/**
 * The WEB board: classic horizontal columns with real drag-and-drop.
 *
 * react-native-web is React DOM underneath, so this file uses plain DOM elements
 * and the HTML5 drag-and-drop API directly. That is far more robust than
 * emulating dragging with PanResponder, and it gives native cursor feedback and
 * auto-scroll for free. The native board (BoardScreen.tsx) is a different
 * layout entirely — swipe-paged columns with an explicit "Move to…" — which is
 * why these are platform seams rather than one responsive component.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  archiveCard,
  cardsInColumn,
  createCard,
  moveCard,
  rerankColumnIfNeeded,
  useBoardCards,
  type Card,
} from '../cards';
import { updateBoard, useBoard, type BoardMemberProfile } from '../boards';
import { useSelection } from '../useSelection';
import { BulkBar } from '../components/BulkBar';
import { columnsPatch, type BoardColumn } from '@sabeel/shared';
import { sessionCan, type SessionUser } from '../session';
import { useNav } from '../nav';
import { useListenerError } from '../liveQuery';
import { getTheme, radius, space, type Theme } from '../theme';
import { useColorScheme } from 'react-native';

type DragState = { cardId: string; fromColumnId: string } | null;

/** Stable empty, so the selection hook does not churn on every render. */
const EMPTY_CARDS: Card[] = [];
const NO_MEMBERS: BoardMemberProfile[] = [];

function useWebTheme(): Theme {
  const scheme = useColorScheme();
  return getTheme(scheme === 'dark' ? 'dark' : 'light');
}

