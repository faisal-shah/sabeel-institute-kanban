/**
 * The @mention popover, drawn at the ROOT of the app rather than in the editor.
 *
 * WHY IT CANNOT LIVE IN THE EDITOR. react-native-web gives every View
 * `position: relative` AND `zIndex: 0`, so every View is a stacking context.
 * A popover inside the editor therefore cannot paint above anything outside the
 * editor's nearest positioned ancestor, no matter how high its own `zIndex` is.
 * Lifting the editor over its own siblings fixed the Comment button next to it
 * and stopped there — the card's Activity section, a later sibling of the whole
 * comments Card, still drew over the THIRD name. Measured, not guessed:
 * `elementFromPoint` at the centre of the "Mention Sara" row returned "Faisal
 * created this card", and a click on that row timed out because the row was not
 * hittable. A person could not pick the third person on the list.
 *
 * Raising the Card too would fix that one case and break again the next time a
 * section is added after the editor, because the rule it relies on — "nothing is
 * drawn after me" — is not stated anywhere and cannot be checked. So the popover
 * is rendered OUT of the editor's tree entirely, as the last child of the app
 * root, positioned in SCREEN coordinates. Nothing can seal it in, because there
 * is nothing above it.
 *
 * A STORE RATHER THAN A CONTEXT holding a node. `OverlayLayer` is the only
 * subscriber, so opening the popover and narrowing it re-renders that layer
 * alone. A context would re-render the whole app on every keystroke that filters
 * the list — the exact cost `viewState.ts` exists to avoid, and the reason the
 * text drafts were moved out of the screens in the first place.
 *
 * ONE SLOT, deliberately. Only one input can hold focus, so only one popover can
 * be open; a second would be a bug, and a single slot makes it unrepresentable.
 */
import { useEffect, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import { MentionList, type MentionListProps } from './MentionList';
import { createViewStore } from '../viewState';

/**
 * `anchor` is non-null on this path by construction: the editor renders the list
 * inline when it has no caret to anchor to, and only hands it here once it does.
 */
type OpenMention = MentionListProps & { anchor: NonNullable<MentionListProps['anchor']> };

/**
 * `owner` is which editor put it there.
 *
 * A card has TWO editors — the description and the comment composer — and both
 * call the hook below. Without an owner, the one that is closed clears the slot
 * belonging to the one that is open: mounting publishes null, and so does every
 * unmount. Clearing only your own entry makes that unrepresentable rather than
 * a race whose outcome depends on which editor rendered last.
 */
const store = createViewStore<{ owner: string | null; open: OpenMention | null }>({
  owner: null,
  open: null,
});

/**
 * Publish this editor's popover to the root layer, or withdraw it.
 *
 * Pass null whenever the popover is closed OR the platform could not measure a
 * caret — the caller renders the inline fallback in that case, and two copies of
 * the same list would otherwise be on screen at once.
 */
export function useMentionOverlay(open: OpenMention | null): void {
  const owner = useId();
  useEffect(() => {
    store.set((prev) =>
      open
        ? { owner, open }
        : // Only clear what is MINE. A closed editor must not blank the popover
          // of the one the person is actually typing in.
          prev.owner === owner
          ? { owner: null, open: null }
          : prev,
    );
  }, [open, owner]);
  // Withdraw on unmount too: closing a card unmounts the editor without ever
  // setting `open` to null, and the popover would outlive the screen it belongs
  // to — floating over whatever the person navigated to next.
  useEffect(
    () => () =>
      store.set((prev) =>
        prev.owner === owner ? { owner: null, open: null } : prev,
      ),
    [owner],
  );
}

/**
 * The layer itself. Mounted once, at the app root and OUTSIDE `SafeAreaProvider`.
 *
 * Outside deliberately: `StyleSheet.absoluteFill` fills its PARENT, and the
 * anchors handed to it are screen coordinates — a viewport rect on web, the
 * focused input's `absoluteY` on native. Nested inside a provider that insets
 * its children, the layer's origin would sit below the status bar while the
 * coordinates still counted from the top of it, and everything would be drawn
 * one inset too low on device while looking perfect in a browser.
 */
export function OverlayLayer() {
  const { open } = store.use();
  if (!open) return null;
  return (
    // `box-none`, or this fills the screen and swallows every touch in the app
    // while a mention is open. Only the popover itself takes them.
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <MentionList {...open} />
    </View>
  );
}
