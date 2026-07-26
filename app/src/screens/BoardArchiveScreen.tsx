import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { deleteCard, restoreCard, useArchivedBoardCards } from '../cards';
import { useBoard } from '../boards';
import { sessionCan, type SessionUser } from '../session';
import { useNav } from '../nav';
import { CardFace } from '../components/CardFace';
import {
  Body,
  Button,
  Hint,
  IconAction,
  Card as Panel,
  Row,
  Screen,
  Spinner,
  Title,
} from '../components/ui';
import { space } from '../theme';
import { useAction } from '../useAction';

/**
 * A board's archived cards, and the way back out.
 *
 * Archiving is the reversible half of the delete/archive pair — members can only
 * archive, precisely so nothing is lost by accident. But an archived card left
 * the board and there was no route back that anyone found: the only one was
 * global Search, in a different tab, behind an "Including archived" toggle that
 * gave no hint it was where your card went. A reversible action you cannot
 * discover how to reverse is not reversible.
 *
 * Reached from the board's own header, because that is where you are standing
 * when you wonder where a card went.
 */
export function BoardArchiveScreen({
  boardId,
  user,
}: {
  boardId: string;
  user: SessionUser;
}) {
  const nav = useNav();
  const board = useBoard(boardId);
  const cards = useArchivedBoardCards(boardId);
  const { run, busy, error } = useAction('boardArchive');
  /** Set only when a restore had to land the card somewhere else. */
  const [note, setNote] = useState<string | null>(null);

  if (board.status === 'loading' || cards.status === 'loading') {
    return <Spinner label="Loading archive…" />;
  }

  const b = board.data;
  if (!b) {
    return (
      <Screen width="read">
        <Title>Board not found</Title>
        <Button label="Back" variant="secondary" onPress={nav.pop} />
      </Screen>
    );
  }

  const archived = cards.data ?? [];

  return (
    <Screen width="read">
      <Row style={styles.between}>
        <Title numberOfLines={1} style={styles.grow}>
          Archived cards
        </Title>
        <IconAction icon="arrow-back" label="Back" onPress={nav.pop} />
      </Row>
      <Hint>{b.name}</Hint>

      {error ? (
        <Panel>
          <Body>{error}</Body>
        </Panel>
      ) : null}

      {note ? (
        <Panel>
          <Body>{note}</Body>
        </Panel>
      ) : null}

      {archived.length === 0 ? (
        <Panel>
          <Body muted>Nothing is archived on this board.</Body>
          <Hint>
            Archiving a card takes it off the board but keeps it — it will show up
            here, and can be put back at any time.
          </Hint>
        </Panel>
      ) : null}

      {archived.map((card) => (
        <Panel key={card.id}>
          {/* The same face the board draws, so an archived card is recognisable
              rather than reduced to a line of text. */}
          <CardFace card={card} boardLabels={b.labels} boardMembers={b.members} />
          <Row>
            <Button
              busy={busy}
              label="Restore to the board"
              onPress={() =>
                run(async () => {
                  const { movedTo } = await restoreCard(card, user, b.columns);
                  // Its own column may have been deleted while it sat here. Say
                  // where it actually went rather than letting it reappear
                  // somewhere the user is not looking.
                  if (movedTo) {
                    setNote(`“${card.title}” went back to ${movedTo} — the column it was archived from no longer exists.`);
                  }
                })
              }
            />
            {/* Permanent deletion stays managers/admins only, exactly as on the
                card itself — the archive is not a back door around that. */}
            {sessionCan.manageBoards(user) ? (
              <Button
                busy={busy}
                label="Delete"
                variant="danger"
                onPress={() => run(() => deleteCard(card.id))}
              />
            ) : null}
          </Row>
        </Panel>
      ))}

      <View style={styles.tail} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between', alignItems: 'center' },
  grow: { flex: 1 },
  tail: { height: space.xl },
});
