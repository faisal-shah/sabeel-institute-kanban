import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ORG_TIMEZONE, type Priority } from '@sabeel/shared';
import {
  archiveCard,
  cardsInColumn,
  deleteCard,
  moveCard,
  restoreCard,
  updateCard,
  useCard,
  useBoardCards,
} from '../cards';
import { useBoard } from '../boards';
import { sessionCan, type SessionUser } from '../session';
import { useNav } from '../nav';
import { Markdown } from '../components/Markdown';
import { Comments } from '../components/Comments';
import { ActivityLog } from '../components/ActivityLog';
import { AssigneePicker } from '../components/AssigneePicker';
import { DateField } from '../components/DateField';
import { Select } from '../components/Select';
import {
  Body,
  Button,
  Caption,
  Card as Panel,
  Heading,
  Row,
  Screen,
  Spinner,
  TextField,
  Title,
} from '../components/ui';
import { radius, space, useTheme } from '../theme';

const PRIORITIES: Priority[] = ['none', 'low', 'medium', 'high', 'urgent'];

/** Today in the org's timezone — the only place a timezone is consulted. */
function todayInOrgTz(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ORG_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function CardScreen({
  boardId,
  cardId,
  user,
}: {
  boardId: string;
  cardId: string;
  user: SessionUser;
}) {
  const nav = useNav();
  const card = useCard(boardId, cardId);
  const board = useBoard(boardId);
  const boardCards = useBoardCards(boardId);
  const t = useTheme();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Seed the local editors once the card arrives, but never stomp on typing.
  useEffect(() => {
    if (card.data && !dirty) {
      setTitle(card.data.title);
      setDescription(card.data.description);
    }
  }, [card.data, dirty]);

  if (card.status === 'loading' || board.status === 'loading') {
    return <Spinner label="Loading card…" />;
  }

  const c = card.data;
  const b = board.data;
  if (!c || !b) {
    return (
      <Screen>
        <Title>Card not found</Title>
        <Caption>It may have been deleted.</Caption>
        <Button label="Back" onPress={nav.pop} />
      </Screen>
    );
  }

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const today = todayInOrgTz();
  const overdue = c.dueDate !== undefined && c.dueDate < today;
  // Only board members may be assigned — the rule the My Work query depends on.
  // Sourced from the board doc so non-admins (who cannot list users) still see
  // who they can assign.
  const assignable = b.members;

  return (
    <Screen>
      <Row style={styles.between}>
        <Title>Card</Title>
        <Button label="Back" variant="secondary" onPress={nav.pop} />
      </Row>

      {error ? (
        <Panel>
          <Body>{error}</Body>
        </Panel>
      ) : null}

      <Panel>
        <Caption>Title</Caption>
        <TextField value={title} onChangeText={(v) => { setTitle(v); setDirty(true); }} />
        <Button
          label="Save title"
          disabled={title.trim() === c.title || title.trim().length === 0}
          onPress={() =>
            run(async () => {
              await updateCard(boardId, cardId, { title: title.trim() }, user);
              setDirty(false);
            })
          }
        />
        {/* The column is EDITABLE here. Previously it was a read-only pill, so
            moving a card meant leaving the detail view, finding it on the board
            and using a separate move action — for the one property you most
            often change while reading a card. */}
        <Row>
          <Caption>in</Caption>
          <Select
            label="Column"
            value={c.columnId}
            options={b.columns.map((col) => ({ value: col.id, label: col.name }))}
            onChange={(toColumnId) =>
              run(async () => {
                // Give it a fresh rank at the END of the destination. Carrying
                // the old rank across would drop the card at an arbitrary
                // position — ranks are only meaningful within a column.
                const destination = cardsInColumn(boardCards.data ?? [], toColumnId);
                await moveCard({
                  boardId,
                  card: c,
                  toColumnId,
                  before: destination[destination.length - 1] ?? null,
                  after: null,
                  user,
                });
              })
            }
          />
        </Row>
      </Panel>

      {/* Edit sits ON the heading, not as a full-width button under the text.
          A button that wide reads as the section's primary action when it is
          really a secondary one, and it cost a whole row on a screen that is
          already long. */}
      <Row style={styles.between}>
        <Heading>Description</Heading>
        {!editingDesc ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit description"
            onPress={() => setEditingDesc(true)}
            hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          >
            <MaterialIcons name="edit" size={18} color={t.text.muted} />
          </Pressable>
        ) : null}
      </Row>
      <Panel>
        {editingDesc ? (
          <>
            {/* A short reference beats a toolbar. The buttons only appended
                placeholder syntax at the end of the text — they could not wrap a
                selection, so they were slower than typing the characters. A
                proper editor is the real answer; until then, say what the syntax
                is and get out of the way. */}
            <Caption>
              **bold**  ·  *italic*  ·  `code`  ·  # heading  ·  - list  ·  1.
              numbered  ·  [link](https://example.com)
            </Caption>
            <TextField
              value={description}
              onChangeText={(v) => {
                setDescription(v);
                setDirty(true);
              }}
              placeholder="Write a description"
              multiline
            />
            <Row>
              <Button
                label="Save"
                onPress={() =>
                  run(async () => {
                    await updateCard(boardId, cardId, { description }, user);
                    setEditingDesc(false);
                    setDirty(false);
                  })
                }
              />
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  setDescription(c.description);
                  setEditingDesc(false);
                  setDirty(false);
                }}
              />
            </Row>
          </>
        ) : (
          <>
            {c.description ? (
              <Markdown source={c.description} />
            ) : (
              <Caption>No description yet.</Caption>
            )}
          </>
        )}
      </Panel>

      <Heading>Priority</Heading>
      <Panel>
        <Row style={styles.wrap}>
          {PRIORITIES.map((p) => (
            <Pressable
              key={p}
              onPress={() => run(() => updateCard(boardId, cardId, { priority: p }, user))}
              accessibilityRole="button"
              accessibilityLabel={`Priority ${p}`}
              style={[
                styles.chip,
                {
                  borderColor: c.priority === p ? t.priority[p] : t.border.subtle,
                  backgroundColor: c.priority === p ? t.bg.accentSoft : 'transparent',
                },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: t.priority[p] }]} />
              <Caption>{p}</Caption>
            </Pressable>
          ))}
        </Row>
      </Panel>

      <Heading>Due date</Heading>
      <Panel>
        {overdue ? <Caption>Overdue</Caption> : null}
        <DateField
          value={c.dueDate}
          label="Due date"
          onChange={(next) =>
            run(() => updateCard(boardId, cardId, { dueDate: next }, user))
          }
        />
      </Panel>

      <Heading>Assignees</Heading>
      <Panel>
        <AssigneePicker
          members={assignable}
          assignedUids={c.assigneeUids}
          onToggle={(uid, assign) =>
            run(() =>
              updateCard(
                boardId,
                cardId,
                {
                  assigneeUids: assign
                    ? Array.from(new Set([...c.assigneeUids, uid]))
                    : c.assigneeUids.filter((x) => x !== uid),
                },
                user,
              ),
            )
          }
          emptyHint={
            assignable.length <= 1
              ? 'Only people added to this board can be assigned. Add them under board Settings — and they have to be approved under People first.'
              : undefined
          }
        />
      </Panel>

      {b.labels.length > 0 ? (
        <>
          <Heading>Labels</Heading>
          <Panel>
            <Row style={styles.wrap}>
              {b.labels.map((l) => {
                const on = c.labelIds.includes(l.id);
                return (
                  <Pressable
                    key={l.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Label ${l.name}`}
                    onPress={() =>
                      run(() =>
                        updateCard(
                          boardId,
                          cardId,
                          {
                            labelIds: on
                              ? c.labelIds.filter((x) => x !== l.id)
                              : [...c.labelIds, l.id],
                          },
                          user,
                        ),
                      )
                    }
                    style={[
                      styles.chip,
                      { borderColor: l.color, backgroundColor: on ? l.color : 'transparent' },
                    ]}
                  >
                    <Caption>{l.name}</Caption>
                  </Pressable>
                );
              })}
            </Row>
          </Panel>
        </>
      ) : null}

      <Heading>Comments ({c.commentCount})</Heading>
      <Comments boardId={boardId} cardId={cardId} members={assignable} user={user} />

      <Heading>Activity</Heading>
      <Panel>
        <ActivityLog
          boardId={boardId}
          cardId={cardId}
          members={assignable}
          columns={b.columns}
        />
      </Panel>

      <Heading>Danger zone</Heading>
      <Panel>
        {c.archived ? (
          <Button
            label="Restore to the board"
            onPress={() => run(() => restoreCard(boardId, cardId, user))}
          />
        ) : (
          <Button
            label="Archive card"
            variant="danger"
            onPress={() =>
              run(async () => {
                await archiveCard(boardId, cardId, user);
                nav.pop();
              })
            }
          />
        )}
        {sessionCan.manageBoards(user) ? (
          <>
            <Caption>
              Deleting is permanent and cannot be undone. Members can only
              archive.
            </Caption>
            <Button
              label="Delete permanently"
              variant="danger"
              onPress={() =>
                run(async () => {
                  await deleteCard(boardId, cardId);
                  nav.pop();
                })
              }
            />
          </>
        ) : null}
      </Panel>

    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  grow: { flex: 1, gap: space.xs },
  wrap: { flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
});
