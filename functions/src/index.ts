/**
 * Cloud Functions entry point.
 *
 * Phase 1: account provisioning + domain enforcement + admin access control.
 * Later phases append triggers here — see docs/PHASE_STATUS.md.
 */
export { onUserCreate } from './auth';
export { setUserAccess } from './users';
export { removeBoardMember, countMemberAssignments } from './boards';
export { onCommentWritten } from './comments';
export { onCardWritten } from './activity';
export { onCardDeleted } from './cleanup';
export {
  onCommentCreated,
  onCardNotify,
  onUserPending,
  dueSoonReminders,
} from './notifications';
