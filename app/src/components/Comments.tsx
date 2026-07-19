import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';
import {
  activeMentionQuery,
  completeMention,
  handleFor,
  mentionSuggestions,
  type MentionCandidate,
} from '@sabeel/shared';
import { addComment, deleteComment, editComment, useComments } from '../comments';
import { sessionCan, type SessionUser } from '../session';
import type { BoardMemberProfile } from '../boards';
import { Markdown } from './Markdown';
import { Body, Button, Caption, Card as Panel, Row, Spinner, TextField } from './ui';
import { space, useTheme } from '../theme';

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
  boardId,
  cardId,
  members,
  user,
}: {
  boardId: string;
  cardId: string;
  members: readonly BoardMemberProfile[];
  user: SessionUser;
}) {
  const comments = useComments(boardId, cardId);
  const t = useTheme();
  const [draft, setDraft] = useState('');
  const draftRef = useRef<TextInput>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const candidates: MentionCandidate[] = useMemo(
    () => members.map((m) => ({ uid: m.uid, displayName: m.displayName, email: m.email })),
    [members],
  );

  const nameFor = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of candidates) m.set(c.uid, c.displayName);
    return m;
  }, [candidates]);

  // The autocomplete only appears while a mention is actually being typed —
  // showing a people-picker permanently would be noise.
  const mentionQuery = activeMentionQuery(draft);
  const suggestions =
    mentionQuery === null ? [] : mentionSuggestions(mentionQuery, candidates);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (comments.status === 'loading') return <Spinner label="Loading comments…" />;

  const list = comments.data ?? [];

  return (
    <>
      {error ? (
        <Panel>
          <Body>{error}</Body>
        </Panel>
      ) : null}

      {list.length === 0 ? <Caption>No comments yet.</Caption> : null}

      {list.map((c) => {
        const mine = c.authorUid === user.uid;
        const canDelete = mine || sessionCan.manageBoards(user);
        return (
          <Panel key={c.id}>
            <Row style={styles.between}>
              <Caption>
                {nameFor.get(c.authorUid) ?? 'Someone'} · {when(c.createdAt)}
                {c.editedAt ? ' · edited' : ''}
              </Caption>
            </Row>

            {editing === c.id ? (
              <>
                <TextField value={editDraft} onChangeText={setEditDraft} multiline />
                <Row>
                  <Button
                    label="Save"
                    onPress={() =>
                      run(async () => {
                        await editComment({
                          boardId,
                          cardId,
                          commentId: c.id,
                          body: editDraft,
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
                {/* Comments render as markdown too, so a pasted list or link
                    behaves the same as in a description. */}
                <Markdown source={c.body} />
                {c.mentionUids.length > 0 ? (
                  <Caption>
                    mentioned{' '}
                    {c.mentionUids.map((u) => nameFor.get(u) ?? 'someone').join(', ')}
                  </Caption>
                ) : null}
                <Row style={styles.wrap}>
                  {/* Only the author edits: a manager rewriting someone's words
                      under their name would be worse than useless. */}
                  {mine ? (
                    <Button
                      label="Edit"
                      variant="secondary"
                      onPress={() => {
                        setEditing(c.id);
                        setEditDraft(c.body);
                      }}
                    />
                  ) : null}
                  {canDelete ? (
                    <Button
                      label="Delete"
                      variant="secondary"
                      onPress={() => run(() => deleteComment(boardId, cardId, c.id))}
                    />
                  ) : null}
                </Row>
              </>
            )}
          </Panel>
        );
      })}

      <Panel>
        <TextField
          ref={draftRef}
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a comment — @ to mention someone"
          multiline
        />

        {/* You can only mention people who can open the card, which is board
            members. If you are the only one, say so rather than letting the
            autocomplete look broken. */}
        {candidates.length <= 1 ? (
          <Caption>
            You are the only member of this board, so there is nobody to mention
            yet. Add people under board Settings.
          </Caption>
        ) : null}

        {suggestions.length > 0 ? (
          <View style={[styles.suggestions, { borderColor: t.border.subtle }]}>
            <Caption>Mention</Caption>
            {suggestions.map((s) => (
              <Button
                key={s.uid}
                label={`${s.displayName} (@${handleFor(s.email)})`}
                variant="secondary"
                onPress={() => {
                  setDraft(completeMention(draft, '', s));
                  // Picking a suggestion BLURS the comment box — whether by
                  // click or by tab-then-enter — and without this you cannot
                  // carry on typing, which makes the autocomplete a trap rather
                  // than a shortcut. Refocus on the next tick so it happens
                  // after the blur has settled.
                  setTimeout(() => draftRef.current?.focus(), 0);
                }}
              />
            ))}
          </View>
        ) : null}

        <Button
          label="Comment"
          disabled={draft.trim().length === 0}
          onPress={() =>
            run(async () => {
              await addComment({ boardId, cardId, body: draft, candidates, user });
              setDraft('');
            })
          }
        />
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  wrap: { flexWrap: 'wrap' },
  suggestions: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: space.sm,
    gap: space.xs,
  },
});
