import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, markdownToHtml } from '../src/richtextHtml';
import { extractMentions, mentionInsertion } from '../src/mentions';
import { normalizeMarkdown, toPlainText } from '../src/richtext';

/**
 * The seam both editors speak.
 *
 * The important assertions are the DEGRADATION table and the round trip —
 * `htmlToMarkdown` is the paste whitelist, so every row of "what happens to
 * something we do not speak" is a security and fidelity statement, not a
 * nicety.
 */

const trip = (md: string) => htmlToMarkdown(markdownToHtml(md));

describe('markdown to HTML and back', () => {
  it('round-trips each element', () => {
    for (const md of [
      '**bold**',
      '*italic*',
      '[label](https://example.org)',
      '- one\n- two',
      '1. one\n2. two',
      'plain text',
    ]) {
      expect(trip(md), md).toBe(md);
    }
  });

  it('round-trips nested marks and mixed blocks', () => {
    const md = '**bold with [link](https://x.test) inside**\n\n- *a*\n- **b**\n\n1. one';
    expect(trip(md)).toBe(md);
  });

  it('keeps a soft line break inside a paragraph', () => {
    expect(markdownToHtml('a\nb')).toContain('<br>');
    expect(trip('a\nb')).toBe('a\nb');
  });

  it('keeps paragraph breaks distinct from line breaks', () => {
    expect(trip('a\n\nb')).toBe('a\n\nb');
    expect(trip('a\nb')).toBe('a\nb');
  });

  it('escapes and restores literal markdown characters', () => {
    for (const md of [normalizeMarkdown('2 * 3'), 'snake_case_name', 'a`b', '~x~']) {
      expect(trip(md), md).toBe(md);
    }
  });

  it('escapes and restores HTML-significant characters', () => {
    // A legacy description containing <not a tag> must not be eaten.
    const md = 'compare <not a tag> & "quotes"';
    expect(toPlainText(trip(md))).toBe(md);
  });
});

describe('degradation — what happens to everything we do not speak', () => {
  const cases: [string, string, string][] = [
    ['heading becomes a paragraph', '<h1>Title</h1>', 'Title'],
    ['quote becomes a paragraph', '<blockquote>quoted</blockquote>', 'quoted'],
    ['underline keeps its text', '<u>under</u>', 'under'],
    ['strikethrough keeps its text', '<s>gone</s>', 'gone'],
    ['inline code keeps its text', '<code>x = 1</code>', 'x = 1'],
    ['code block keeps its text', '<pre>line</pre>', 'line'],
    ['checkbox list becomes a bullet list', '<ul data-type="checkbox"><li>a</li></ul>', '- a'],
    ['unknown tag is unwrapped', '<span class="x">kept</span>', 'kept'],
    ['mention flattens to its text', '<mention>@sara</mention>', '@sara'],
    ['image is dropped entirely', '<p>before<img src="x.png">after</p>', 'beforeafter'],
    ['script is dropped, content and all', '<p>a</p><script>alert(1)</script>', 'a'],
    ['style is dropped, content and all', '<style>p{color:red}</style><p>b</p>', 'b'],
  ];
  for (const [name, html, expected] of cases) {
    it(name, () => {
      expect(htmlToMarkdown(html)).toBe(expected);
    });
  }

  it('flattens a nested list to one level, losing no items', () => {
    const md = htmlToMarkdown('<ul><li>a</li><ul><li>b</li></ul><li>c</li></ul>');
    expect(toPlainText(md).split('\n').sort()).toEqual(['a', 'b', 'c']);
  });

  it('drops a refused scheme but keeps the label', () => {
    expect(htmlToMarkdown('<a href="javascript:alert(1)">click</a>')).toBe('click');
    expect(htmlToMarkdown('<a href="https://ok.test">click</a>')).toBe(
      '[click](https://ok.test)',
    );
  });

  it('never emits a tag outside the vocabulary', () => {
    const html = markdownToHtml('**b** *i* [l](https://x.test)\n\n- a\n\n1. n');
    const tags = [...html.matchAll(/<([a-z]+)/g)].map((m) => m[1]);
    expect([...new Set(tags)].sort()).toEqual(['a', 'b', 'i', 'li', 'ol', 'p', 'ul']);
  });
});

describe('both editor dialects', () => {
  it('collapses a doubled mark rather than nesting it', () => {
    // Lexical emits <b><strong>x</strong></b> for ONE bold run; nested that
    // serializes as ****x****, which is not even valid emphasis.
    expect(htmlToMarkdown('<b><strong>x</strong></b>')).toBe('**x**');
    expect(htmlToMarkdown('<i><em>y</em></i>')).toBe('*y*');
    expect(htmlToMarkdown('<b><i><b>z</b></i></b>')).toBe('***z***');
  });

  it('reads Lexical output', () => {
    // Lexical emits <strong>/<em>, wrapping spans, dir attributes and li value.
    const html =
      '<p dir="ltr"><span style="white-space: pre-wrap;"><strong>bold</strong> and <em>it</em></span></p>' +
      '<ol><li value="1"><span>one</span></li><li value="2"><span>two</span></li></ol>';
    expect(htmlToMarkdown(html)).toBe('**bold** and *it*\n\n1. one\n2. two');
  });

  it('reads enriched-html output', () => {
    const html = '<p><b>bold</b> and <i>it</i></p><ul><li>one</li></ul>';
    expect(htmlToMarkdown(html)).toBe('**bold** and *it*\n\n- one');
  });
});

