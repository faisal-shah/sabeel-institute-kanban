/**
 * Cloud Functions entry point.
 *
 * Phase 1: account provisioning + domain enforcement + admin access control.
 * Later phases append triggers here — see docs/PHASE_STATUS.md.
 */
export { onUserCreate } from './auth';
// TEMPORARY — first-admin bootstrap. Delete this export and src/bootstrap.ts
// once the first admin exists (see docs/DEPLOY.md).
export { bootstrapFirstAdmin } from './bootstrap';
export { setUserAccess } from './users';
export { removeBoardMember, countMemberAssignments } from './boards';
export { onCommentWritten } from './comments';
export { onCardWritten } from './activity';
export {
  onCommentCreated,
  onCardNotify,
  onUserPending,
  dueSoonReminders,
} from './notifications';
