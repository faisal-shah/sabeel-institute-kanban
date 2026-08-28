import { useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { enablePush, pushPromptState } from './notify';
import { useCheckOnForeground } from './foreground';
import { afterRecheck, type NudgeState } from './pushNudgeState';

/**
 * The one-time nudge to switch notifications on, shown on the first screen
 * after signing in.
 *
 * It exists because the permission prompt has to follow a press (see
 * notify.web.ts and notify.ts — the rule holds on both surfaces, for different
 * reasons), and the only control that does that lives on the notifications
 * screen — which someone who never goes looking will never find. This is the
 * discoverable route to the same call.
 *
 * Dismissing costs NOTHING. That is the whole point of asking on our own card
 * before the browser's or the OS's: a "not now" here is free and repeatable,
 * while a dismissed browser or OS dialog can never be raised again. The
 * notifications screen always offers the same control, so nobody is trapped by
 * dismissing.
 */

/**
 * Per DEVICE because permission is per device, and per ACCOUNT because a shared
 * browser must not hide the nudge from whoever signs in next. AsyncStorage is
 * localStorage on web, so one implementation covers both surfaces.
 */
const key = (uid: string) => `pushNudgeDismissed:${uid}`;

async function isDismissed(uid: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key(uid))) === '1';
  } catch {
    // Storage blocked — a locked-down browser, a private window. Showing the
    // nudge is the safe answer: it is dismissible, and the alternative is
    // hiding it from someone who never chose to hide it.
    return false;
  }
}

/**
 * ONE state owns whether the card shows AND what it says, so the two cannot
 * disagree — the same shape `ColumnNameEditor` uses for editing-and-text.
 *
 * They did disagree, and it took a device to see it. Two independent flags let
 * the foreground re-check below clear a failure the press had just recorded:
 * the OS permission dialog is its own activity, so ALLOWING it returns the app
 * to the front and fires that re-check, which found permission granted, decided
 * the card was no longer needed and hid it — while the attempt behind it was
 * still failing to file a token. The card vanished on a press that achieved
 * nothing, which is precisely the silent failure the failed state exists to
 * prevent, reintroduced by the fix for a different silent failure.
 */
export function usePushNudge(uid: string): {
  visible: boolean;
  busy: boolean;
  /** Permission was granted but no token came back — say so, do not vanish. */
  failed: boolean;
  enable: () => Promise<void>;
  dismiss: () => void;
} {
  const [state, setState] = useState<NudgeState>('hidden');
  const [busy, setBusy] = useState(false);
  /**
   * How many attempts are in flight. While any is, a foreground event is OUR OWN
   * prompt closing rather than news from outside: `enable` owns the outcome, and
   * a re-check racing it can only get the answer wrong, because it reads the
   * permission alone and cannot see whether a token was filed.
   *
   * A COUNT rather than a flag. `busy` disables the button, but busy is state,
   * so it cannot stop a second press in the same frame — and with a flag the
   * first attempt to finish would clear it while the second was still running,
   * reopening the window it exists to close.
   *
   * A ref, not state: it is read inside an async callback that would otherwise
   * close over a stale value, and nothing renders from it.
   */
  const attempts = useRef(0);

  // Remounting covers most of it — this app renders one screen per route rather
  // than stacking them, so returning to the board list re-runs this, where the
  // two sibling apps keep their home screen mounted and need useFocusEffect.
  // What remounting does NOT cover is leaving the app entirely — for the system
  // settings screen, or for the permission dialog — and coming back. See
  // useCheckOnForeground.
  useCheckOnForeground(() => {
    let live = true;
    void (async () => {
      const [permission, dismissed] = await Promise.all([
        pushPromptState(),
        isDismissed(uid),
      ]);
      if (!live || attempts.current > 0) return;
      // Only 'default' is worth a nudge: granted needs nothing, and denied
      // cannot be re-asked from here at all.
      const askable = permission === 'default' && !dismissed;
      setState((prev) => afterRecheck(prev, askable));
    })();
    return () => {
      live = false;
    };
  }, [uid]);

  // enablePush must be the FIRST thing this does — a browser only honours a
  // permission request raised directly from a press, and an await before it
  // loses that. setBusy and the ref are synchronous, so they do not separate
  // the two.
  const enable = () => {
    attempts.current += 1;
    setBusy(true);
    // RETURNED, not voided: a Button that awaits its handler to drive its own
    // progress (the time tracker's does) gets nothing from a void. Returning
    // the promise does not await it, so the request above is still raised
    // synchronously inside the press.
    //
    // .catch as well as .then: enablePush is total by construction, but a
    // rejection slipping through here would leave the button spinning with no
    // way back, which is worse than any answer it could have given.
    //
    // It maps to 'unavailable', NOT to undefined: undefined fell through to the
    // hide-the-card branch below, so a rejection vanished silently and looked
    // exactly like success — the very thing the failed state exists to prevent.
    return enablePush(uid)
      .catch(() => 'unavailable' as const)
      .then((result) => {
        setBusy(false);
        // Granted needs no further nudge. A refusal hides the card too — NOT
        // because the refusal is final, which on Android it is not until the
        // second one, but because nagging in the same breath as a "no" is how a
        // one-time offer becomes an irritant. It comes back on the next remount
        // while the device is still askable, which is the right cadence for it.
        //
        // But permission granted with NO TOKEN behind it is a silent failure
        // that looks exactly like success: the card would vanish and nothing
        // would ever arrive. Say so instead.
        setState(result === 'unavailable' ? 'failed' : 'hidden');
        // Released LAST, after the outcome is recorded, so a foreground event
        // arriving in between cannot overwrite it.
        attempts.current -= 1;
      });
  };

  const dismiss = () => {
    setState('hidden');
    void AsyncStorage.setItem(key(uid), '1').catch(() => undefined);
  };

  return { visible: state !== 'hidden', busy, failed: state === 'failed', enable, dismiss };
}
