import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  CARD_DESCRIPTION_MAX,
  CARD_TITLE_MAX,
  ORG_TIMEZONE,
  readableInkOn,
  type Priority,
} from '@sabeel/shared';
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
import { shareLink, WEB_ORIGIN } from '../share';
import { cardPath } from '../links';
import { Comments } from '../components/Comments';
import { ActivityLog } from '../components/ActivityLog';
import { AssigneePicker } from '../components/AssigneePicker';
import { DateField } from '../components/DateField';
import { Select } from '../components/Select';
import {
  Body,
  Button,
  Caption,
  Hint,
  IconAction,
  Card as Panel,
  Heading,
  Row,
  Screen,
  Spinner,
  TextField,
  Title,
} from '../components/ui';
import { radius, space, type, useTheme } from '../theme';
import { useAction } from '../useAction';

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
  const card = useCard(cardId);
  const board = useBoard(boardId);
  const boardCards = useBoardCards(boardId);
  const t = useTheme();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const { run, busy, error } = useAction('card');
  const [dirty, setDirty] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

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
      <Screen width="read">
        <Title>Card not found</Title>
        <Hint>It may have been deleted.</Hint>
        <Button label="Back" onPress={nav.pop} />
      </Screen>
    );
  }


  const today = todayInOrgTz();
  const overdue = c.dueDate !== undefined && c.dueDate < today;
  // Only board members may be assigned — the rule the My Work query depends on.
  // Sourced from the board doc so non-admins (who cannot list users) still see
  // who they can assign.
  const assignable = b.members;

  // Share an https link to this card. The receiver opens it — desktop lands in
  // the web app, a phone opens the browser (or, once App Links ship, the app) —
  // and the link resolves the card's board live, so it survives a cross-board
  // move. The link is built from the card id, never from the address bar.
  const onShare = async () => {
    const result = await shareLink(`${WEB_ORIGIN}${cardPath(cardId)}`, c.title);
    if (result === 'copied') {
      setShareNote('Link copied');
      setTimeout(() => setShareNote(null), 2200);
    }
  };

  return (
    <Screen width="read">
      <Row style={styles.between}>
        <View style={styles.crumbCol}>
          {/* Which board this card lives on — and a one-tap way back to it.
              Cards are top-level docs, so without this the detail view gives no
              hint of its board. Accent-coloured because it navigates. */}
          <Pressable
            onPress={() => nav.push({ name: 'board', boardId })}
            accessibilityRole="link"
            accessibilityLabel={`Open board ${b.name}`}
            hitSlop={8}
            style={styles.crumb}
          >
            <MaterialIcons name="dashboard" size={13} color={t.accent.base} />
            <Text style={[type.caption, { color: t.accent.base }]} numberOfLines={1}>
              {b.name}
            </Text>
          </Pressable>
          <Title>Card</Title>
        </View>
        <View style={styles.headerActions}>
          {shareNote ? <Caption>{shareNote}</Caption> : null}
          <IconAction icon="share" label="Share card" onPress={onShare} />
          <IconAction icon="arrow-back" label="Back" onPress={nav.pop} />
        </View>
      </Row>

      {error ? (
        <Panel>
          <Body>{error}</Body>
        </Panel>
      ) : null}

      <Panel>
        <Hint>Title</Hint>
        <TextField
          value={title}
          onChangeText={(v) => { setTitle(v); setDirty(true); }}
          maxLength={CARD_TITLE_MAX}
        />
        {/* Only once the title actually differs. A permanently visible
            full-width button that is disabled 99% of the time is pure cost: it
            takes a row on every card, and a control you can never press teaches
            people to ignore it. An empty title is not a save either — it is a
            half-typed edit, so the button stays away rather than appearing
            disabled. */}
        {title.trim() !== c.title && title.trim().length > 0 ? (
          <Button
          busy={busy}
            label="Save title"
            onPress={() =>
              run(async () => {
                await updateCard(cardId, { title: title.trim() }, user);
                setDirty(false);
              })
            }
          />
        ) : null}
        {/* The column is EDITABLE here. Previously it was a read-only pill, so
            moving a card meant leaving the detail view, finding it on the board
            and using a separate move action — for the one property you most
            often change while reading a card. */}
        <Row>
          <Hint>in</Hint>
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
            <TextField
              value={description}
              onChangeText={(v) => {
                setDescription(v);
                setDirty(true);
              }}
              placeholder="Write a description"
              multiline
              maxLength={CARD_DESCRIPTION_MAX}
            />
            <Row>
              <Button
          busy={busy}
                label="Save"
                onPress={() =>
                  run(async () => {
                    await updateCard(cardId, { description }, user);
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
              <Body>{c.description}</Body>
            ) : (
              <Hint>No description yet.</Hint>
            )}
          </>
        )}
      </Panel>

      <Heading>Priority</Heading>
      <Panel>
        <Row style={styles.wrap}>
          {PRIORITIES.map((p) => {
            const selected = c.priority === p;
            const label = p[0].toUpperCase() + p.slice(1);
            // Selected looks like the card-face badge: filled color + readable ink.
            // `none` has no badge color, so it fills a neutral chip. Unselected is
            // an outline tinted with the priority color as a hint.
            const fill = p === 'none' ? t.bg.inset : t.priority[p];
            const ink =
              p === 'none'
                ? t.text.secondary
                : readableInkOn(fill, t.text.inverse, t.text.primary) === 'light'
                  ? t.text.inverse
                  : t.text.primary;
            return (
              <Pressable
                key={p}
                onPress={() => run(() => updateCard(cardId, { priority: p }, user))}
                accessibilityRole="button"
                accessibilityLabel={`Priority ${p}`}
                style={[
                  styles.chip,
                  selected
                    ? { backgroundColor: fill, borderColor: fill }
                    : {
                        backgroundColor: 'transparent',
                        borderColor: p === 'none' ? t.border.subtle : t.priority[p],
                      },
                ]}
              >
                <Text
                  style={[
                    type.caption,
                    { color: selected ? ink : t.text.secondary, fontWeight: selected ? '600' : '400' },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </Row>
      </Panel>

      <Heading>Due date</Heading>
      <Panel>
        {overdue ? <Caption>Overdue</Caption> : null}
        <DateField
          value={c.dueDate}
          label="Due date"
          onChange={(next) =>
            run(() => updateCard(cardId, { dueDate: next }, user))
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
                    <Text
                      style={[
                        type.caption,
                        {
                          // Readable ON the fill when selected; muted-but-legible
                          // on transparent when not.
                          color: on
                            ? readableInkOn(l.color, t.text.inverse, t.text.primary) === 'light'
                              ? t.text.inverse
                              : t.text.primary
                            : t.text.secondary,
                          fontWeight: on ? '600' : '400',
                        },
                      ]}
                    >
                      {l.name}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
          </Panel>
        </>
      ) : null}

      <Heading>Comments ({c.commentCount})</Heading>
      <Comments cardId={cardId} members={assignable} user={user} />

      <Heading>Activity</Heading>
      <Panel>
        <ActivityLog
          cardId={cardId}
          members={assignable}
          columns={b.columns}
        />
      </Panel>

      <Heading>Danger zone</Heading>
      <Panel>
        {c.archived ? (
          <Button
          busy={busy}
            label="Restore to the board"
            onPress={() => run(() => restoreCard(cardId, user))}
          />
        ) : (
          <Button
          busy={busy}
            label="Archive card"
            variant="danger"
            onPress={() =>
              run(async () => {
                await archiveCard(cardId, user);
                nav.pop();
              })
            }
          />
        )}
        {sessionCan.manageBoards(user) ? (
          <>
            <Hint>
              Deleting is permanent and cannot be undone. Members can only
              archive.
            </Hint>
            <Button
          busy={busy}
              label="Delete permanently"
              variant="danger"
              onPress={() =>
                run(async () => {
                  await deleteCard(cardId);
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
  crumbCol: { flex: 1, gap: space.xs },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
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
});
