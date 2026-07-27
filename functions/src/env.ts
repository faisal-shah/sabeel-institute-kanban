import { EMULATOR_PROJECT_ID } from '@sabeel/shared';

/**
 * Whether this process is running against the demo project, i.e. the emulator
 * suite.
 *
 * Keyed off the running PROJECT ID rather than an env var on purpose: a flag
 * like `USE_EMULATORS` can be left set in a shell that then deploys, whereas the
 * project id is whatever is actually being talked to. The signed-URL seam in
 * `attachments.ts` depends on getting this right — its emulator branch hands out
 * a URL with a never-expiring download token, which is precisely the mechanism
 * production rejects, and it is only acceptable because this check cannot come
 * back true against a real project.
 */
export function isEmulatorProject(): boolean {
  return (process.env.GCLOUD_PROJECT ?? '') === EMULATOR_PROJECT_ID;
}
