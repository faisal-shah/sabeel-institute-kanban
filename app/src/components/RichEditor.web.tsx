/**
 * WEB (native sibling: RichEditor.tsx). The Lexical half of the editor seam.
 *
 * Markdown in, markdown out — neither HTML nor editor state ever reaches a
 * screen. Both surfaces convert through the SAME `richtextHtml` seam, so the
 * same keystrokes produce byte-identical markdown from a phone and a browser.
 *
 * `@lexical/markdown` is used for TYPING SHORTCUTS ONLY, never as the save
 * path. It escapes a different set from ours (`_`, backtick, `~`), and two
 * serializers would have to be proved to agree; one converter only has to be
 * proved to work.
 *
 * FOUR THINGS CONSTRAIN THIS TO THE VOCABULARY, in decreasing order of trust:
 *  1. Only ListNode/ListItemNode/LinkNode are registered. Lexical cannot create
 *     a node type absent from the config, so a pasted <h1> or <blockquote>
 *     becomes a paragraph by construction rather than by our filtering.
 *  2. A TextNode transform clears every format bit except bold/italic. This is
 *     the layer that kills pasted underline, strikethrough, sub/superscript and
 *     inline code, which survive as FORMAT BITS rather than nodes and so slip
 *     past (1).
 *  3. `htmlToMarkdown` on save, which can only emit the five.
 *  4. No AutoLink plugin: a bare URL is stored exactly as typed and made
 *     tappable at render time, so web and Android agree.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $isListNode,
  ListItemNode,
  ListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from '@lexical/list';
import { $isLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import {
  BOLD_STAR,
  ITALIC_STAR,
  ORDERED_LIST,
  UNORDERED_LIST,
} from '@lexical/markdown';
import { $findMatchingParent, mergeRegister } from '@lexical/utils';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  FORMAT_TEXT_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  TextNode,
} from 'lexical';
import {
  activeMentionQuery,
  handleFor,
  htmlToMarkdown,
  markdownToHtml,
  isSafeHref,
  type MentionCandidate,
} from '@sabeel/shared';
import { RichToolbar, type RichMarks } from './RichToolbar';
import { LinkSheet } from './LinkSheet';
import { MentionList, ROW_PITCH } from './MentionList';
import { useMentionPolicy } from './useMentionPolicy';
import { radius, space, useTheme } from '../theme';

/** Exactly the five. Nothing else can be typed into existence as a shortcut. */
const TRANSFORMERS = [UNORDERED_LIST, ORDERED_LIST, BOLD_STAR, ITALIC_STAR];

const EMPTY_MARKS: RichMarks = {
  bold: false,
  italic: false,
  bullets: false,
  numbers: false,
  link: false,
};

/** Load markdown into the editor, and report it back out as markdown. */
function Bridge({
  initialMarkdown,
  onChangeMarkdown,
  onMarks,
  registerCommands,
}: {
  initialMarkdown: string;
  onChangeMarkdown: (md: string) => void;
  onMarks: (m: RichMarks) => void;
  registerCommands: (c: {
    toggleBold: () => void;
    toggleItalic: () => void;
    toggleBullets: () => void;
    toggleNumbers: () => void;
    selectedText: () => string;
    applyLink: (href: string, text: string) => void;
  }) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const seeded = useRef(false);

  // Seed ONCE. Re-seeding a focused editor moves the caret and drops
  // keystrokes; the screen's dirty flag decides when a reseed is safe.
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      if (initialMarkdown) {
        const dom = new DOMParser().parseFromString(
          markdownToHtml(initialMarkdown),
          'text/html',
        );
        root.append(...$generateNodesFromDOM(editor, dom));
      }
    });
  }, [editor, initialMarkdown]);

  /**
   * Strip every format bit except bold and italic.
   *
   * Underline, strikethrough, code, subscript and superscript arrive as bits on
   * a TextNode rather than as nodes, so restricting the node list does not stop
   * a paste — or a hardware Ctrl+U — from setting them. Clearing them here is
   * what makes what you see equal what will be stored.
   */
  useEffect(
    () =>
      editor.registerNodeTransform(TextNode, (node) => {
        if (!$isTextNode(node)) return;
        for (const fmt of ['underline', 'strikethrough', 'code', 'subscript', 'superscript'] as const) {
          if (node.hasFormat(fmt)) node.toggleFormat(fmt);
        }
      }),
    [editor],
  );

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          const html = $generateHtmlFromNodes(editor, null);
          onChangeMarkdown(htmlToMarkdown(html));

          const sel = $getSelection();
          if (!$isRangeSelection(sel)) {
            onMarks(EMPTY_MARKS);
            return;
          }
          const anchor = sel.anchor.getNode();
          const list = $findMatchingParent(anchor, $isListNode);
          onMarks({
            bold: sel.hasFormat('bold'),
            italic: sel.hasFormat('italic'),
            bullets: $isListNode(list) && list.getListType() === 'bullet',
            numbers: $isListNode(list) && list.getListType() === 'number',
            link: $findMatchingParent(anchor, $isLinkNode) !== null,
          });
        });
      }),
    [editor, onChangeMarkdown, onMarks],
  );

  useEffect(() => {
    registerCommands({
      toggleBold: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold'),
      toggleItalic: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic'),
      toggleBullets: () => {
        let on = false;
        editor.getEditorState().read(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) return;
          const l = $findMatchingParent(sel.anchor.getNode(), $isListNode);
          on = $isListNode(l) && l.getListType() === 'bullet';
        });
        editor.dispatchCommand(
          on ? REMOVE_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND,
          undefined,
        );
      },
      toggleNumbers: () => {
        let on = false;
        editor.getEditorState().read(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) return;
          const l = $findMatchingParent(sel.anchor.getNode(), $isListNode);
          on = $isListNode(l) && l.getListType() === 'number';
        });
        editor.dispatchCommand(
          on ? REMOVE_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND,
          undefined,
        );
      },
      selectedText: () => {
        let text = '';
        editor.getEditorState().read(() => {
          const sel = $getSelection();
          if ($isRangeSelection(sel)) text = sel.getTextContent();
        });
        return text;
      },
      applyLink: (href, text) => {
        if (!isSafeHref(href)) return;
        editor.update(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) return;
          if (sel.isCollapsed()) sel.insertText(text);
        });
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, href);
      },
    });
  }, [editor, registerCommands]);

  return null;
}


