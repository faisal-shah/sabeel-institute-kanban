import { describe, it, expect } from 'vitest';
import { applyMarkdown, parseInline, parseMarkdown } from '../src/markdown';

describe('inline parsing', () => {
  it('leaves plain text alone', () => {
    expect(parseInline('hello world')).toEqual([{ kind: 'text', text: 'hello world' }]);
  });

  it('parses bold, italic and code', () => {
    expect(parseInline('**b**')).toEqual([{ kind: 'bold', text: 'b' }]);
    expect(parseInline('*i*')).toEqual([{ kind: 'italic', text: 'i' }]);
    expect(parseInline('_i_')).toEqual([{ kind: 'italic', text: 'i' }]);
    expect(parseInline('`c`')).toEqual([{ kind: 'code', text: 'c' }]);
  });

  it('prefers bold over italic, so **x** is not two empty italics', () => {
    expect(parseInline('**x**')).toEqual([{ kind: 'bold', text: 'x' }]);
  });

  it('keeps surrounding text', () => {
    expect(parseInline('a **b** c')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'bold', text: 'b' },
      { kind: 'text', text: ' c' },
    ]);
  });

  it('parses links', () => {
    expect(parseInline('[docs](https://example.com/a)')).toEqual([
      { kind: 'link', text: 'docs', href: 'https://example.com/a' },
    ]);
    expect(parseInline('[mail](mailto:a@oursabeel.com)')).toEqual([
      { kind: 'link', text: 'mail', href: 'mailto:a@oursabeel.com' },
    ]);
  });

  it('refuses dangerous link schemes — they stay literal text', () => {
    // A javascript: URL in a description must never become tappable.
    const nodes = parseInline('[click](javascript:alert(1))');
    expect(nodes.every((n) => n.kind !== 'link')).toBe(true);
  });

  it('never produces HTML — tags are literal text', () => {
    // The reason this parser exists rather than an HTML pipeline: there is no
    // sanitiser to get wrong.
    const nodes = parseInline('<script>alert(1)</script>');
    expect(nodes).toEqual([{ kind: 'text', text: '<script>alert(1)</script>' }]);
  });

  it('handles unmatched markers as plain text', () => {
    expect(parseInline('a * b')).toEqual([{ kind: 'text', text: 'a * b' }]);
    expect(parseInline('**unclosed')).toEqual([{ kind: 'text', text: '**unclosed' }]);
  });

  it('drops empty text runs', () => {
    expect(parseInline('**a**')).toHaveLength(1);
  });

  it('terminates on adversarial input', () => {
    // A parser loop that fails to consume input would hang the app.
    const nasty = '*'.repeat(500) + '`'.repeat(500) + '[](';
    expect(() => parseInline(nasty)).not.toThrow();
  });
});

describe('block parsing', () => {
  it('parses headings at three levels', () => {
    const blocks = parseMarkdown('# one\n## two\n### three');
    expect(blocks.map((b) => (b.kind === 'heading' ? b.level : null))).toEqual([1, 2, 3]);
  });

  it('does not treat #### as a heading', () => {
    expect(parseMarkdown('#### four')[0].kind).toBe('paragraph');
  });

  it('parses bullets with - and *', () => {
    expect(parseMarkdown('- a\n* b').map((b) => b.kind)).toEqual(['bullet', 'bullet']);
  });

  it('parses numbered items and keeps the marker', () => {
    const blocks = parseMarkdown('1. a\n7. b');
    expect(blocks.map((b) => (b.kind === 'numbered' ? b.marker : null))).toEqual([
      '1',
      '7',
    ]);
  });

  it('marks blank lines', () => {
    expect(parseMarkdown('a\n\nb').map((b) => b.kind)).toEqual([
      'paragraph',
      'blank',
      'paragraph',
    ]);
  });

  it('normalises CRLF', () => {
    expect(parseMarkdown('a\r\nb')).toHaveLength(2);
  });

  it('applies inline formatting inside blocks', () => {
    const blocks = parseMarkdown('- has **bold**');
    expect(blocks[0].kind).toBe('bullet');
    if (blocks[0].kind !== 'bullet') throw new Error('unreachable');
    expect(blocks[0].content.some((n) => n.kind === 'bold')).toBe(true);
  });
});

describe('toolbar actions', () => {
  it('inserts placeholders for inline styles', () => {
    expect(applyMarkdown('', 'bold')).toBe('**bold text**');
    expect(applyMarkdown('', 'italic')).toBe('*italic text*');
    expect(applyMarkdown('', 'code')).toBe('`code`');
    expect(applyMarkdown('', 'link')).toBe('[label](https://)');
  });

  it('starts block styles on a fresh line', () => {
    expect(applyMarkdown('text', 'bullet')).toBe('text\n- ');
    expect(applyMarkdown('text', 'numbered')).toBe('text\n1. ');
    expect(applyMarkdown('text', 'heading')).toBe('text\n## ');
  });

  it('does not add a second newline when already at line start', () => {
    expect(applyMarkdown('text\n', 'bullet')).toBe('text\n- ');
  });

  it('round-trips: what the toolbar inserts, the parser understands', () => {
    for (const action of ['bold', 'italic', 'code'] as const) {
      const nodes = parseInline(applyMarkdown('', action));
      expect(nodes.some((n) => n.kind !== 'text'), action).toBe(true);
    }
  });

  it('the link placeholder is not a link until a host is typed', () => {
    // `[label](https://)` has no host yet, so it renders as plain text — correct,
    // and the visible cue that the URL still needs filling in. It becomes a link
    // as soon as it is a real address.
    expect(parseInline(applyMarkdown('', 'link')).every((n) => n.kind === 'text')).toBe(
      true,
    );
    expect(parseInline('[label](https://example.com)')).toEqual([
      { kind: 'link', text: 'label', href: 'https://example.com' },
    ]);
  });
});
