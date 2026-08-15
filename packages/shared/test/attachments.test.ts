import { describe, it, expect } from 'vitest';
import {
  attachmentCacheName,
  attachmentKind,
  attachmentStoragePath,
  contentDispositionFor,
  formatBytes,
  isInlineSafe,
  joinAttachmentName,
  normalizeContentType,
  sanitizeAttachmentName,
  splitAttachmentName,
} from '../src/attachments';
import { ATTACHMENT_NAME_MAX } from '../src/constants';

describe('attachmentStoragePath', () => {
  it('derives the object path from the ids', () => {
    expect(attachmentStoragePath('card1', 'att1')).toBe('cards/card1/attachments/att1');
  });
});

describe('normalizeContentType', () => {
  it('drops parameters and lowercases', () => {
    expect(normalizeContentType('Text/Plain; charset=UTF-8')).toBe('text/plain');
  });

  it('falls back to octet-stream for nothing useful', () => {
    for (const input of ['', '   ', null, undefined, 'garbage']) {
      expect(normalizeContentType(input)).toBe('application/octet-stream');
    }
  });

  it('discards anything that is not a well-formed MIME type', () => {
    // `contentType` arrives on a client-written document and ends up as the
    // stored object's Content-Type — a response header. CRLF in it is a
    // header-injection shape, and it used to pass straight through because the
    // only check was "does it contain a slash".
    for (const hostile of [
      'application/pdf\r\nX-Injected: 1',
      'application/pdf\nSet-Cookie: a=b',
      '../../etc/passwd/x',
      `${'a'.repeat(200)}/b`,
      'application/',
      '/pdf',
      'application pdf',
    ]) {
      expect(normalizeContentType(hostile)).toBe('application/octet-stream');
    }
  });

  it('keeps the legitimate types people actually attach', () => {
    for (const ok of [
      'application/pdf',
      'image/png',
      'image/svg',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/x-7z-compressed',
    ]) {
      expect(normalizeContentType(ok)).toBe(ok);
    }
  });

  it('refuses to store the types that must never render inline', () => {
    // Served from storage.googleapis.com, these would execute script on Google's
    // origin. Nobody attaching a file to a card needs a live document.
    for (const t of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/xml']) {
      expect(normalizeContentType(t)).toBe('application/octet-stream');
    }
  });
});

describe('isInlineSafe', () => {
  it('renders PDFs, plain text and images in place', () => {
    expect(isInlineSafe('application/pdf')).toBe(true);
    expect(isInlineSafe('text/plain')).toBe(true);
    expect(isInlineSafe('image/png')).toBe(true);
  });

  it('downloads everything else, and never SVG', () => {
    expect(isInlineSafe('image/svg+xml')).toBe(false);
    expect(isInlineSafe('application/zip')).toBe(false);
    expect(isInlineSafe('application/octet-stream')).toBe(false);
  });
});

describe('sanitizeAttachmentName', () => {
  it('removes control characters, path separators and header-breaking punctuation', () => {
    expect(sanitizeAttachmentName('re\u0007port.pdf')).toBe('report.pdf');
    expect(sanitizeAttachmentName('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(sanitizeAttachmentName('a"b;c.pdf')).toBe('a_b_c.pdf');
  });

  it('keeps the extension when it has to shorten a long name', () => {
    // Truncating the whole string drops the extension, and the extension is
    // what the row shows as the file's kind and what some viewers sniff.
    const long = sanitizeAttachmentName(`${'x'.repeat(400)}.txt`);
    expect(long).toHaveLength(ATTACHMENT_NAME_MAX);
    expect(long.endsWith('.txt')).toBe(true);
    // A trailing dot-something that is not plausibly an extension is not kept.
    expect(sanitizeAttachmentName(`${'x'.repeat(400)}.${'y'.repeat(40)}`)).toHaveLength(
      ATTACHMENT_NAME_MAX,
    );
  });

  it('clamps to the cap and never returns empty', () => {
    expect(sanitizeAttachmentName('x'.repeat(400))).toHaveLength(ATTACHMENT_NAME_MAX);
    for (const input of ['', '   ', null, undefined]) {
      expect(sanitizeAttachmentName(input)).toBe('file');
    }
  });

  it('keeps non-ASCII intact — the header encodes it, sanitising must not eat it', () => {
    expect(sanitizeAttachmentName('ملف.pdf')).toBe('ملف.pdf');
  });
});

describe('contentDispositionFor', () => {
  it('serves a PDF inline and a zip as a download', () => {
    expect(contentDispositionFor('budget.pdf', 'application/pdf')).toMatch(/^inline; /);
    expect(contentDispositionFor('logs.zip', 'application/zip')).toMatch(/^attachment; /);
  });

  it('carries an Arabic name through filename* with an ASCII fallback', () => {
    const header = contentDispositionFor('ملف.pdf', 'application/pdf');
    // The quoted form cannot hold non-ASCII, so it degrades rather than breaking
    // the header; filename* is what actually carries the name.
    expect(header).toContain('filename="___.pdf"');
    expect(header).toContain("filename*=UTF-8''%D9%85%D9%84%D9%81.pdf");
  });

  it('cannot be escaped with a quote in the filename', () => {
    const header = contentDispositionFor('evil".pdf', 'application/pdf');
    expect(header).toContain('filename="evil_.pdf"');
    // Exactly two quotes: the ones delimiting the quoted form.
    expect(header.split('"')).toHaveLength(3);
  });
});

describe('formatBytes', () => {
  it('scales and rounds for a file row', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1024 * 200)).toBe('200 KB');
    expect(formatBytes(1024 * 1024 * 1.5)).toBe('1.5 MB');
  });

  it('says nothing rather than something wrong for a missing size', () => {
    expect(formatBytes(NaN)).toBe('');
    expect(formatBytes(-1)).toBe('');
  });
});