/**
 * @mention autocomplete, using a REAL caret.
 *
 * This is the half the plain-text box cannot have. `MentionField` passes the
 * whole value to `activeMentionQuery`, which is `$`-anchored, so a mention must
 * be the last thing in the box — put the caret in the middle, type `@`, and
 * nothing opens. Here the query comes from the text BEFORE the caret in the
 * anchor node, so mid-text mentions work, which is a bug fix rather than a new
 * feature.
 *
 * The list, its ranking, the highlight and the popover are the SHARED ones. Only
 * "where is the caret" and "insert here" live in this file — the same division
 * `mentionKeys.ts` documents, with Lexical commands standing in for onKeyPress.
 */
function MentionPlugin({
  candidates,
  prioritiseUids,
}: {
  candidates: readonly MentionCandidate[];
  prioritiseUids?: readonly string[];
}) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const pitch = useRef(ROW_PITCH);

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel) || !sel.isCollapsed()) {
            setQuery(null);
            return;
          }
          const node = sel.anchor.getNode();
          if (!$isTextNode(node)) {
            setQuery(null);
            return;
          }
          // Text up to the CARET, not the whole value.
          setQuery(activeMentionQuery(node.getTextContent().slice(0, sel.anchor.offset)));
        });
      }),
    [editor],
  );

  const policy = useMentionPolicy({
    query,
    candidates,
    prioritiseUids,
    rowPitch: pitch.current,
    onInsert: (candidate) => {
      const handle = handleFor(candidate.email);
      editor.update(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel) || !sel.isCollapsed()) return;
        const node = sel.anchor.getNode();
        if (!$isTextNode(node)) return;
        const offset = sel.anchor.offset;
        const before = node.getTextContent().slice(0, offset);
        const m = before.match(/(?:^|\s)@([A-Za-z0-9._%+-]*)$/);
        if (!m) return;
        // Select back over the "@partial" only — never the space before it.
        const typed = m[0].startsWith('@') ? m[0].length : m[0].length - 1;
        sel.setTextNodeRange(node, offset - typed, node, offset);
        sel.insertText(`@${handle} `);
      });
    },
    onRefocus: () => editor.focus(),
  });

  // Focus drives whether the popover may open at all.
  useEffect(() => {
    const el = editor.getRootElement();
    if (!el) return;
    const on = () => policy.onFocus();
    const off = () => policy.onBlur();
    el.addEventListener('focus', on);
    el.addEventListener('blur', off);
    return () => {
      el.removeEventListener('focus', on);
      el.removeEventListener('blur', off);
    };
  }, [editor, policy]);

  /**
   * Keys, intercepted ONLY while the list is open.
   *
   * Returning true swallows the event, so Enter must still insert a paragraph
   * and Tab must still move focus whenever the popover is closed — the same
   * gating `mentionKeys.web.ts` applies with `preventDefault`.
   */
  useEffect(() => {
    const stop = (fn: () => void) => () => {
      if (!policy.open) return false;
      fn();
      return true;
    };
    const accept = () => {
      const s = policy.suggestions[policy.index];
      if (s) policy.accept(s);
    };
    return mergeRegister(
      editor.registerCommand(KEY_ARROW_DOWN_COMMAND, stop(() => policy.move(1)), COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_ARROW_UP_COMMAND, stop(() => policy.move(-1)), COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_ENTER_COMMAND, stop(accept), COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_TAB_COMMAND, stop(accept), COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_ESCAPE_COMMAND, stop(() => policy.dismiss()), COMMAND_PRIORITY_HIGH),
    );
  }, [editor, policy]);

  if (!policy.open) return null;
  return (
    <MentionList
      suggestions={policy.suggestions}
      index={policy.index}
      listRef={policy.listRef}
      onPick={policy.accept}
      onMeasureRow={(p) => {
        pitch.current = p;
      }}
    />
  );
}

