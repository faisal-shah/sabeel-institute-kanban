import { ATTACHMENT_NAME_MAX } from './constants';

/**
 * Storage object path for a card attachment.
 *
 * One definition, used by the upload client, the rules tests, the callables and
 * the card-delete sweep. The path is DERIVED from the ids and never stored on
 * the document: bytes that landed from an upload that never finalized have no
 * field pointing at them, so cleanup keyed on a stored field would orphan
 * exactly the objects it most needs to remove.
 */
export function attachmentStoragePath(cardId: string, attachmentId: string): string {
  return `cards/${cardId}/attachments/${attachmentId}`;
}

/**
 * Content types that are never served inline, whatever the uploader claimed.
 *
 * An attachment is served from a `storage.googleapis.com` URL, so inline HTML or
 * SVG would execute script on Google's origin rather than ours. That cannot
 * reach this app's tokens, but a phishing page hosted on googleapis.com and
 * authored by any active member is not nothing, and nobody attaching a file to a
 * kanban card needs it rendered as a live document.
 */
const NEVER_INLINE = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'text/xml',
  'application/xml',
]);

/**
 * `type/subtype`, per RFC 6838's restricted token grammar.
 *
 * Matched STRICTLY, not merely checked for a slash. `contentType` arrives on a
 * client-written document — the rules only bound its length — and it ends up as
 * the stored object's `Content-Type`, i.e. in a response header. A value
 * containing CRLF passed the old "does it contain a slash" test unchanged,
 * which is a header-injection shape. Anything that is not a well-formed type is
 * not repaired, it is discarded.
 */
const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;

/**
 * Reduce a client-declared MIME type to one worth storing.
 *
 * The picker's claim is untrusted on both surfaces, so this runs server-side at
 * finalize and decides what the object's stored `contentType` becomes.
 */
export function normalizeContentType(declared: string | null | undefined): string {
  const bare = (declared ?? '').split(';')[0].trim().toLowerCase();
  if (!MIME.test(bare)) return 'application/octet-stream';
  if (NEVER_INLINE.has(bare)) return 'application/octet-stream';
  return bare;
}

/** Types a browser should render in place rather than download. */
export function isInlineSafe(contentType: string): boolean {
  if (NEVER_INLINE.has(contentType)) return false;
  return (
    contentType === 'application/pdf' ||
    contentType === 'text/plain' ||
    contentType.startsWith('image/')
  );
}

/**
 * The longest trailing dot-segment still treated as an extension, dot included.
 *
 * A bound is needed because `lastIndexOf('.')` alone would call `.verylongword`
 * an extension, and something has to decide. Twelve covers everything real
 * (`.jpeg`, `.docx`, `.tar.gz` → `.gz`) without swallowing a sentence.
 */
const MAX_EXT_LEN = 12;

/**
 * What a trailing dot-segment must LOOK like to be an extension.
 *
 * The length bound alone is not enough, and the failure it misses is not
 * exotic: `Notes on v1.2 planning` ends in a nine-character dot-segment, so it
 * split into `Notes on v1` + `.2 planning` — and because the sheet renders the
 * suffix as fixed text, the name could not be repaired by the person renaming
 * it. `meeting 3.30pm` and `photo 2026.08.15` are the same shape.
 *
 * So: ASCII alphanumerics only, which rules out prose (a space, punctuation),
 * and at least one LETTER, which rules out a version or a date segment. Real
 * extensions satisfy both, `.7z` and `.mp4` included.
 */
const EXT_CHARS = /^\.[A-Za-z0-9]+$/;
const EXT_LETTER = /[A-Za-z]/;

/**
 * Split a filename into the part a person may edit and the suffix they may not.
 *
 * ONE definition of "the extension", shared by the rename field, the kind badge
 * and the truncation inside `sanitizeAttachmentName`. Two definitions fail
 * silently: a name shortened against one rule and displayed against another
 * shows a kind the file does not have.
 *
 * A LEADING dot is not an extension — `.gitignore` is a whole name — which is
 * what `dot > 0` says. A base of nothing but whitespace is the same case: `.pdf`
 * with three spaces in front of it is a name, not a stem plus a suffix, and
 * treating it as the latter is what would break the round trip below.
 */
export function splitAttachmentName(name: string | null | undefined): {
  base: string;
  ext: string;
} {
  const s = name ?? '';
  const dot = s.lastIndexOf('.');
  if (dot <= 0) return { base: s, ext: '' };
  const base = s.slice(0, dot);
  const ext = s.slice(dot);
  const isExt =
    base.trim() !== '' &&
    ext.length <= MAX_EXT_LEN &&
    EXT_CHARS.test(ext) &&
    EXT_LETTER.test(ext);
  return isExt ? { base, ext } : { base: s, ext: '' };
}