describe('attachmentCacheName', () => {
  it('is unique per attachment even when two files share a name', () => {
    // Two camera photos in the same minute genuinely produce the same name.
    const a = attachmentCacheName('idAAA', 'photo-2026-07-27-1432.jpg');
    const b = attachmentCacheName('idBBB', 'photo-2026-07-27-1432.jpg');
    expect(a).not.toBe(b);
    expect(a.endsWith('.jpg')).toBe(true);
    expect(b.endsWith('.jpg')).toBe(true);
  });

  it('keeps the name filesystem-safe and never empty', () => {
    expect(attachmentCacheName('id1', '../../etc/passwd')).not.toContain('/');
    expect(attachmentCacheName('id1', '')).toBe('id1-file');
    expect(attachmentCacheName('id1', 'ملف.pdf')).toMatch(/^id1-/);
  });
});

describe('splitAttachmentName', () => {
  it('splits on the last dot', () => {
    expect(splitAttachmentName('budget.pdf')).toEqual({ base: 'budget', ext: '.pdf' });
    expect(splitAttachmentName('report.final.v2.backup')).toEqual({
      base: 'report.final.v2',
      ext: '.backup',
    });
  });

  it('finds no extension where there is none', () => {
    expect(splitAttachmentName('README')).toEqual({ base: 'README', ext: '' });
    expect(splitAttachmentName('')).toEqual({ base: '', ext: '' });
    expect(splitAttachmentName(null)).toEqual({ base: '', ext: '' });
  });

  /** A leading dot is a whole NAME, not an extension. */
  it('does not treat a dotfile as all extension', () => {
    expect(splitAttachmentName('.gitignore')).toEqual({ base: '.gitignore', ext: '' });
    expect(splitAttachmentName('.env.local')).toEqual({ base: '.env', ext: '.local' });
  });

  /** A long trailing dot-segment is a word, not a kind. */
  it('refuses an implausibly long suffix', () => {
    expect(splitAttachmentName('archive.verylongsuffix')).toEqual({
      base: 'archive.verylongsuffix',
      ext: '',
    });
    // Twelve including the dot is the boundary, so eleven characters still counts.
    expect(splitAttachmentName('a.elevenchars')).toEqual({ base: 'a', ext: '.elevenchars' });
  });
});

describe('joinAttachmentName', () => {
  it('puts an edited base back with its suffix', () => {
    expect(joinAttachmentName('Q3 budget draft', '.pdf')).toBe('Q3 budget draft.pdf');
  });

  it('sanitises, so a rename cannot smuggle past the cleaning', () => {
    expect(joinAttachmentName('a"b;c', '.pdf')).toBe('a_b_c.pdf');
    expect(joinAttachmentName('../etc/passwd', '.txt')).toBe('.._etc_passwd.txt');
    expect(joinAttachmentName('x'.repeat(400), '.txt')).toHaveLength(ATTACHMENT_NAME_MAX);
  });

  it('never produces a bare dotfile from an emptied field', () => {
    expect(joinAttachmentName('', '.pdf')).toBe('file.pdf');
    expect(joinAttachmentName('   ', '.pdf')).toBe('file.pdf');
    expect(joinAttachmentName('', '')).toBe('file');
  });

  /**
   * The round trip is the real criterion, not the hand-written cases above: if
   * splitting and rejoining ever disagreed with sanitising, a file would rename
   * ITSELF the moment it was attached.
   */
  it('round-trips through sanitizeAttachmentName', () => {
    const names = [
      'budget.pdf',
      'README',
      '.gitignore',
      '.env.local',
      'report.final.v2.backup',
      'archive.verylongsuffix',
      'ملف.pdf',
      'a"b;c.pdf',
      '',
      '   ',
      `${'x'.repeat(400)}.txt`,
    ];
    for (const name of names) {
      const { base, ext } = splitAttachmentName(name);
      expect(joinAttachmentName(base, ext)).toBe(sanitizeAttachmentName(name));
    }
  });
});

describe('attachmentKind', () => {
  it('reads the extension as a short badge', () => {
    expect(attachmentKind('budget.pdf')).toBe('PDF');
    expect(attachmentKind('photo.jpeg')).toBe('JPEG');
    expect(attachmentKind('archive.tar.gz')).toBe('GZ');
  });

  it('falls back to FILE where there is no short extension', () => {
    // Longer than a badge holds — a word, not a kind.
    expect(attachmentKind('notes.backup')).toBe('FILE');
    expect(attachmentKind('README')).toBe('FILE');
    expect(attachmentKind('.gitignore')).toBe('FILE');
  });
});
