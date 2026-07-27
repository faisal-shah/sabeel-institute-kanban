import { describe, it, expect } from 'vitest';
import {
  attachmentStoragePath,
  contentDispositionFor,
  formatBytes,
  isInlineSafe,
  normalizeContentType,
  sanitizeAttachmentName,
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
