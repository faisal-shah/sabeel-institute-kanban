import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ORG_TIMEZONE, applyMarkdown, type Priority } from '@sabeel/shared';
import { archiveCard, deleteCard, restoreCard, updateCard, useCard } from '../cards';
import { useBoard } from '../boards';
import { sessionCan, type SessionUser } from '../session';
import { useNav } from '../nav';
import { Markdown } from '../components/Markdown';
import { Comments } from '../components/Comments';
import { ActivityLog } from '../components/ActivityLog';
import {
  Body,
  Button,
  Caption,
  Card as Panel,
  Heading,
  Pill,
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

function addDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
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
  const column = b.columns.find((col) => col.id === c.columnId);
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
        <Row>
          <Caption>in</Caption>
          <Pill label={column?.name ?? 'unknown column'} tone="accent" />
        </Row>
      </Panel>

      <Heading>Description</Heading>
      <Panel>
        {editingDesc ? (
          <>
            {/* The toolbar exists so nobody has to remember markdown syntax. */}
            <Row style={styles.wrap}>
              {(
                [
                  ['Bold', 'bold'],
                  ['Italic', 'italic'],
                  ['Code', 'code'],
                  ['List', 'bullet'],
                  ['1.', 'numbered'],
                  ['Heading', 'heading'],
                  ['Link', 'link'],
                ] as const
              ).map(([label, action]) => (
                <Button
                  key={action}
                  label={label}
                  variant="secondary"
                  onPress={() => {
                    setDescription((d) => applyMarkdown(d, action));
                    setDirty(true);
                  }}
                />
              ))}
            </Row>
            <TextField
              value={description}
              onChangeText={(v) => {
                setDescription(v);
                setDirty(true);
              }}
              placeholder="Markdown supported"
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
            <Button
              label="Edit description"
              variant="secondary"
              onPress={() => setEditingDesc(true)}
            />
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
        <Row>
          {c.dueDate ? (
            <Pill
              label={overdue ? `${c.dueDate} — overdue` : c.dueDate}
              tone={overdue ? 'bad' : 'good'}
            />
          ) : (
            <Caption>No due date.</Caption>
          )}
        </Row>
        {/* All-day dates as YYYY-MM-DD strings — no timezone drift possible. */}
        <Row style={styles.wrap}>
          <Button
            label="Today"
            variant="secondary"
            onPress={() => run(() => updateCard(boardId, cardId, { dueDate: today }, user))}
          />
          <Button
            label="Tomorrow"
            variant="secondary"
            onPress={() =>
              run(() => updateCard(boardId, cardId, { dueDate: addDays(today, 1) }, user))
            }
          />
          <Button
            label="Next week"
            variant="secondary"
            onPress={() =>
              run(() => updateCard(boardId, cardId, { dueDate: addDays(today, 7) }, user))
            }
          />
          {c.dueDate ? (
            <Button
              label="Clear"
              variant="secondary"
              onPress={() =>
                run(() => updateCard(boardId, cardId, { dueDate: undefined }, user))
              }
            />
          ) : null}
        </Row>
      </Panel>

      <Heading>Assignees</Heading>
      <Panel>
        {assignable.length === 0 ? (
          <Caption>
            Only board members can be assigned. Ask a manager to add people to
            this board.
          </Caption>
        ) : null}
        {assignable.map((u) => {
          const on = c.assigneeUids.includes(u.uid);
          return (
            <Row key={u.uid} style={styles.between}>
              <View style={styles.grow}>
                <Body>{u.displayName}</Body>
                <Caption>{u.email}</Caption>
              </View>
              <Button
                label={on ? 'Unassign' : 'Assign'}
                variant={on ? 'secondary' : 'primary'}
                onPress={() =>
                  run(() =>
                    updateCard(
                      boardId,
                      cardId,
                      {
                        assigneeUids: on
                          ? c.assigneeUids.filter((x) => x !== u.uid)
                          : [...c.assigneeUids, u.uid],
                      },
                      user,
                    ),
                  )
                }
              />
            </Row>
          );
        })}
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
