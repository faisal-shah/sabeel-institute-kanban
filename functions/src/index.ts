/**
 * Cloud Functions entry point.
 *
 * Phase 1: account provisioning + domain enforcement + admin access control.
 * Later phases append triggers here — see docs/PHASE_STATUS.md.
 */
export { onUserCreate } from './auth';
export { setUserAccess } from './users';
