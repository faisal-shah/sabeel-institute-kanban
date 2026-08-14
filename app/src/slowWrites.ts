import { captureError } from './sentry';

/**
 * Time a mutation, and report the slow ones.
 *
 * A comment post took roughly FOURTEEN seconds on a real phone. That is not
 * normal for Firestore — a local write should apply immediately and the promise
 * should settle shortly after the server acknowledges — so the honest position
 * is that we do not yet know where the time went, and guessing at causes
 * (token refresh, long-polling reconnect, a cold connection after the app was
 * backgrounded) is not the same as measuring.
 *
 * This measures. Anything past the threshold is reported with its duration and
 * label, so the next slow write in production tells us WHICH action and HOW
 * long instead of relying on someone happening to film it.
 *
 * Deliberately not a console log: the whole problem is that this happens on
 * someone else's phone.
 *
 * Reported at WARNING, not error. A slow write is worth *recording* but not
 * worth *paging the whole team* over: the two unavoidable causes here — a Cloud
 * Function cold-starting after idle, and a Firestore write on a poor mobile
 * connection — are latency, not defects, and every user action already shows a
 * spinner while it runs. The threshold sits above a typical cold start so the
 * signal is the genuinely painful writes, not routine first-call latency; the
 * console still needs an alert rule that only pages on error-level issues.
 */
const SLOW_MS = 5000;

/**
 * Excludes a region from the measurement. See `timed`.
 *
 * Deliberately named for what it does to the CLOCK rather than for what is
 * inside it. The three regions it covers are a system picker, a document viewer
 * and a byte transfer, and the only thing they have in common is that their
 * duration is not this app's to answer for.
 */
export type Untimed = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * Run `fn`, charging it only for time this app is answerable for.
 *
 * `fn` is handed an `untimed` helper and must wrap anything whose duration this
 * monitor has no business judging. Two kinds qualify, and BOTH were shipped
 * being charged:
 *
 * - **A human.** `useAction.run` wraps a whole user action, and an action may
 *   START by opening system UI — a file picker, a camera, a document viewer.
 *   Every expo module of that shape (document-picker, image-picker,
 *   intent-launcher, sharing) resolves its promise from `onActivityResult`, so
 *   the await spans the entire time the app is not even on screen. Measured on
 *   the emulator before this existed: attaching a file after ~33s in the picker
 *   reported `uploadAttachment took 37992ms`, and a document left open for 20s
 *   reported `openAttachment took 20935ms` exactly 100ms after Back was pressed.
 *   A CANCELLED pick was reported too — a slow write for a write that never
 *   happened.
 * - **A byte transfer.** Its duration is proportional to file size and uplink
 *   (the cap is 10MB), so on a poor connection a large attachment clears the
 *   threshold on its own. A flat threshold written for a metadata write is the
 *   wrong instrument for it, and it already has a progress bar.
 *
 * What is left charged is round trips that should be fast regardless of file
 * size or how long someone browses — a Firestore write, a callable — which is
 * the property actually worth watching.
 *
 * The excluded total is reported as `waitedMs`, so a report still shows the
 * whole picture rather than quietly hiding time.
 */
export async function timed<T>(
  label: string,
  fn: (untimed: Untimed) => Promise<T>,
): Promise<T> {
  const started = Date.now();
  let waited = 0;

  // What is excluded is the UNION of the excluded regions, which is why this
  // counts a group rather than each call. Summing them instead would subtract
  // the overlap twice the moment two nest or run together — and an over-
  // subtracted charge can go NEGATIVE, which never reaches the threshold. The
  // monitor would then go quiet rather than wrong, and a quiet monitor is the
  // failure that does not announce itself. `openAttachment` already excludes
  // two regions, so composing them is the normal case, not a hypothetical.
  let open = 0;
  let openedAt = 0;

  const untimed: Untimed = async (inner) => {
    if (open === 0) openedAt = Date.now();
    open += 1;
    try {
      return await inner();
    } finally {
      // In `finally`, so a refusal still discounts its wait: declining the
      // camera permission THROWS (see filePicker.ts), and the time spent on
      // that dialog is no more ours than a successful one.
      open -= 1;
      if (open === 0) waited += Date.now() - openedAt;
    }
  };

  try {
    return await fn(untimed);
  } finally {
    const ms = Date.now() - started - waited;
    if (ms >= SLOW_MS) {
      captureError(
        new Error(`Slow write: ${label} took ${ms}ms`),
        { source: 'slowWrite', label, ms, waitedMs: waited },
        'warning',
      );
    }
  }
}
