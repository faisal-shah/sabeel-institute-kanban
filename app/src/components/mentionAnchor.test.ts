import { describe, expect, it } from 'vitest';
import {
  anchorForCaret,
  anchorForField,
  MENTION_POPOVER_WIDTH,
  type AnchorSpace,
} from './mentionAnchor';

const caret = { x: 40, y: 120, height: 18 };
const roomy: AnchorSpace = { fieldWidth: 600, below: 400, above: 400 };

describe('anchorForCaret', () => {
  it('sits below the caret line when there is room', () => {
    const a = anchorForCaret(caret, roomy, 260);
    expect(a.placement).toBe('below');
    // Below the caret, and clear of it — never covering the character just typed.
    expect(a.top).toBeGreaterThanOrEqual(caret.y + caret.height);
  });

  it('flips above when the keyboard leaves no usable room below', () => {
    const a = anchorForCaret(caret, { ...roomy, below: 20 }, 260);
    expect(a.placement).toBe('above');
    expect(a.top + a.maxHeight).toBeLessThanOrEqual(caret.y);
  });

  it('does NOT flip merely because the whole list will not fit below', () => {
    // 140px is not the full 260 wanted, but it is four rows — flipping here
    // would move the list for no gain.
    const a = anchorForCaret(caret, { ...roomy, below: 140, above: 400 }, 260);
    expect(a.placement).toBe('below');
  });

  it('stays below when above is no better', () => {
    const a = anchorForCaret(caret, { fieldWidth: 600, below: 10, above: 10 }, 260);
    expect(a.placement).toBe('below');
  });

  it('clamps to the field rather than overflowing it sideways', () => {
    const a = anchorForCaret({ ...caret, x: 580 }, { ...roomy, fieldWidth: 600 }, 260);
    expect(a.left).toBe(600 - MENTION_POPOVER_WIDTH);
    expect(a.left + a.width).toBeLessThanOrEqual(600);
  });

  it('never starts left of the field', () => {
    const a = anchorForCaret({ ...caret, x: -50 }, roomy, 260);
    expect(a.left).toBe(0);
  });

  it('narrows to the field on a phone rather than overflowing it', () => {
    const a = anchorForCaret(caret, { ...roomy, fieldWidth: 200 }, 260);
    expect(a.width).toBe(200);
    expect(a.left).toBe(0);
  });

  it('caps its height at the room actually available', () => {
    const a = anchorForCaret(caret, { ...roomy, below: 150 }, 260);
    expect(a.maxHeight).toBeLessThanOrEqual(150);
  });

  it('never asks for more height than the list wants', () => {
    const a = anchorForCaret(caret, roomy, 120);
    expect(a.maxHeight).toBe(120);
  });
});

describe('anchorForField', () => {
  const field = { x: 16, y: 500, width: 600 };

  it('sits ABOVE the field, clear of it', () => {
    const a = anchorForField(field, 260);
    expect(a.placement).toBe('above');
    expect(a.top + a.maxHeight).toBeLessThanOrEqual(field.y);
  });

  it('is in SCREEN coordinates, not field-relative', () => {
    const a = anchorForField(field, 260);
    expect(a.left).toBe(field.x);
    expect(a.top).toBeGreaterThan(0);
  });

  it('never runs off the top of the screen', () => {
    // A field near the very top has almost no room above it.
    const a = anchorForField({ x: 0, y: 40, width: 600 }, 260);
    expect(a.top).toBeGreaterThanOrEqual(0);
    expect(a.maxHeight).toBeLessThanOrEqual(40);
  });

  it('narrows to a phone-width field', () => {
    const a = anchorForField({ x: 0, y: 500, width: 200 }, 260);
    expect(a.width).toBe(200);
  });
});
