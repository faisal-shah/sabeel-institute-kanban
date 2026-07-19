/**
 * Markdown parsing for card descriptions.
 *
 * Lives in shared rather than the app because it is pure logic and deserves
 * tests — the rendering component is a thin shell over these functions.
 *
 * The supported subset is exactly what the formatting toolbar can produce:
 * headings, bold, italic, inline code, links, bullet and numbered lists. HTML is
 * NEVER interpreted; anything that looks like a tag renders as literal text.
 * That is the point of hand-rolling this rather than routing through an HTML
 * pipeline — there is no sanitiser to get wrong.
 */

export type InlineNode =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string };

export type BlockNode =
  | { kind: 'heading'; level: 1 | 2 | 3; content: InlineNode[] }
  | { kind: 'bullet'; content: InlineNode[] }
  | { kind: 'numbered'; marker: string; content: InlineNode[] }
  | { kind: 'paragraph'; content: InlineNode[] }
  | { kind: 'blank' };

/**
 * Order matters: links before code, and bold (`**`) before italic (`*`), or
 * `**bold**` would parse as two empty italics.
 *
 * Link hrefs are restricted to http(s) and mailto. A `javascript:` URL in a card
 * description must never become a tappable link.
 */
const INLINE_PATTERN =
  /(\[[^\]]+\]\((?:https?:\/\/|mailto:)[^\s)]+\))|(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)/;

export function parseInline(source: string): InlineNode[] {
  const out: InlineNode[] = [];
  let rest = source;

  while (rest.length > 0) {
    const m = rest.match(INLINE_PATTERN);
    if (!m || m.index === undefined) {
      out.push({ kind: 'text', text: rest });
      break;
    }
    if (m.index > 0) out.push({ kind: 'text', text: rest.slice(0, m.index) });

    const token = m[0];
    if (token.startsWith('[')) {
      const close = token.indexOf(']');
      out.push({
        kind: 'link',
        text: token.slice(1, close),
        href: token.slice(close + 2, -1),
      });
    } else if (token.startsWith('`')) {
      out.push({ kind: 'code', text: token.slice(1, -1) });
    } else if (token.startsWith('**')) {
      out.push({ kind: 'bold', text: token.slice(2, -2) });
    } else {
      out.push({ kind: 'italic', text: token.slice(1, -1) });
    }
    rest = rest.slice(m.index + token.length);
  }

  return out.filter((n) => n.kind !== 'text' || n.text.length > 0);
}

export function parseMarkdown(source: string): BlockNode[] {
  return source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map<BlockNode>((line) => {
      const heading = line.match(/^(#{1,3})\s+(.*)$/);
      if (heading) {
        return {
          kind: 'heading',
          level: heading[1].length as 1 | 2 | 3,
          content: parseInline(heading[2]),
        };
      }

      const bullet = line.match(/^\s*[-*]\s+(.*)$/);
      if (bullet) return { kind: 'bullet', content: parseInline(bullet[1]) };

      const numbered = line.match(/^\s*(\d+)\.\s+(.*)$/);
      if (numbered) {
        return {
          kind: 'numbered',
          marker: numbered[1],
          content: parseInline(numbered[2]),
        };
      }

      if (line.trim() === '') return { kind: 'blank' };
      return { kind: 'paragraph', content: parseInline(line) };
    });
}

export type MarkdownAction =
  | 'bold'
  | 'italic'
  | 'code'
  | 'bullet'
  | 'numbered'
  | 'heading'
  | 'link';

/**
 * What the formatting toolbar inserts. Appends rather than wrapping a selection:
 * React Native's TextInput does not expose a reliable cross-platform selection
 * range, and a toolbar that silently mangles text is worse than one that appends
 * a placeholder you then type over.
 */
export function applyMarkdown(source: string, action: MarkdownAction): string {
  const needsNewline = source.length > 0 && !source.endsWith('\n');
  const nl = needsNewline ? '\n' : '';
  switch (action) {
    case 'bold':
      return `${source}**bold text**`;
    case 'italic':
      return `${source}*italic text*`;
    case 'code':
      return `${source}\`code\``;
    case 'bullet':
      return `${source}${nl}- `;
    case 'numbered':
      return `${source}${nl}1. `;
    case 'heading':
      return `${source}${nl}## `;
    case 'link':
      return `${source}[label](https://)`;
  }
}
