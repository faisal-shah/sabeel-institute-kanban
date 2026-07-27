import './setup';
import { randomUUID } from 'node:crypto';
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_UPLOAD_STALE_MS,
  ATTACHMENT_URL_TTL_MS,
  EMULATOR_STORAGE_BUCKET,
  ORG_TIMEZONE,
  attachmentStoragePath,
  canAccessBoard,
  contentDispositionFor,
  normalizeContentType,
  sanitizeAttachmentName,
  type ActivityType,
  type AttachmentDoc,
  type BoardDoc,
  type CardDoc,
  type Role,
  type UserStatus,
} from '@sabeel/shared';
import { guarded, guardedEvent, sentryDsn } from './sentry';
import { isEmulatorProject } from './env';

/**
 * Card attachments: the three things a client cannot do for itself.
 *
 * Cloud Storage security rules cannot read Firestore, so `storage.rules` can
 * only ask "is this an active account" — it cannot ask whether someone is on
 * this card's board, which is the whole access model. Everything that needs
 * that question answered therefore happens here:
 *
 *  - FINALIZE, because the recorded size must be the one the server read, and
 *    because a document may only become `ready` once its bytes exist.
 *  - DELETE, because `storage.rules` denies clients deleting objects (a client
 *    delete would strand the bytes) and because a Firestore delete trigger
 *    cannot know WHO removed it, which the activity log needs.
 *  - DOWNLOAD, because the URL is signed with the service account's own
 *    credentials and bypasses every rule. This is the only thing standing
 *    between a signed-in user and someone else's board's files.
 */

const db = () => getFirestore();
const bucket = () => getStorage().bucket();

/**
 * Both ids become path segments, in Firestore and in Storage. A slash would
 * change the depth of `cards/{id}` into something else entirely, so they are
 * checked at the boundary rather than trusted because "Firestore ids can't
 * contain one".
 */
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function requireIds(data: { cardId?: unknown; attachmentId?: unknown } | undefined): {
  cardId: string;
  attachmentId: string;
} {
  const cardId = data?.cardId;
  const attachmentId = data?.attachmentId;
  if (typeof cardId !== 'string' || !SAFE_ID.test(cardId)) {
    throw new HttpsError('invalid-argument', 'A valid cardId is required.');
  }
  if (typeof attachmentId !== 'string' || !SAFE_ID.test(attachmentId)) {
    throw new HttpsError('invalid-argument', 'A valid attachmentId is required.');
  }
  return { cardId, attachmentId };
}

/**
 * Resolve card → board and assert the caller may act on it.
 *
 * The predicate itself lives in `@sabeel/shared` (`canAccessBoard`) so it cannot
 * drift from the `onBoard()` helper the rules use for every other card
 * subcollection. Claims come from the TOKEN, never from the user document — the
 * document is a mirror, and a stale or tampered mirror must not grant anything.
 *
 * Two reads per call, the same pair the comments rules already do.
 */
async function requireCardAccess(
  request: CallableRequest<unknown>,
  cardId: string,
): Promise<{ uid: string; boardId: string }> {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');

  const card = await db().doc(`cards/${cardId}`).get();
  if (!card.exists) throw new HttpsError('not-found', 'No such card.');
  const { boardId } = card.data() as CardDoc;

  const board = await db().doc(`boards/${boardId}`).get();
  if (!board.exists) throw new HttpsError('not-found', 'No such board.');

  const actor = {
    uid: auth.uid,
    role: (auth.token.role ?? 'member') as Role,
    status: (auth.token.status ?? 'pending') as UserStatus,
  };
  if (!canAccessBoard(actor, board.data() as BoardDoc)) {
    throw new HttpsError('permission-denied', 'You are not on this board.');
  }
  return { uid: auth.uid, boardId };
}

/**
 * Append a card-activity entry.
 *
 * Written from a callable rather than a trigger, which is a deliberate
 * departure from `activity.ts`. What makes the log trustworthy is that no
 * CLIENT can write it — `firestore.rules` still denies that outright — and the
 * actor here comes from a verified token. A delete trigger, by contrast, cannot
 * know who performed the delete, so removals would be recorded as done by
 * nobody.
 *
 * Never worth failing the user's action over, same as activity.ts.
 */
