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
 * Reduce a client-declared MIME type to one worth storing.
 *
 * The picker's claim is untrusted on both surfaces, so this runs server-side at
 * finalize and decides what the object's stored `contentType` becomes.
 */
export function normalizeContentType(declared: string | null | undefined): string {
  const bare = (declared ?? '').split(';')[0].trim().toLowerCase();
  if (!bare || !bare.includes('/')) return 'application/octet-stream';
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
    .trim()
    .slice(0, ATTACHMENT_NAME_MAX);
  return cleaned || 'file';
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
