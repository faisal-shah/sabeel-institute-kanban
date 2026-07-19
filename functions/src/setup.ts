import { initializeApp, getApps } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';

/**
 * One Admin SDK app for the whole codebase, and the shared deploy options.
 *
 * `invoker: 'public'` is required for callables: the Cloud Run layer would
 * otherwise reject unauthenticated HTTP before our code runs, and Firebase
 * callables authenticate inside the function body, not at the transport.
 * See docs/INHERITED-STACK.md lesson 2 for how this failed in the sibling
 * project — and note the binding is only applied on the function CREATE path,
 * so a first deploy that fails to build leaves callables permanently 403.
 */
setGlobalOptions({
  region: 'us-central1',
  invoker: 'public',
  maxInstances: 10,
});

if (getApps().length === 0) {
  initializeApp();
}