async function recordActivity(
  cardId: string,
  entry: { type: ActivityType; actorUid: string; to?: string; from?: string },
): Promise<void> {
  try {
    await db().collection(`cards/${cardId}/activity`).add({ ...entry, at: Date.now() });
  } catch (e) {
    logger.warn('attachment activity write failed', { cardId, error: String(e) });
  }
}

/**
 * Confirm the bytes arrived, record what actually landed, and publish the file.
 *
 * The client reports nothing that matters here: the size is read from the
 * object, and the name and content type are re-sanitized server-side before
 * they reach an HTTP header. Flipping `status` to `ready` only after the object
 * is confirmed present is what stops a failed upload leaving a row that looks
 * openable.
 *
 * `contentType` and `contentDisposition` are written onto the OBJECT rather
 * than passed as query overrides on the signed URL. Query overrides are honoured
 * only by real GCS, so inline-vs-download and filename handling would then be
 * exercised by no local test at all; stored on the object, the emulator serves
 * the same headers production does.
 */
export const finalizeAttachment = onCall(
  { secrets: [sentryDsn] },
  guarded(async (request: CallableRequest<{ cardId?: unknown; attachmentId?: unknown }>) => {
    const { cardId, attachmentId } = requireIds(request.data);
    const { uid } = await requireCardAccess(request, cardId);
    return applyFinalizeAttachment(cardId, attachmentId, uid);
  }),
);

/**
 * The effect, separated from its callable.
 *
 * Extracted for the same reason `runNotificationSweep` and `diffCard` are: the
 * wrapper can only be reached over HTTP, and the functions emulator serialises
 * concurrent calls to a WARM instance — so a race test driven through the
 * callable passes against code that is genuinely broken. (It reproduced once,
 * on a cold start, and then stopped. A test that only fails sometimes is worse
 * than no test.) In-process, two promises interleave for real.
 */
export async function applyFinalizeAttachment(
  cardId: string,
  attachmentId: string,
  actorUid: string,
) {
  {
    const uid = actorUid;
    const ref = db().doc(`cards/${cardId}/attachments/${attachmentId}`);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'No such attachment.');
    const existing = snap.data() as AttachmentDoc;

    // Idempotent: a retry after a lost response must not log a second "attached".
    if (existing.status === 'ready') {
      return { ok: true, sizeBytes: existing.sizeBytes ?? 0, contentType: existing.contentType };
    }

    const file = bucket().file(attachmentStoragePath(cardId, attachmentId));
    const [exists] = await file.exists();
    if (!exists) {
      throw new HttpsError('failed-precondition', 'The upload did not finish.');
    }

    const [meta] = await file.getMetadata();
    const sizeBytes = Number(meta.size ?? 0);
    if (sizeBytes > ATTACHMENT_MAX_BYTES) {
      // storage.rules already caps this, so reaching here means the object
      // arrived by some other route. Leave neither the bytes nor the record.
      await file.delete({ ignoreNotFound: true });
      await ref.delete();
      throw new HttpsError('failed-precondition', 'That file is too large.');
    }

    const name = sanitizeAttachmentName(existing.name);
    const contentType = normalizeContentType(existing.contentType);
    await file.setMetadata({
      contentType,
      contentDisposition: contentDispositionFor(name, contentType),
    });

    // The flip to `ready` is a TRANSACTION, and only the caller that performs it
    // writes the activity entry.
    //
    // The early return above is a fast path, not a guard: two finalizes racing
    // — a double tap, or a retry after a slow response — both read `uploading`,
    // both proceed, and the card gets two "attached Budget.pdf" lines. Measured,
    // not hypothetical.
    const won = await db().runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      if (!cur.exists) return null;
      const data = cur.data() as AttachmentDoc;
      if (data.status === 'ready') return null; // the other caller won
      tx.update(ref, { status: 'ready', name, contentType, sizeBytes });
      return data;
    });

    if (won) {
      // Attributed to whoever UPLOADED it, not to whoever called finalize.
      // They are normally the same person, but the caller is not the authority
      // on that — the document is — and "Sara attached budget.pdf" has to be
      // true for the log to be worth keeping.
      await recordActivity(cardId, {
        type: 'attached',
        actorUid: won.uploadedBy || uid,
        to: name,
      });
      logger.info('attachment finalized', { cardId, attachmentId, actorUid: uid, sizeBytes });
    }
    return { ok: true, sizeBytes, contentType };
  }
}