describe('paste is safe without a paste handler', () => {
  it('reduces a rich paste to the vocabulary', () => {
    const pasted =
      '<h1>Heading</h1><p>Some <u>underlined</u> and <s>struck</s> text with ' +
      '<a href="https://ok.test">a link</a>.</p>' +
      '<table><tr><td>cell</td></tr></table>' +
      '<ul><li>item <code>code</code></li></ul>' +
      '<img src="x.png"><script>alert(1)</script>';
    const md = htmlToMarkdown(pasted);
    expect(md).not.toMatch(/[<>]/);
    expect(md).toContain('[a link](https://ok.test)');
    expect(toPlainText(md)).toContain('cell');
    expect(toPlainText(md)).not.toContain('alert(1)');
    // And it is already canonical, so the counter and the write agree.
    expect(normalizeMarkdown(md)).toBe(md);
  });
});

/**
 * A MENTION MUST SURVIVE THE SEAM WITH ITS INDICATOR.
 *
 * The native editor owns the mention as a <mention> node and puts the indicator
 * in an ATTRIBUTE, not in the element's text. An unknown tag is unwrapped here
 * — its text survives, the tag does not — so the "@" was silently dropped and
 * the stored body read "Cc sara". `extractMentions` scans for /@handle/, so it
 * found nobody, `mentionUids` was empty, and `onCommentWritten` paged nobody.
 * Nothing looked wrong: the popover opened, the chip rendered, the comment
 * posted.
 *
 * Web never had this — it inserts literal "@handle" text and has no mention
 * node at all — which is exactly why only a device found it. The assertion that
 * matters is the LAST one: not that the markdown looks right, but that the
 * function which decides who gets notified can still find the person.
 */
describe('mentions across the HTML seam', () => {
  const roster = [
    { uid: 'u-sara', email: 'sara@oursabeel.com', displayName: 'Sara' },
    { uid: 'u-omar', email: 'omar@oursabeel.com', displayName: 'Omar' },
  ];

  it('keeps the indicator, which lives in an attribute', () => {
    expect(
      htmlToMarkdown('<p>Cc <mention text="sara" indicator="@">sara</mention> please</p>'),
    ).toBe('Cc @sara please');
  });

  it('does not double the indicator when the text already carries it', () => {
    expect(
      htmlToMarkdown('<p><mention text="@sara" indicator="@">@sara</mention></p>'),
    ).toBe('@sara');
  });

  it('degrades to the visible text when the attributes are missing', () => {
    expect(htmlToMarkdown('<p>hi <mention>sara</mention></p>')).toBe('hi sara');
  });

  it('THE POINT: the stored body still resolves to a uid', () => {
    const body = htmlToMarkdown(
      '<p>Hi <mention text="sara" indicator="@">sara</mention> and <mention text="omar" indicator="@">omar</mention></p>',
    );
    expect(extractMentions(body, roster)).toEqual(['u-sara', 'u-omar']);
  });

  it('a mention is plain text in storage, as it is on web', () => {
    // Storage stays markdown with a literal @handle: `@` is NOT in the parse
    // set, and making it one would force it into the escape set and store
    // `\@` noise. So the chip is an editor-side representation only.
    const body = htmlToMarkdown('<p><mention text="sara" indicator="@">sara</mention></p>');
    expect(markdownToHtml(body)).toBe('<p>@sara</p>');
  });
});

/**
 * THE TWO SURFACES MUST CONVERGE — this is the test the bug needed.
 *
 * The converter tests above pin one shape. This pins the PROPERTY that made the
 * bug possible: web and native insert a mention by different mechanisms, and
 * for a month they disagreed about whether the indicator was part of the text.
 * Both now derive from `mentionInsertion`, and both paths are exercised here
 * against the same roster, asserting they produce byte-identical markdown and
 * resolve to the same uid.
 *
 * A regression on either surface alone fails this, which is what the old tests
 * could not do: they covered detection and conversion, never the round trip
 * from "the person picked a name" to "the person gets notified".
 */
describe('web and native mentions converge on the same stored markdown', () => {
  const roster = [
    { uid: 'u-sara', email: 'sara@oursabeel.com', displayName: 'Sara' },
    { uid: 'u-omar', email: 'omar@oursabeel.com', displayName: 'Omar' },
    { uid: 'u-dotted', email: 'faisal.shah@oursabeel.com', displayName: 'Faisal Shah' },
    { uid: 'u-plus', email: 'a+b@oursabeel.com', displayName: 'Plus' },
  ];

  /** What Lexical types into the document. */
  const webHtml = (c: (typeof roster)[number]) =>
    `<p>hi ${mentionInsertion(c).literal} there</p>`;

  /** What `react-native-enriched-html` serialises after setMention(). */
  const nativeHtml = (c: (typeof roster)[number]) => {
    const m = mentionInsertion(c);
    return `<p>hi <mention text="${m.text}" indicator="${m.indicator}">${m.text}</mention> there</p>`;
  };

  for (const c of roster) {
    it(`${c.displayName}: both surfaces store the same bytes and resolve`, () => {
      const fromWeb = htmlToMarkdown(webHtml(c));
      const fromNative = htmlToMarkdown(nativeHtml(c));

      expect(fromNative, 'native must store what web stores').toBe(fromWeb);
      expect(fromWeb).toBe(`hi ${mentionInsertion(c).literal} there`);

      // The assertion that actually matters: who gets notified.
      expect(extractMentions(fromWeb, roster)).toEqual([c.uid]);
      expect(extractMentions(fromNative, roster)).toEqual([c.uid]);
    });
  }

  it('a handle the indicator is missing from resolves to NOBODY', () => {
    // The bug, stated as a test: this is exactly what native used to store.
    expect(extractMentions('hi sara there', roster)).toEqual([]);
  });
});
