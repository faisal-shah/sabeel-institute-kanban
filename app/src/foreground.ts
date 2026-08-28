import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Run a check on mount, and again every time the app comes back to the front.
 *
 * For state the app does not own and cannot be told about. Notification
 * permission is the case this exists for: the only advice a blocked device gets
 * is **Open settings**, which leaves the app entirely — and nothing brings the
 * answer back. `App.tsx` renders one screen per route, so returning from an
 * external activity remounts nothing and re-runs no effect.
 *
 * On the device that produced a closed loop: the screen said "Notifications are
 * blocked for this app on this device", its button sent you to Settings, you
 * turned them on, you came back, and it still said blocked with the same button
 * beside it. `dumpsys` said `granted=true` the whole time. The screen could only
 * be made honest by navigating somewhere else and back, which it never
 * suggested. Every test passed, on both surfaces, throughout.
 *
 * One implementation for both: react-native-web maps AppState onto document
 * visibility, so a browser tab returning from the site-settings panel re-reads
 * exactly the same way.
 *
 * `check` may return a cleanup, and it is not optional courtesy — these checks
 * are async and set state when they land, so each run must be able to disown
 * itself. The cleanup runs before the NEXT run as well as on unmount; without
 * that, two foregrounds in quick succession leave two live checks racing to set
 * the same state, and the slower one wins.
 *
 * The callback is held in a ref so a caller may pass an inline closure without
 * resubscribing on every render.
 */
export function useCheckOnForeground(
  check: () => (() => void) | void,
  deps: unknown[],
): void {
  const latest = useRef(check);
  latest.current = check;

  useEffect(() => {
    let cancel: (() => void) | void;
    const run = () => {
      if (typeof cancel === 'function') cancel();
      cancel = latest.current();
    };
    run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => {
      // Optional because react-native-web's AppState returns nothing at all when
      // `document.visibilityState` is unavailable — a library boundary, so the
      // subscription is not assumed to exist just because the types say so.
      sub?.remove();
      if (typeof cancel === 'function') cancel();
    };
    // The caller states its own dependencies; a spread array cannot be checked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
