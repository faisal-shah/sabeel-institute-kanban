/**
 * NATIVE (web sibling: RichEditor.web.tsx). The Fabric half of the editor seam.
 *
 * `react-native-enriched-html` is a real native input — no WebView — so
 * `react-native-keyboard-controller` still sees a focused view and scrolls it
 * clear of the IME. That was the highest-risk question in the plan and it was
 * settled on a device before this was written: the editor, the toolbar row AND
 * the Save/Cancel row all stay visible with the keyboard up, inside the
 * existing 96px budget.
 *
 * Markdown in, markdown out, through the SAME `richtextHtml` seam the web half
 * uses, so identical keystrokes produce byte-identical markdown on both
 * surfaces.
 *
 * THREE PROPS ARE CORRECTIONS TO THE LIBRARY'S DEFAULTS, each read out of its
 * types rather than assumed:
 *  - `scrollEnabled={false}` — it defaults TRUE, giving the editor its own
 *    scroll view nested inside `Screen`'s `KeyboardScroll`. That is the same
 *    nested-scroller bug the mention list already had to solve.
 *  - `linkRegex={null}` — autodetection is ON by default and would rewrite a
 *    bare URL into a markdown link on Android ONLY, so the same typing would
 *    store different bytes than the browser did. Autolinking belongs at render
 *    time, where both surfaces share one implementation.
 *  - `textShortcuts` pinned to exactly our two list triggers. The default
 *    happens to match today; pinning means an upstream change cannot silently
 *    add a heading or quote trigger.
 *
 * Underline is the one rough edge: a hardware Ctrl+U can set it, markdown
 * cannot express it, and the converter drops it — so the text visibly
 * un-underlines. `textShortcuts` governs typed triggers, not hardware keys, and
 * the library exposes no opt-out. Documented in the manual.
 */
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  EnrichedTextInput,
  type EnrichedTextInputInstance,
} from 'react-native-enriched-html';
import {
  handleFor,
  htmlToMarkdown,
  markdownToHtml,
  type MentionCandidate,
} from '@sabeel/shared';
import { RichToolbar, type RichMarks } from './RichToolbar';
import { LinkSheet } from './LinkSheet';
import { MentionList, ROW_PITCH } from './MentionList';
import { useMentionPolicy } from './useMentionPolicy';
import { radius, space, useTheme } from '../theme';

/** Exactly the two list triggers, pinned rather than defaulted. */
const TEXT_SHORTCUTS = [
  { trigger: '- ', style: 'unordered_list' as const },
  { trigger: '1. ', style: 'ordered_list' as const },
];

const EMPTY_MARKS: RichMarks = {
  bold: false,
  italic: false,
  bullets: false,
  numbers: false,
  link: false,
};

export function RichEditor({
  initialMarkdown,
  onChangeMarkdown,
  placeholder,
  autoFocus,
  candidates,
  prioritiseUids,
}: {
  initialMarkdown: string;
  onChangeMarkdown: (md: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  candidates?: readonly MentionCandidate[];
  prioritiseUids?: readonly string[];
  /** Web only — a contenteditable has no placeholder to select on. */
  testID?: string;
}) {
  const t = useTheme();
  const ref = useRef<EnrichedTextInputInstance>(null);
  const [marks, setMarks] = useState<RichMarks>(EMPTY_MARKS);
  const [linkOpen, setLinkOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const pitch = useRef(ROW_PITCH);
  /**
   * `setLink` takes an explicit [start, end) range rather than "the current
   * selection", so the caret has to be tracked. Read out of the library's
   * types, and it shapes the whole link flow.
   */
  const sel = useRef({ start: 0, end: 0, text: '' });

  const policy = useMentionPolicy({
    query,
    candidates: candidates ?? [],
    prioritiseUids,
    rowPitch: pitch.current,
    // The library owns the mention node; we only say which handle it is.
    onInsert: (c) => ref.current?.setMention('@', handleFor(c.email)),
    onRefocus: () => ref.current?.focus(),
  });

  const commands = useCallback(
    () => ({
      toggleBold: () => ref.current?.toggleBold(),
      toggleItalic: () => ref.current?.toggleItalic(),
      toggleBullets: () => ref.current?.toggleUnorderedList(),
      toggleNumbers: () => ref.current?.toggleOrderedList(),
      promptLink: () => setLinkOpen(true),
    }),
    [],
  );

  return (
    <View style={styles.wrap}>
      <RichToolbar commands={commands()} marks={marks} />

      {/* Positioning context for the popover, which is absolute and sits above
          the input. RN Views are `relative` by default. */}
      <View>
        {policy.open ? (
          <MentionList
            suggestions={policy.suggestions}
            index={policy.index}
            listRef={policy.listRef}
            onPick={policy.accept}
            onMeasureRow={(p) => {
              pitch.current = p;
            }}
          />
        ) : null}

        <EnrichedTextInput
          ref={ref}
          defaultValue={markdownToHtml(initialMarkdown)}
          placeholder={placeholder}
          placeholderTextColor={t.text.muted}
          autoFocus={autoFocus}
          scrollEnabled={false}
          linkRegex={null}
          textShortcuts={TEXT_SHORTCUTS}
          mentionIndicators={candidates ? ['@'] : []}
          onChangeHtml={(e) => onChangeMarkdown(htmlToMarkdown(e.nativeEvent.value))}
          onChangeState={(e) => {
            const s = e.nativeEvent;
            setMarks({
              bold: !!s.bold?.isActive,
              italic: !!s.italic?.isActive,
              bullets: !!s.unorderedList?.isActive,
              numbers: !!s.orderedList?.isActive,
              link: !!s.link?.isActive,
            });
          }}
          onChangeSelection={(e) => {
            sel.current = {
              start: e.nativeEvent.start,
              end: e.nativeEvent.end,
              text: e.nativeEvent.text ?? '',
            };
          }}
          // The library extracts the query itself, so `activeMentionQuery` —
          // which exists to find one in a flat string — is simply not needed
          // here. Start fires with an empty query; change carries the text.
          onStartMention={() => setQuery('')}
          onChangeMention={(e) => setQuery(e.text)}
          onEndMention={() => setQuery(null)}
          onFocus={policy.onFocus}
          onBlur={policy.onBlur}
          style={{
            minHeight: 120,
            backgroundColor: t.bg.surface,
            borderColor: t.border.subtle,
            borderWidth: StyleSheet.hairlineWidth,
            borderRadius: radius.sm,
            padding: space.md,
            color: t.text.primary,
          }}
          htmlStyle={{ a: { color: t.accent.base } }}
        />
      </View>

      <LinkSheet
        visible={linkOpen}
        initialText={sel.current.text}
        onCancel={() => setLinkOpen(false)}
        onConfirm={(href, text) => {
          ref.current?.setLink(sel.current.start, sel.current.end, text, href);
          setLinkOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
});