/**
 * Put an edited base back together with the suffix it kept.
 *
 * Sanitizes, so a rename field cannot become a way around the cleaning every
 * other path gets — and so this is the ONE join. Building the name by hand at a
 * call site skips the cleaning and skips the cap, which is how a picked name
 * longer than `ATTACHMENT_NAME_MAX` reached the server and was renamed there.
 *
 * `joinAttachmentName(...splitAttachmentName(x))` equals
 * `sanitizeAttachmentName(x)` for every `x` — asserted by fuzz, not by a list.
 * The base is passed on UNTRIMMED for exactly that reason: sanitising already
 * trims, and trimming here as well renamed `Q3 report .pdf` to `Q3 report.pdf`
 * the moment it was attached.
 */
export function joinAttachmentName(base: string, ext: string): string {
  // An empty base would leave a bare `.pdf` — a hidden file, not what anyone
  // renaming meant. Fall back to the word an empty name already falls back to.
  return sanitizeAttachmentName(base.trim() ? `${base}${ext}` : `file${ext}`);
}

/**
 * The extension, uppercased — what people actually recognise a file by.
 *
 * Two bounds, deliberately different: `splitAttachmentName` decides what the
 * extension IS, and four characters decides what fits in a badge. Anything
 * longer reads as a word rather than a kind, so it becomes `FILE`.
 */
export function attachmentKind(name: string): string {
  const bare = splitAttachmentName(name).ext.slice(1);
  return bare && bare.length <= 4 ? bare.toUpperCase() : 'FILE';
}

/**
 * Strip everything from a filename that would break a header or escape a path.
 *
 * The name reaches an HTTP `Content-Disposition`, so quotes, semicolons,
 * newlines and control characters have to go; path separators go because the
 * name is display-only and must never be able to imply a directory.
 */
export function sanitizeAttachmentName(name: string | null | undefined): string {
  const cleaned = (name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[/\\]/g, '_')
    .replace(/["';]/g, '_')
    .trim();
  if (!cleaned) return 'file';
  if (cleaned.length <= ATTACHMENT_NAME_MAX) return cleaned;

  // Shorten the STEM, not the whole string. A plain slice cuts the extension
  // off, and the extension is what the file row shows as the kind and what some
  // viewers sniff to decide how to open it — so a long name would arrive as an
  // unopenable, untyped blob. A long trailing dot-segment is not treated as an
  // extension, because it is not one — see `splitAttachmentName`, which is the
  // single place that rule lives.
  //
  // `trimEnd` on the shortened stem so this function is IDEMPOTENT. It runs
  // twice on the way to storage — once in the naming sheet, once in
  // `uploadAttachment` — and without it a cut that lands on a space leaves a
  // trailing one that the second call then trims, so the row is stored under a
  // name one character shorter than the sheet displayed.
  const { ext } = splitAttachmentName(cleaned);
  return cleaned.slice(0, ATTACHMENT_NAME_MAX - ext.length).trimEnd() + ext;
}

/** RFC 5987 percent-encoding, as `filename*` requires. */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * The `Content-Disposition` stored on the object at finalize.
 *
 * Stored as object metadata rather than passed as a `responseDisposition`
 * override on the signed URL, so the emulator's `?alt=media` path and a real
 * signed URL serve identical headers — which is the only reason inline-vs-
 * download behaviour can be tested anywhere but production.
 *
 * Both filename forms are emitted: the quoted ASCII one for anything old, and
 * `filename*` for everything else. Arabic filenames are a certainty here, and a
 * bare `filename="…"` cannot carry them.
 */
export function contentDispositionFor(name: string, contentType: string): string {
  const safe = sanitizeAttachmentName(name);
  const kind = isInlineSafe(contentType) ? 'inline' : 'attachment';
  const ascii = safe.replace(/[^\u0020-\u007E]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(safe)}`;
}

/** Human-readable size for a file row. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * A unique on-disk name for a cached attachment, keeping the extension.
 *
 * Android has to download a file before a viewer can open it, and two files on
 * one card may share a display name — two camera photos taken in the same
 * minute generate the same name, because it is stamped to the minute. Keyed by
 * name alone the second download overwrites the first, and opening the first
 * then shows the SECOND file's contents under the first one's name.
 *
 * Lives here rather than in the native seam so it can be tested at all.
 */
export function attachmentCacheName(id: string, name: string): string {
  const safe = sanitizeAttachmentName(name)
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(-96);
  return `${id}-${safe || 'file'}`;
}
