import { describe, expect, it } from 'vitest';
import { afterRecheck } from './pushNudgeState';

/**
 * The nudge card's re-check, which has to survive an event it did not ask for.
 *
 * The OS permission dialog is its own activity, so ALLOWING it returns the app
 * to the front and fires the same foreground re-check that exists to catch a
 * setting changed outside the app. That re-check reads the permission alone —
 * it cannot see whether a token was filed — so on a device where registration
 * then fails it found "granted", concluded the card was no longer needed, and
 * hid it. The press achieved nothing and said nothing, which is the exact
 * silent failure the failed state was added to prevent.
 *
 * Only a device shows it: web grants permission without leaving the page, so no
 * foreground event ever collides with the attempt, and both browser suites are
 * green with the bug present. Hence a pure function, tested here.
 */
describe('afterRecheck', () => {
  it('keeps a failure on screen when the device is no longer askable', () => {
    expect(afterRecheck('failed', false)).toBe('failed');
  });

  it('clears a failure once the device can be asked again', () => {
    expect(afterRecheck('failed', true)).toBe('offer');
  });

  it('offers when the device is askable', () => {
    expect(afterRecheck('hidden', true)).toBe('offer');
    expect(afterRecheck('offer', true)).toBe('offer');
  });

  it('hides an offer that is no longer askable', () => {
    // Granted elsewhere, refused for good, or dismissed on another screen.
    expect(afterRecheck('offer', false)).toBe('hidden');
    expect(afterRecheck('hidden', false)).toBe('hidden');
  });
});
