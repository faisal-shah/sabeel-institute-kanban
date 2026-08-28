import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { enablePush, pushPromptState } from './notify';

/**
 * The one-time nudge to switch notifications on, shown on the first screen
 * after signing in.
 *
 * It exists because the permission prompt has to follow a press (see
 * notify.web.ts), and the only control that does that lives on the
 * notifications screen — which someone who never goes looking will never find.
 * This is the discoverable route to the same call.
 *
 * Dismissing costs NOTHING. That is the whole point of asking on our own card
 * before the browser's: a "not now" here is free and repeatable, while a
 * dismissed browser or OS dialog can never be raised again. The notifications
 * screen always offers the same control, so nobody is trapped by dismissing.
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

export function usePushNudge(uid: string): {
  visible: boolean;
  busy: boolean;
  /** Permission was granted but no token came back — say so, do not vanish. */
  failed: boolean;
  enable: () => Promise<void>;
  dismiss: () => void;
} {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // A plain mount effect is right HERE, unlike in the two sibling apps: this app
  // renders one screen per route rather than stacking them, so returning to the
  // board list remounts it and re-runs this. The siblings keep their home screen
  // mounted under a pushed settings screen and need useFocusEffect instead.
  useEffect(() => {
    let live = true;
    void (async () => {
      // Only 'default' is worth a nudge: granted needs nothing, and denied
      // cannot be re-asked from here at all.
      const [state, dismissed] = await Promise.all([pushPromptState(), isDismissed(uid)]);
      if (!live) return;
      // Cleared on every re-check: a failure is about one attempt, not about the
      // device forever, and leaving it set would strand the card on an error
      // with no way to try again.
      setFailed(false);
      setVisible(state === 'default' && !dismissed);
    })();
    return () => {
      live = false;
    };
  }, [uid]);

  // enablePush must be the FIRST thing this does — a browser only honours a
  // permission request raised directly from a press, and an await before it
  // loses that. setBusy is synchronous, so it does not separate the two.
  const enable = () => {
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
        // Granted needs no further nudge, and a refusal is sticky — both just
        // go away. But permission granted with NO TOKEN behind it is a silent
        // failure that looks exactly like success: the card would vanish and
        // nothing would ever arrive. Say so instead.
        if (result === 'unavailable') return setFailed(true);
        setVisible(false);
      });
  };

  const dismiss = () => {
    setVisible(false);
    void AsyncStorage.setItem(key(uid), '1').catch(() => undefined);
  };

  return { visible, busy, failed, enable, dismiss };
}
