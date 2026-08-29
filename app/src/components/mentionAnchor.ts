/**
 * WHERE the @mention popover goes, given where the caret is.
 *
 * Pure arithmetic, on purpose. Anchoring to the caret needs a number from the
 * platform — a DOM range rect on web, a native selection event on Android — and
 * neither can be exercised in a unit test. This module is the half that can be,
 * so the decisions (flip, clamp, how tall) are pinned by tests and only the
 * measurement is left to a device. `afterRecheck` was split out for the same
 * reason.
 *
 * The popover used to sit at `bottom: 100%; left: 0; right: 0` — above the WHOLE
 * field, full width. On a short box that reads as "at the caret" by accident; on
 * a long comment the caret is at the bottom and the list is hundreds of pixels
 * above it, off screen. Everything here exists to make it behave like code
 * completion in an editor instead.
 */

/** Where the popover should be drawn, relative to the field's own box. */
export interface MentionAnchor {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  /** Which side of the caret line it landed on — for tests and for debugging. */
  placement: 'below' | 'above';
}

export interface CaretBox {
  /** Caret left edge, relative to the field's box. */
  x: number;
  /** Caret TOP, relative to the field's box. */
  y: number;
  /** Caret height — one line. The popover clears it rather than covering it. */
  height: number;
}

export interface AnchorSpace {
  /** The field's own width; the popover is clamped inside it. */
  fieldWidth: number;
  /** Room under the caret line before something occludes it (keyboard, viewport edge). */
  below: number;
  /** Room above the caret line. */
  above: number;
}

/** Widest the list gets. Beyond this, long names gain nothing and scanning costs. */
export const MENTION_POPOVER_WIDTH = 280;
/** Below this the list is a peephole; flip instead of squeezing into it. */
const MIN_USABLE_HEIGHT = 96;
/** Breathing room between the caret line and the list. */
const GAP = 4;

/**
 * Place the popover.
 *
 * BELOW the caret is preferred — that is where a code-completion list goes, and
 * it leaves what you just typed visible. It flips ABOVE when below cannot show a
 * usable list, which on a phone is most of the time: the keyboard eats the space
 * under the caret.
 *
 * The flip is on `MIN_USABLE_HEIGHT`, not on "does it all fit". Waiting for the
 * full list to fit would flip on a long list that had ample room for four rows,
 * and a list that scrolls is not short of anything.
 */
export function anchorForCaret(
  caret: CaretBox,
  space: AnchorSpace,
  desiredHeight: number,
): MentionAnchor {
  const width = Math.max(0, Math.min(MENTION_POPOVER_WIDTH, space.fieldWidth));

  const roomBelow = Math.max(0, space.below - GAP);
  const roomAbove = Math.max(0, space.above - GAP);

  // Prefer below; flip when below is unusable AND above is genuinely better.
  const below =
    roomBelow >= Math.min(desiredHeight, MIN_USABLE_HEIGHT) || roomAbove <= roomBelow;

  const maxHeight = Math.min(desiredHeight, below ? roomBelow : roomAbove);

  return {
    top: below
      ? caret.y + caret.height + GAP
      : caret.y - GAP - maxHeight,
    // Clamped so the list never leaves the field sideways. A caret near the
    // right edge otherwise pushes it past the border, and on web that is a
    // horizontal scrollbar on the page — a layout fault the sweep fails on.
    left: clamp(caret.x, 0, Math.max(0, space.fieldWidth - width)),
    width,
    maxHeight,
    placement: below ? 'below' : 'above',
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Where the popover goes when the platform cannot measure a caret.
 *
 * There used to be a second answer to this question: the list was rendered
 * INSIDE the editor with `bottom: 100%`, so the fallback had its own rendering
 * path, its own stacking problem, and its own `zIndex` lift to escape it. That
 * lift is what cost the editor its focus on Android. Two paths meant the rare
 * one carried a hazard the common one had already solved.
 *
 * So the fallback is now the same path: a real anchor, in screen coordinates,
 * drawn by the same overlay. It is expressed as a caret of zero height at the
 * field's top-left with NO room below, which makes `anchorForCaret` flip above
 * and clamp to the room available — reproducing "above the whole field" without
 * a second set of rules to keep in step.
 *
 * The one deliberate difference from the old placement: it is capped at
 * `MENTION_POPOVER_WIDTH` rather than spanning the field, because that cap is a
 * property of the list and not of how it happened to be positioned.
 */
export function anchorForField(
  field: { x: number; y: number; width: number },
  desiredHeight: number,
): MentionAnchor {
  const anchor = anchorForCaret(
    { x: 0, y: 0, height: 0 },
    { fieldWidth: field.width, below: 0, above: field.y },
    desiredHeight,
  );
  return { ...anchor, top: anchor.top + field.y, left: anchor.left + field.x };
}
