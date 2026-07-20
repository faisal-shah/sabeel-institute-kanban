import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInput } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
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
import { toUserMessage } from '../errors';

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
  const [posting, setPosting] = useState(false);
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
      setError(toUserMessage(e, 'comments'));
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
            {/* Actions live ON the byline, not under the comment. Full-size
                Edit/Delete buttons cost a whole row each, so a thread of three
                comments spent more height on chrome than on what people wrote.
                These are quiet text actions with a generous hitSlop — the touch
                target stays finger-sized while the visual footprint is a word. */}
            <Row style={styles.between}>
              <Caption>
                {nameFor.get(c.authorUid) ?? 'Someone'} · {when(c.createdAt)}
                {c.editedAt ? ' · edited' : ''}
              </Caption>
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
                      onPress={() => run(() => deleteComment(boardId, cardId, c.id))}
                    />
                  ) : null}
                </Row>
              ) : null}
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

        {/* Submit sits DIRECTLY under the field. The mention hint used to be
            between them, pushing the button ~50dp lower — far enough that the
            keyboard covered it while the field itself stayed clear, so there was
            nothing to scroll and no way to reach Comment without dismissing the
            keyboard. The hint is guidance, not a step, so it reads fine after. */}
        <Button
          label="Comment"
          disabled={draft.trim().length === 0 || posting}
          busy={posting}
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
            setPosting(true);
            void run(async () => {
              try {
                await addComment({ boardId, cardId, body, candidates, user });
              } catch (e) {
                setDraft(body);
                throw e;
              } finally {
                setPosting(false);
              }
            });
          }}
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
      </Panel>
    </>
  );
}

/**
 * A quiet, inline icon action.
 *
 * Per-comment Edit/Delete used to be full Buttons on their own row, so a thread
 * of three comments spent more height on chrome than on what people wrote. An
 * icon costs a line it was already going to occupy — it sits on the byline.
 *
 * `accessibilityLabel` carries the word the icon replaces, so nothing is lost
 * for screen readers, and `hitSlop` keeps the tap target finger-sized while the
 * ink stays small.
 */
function IconAction({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: 'edit' | 'delete-outline';
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
    >
      <MaterialIcons
        name={icon}
        size={18}
        color={danger ? t.text.danger : t.text.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.md },
  action: { paddingVertical: 2 },
  between: { justifyContent: 'space-between' },
  wrap: { flexWrap: 'wrap' },
  suggestions: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: space.sm,
    gap: space.xs,
  },
});