function CardTile({
  card,
  t,
  canEdit,
  selected,
  onOpen,
  onArchive,
  onToggleSelect,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  card: Card;
  t: Theme;
  canEdit: boolean;
  selected: boolean;
  onOpen: () => void;
  onArchive: () => void;
  onToggleSelect: (shiftKey: boolean) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  return (
    <div
      draggable={canEdit}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      data-testid={`card-${card.title}`}
      style={{
        background: selected ? t.bg.accentSoft : t.bg.surface,
        border: `${selected ? 2 : 1}px solid ${
          selected ? t.accent.base : t.border.subtle
        }`,
        borderRadius: radius.md,
        padding: space.md,
        marginBottom: space.sm,
        cursor: canEdit ? 'grab' : 'pointer',
        opacity: dragging ? 0.4 : 1,
        boxShadow: `0 1px 2px ${t.effect.shadow}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: space.sm }}>
        <input
          type="checkbox"
          checked={selected}
          aria-label={`Select ${card.title}`}
          // Shift-click extends from the last touched card — the convention
          // everyone already knows from file managers and mail clients.
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(e.shiftKey);
          }}
          onChange={() => {}}
          style={{ marginTop: 3, accentColor: t.accent.base, cursor: 'pointer' }}
        />
        <div style={{ color: t.text.primary, fontSize: 15, flex: 1 }}>{card.title}</div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space.sm,
          marginTop: space.sm,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: t.priority[card.priority],
            display: 'inline-block',
          }}
        />
        {card.dueDate ? (
          <span style={{ color: t.text.muted, fontSize: 12 }}>{card.dueDate}</span>
        ) : null}
        {card.assigneeUids.length > 0 ? (
          <span style={{ color: t.text.muted, fontSize: 12 }}>
            {card.assigneeUids.length} assigned
          </span>
        ) : null}
        {canEdit ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onArchive();
            }}
            aria-label={`Archive ${card.title}`}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              color: t.text.muted,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Archive
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function BoardScreen({ boardId, user }: { boardId: string; user: SessionUser }) {
  const nav = useNav();
  const board = useBoard(boardId);
  const cards = useBoardCards(boardId);
  const listenerError = useListenerError();
  const t = useWebTheme();

  const [drag, setDrag] = useState<DragState>(null);
  const [dropTarget, setDropTarget] = useState<{ columnId: string; index: number } | null>(
    null,
  );
  const [adding, setAdding] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const selection = useSelection(cards.data ?? EMPTY_CARDS);

  // From the BOARD, not the user directory — only admins may list users.
  const members = board.data?.members ?? NO_MEMBERS;

  const canEdit = true; // any board member may edit cards
  const isManager = sessionCan.manageBoards(user);

  const byColumn = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const col of board.data?.columns ?? []) {
      map.set(col.id, cardsInColumn(cards.data ?? [], col.id));
    }
    return map;
  }, [board.data?.columns, cards.data]);

  const drop = useCallback(
    async (columnId: string, index: number, cardIdFromEvent: string | null) => {
      // The card id comes from the DataTransfer, not from React state.
      //
      // State is set in onDragStart, but React batches updates — a drop handled
      // in the same task still sees the OLD state and the move is silently
      // dropped. Carrying the payload on the event is both how HTML5 drag and
      // drop is meant to work and immune to render timing.
      const cardId = cardIdFromEvent || drag?.cardId || null;
      setDrag(null);
      setDropTarget(null);
      if (!cardId) return;

      const moving = (cards.data ?? []).find((c) => c.id === cardId);
      if (!moving) return;

      const target = (byColumn.get(columnId) ?? []).filter((c) => c.id !== moving.id);
      const before = index > 0 ? target[index - 1] : null;
      const after = index < target.length ? target[index] : null;
      if (before?.id === moving.id || after?.id === moving.id) return;

      try {
        await moveCard({
          boardId,
          card: moving,
          toColumnId: columnId,
          before: before ?? null,
          after: after ?? null,
          user,
        });
        // Background tidy-up; never blocks the user.
        void rerankColumnIfNeeded(boardId, target).catch(() => {});
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [drag, cards.data, byColumn, boardId, user],
  );

  async function addCard(columnId: string) {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle('');
    setAdding(null);
    try {
      await createCard({
        boardId,
        columnId,
        title,
        user,
        columnCards: byColumn.get(columnId) ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeColumn(col: BoardColumn) {
    const inCol = byColumn.get(col.id) ?? [];
    if (inCol.length > 0) {
      setError(
        `“${col.name}” still has ${inCol.length} card${inCol.length === 1 ? '' : 's'}. ` +
          'Move or archive them first — deleting a column must never take cards with it.',
      );
      return;
    }
    const next = (board.data?.columns ?? []).filter((c) => c.id !== col.id);
    try {
      await updateBoard(boardId, columnsPatch(next));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (board.status === 'loading' || cards.status === 'loading') {
    return (
      <div style={{ padding: space.xl, color: t.text.muted, background: t.bg.canvas }}>
        Loading board…
      </div>
    );
  }

  const b = board.data;
  if (!b) {
    return (
      <div style={{ padding: space.xl, background: t.bg.canvas, color: t.text.primary }}>
        <h2>Board not found</h2>
        <button onClick={() => nav.reset({ name: 'boards' })}>Back to boards</button>
      </div>
    );
  }

  return (
    <div
      style={{
        background: t.bg.canvas,
        minHeight: '100vh',
        padding: space.lg,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: space.md,
        }}
      >
        <h1 style={{ color: t.text.primary, margin: 0, fontSize: 22 }}>{b.name}</h1>
        <div style={{ display: 'flex', gap: space.sm }}>
          {isManager ? (
            <button
              onClick={() => nav.push({ name: 'boardSettings', boardId })}
              style={btn(t)}
            >
              Settings
            </button>
          ) : null}
          <button onClick={nav.pop} style={btn(t)}>
            Back
          </button>
        </div>
      </div>

      {selection.active ? (
        <BulkBar
          boardId={boardId}
          columns={b.columns}
          allCards={cards.data ?? []}
          selection={selection}
          members={members}
          user={user}
          onError={setError}
        />
      ) : null}

      {listenerError ? (
        <div style={banner(t)}>{listenerError}</div>
      ) : null}
      {error ? (
        <div style={banner(t)}>
          {error}{' '}
          <button onClick={() => setError(null)} style={{ ...btn(t), marginLeft: 8 }}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          gap: space.md,
          alignItems: 'flex-start',
          overflowX: 'auto',
          paddingBottom: space.lg,
        }}
      >
        {b.columns.map((col) => {
          const colCards = byColumn.get(col.id) ?? [];
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                if (drag) setDropTarget({ columnId: col.id, index: colCards.length });
              }}
              onDrop={(e) => {
                e.preventDefault();
                void drop(
                  col.id,
                  dropTarget?.columnId === col.id ? dropTarget.index : colCards.length,
                  e.dataTransfer.getData('text/plain') || null,
                );
              }}
              style={{
                background: t.bg.inset,
                borderRadius: radius.lg,
                padding: space.md,
                minWidth: 280,
                maxWidth: 320,
                flex: '0 0 auto',
                border:
                  dropTarget?.columnId === col.id
                    ? `2px solid ${t.accent.base}`
                    : '2px solid transparent',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: space.sm,
                }}
              >
                <strong style={{ color: t.text.primary, fontSize: 14 }}>
                  {col.name}{' '}
                  <span style={{ color: t.text.muted, fontWeight: 400 }}>
                    ({colCards.length})
                  </span>
                </strong>
                {isManager ? (
                  <button
                    onClick={() => removeColumn(col)}
                    aria-label={`Delete column ${col.name}`}
                    style={{ ...btn(t), fontSize: 12 }}
                  >
                    ✕
                  </button>
                ) : null}
              </div>

              {colCards.map((card, i) => (
                <div
                  key={card.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (drag) setDropTarget({ columnId: col.id, index: i });
                  }}
                >
                  {dropTarget?.columnId === col.id && dropTarget.index === i ? (
                    <div
                      style={{
                        height: 3,
                        background: t.accent.base,
                        borderRadius: 2,
                        marginBottom: space.sm,
                      }}
                    />
                  ) : null}
                  <CardTile
                    card={card}
                    t={t}
                    canEdit={canEdit}
                    selected={selection.isSelected(card.id)}
                    dragging={drag?.cardId === card.id}
                    onToggleSelect={(shiftKey) =>
                      shiftKey
                        ? selection.selectRangeTo(card.id, colCards)
                        : selection.toggle(card.id)
                    }
                    onOpen={() =>
                      selection.active
                        ? selection.toggle(card.id)
                        : nav.push({ name: 'card', boardId, cardId: card.id })
                    }
                    onArchive={() => archiveCard(boardId, card.id, user)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', card.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDrag({ cardId: card.id, fromColumnId: col.id });
                    }}
                    onDragEnd={() => {
                      setDrag(null);
                      setDropTarget(null);
                    }}
                  />
                </div>
              ))}

              {adding === col.id ? (
                <div>
                  <input
                    autoFocus
                    value={newTitle}
                    placeholder="Card title"
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void addCard(col.id);
                      if (e.key === 'Escape') {
                        setAdding(null);
                        setNewTitle('');
                      }
                    }}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: space.sm,
                      borderRadius: radius.sm,
                      border: `1px solid ${t.border.subtle}`,
                      background: t.bg.surface,
                      color: t.text.primary,
                    }}
                  />
                  <button onClick={() => void addCard(col.id)} style={primaryBtn(t)}>
                    Add card
                  </button>
                </div>
              ) : (
                <button onClick={() => setAdding(col.id)} style={{ ...btn(t), width: '100%' }}>
                  + Add card
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function btn(t: Theme): React.CSSProperties {
  return {
    background: t.bg.surface,
    color: t.text.primary,
    border: `1px solid ${t.border.subtle}`,
    borderRadius: radius.sm,
    padding: `${space.sm}px ${space.md}px`,
    cursor: 'pointer',
  };
}

function primaryBtn(t: Theme): React.CSSProperties {
  return {
    background: t.accent.base,
    color: t.accent.onAccent,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${space.sm}px ${space.md}px`,
    cursor: 'pointer',
    marginTop: space.sm,
    width: '100%',
  };
}

function banner(t: Theme): React.CSSProperties {
  return {
    background: t.bg.dangerSoft,
    color: t.text.danger,
    padding: space.sm,
    borderRadius: radius.sm,
    marginBottom: space.sm,
    fontSize: 13,
  };
}
