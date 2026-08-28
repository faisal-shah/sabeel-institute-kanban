/**
 * The push nudge card's state, and the one transition that is easy to get wrong.
 *
 * Its own module, importing NOTHING, because `pushNudge.ts` reaches
 * `react-native` through the foreground hook and `app/`'s runner deliberately
 * takes plain `.ts` only — see `vitest.config.ts`. The rule there is that a test
 * needing a renderer belongs in an e2e suite; this needs neither, so it should
 * not have to mock a platform to be checked.
 */

export type NudgeState = 'hidden' | 'offer' | 'failed';

/**
 * What a re-check does to the card.
 *
 * Pure and tested because the bug it fixes is a RACE between two event sources,
 * and neither a renderer nor a browser can reproduce it: the OS permission
 * dialog is its own activity, so ALLOWING it returns the app to the front and
 * fires the foreground re-check that exists to catch a setting changed outside
 * the app. That re-check reads the permission alone — it cannot see whether a
 * token was filed — so on a device where registration then failed it found
 * "granted", concluded the card was no longer needed, and hid it. The press
 * achieved nothing and said nothing.
 *
 * Web never shows it: permission is granted there without leaving the page, so
 * no foreground event collides with the attempt, and both browser suites are
 * green with the bug present.
 */
export function afterRecheck(prev: NudgeState, askable: boolean): NudgeState {
  // Askable again means a fresh chance, so a past failure is spent news — it
  // was about one attempt, not about the device forever.
  if (askable) return 'offer';
  // Not askable, and a failure is on screen: it stays. It is the only record
  // that the press did nothing, and the state that replaced it here was
  // "granted", which is exactly what a failed attempt leaves behind.
  return prev === 'failed' ? 'failed' : 'hidden';
}