/**
 * Remove an attachment: the object and its record, together.
 *
 * Any active member of the board may do this — deliberately NOT the
 * manager-only gate that permanent card deletion uses. Attaching the wrong file
 * is an ordinary mistake and should not need someone else to undo.
 *
 * Also the ROLLBACK path for a failed upload, which is why it accepts a document
 * still in `uploading`. The client cannot roll back for itself: `storage.rules`
 * denies clients deleting objects, so a client-side undo would remove the record
 * and leave the bytes unreferenced, unreadable and billable forever.
 */
export const deleteAttachment = onCall(
  { secrets: [sentryDsn] },
  guarded(async (request: CallableRequest<{ cardId?: unknown; attachmentId?: unknown }>) => {
    const { cardId, attachmentId } = requireIds(request.data);
    const { uid } = await requireCardAccess(request, cardId);
    return applyDeleteAttachment(cardId, attachmentId, uid);
  }),
);

/** The effect, separated from its callable — see applyFinalizeAttachment. */
export async function applyDeleteAttachment(
  cardId: string,
  attachmentId: string,
  actorUid: string,
) {
  {
    const uid = actorUid;
    const ref = db().doc(`cards/${cardId}/attachments/${attachmentId}`);

    // The object goes FIRST, and the ordering is deliberate. If this throws, the
    // record still exists, so something still knows which bytes to chase and the
    // user can try again. Deleting the document first would, on the same
    // failure, leave bytes that are unreferenced, invisible and billable — the
    // nightly sweep only looks at documents, so nothing would ever find them.
    //
    // Deleting at the CANONICAL path rather than via a stored field is what also
    // clears bytes from an upload that never finalized.
    await bucket()
      .file(attachmentStoragePath(cardId, attachmentId))
      .delete({ ignoreNotFound: true });

    // Deleting the record and deciding to log it must be ONE atomic step, or two
    // concurrent removals both see the document and the card gets two "removed
    // budget.pdf" lines. Only the caller whose transaction actually removed it
    // writes the entry. Measured, not hypothetical.
    const removed = await db().runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      if (!cur.exists) return null;
      tx.delete(ref);
      return cur.data() as AttachmentDoc;
    });

    if (!removed) return { ok: true, removed: false };

    // An upload that never finished was never an attachment anyone saw, so
    // rolling one back is not a removal worth recording.
    if (removed.status === 'ready') {
      await recordActivity(cardId, { type: 'detached', actorUid: uid, from: removed.name });
    }

    logger.info('attachment removed', { cardId, attachmentId, actorUid: uid });
    return { ok: true, removed: true };
  }
}

/**
 * Mint a time-limited URL for one attachment.
 *
 * Authorization happens HERE, not in security rules, because a signed URL is
 * signed with the service account's own credentials and bypasses rules
 * entirely.
 */
export const getAttachmentUrl = onCall(
  { secrets: [sentryDsn] },
  guarded(async (request: CallableRequest<{ cardId?: unknown; attachmentId?: unknown }>) => {
    const { cardId, attachmentId } = requireIds(request.data);
    await requireCardAccess(request, cardId);

    const snap = await db().doc(`cards/${cardId}/attachments/${attachmentId}`).get();
    if (!snap.exists) throw new HttpsError('not-found', 'No such attachment.');
    const attachment = snap.data() as AttachmentDoc;
    if (attachment.status !== 'ready') {
      throw new HttpsError('failed-precondition', 'That upload has not finished.');
    }

    const expiresAt = Date.now() + ATTACHMENT_URL_TTL_MS;
    return {
      url: await readUrl(attachmentStoragePath(cardId, attachmentId), expiresAt),
      expiresAt,
      name: attachment.name,
      contentType: attachment.contentType,
    };
  }),
);