export function RichEditor({
  initialMarkdown,
  onChangeMarkdown,
  placeholder,
  autoFocus,
  candidates,
  prioritiseUids,
  testID,
}: {
  initialMarkdown: string;
  onChangeMarkdown: (md: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Board members, when this box supports @mentions (comments do; descriptions do not). */
  candidates?: readonly MentionCandidate[];
  prioritiseUids?: readonly string[];
  /** Stable handle for e2e: a contenteditable exposes no placeholder to select on. */
  testID?: string;
}) {
  const t = useTheme();
  const [marks, setMarks] = useState<RichMarks>(EMPTY_MARKS);
  const [linkOpen, setLinkOpen] = useState(false);
  const cmds = useRef<Parameters<Parameters<typeof Bridge>[0]['registerCommands']>[0] | null>(null);
  const registerCommands = useCallback((c: NonNullable<typeof cmds.current>) => {
    cmds.current = c;
  }, []);

  /**
   * Node styling by CLASS, generated from theme tokens.
   *
   * `ContentEditable` is a real DOM element, so react-native-web styles do not
   * reach it and descendant rules (`strong`, `ul`, `a`) cannot be inline. The
   * ESLint no-hardcoded-colour rule cannot see inside a CSS string either, so
   * every colour here comes from `useTheme()` deliberately.
   */
  const css = useMemo(
    () => `
      .sk-rt { outline: none; }
      .sk-rt-p { margin: 0 0 ${space.sm}px; }
      .sk-rt-b { font-weight: 700; }
      .sk-rt-i { font-style: italic; }
      .sk-rt-a { color: ${t.accent.base}; text-decoration: underline; }
      .sk-rt-ul, .sk-rt-ol { margin: 0 0 ${space.sm}px; padding-left: ${space.lg}px; }
      .sk-rt-li { margin: 0 0 ${space.xs}px; }
    `,
    [t.accent.base],
  );

  const initialConfig = useMemo(
    () => ({
      namespace: 'sabeel-rich',
      nodes: [ListNode, ListItemNode, LinkNode],
      theme: {
        paragraph: 'sk-rt-p',
        text: { bold: 'sk-rt-b', italic: 'sk-rt-i' },
        link: 'sk-rt-a',
        list: { ul: 'sk-rt-ul', ol: 'sk-rt-ol', listitem: 'sk-rt-li' },
      },
      onError: (e: Error) => {
        throw e;
      },
    }),
    [],
  );

  const commands = useMemo(
    () => ({
      toggleBold: () => cmds.current?.toggleBold(),
      toggleItalic: () => cmds.current?.toggleItalic(),
      toggleBullets: () => cmds.current?.toggleBullets(),
      toggleNumbers: () => cmds.current?.toggleNumbers(),
      promptLink: () => setLinkOpen(true),
    }),
    [],
  );

  // Into <head>, not into the tree: a <style> element inside a View is invalid
  // nesting and React says so on every render. One node, shared by every editor
  // instance, replaced when the theme changes.
  useEffect(() => {
    const id = 'sk-richtext-style';
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = css;
  }, [css]);

  return (
    <View style={styles.wrap}>
      {/*
        Pressing a toolbar button steals focus and collapses the selection
        before the command runs, so the format applies to nothing. Preventing
        the default on mousedown is the standard fix and has no RN equivalent,
        which is precisely the kind of thing the seam exists to hold.
      */}
      <div onMouseDown={(e) => e.preventDefault()}>
        <RichToolbar commands={commands} marks={marks} />
      </div>

      <LexicalComposer initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="sk-rt"
              data-testid={testID}
              aria-label={placeholder ?? 'Rich text'}
              autoFocus={autoFocus}
              style={{
                minHeight: 120,
                backgroundColor: t.bg.surface,
                color: t.text.primary,
                borderColor: t.border.subtle,
                borderWidth: StyleSheet.hairlineWidth,
                borderStyle: 'solid',
                borderRadius: radius.sm,
                padding: space.md,
                fontSize: 16,
                lineHeight: 1.5,
              }}
            />
          }
          placeholder={
            <div
              style={{
                position: 'absolute',
                pointerEvents: 'none',
                padding: space.md,
                color: t.text.muted,
                fontSize: 16,
              }}
            >
              {placeholder}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin validateUrl={isSafeHref} />
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
        {candidates ? (
          <MentionPlugin candidates={candidates} prioritiseUids={prioritiseUids} />
        ) : null}
        <Bridge
          initialMarkdown={initialMarkdown}
          onChangeMarkdown={onChangeMarkdown}
          onMarks={setMarks}
          registerCommands={registerCommands}
        />
      </LexicalComposer>

      <LinkSheet
        visible={linkOpen}
        initialText={cmds.current?.selectedText() ?? ''}
        onCancel={() => setLinkOpen(false)}
        onConfirm={(href, text) => {
          cmds.current?.applyLink(href, text);
          setLinkOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
});
