import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `./sentry` is mocked with a FACTORY, which is what stops the real module
 * loading at all. It imports `@sentry/react-native`, and `app/vitest.config.ts`
 * is node-environment with no react-native transform — an automock would still
 * resolve the module graph and fail on the import rather than on anything about
 * this file.
 */
vi.mock('./sentry', () => ({ captureError: vi.fn() }));

import { captureError } from './sentry';
import { timed } from './slowWrites';

const reported = vi.mocked(captureError);

/**
 * Advance the fake clock, flushing microtasks between timers.
 *
 * The async form is not optional here: these callbacks `await` in sequence, so
 * the second `setTimeout` is not created until the first has resolved. The
 * synchronous `advanceTimersByTime` fires everything already scheduled and
 * returns, and the later steps then wait on a clock that has stopped moving —
 * which presents as a five-second test timeout rather than as anything to do
 * with the code under test.
 */
const elapse = (ms: number) => vi.advanceTimersByTimeAsync(ms);

/** A promise that settles only once the clock is moved past `ms`. */
function takes<T>(ms: number, value: T): () => Promise<T> {
  return () =>
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(value), ms);
    });
}

function rejectsAfter(ms: number, message: string): () => Promise<never> {
  return () =>
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
}

/** The `{ ms, waitedMs }` context of the single report, or null if none. */
function onlyReport(): { ms: number; waitedMs: number } | null {
  if (reported.mock.calls.length === 0) return null;
  expect(reported).toHaveBeenCalledTimes(1);
  return reported.mock.calls[0][1] as { ms: number; waitedMs: number };
}

describe('timed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reported.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a genuinely slow write', async () => {
    const p = timed('comments', takes(9000, 'ok'));
    await elapse(9000);
    await expect(p).resolves.toBe('ok');

    expect(onlyReport()).toMatchObject({ ms: 9000, waitedMs: 0 });
    expect(reported.mock.calls[0][0]).toMatchObject({
      message: 'Slow write: comments took 9000ms',
    });
    expect(reported.mock.calls[0][2]).toBe('warning');
  });

  it('says nothing about a fast write', async () => {
    const p = timed('comments', takes(200, 'ok'));
    await elapse(200);
    await p;
    expect(reported).not.toHaveBeenCalled();
  });

  /**
   * THE BUG, as a test. A nine-second file picker around a 200ms write used to
   * report `took 9200ms`; the threshold must see only the 200.
   */
  it('does not charge an untimed region, even when it dominates', async () => {
    const p = timed('uploadAttachment', async (untimed) => {
      await untimed(takes(9000, 'picked'));
      await takes(200, 'written')();
    });
    await elapse(9200);
    await p;

    expect(reported).not.toHaveBeenCalled();
  });

  it('still reports when the charged part alone is slow, and shows the wait', async () => {
    const p = timed('uploadAttachment', async (untimed) => {
      await untimed(takes(30_000, 'picked'));
      await takes(6000, 'written')();
    });
    await elapse(36_000);
    await p;

    expect(onlyReport()).toMatchObject({ ms: 6000, waitedMs: 30_000 });
  });

  /** A refused camera permission throws; its dialog is still not our time. */
  it('discounts an untimed region that throws', async () => {
    const p = timed('uploadAttachment', async (untimed) => {
      await untimed(rejectsAfter(9000, 'Allow camera access to attach a photo.'));
    });
    const settled = expect(p).rejects.toThrow('Allow camera access');
    await elapse(9000);
    await settled;

    expect(reported).not.toHaveBeenCalled();
  });

  /** A throw in the CHARGED part is still a slow write worth reporting. */
  it('reports a slow failure', async () => {
    const p = timed('uploadAttachment', rejectsAfter(7000, 'boom'));
    const settled = expect(p).rejects.toThrow('boom');
    await elapse(7000);
    await settled;

    expect(onlyReport()).toMatchObject({ ms: 7000, waitedMs: 0 });
  });

  /** openAttachment excludes two separate regions; they must add up. */
  it('accumulates repeated exclusions', async () => {
    const p = timed('openAttachment', async (untimed) => {
      await takes(400, 'url')();
      await untimed(takes(3000, 'downloaded'));
      await untimed(takes(20_000, 'viewer closed'));
    });
    await elapse(23_400);
    await p;

    expect(reported).not.toHaveBeenCalled();
  });

  /**
   * NESTED exclusions must count their union once, not once each. Summing them
   * would subtract the overlap twice, and an over-subtracted charge goes
   * negative — which silently stops reporting rather than reporting wrongly.
   */
  it('counts nested exclusions once', async () => {
    const p = timed('uploadAttachment', async (untimed) => {
      await untimed(async () => {
        await untimed(takes(20_000, 'inner'));
      });
      await takes(6000, 'written')();
    });
    await elapse(26_000);
    await p;

    expect(onlyReport()).toMatchObject({ ms: 6000, waitedMs: 20_000 });
  });

  /** Concurrent exclusions overlap; their union is 20s, not 35s. */
  it('counts overlapping exclusions once', async () => {
    const p = timed('uploadAttachment', async (untimed) => {
      await Promise.all([untimed(takes(20_000, 'a')), untimed(takes(15_000, 'b'))]);
      await takes(6000, 'written')();
    });
    await elapse(26_000);
    await p;

    expect(onlyReport()).toMatchObject({ ms: 6000, waitedMs: 20_000 });
  });

  /** Existing call sites pass a zero-argument callback and must be unaffected. */
  it('accepts a callback that ignores the helper', async () => {
    const p = timed('card', takes(10, 'ok'));
    await elapse(10);
    await expect(p).resolves.toBe('ok');
    expect(reported).not.toHaveBeenCalled();
  });
});
