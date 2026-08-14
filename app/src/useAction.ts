import { useCallback, useState } from 'react';
import { toUserMessage } from './errors';
import { timed, type Untimed } from './slowWrites';

/**
 * The ONE way to run a user-triggered mutation.
 *
 * Every screen had its own `run()` that caught, set an error string, and moved
 * on. None of them tracked whether the work was in flight, so 22 of 36 actions
 * gave no feedback at all: you tap, nothing changes, and the app looks frozen.
 * That is how a slow comment post came to look like a dead button.
 *
 * `busy` is the point. Pass it to the Button that triggered the action so it
 * shows a spinner and stops accepting taps — which also prevents the duplicate
 * submissions that repeated tapping would otherwise cause.
 *
 * Errors go through `toUserMessage`, so anything a user is told about also
 * reaches Sentry, and slow writes are timed (see slowWrites.ts) because a
 * mutation that takes seconds is a defect even when it eventually succeeds.
 *
 * `busy` and the stopwatch cover the SAME region, and that is right for a
 * Firestore write but wrong for an action that opens system UI: `busy` should
 * span the file picker — it is what keeps the attach button from taking a
 * second tap — while the stopwatch should not. So the callback is handed
 * `untimed` and wraps anything whose duration is not ours (see slowWrites.ts).
 * Only the callbacks that need it take the argument.
 */
export function useAction(source: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (fn: (untimed: Untimed) => Promise<unknown>, label = source) => {
      setBusy(true);
      setError(null);
      try {
        await timed(label, fn);
      } catch (e) {
        setError(toUserMessage(e, label));
      } finally {
        setBusy(false);
      }
    },
    [source],
  );

  return { run, busy, error, setError };
}
