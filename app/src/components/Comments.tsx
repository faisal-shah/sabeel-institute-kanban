import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { type MentionCandidate } from '@sabeel/shared';
import { addComment, deleteComment, editComment, useComments } from '../comments';
import { sessionCan, type SessionUser } from '../session';
import type { BoardMemberProfile } from '../boards';
import {
  Body,
  Button,
  Hint,
  Card as Panel,
  IconAction,
  Row,
  Spinner,
} from './ui';
import { RichText } from './RichText';
import { RichEditor } from './RichEditor';
import { space } from '../theme';
import { useAction } from '../useAction';

function when(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ms).toISOString().slice(0, 10);
}

export function Comments({
  cardId,
  members,
  prioritiseUids,
  user,
}: {
  cardId: string;
  members: readonly BoardMemberProfile[];
  /** The card's assignees, floated to the top of the mention list — the people
   *  a comment on this card is most likely to be addressed to. */
  prioritiseUids?: readonly string[];
  user: SessionUser;
}) {
  const comments = useComments(cardId);
  const [draft, setDraft] = useState('');
  /**
   * Bumped to remount the composer after a successful post.
   *
   * The rich editor is UNCONTROLLED — it seeds from `initialMarkdown` once, so
   * setting `draft` back to '' does not empty the box. A remount is safe at
   * exactly this moment and no other: the text has already been handed to
   * `addComment`, so there is nothing to lose.
   */
  const [composerKey, setComposerKey] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const { run, busy, error } = useAction('comments');

  const candidates: MentionCandidate[] = useMemo(
    () => members.map((m) => ({ uid: m.uid, displayName: m.displayName, email: m.email })),
    [members],
  );

  const nameFor = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of candidates) m.set(c.uid, c.displayName);
    return m;
  }, [candidates]);

  if (comments.status === 'loading') return <Spinner label="Loading comments…" />;

  const list = comments.data ?? [];

  return (
    <>
      {error ? (
        <Panel>
          <Body>{error}</Body>
        </Panel>
      ) : null}

      {list.length === 0 ? <Hint>No comments yet.</Hint> : null}

      {list.map((c) => {
        const mine = c.authorUid === user.uid;
        const canDelete = mine || sessionCan.manageBoards(user);
        return (
          <Panel key={c.id}>
            {/* Actions live ON the byline, not under the comment. Full-size
                Edit/Delete buttons cost a whole row each, so a thread of three
                comments spent more height on chrome than on what people wrote.
                These are quiet text actions with a generous hitSlop — the touch
                target stays finger-sized while the visual footprint is a word. */}
            <Row style={styles.between}>
              <Hint>
                {nameFor.get(c.authorUid) ?? 'Someone'} · {when(c.createdAt)}
                {c.editedAt ? ' · edited' : ''}
              </Hint>
              {editing !== c.id ? (
                <Row style={styles.actions}>
                  {/* Only the author edits: a manager rewriting someone's words
                      under their name would be worse than useless. */}
                  {mine ? (
                    <IconAction
                      icon="edit"
                      label="Edit comment"
                      onPress={() => {
                        setEditing(c.id);
                        setEditDraft(c.body);
                      }}
                    />
                  ) : null}
                  {canDelete ? (
                    <IconAction
                      icon="delete-outline"
                      label="Delete comment"
                      danger
                      onPress={() => run(() => deleteComment(cardId, c.id))}
                    />
                  ) : null}
                </Row>
              ) : null}
            </Row>

            {editing === c.id ? (
              <>
                <RichEditor
                  initialMarkdown={editDraft}
                  onChangeMarkdown={setEditDraft}
                  candidates={candidates}
                  prioritiseUids={prioritiseUids}
                  placeholder="Edit your comment — @ to mention someone"
                  testID="comment-edit-editor"
                  minHeight={72}
                />
                <Row>
                  <Button
                    busy={busy}
                    disabled={editDraft.trim().length === 0 || busy}
                    label="Save"
                    onPress={() =>
                      run(async () => {
                        await editComment({
                          cardId,
                          commentId: c.id,
                          body: editDraft,
                          candidates,
                        });
                        setEditing(null);
                      })
                    }
                  />
                  <Button
                    label="Cancel"
                    variant="secondary"
                    onPress={() => setEditing(null)}
                  />
                </Row>
              </>
            ) : (
              <>
                <RichText markdown={c.body} />
                {c.mentionUids.length > 0 ? (
                  <Hint>
                    mentioned{' '}
                    {c.mentionUids.map((u) => nameFor.get(u) ?? 'someone').join(', ')}
                  </Hint>
                ) : null}
              </>
            )}
          </Panel>
        );
      })}

      <Panel>
        <RichEditor
          key={composerKey}
          initialMarkdown={draft}
          onChangeMarkdown={setDraft}
          candidates={candidates}
          prioritiseUids={prioritiseUids}
          placeholder="Add a comment — @ to mention someone"
          testID="comment-editor"
          minHeight={72}
        />

        {/* Submit sits DIRECTLY under the field. The mention hint used to be
            between them, pushing the button ~50dp lower — far enough that the
            keyboard covered it while the field itself stayed clear, so there was
            nothing to scroll and no way to reach Comment without dismissing the
            keyboard. The hint is guidance, not a step, so it reads fine after. */}
        <Button
          label="Comment"
          disabled={draft.trim().length === 0 || busy}
          busy={busy}
          onPress={() => {
            // Clear the box IMMEDIATELY rather than after the server
            // acknowledges. `addDoc` resolves on server ack, which on a phone
            // can take many seconds — during which the draft sat there, the
            // button stayed enabled, and nothing indicated progress. It looked
            // dead, so you tap it again. Firestore applies the write locally
            // first, so the comment appears on its own.
            //
            // The text is restored if the write actually fails, because losing
            // what someone typed is far worse than a second of uncertainty.
            const body = draft;
            setDraft('');
            setComposerKey((k) => k + 1);
            void run(async () => {
              try {
                await addComment({ cardId, body, candidates, user });
              } catch (e) {
                // Restore what they typed, and remount so the box shows it
                // again — losing it is far worse than a second of uncertainty.
                setDraft(body);
                setComposerKey((k) => k + 1);
                throw e;
              }
            }, 'addComment');
          }}
        />

        {/* You can only mention people who can open the card, which is board
            members. If you are the only one, say so rather than letting the
            autocomplete look broken. */}
        {candidates.length <= 1 ? (
          <Hint>
            You are the only member of this board, so there is nobody to mention
            yet. Add people under board Settings.
          </Hint>
        ) : null}
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.md },
  between: { justifyContent: 'space-between' },
  wrap: { flexWrap: 'wrap' },
});
