import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  CARD_DESCRIPTION_MAX,
  CARD_TITLE_MAX,
  readableInkOn,
  todayInOrgTz,
  type Priority,
} from '@sabeel/shared';
import {
  archiveCard,
  cardsInColumn,
  createCard,
  deleteCard,
  moveCard,
  restoreCard,
  updateCard,
  useCard,
  useBoardCards,
  type Card,
} from '../cards';
import { useBoard } from '../boards';
import { sessionCan, type SessionUser } from '../session';
import { useNav } from '../nav';
import { shareLink, WEB_ORIGIN } from '../share';
import { cardPath } from '../links';
import { Comments } from '../components/Comments';
import { ActivityLog } from '../components/ActivityLog';
import {
  AssigneePicker,
  assignableCandidates,
} from '../components/AssigneePicker';
import { Subtasks } from '../components/Subtasks';
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

/** Stable empty, so Subtasks' memos don't churn while the board loads. */
const NO_CARDS: Card[] = [];

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
  const [editingTitle, setEditingTitle] = useState(false);
  // Owned here, not in AssigneePicker: the control that opens it lives on the
  // section heading, outside that component.
  const [picking, setPicking] = useState(false);
  const { run, busy, error } = useAction('card');
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<string | null>(null);

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
  // Whether the heading offers "assign someone" must be the SAME question the
  // picker answers, so it comes from the picker's own helper rather than from
  // comparing two lengths — see assignableCandidates.
  //
  // Deliberately NOT useMemo: this sits below the early returns above, where a
  // hook would be conditional. It is a filter over a handful of board members.
  const assignableNow = assignableCandidates(assignable, c.assigneeUids);

  // The card this one is a subtask of, resolved against the board's LIVE cards.
  // Resolving here rather than fetching means a parent that was archived, moved
  // to another board or deleted simply resolves to undefined and the link is not
  // rendered — a dead link is worse than no link.
  const parent = c.parentId
    ? (boardCards.data ?? NO_CARDS).find((x) => x.id === c.parentId)
    : undefined;

  const saveTitle = () =>
    run(async () => {
      const next = title.trim();
      // An empty title is a half-finished edit, not a save — and the rules
      // reject it anyway (title.size() > 0).
      if (!next) return;
      await updateCard(cardId, { title: next }, user);
      setEditingTitle(false);
      setDirty(false);
    });

  // Share an https link to this card. The receiver opens it — desktop lands in
  // the web app, a phone opens the browser (or, once App Links ship, the app) —
  // and the link resolves the card's board live, so it survives a cross-board
  // move. The link is built from the card id, never from the address bar.
  const onShare = async () => {
    const result = await shareLink(`${WEB_ORIGIN}${cardPath(cardId)}`, c.title);
    if (result === 'copied') {
      setNote('Link copied');
      setTimeout(() => setNote(null), 2200);
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
            {/* Shrinks, or a long board name (120 chars are allowed) is laid
                out at full width beside the icon and spills over the Share and
                Back actions — invisibly on web, which clips, but not on
                Android. Same trap as the phone pager's column name. */}
            <Text
              style={[type.caption, styles.shrink, { color: t.accent.base }]}
              numberOfLines={1}
            >
              {b.name}
            </Text>
          </Pressable>
          {/* No generic "Card" heading: the card's own title sits directly below
              as the page's heading, so a second one was pure noise. */}
        </View>
        <View style={styles.headerActions}>
          {note ? <Caption>{note}</Caption> : null}
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
        {/* The way back UP a subtask chain — and the ONLY place a subtask can
            detach itself.

            Shown whenever `parentId` is set, even when the parent cannot be
            resolved. Hiding it in that case was a one-way door: archiving or
            moving a parent left the child silently still linked, with no sign it
            was a subtask, no unlink here (the only unlink lived on the parent,
            which was now unreachable), and permanently excluded from every
            picker, because `canBeSubtaskOf` refuses a card that already has a
            parent. The link lives on the CHILD, so the child must always be able
            to let go of it. */}
        {c.parentId ? (
          <Row style={styles.between}>
            {parent ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open parent card ${parent.title}`}
                onPress={() => nav.push({ name: 'card', boardId, cardId: parent.id })}
                style={({ pressed }) => [styles.grow, pressed && { opacity: 0.6 }]}
              >
                <Hint>Subtask of</Hint>
                <Body>{parent.title}</Body>
              </Pressable>
            ) : (
              <View style={styles.grow}>
                <Hint>Subtask of</Hint>
                <Body muted>a card that isn&rsquo;t showing here</Body>
                <Hint>It may have been archived, moved to another board, or deleted.</Hint>
              </View>
            )}
            <IconAction
              icon="link-off"
              label="Unlink from parent card"
              onPress={() => run(() => updateCard(cardId, { parentId: undefined }, user))}
              disabled={busy}
            />
          </Row>
        ) : null}
        {/* The title READS as a title and only becomes a field when you choose
            to edit it — the same shape as Description just below.

            It was a permanently-open TextField, which was wrong twice over: a
            card's name is the thing you came to read, and a single-line input
            TRUNCATES it, so a long title could not be read at all on the one
            screen dedicated to that card. As a heading it wraps and shows in
            full. */}
        {editingTitle ? (
          <>
            <Hint>Title</Hint>
            <TextField
              value={title}
              onChangeText={(v) => { setTitle(v); setDirty(true); }}
              maxLength={CARD_TITLE_MAX}
              autoFocus
              label="Card title"
              onSubmit={saveTitle}
            />
            <Row>
              <Button
                busy={busy}
                label="Save"
                disabled={!title.trim() || title.trim() === c.title}
                onPress={saveTitle}
              />
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  setTitle(c.title);
                  setEditingTitle(false);
                  setDirty(false);
                }}
              />
            </Row>
          </>
        ) : (
          <Row style={styles.between}>
            <View style={styles.grow}>
              <Title>{c.title}</Title>
            </View>
            <IconAction
              icon="edit"
              label="Edit title"
              onPress={() => {
                setTitle(c.title);
                setEditingTitle(true);
              }}
              disabled={busy}
            />
          </Row>
        )}
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
      <Heading
        action={
          !editingDesc ? (
            <IconAction
              icon="edit"
              label="Edit description"
              onPress={() => setEditingDesc(true)}
            />
          ) : null
        }
      >
        Description
      </Heading>
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

      <Heading>Subtasks</Heading>
      <Panel>
        <Subtasks
          parentId={cardId}
          boardCards={boardCards.data ?? NO_CARDS}
          columns={b.columns}
          busy={busy}
          onOpen={(id) => nav.push({ name: 'card', boardId, cardId: id })}
          onCreate={(childTitle) =>
            run(async () => {
              // Created in the PARENT's column, so a breakdown starts wherever
              // the work currently sits rather than always at To Do.
              const newId = await createCard({
                boardId,
                columnId: c.columnId,
                title: childTitle,
                user,
                columnCards: cardsInColumn(boardCards.data ?? [], c.columnId),
              });
              await updateCard(newId, { parentId: cardId }, user);
            })
          }
          onLink={(id) => run(() => updateCard(id, { parentId: cardId }, user))}
          // `undefined` is how updateCard clears a field (deleteField), so an
          // unlink leaves the card intact and merely unparented.
          onUnlink={(id) => run(() => updateCard(id, { parentId: undefined }, user))}
        />
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

      {/* The person-add icon rides on the heading rather than sitting in the
          panel: a section-level control in its own row costs a row of a screen
          that is already long. Same shape as Description's edit icon. */}
      <Heading
        action={
          assignableNow.length > 0 && !picking ? (
            <IconAction
              icon="person-add"
              label={`Assign someone (${assignableNow.length} available)`}
              accent
              size={22}
              disabled={busy}
              onPress={() => setPicking(true)}
            />
          ) : null
        }
      >
        Assignees
      </Heading>
      <Panel>
        <AssigneePicker
          picking={picking}
          onPickingChange={setPicking}
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
          cardTitleFor={(id) =>
            (boardCards.data ?? NO_CARDS).find((x) => x.id === id)?.title ??
            'another card'
          }
        />
      </Panel>

      <Heading>Danger zone</Heading>
      <Panel>
        {c.archived ? (
          <Button
            busy={busy}
            label="Restore to the board"
            onPress={() =>
              run(async () => {
                // May land in a different column if its own was deleted while it
                // was archived — see restoreCard.
                const { movedTo } = await restoreCard(c, user, b.columns);
                if (movedTo) {
                  setNote(`Restored to ${movedTo}`);
                  setTimeout(() => setNote(null), 3200);
                }
              })
            }
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
  shrink: { flexShrink: 1 },
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