/**
 * Two paths, and the difference between them is the most dangerous seam here.
 *
 *  - PRODUCTION signs a V4 URL with the runtime service account through the IAM
 *    Credentials API. It expires, which is the entire requirement:
 *    `getDownloadURL()` is rejected precisely because its token never does, so
 *    anyone who ever saw a link would keep access after leaving a board.
 *  - The EMULATOR has no signing service. There is nothing to sign with, and a
 *    URL it did produce would point at real GCS where the object does not exist.
 *    So it returns the emulator's own object URL with a download token.
 *
 * That token is exactly the never-expiring mechanism production rejects. It is
 * acceptable only because this branch keys off the running PROJECT ID rather
 * than an env var — a flag can be left set in a shell that then deploys, a
 * project id is whatever is actually being talked to — so it cannot be reached
 * against a real project.
 *
 * It THROWS rather than falling back if signing fails. A silent fallback to an
 * unsigned or permanent URL would be a data leak wearing the costume of a
 * working feature. Note also that the production path is exercised by NO local
 * test: signing needs `roles/iam.serviceAccountTokenCreator` on the runtime
 * service account, whose absence fails only in production.
 */
async function readUrl(path: string, expiresAt: number): Promise<string> {
  const file = bucket().file(path);

  if (isEmulatorProject()) {
    const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199';
    // A plain `?alt=media` URL is RULES-governed, and storage.rules denies every
    // read — deliberately, since production reads bypass rules by being signed.
    // So the emulator needs the one other thing that bypasses them: a token.
    const [meta] = await file.getMetadata();
    let token = (meta.metadata?.firebaseStorageDownloadTokens as string | undefined) ?? '';
    if (!token) {
      token = randomUUID();
      await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    }
    return `http://${host}/v0/b/${EMULATOR_STORAGE_BUCKET}/o/${encodeURIComponent(
      path,
    )}?alt=media&token=${token}`;
  }

  const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: expiresAt });
  return url;
}

/**
 * Delete uploads that were started and abandoned.
 *
 * The client rolls its own failures back through `deleteAttachment`, but it
 * cannot do that if the tab closed or the app was killed mid-upload. Without
 * this, those documents sit in `uploading` forever and their bytes are billed
 * forever.
 */
export const pruneAttachments = onSchedule(
  { schedule: '0 4 * * *', timeZone: ORG_TIMEZONE, secrets: [sentryDsn] },
  guardedEvent(async () => {
    await runAttachmentSweep();
  }),
);

/**
 * The sweep itself, separated from its schedule for the same reason as
 * `runNotificationSweep`: there is no pubsub emulator, so a scheduled
 * function's body is untestable unless it can be called directly.
 */
export async function runAttachmentSweep(
  now: number = Date.now(),
): Promise<{ swept: number }> {
  const cutoff = now - ATTACHMENT_UPLOAD_STALE_MS;

  // A single-equality collection-group query is served by the automatic
  // single-field index, so this needs no entry in firestore.indexes.json and no
  // index deploy. Adding `where('uploadedAt','<',cutoff)` would force a
  // COLLECTION_GROUP composite index — the first in this project — to filter a
  // handful of documents, so the age test is applied in memory instead.
  const stuck = await db()
    .collectionGroup('attachments')
    .where('status', '==', 'uploading')
    .get();

  let swept = 0;
  for (const doc of stuck.docs) {
    const { uploadedAt } = doc.data() as AttachmentDoc;
    if (typeof uploadedAt !== 'number' || uploadedAt >= cutoff) continue;
    // cards/{cardId}/attachments/{attachmentId}
    const cardId = doc.ref.parent.parent?.id;
    if (!cardId) continue;
    try {
      await bucket()
        .file(attachmentStoragePath(cardId, doc.id))
        .delete({ ignoreNotFound: true });
      await doc.ref.delete();
      swept += 1;
    } catch (e) {
      // One bad document must not stop the rest of the sweep.
      logger.warn('attachment sweep failed', { path: doc.ref.path, error: String(e) });
    }
  }

  if (swept > 0) logger.info('swept abandoned uploads', { swept });
  return { swept };
}
