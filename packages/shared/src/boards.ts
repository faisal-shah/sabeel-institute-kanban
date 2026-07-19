import { DEFAULT_COLUMNS } from './constants';
import type { BoardColumn, BoardDoc, BoardLabel } from './types';

/**
 * Board construction and validation, shared so the client and any server-side
 * code agree on what a well-formed board looks like.
 */

/** Short random id for embedded columns and labels (not Firestore doc ids). */
export function localId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * A palette that stays legible on BOTH light and dark backgrounds. Label colors
 * are the one place users pick a color, so the choices are constrained rather
 * than free — an arbitrary picker guarantees someone chooses pale yellow and it
 * vanishes in light mode.
 */
export const LABEL_COLORS = [
  '#D73A49', // red
  '#E36209', // orange
  '#B08800', // amber
  '#2DA44E', // green
  '#0969DA', // blue
  '#8250DF', // purple
  '#BF3989', // magenta
  '#57606A', // slate
] as const;

export function defaultColumns(): BoardColumn[] {
  // A blank board is a worse first run than a wrong-but-editable one.
  return DEFAULT_COLUMNS.map((name) => ({ id: localId('col'), name }));
}

export function newBoard(params: {
  name: string;
  description?: string;
  createdBy: string;
  now: number;
}): BoardDoc {
  const columns = defaultColumns();
  return {
    name: params.name.trim(),
    description: params.description?.trim() ?? '',
    archived: false,
    columns,
    columnIds: columns.map((c) => c.id),
    labels: [],
    // The creator is always a member: a board nobody can see is a support ticket.
    memberUids: [params.createdBy],
    createdAt: params.now,
    createdBy: params.createdBy,
  };
}

/**
 * Columns and their flat id list must always move together — rules check card
 * writes against `columnIds`, so a desynced pair would either reject valid cards
 * or accept invented columns. Never write `columns` without this.
 */
export function columnsPatch(columns: BoardColumn[]): {
  columns: BoardColumn[];
  columnIds: string[];
} {
  return { columns, columnIds: columns.map((c) => c.id) };
}

export const BOARD_NAME_MAX = 120;

export function validateBoardName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Give the board a name.';
  if (trimmed.length > BOARD_NAME_MAX)
    return `Keep the name under ${BOARD_NAME_MAX} characters.`;
  return null;
}

export function validateColumnName(name: string, existing: BoardColumn[]): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Give the column a name.';
  if (trimmed.length > 60) return 'Keep the column name under 60 characters.';
  if (existing.some((c) => c.name.toLowerCase() === trimmed.toLowerCase()))
    return 'There is already a column with that name.';
  return null;
}

export function newLabel(name: string, color: string): BoardLabel {
  return { id: localId('lbl'), name: name.trim(), color };
}

/**
 * Board list ordering: favourites first, then most-recently-opened, then the
 * rest alphabetically. With no board cap the flat list is what degrades first,
 * and this is the cheapest structure that scales without asking anyone to
 * curate folders.
 */
export function sortBoardsForList<T extends { id: string; name: string }>(
  boards: T[],
  favouriteIds: readonly string[],
  recentIds: readonly string[],
): { favourites: T[]; recents: T[]; others: T[] } {
  const fav = new Set(favouriteIds);
  const favourites = boards.filter((b) => fav.has(b.id));

  const recentRank = new Map(recentIds.map((id, i) => [id, i]));
  const recents = boards
    .filter((b) => !fav.has(b.id) && recentRank.has(b.id))
    .sort((a, b) => (recentRank.get(a.id) ?? 0) - (recentRank.get(b.id) ?? 0));

  const seen = new Set([...favourites, ...recents].map((b) => b.id));
  const others = boards
    .filter((b) => !seen.has(b.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    favourites: favourites.sort((a, b) => a.name.localeCompare(b.name)),
    recents,
    others,
  };
}

/** Most-recent-first, capped, no duplicates. */
export function pushRecent(
  recents: readonly string[],
  boardId: string,
  max: number,
): string[] {
  return [boardId, ...recents.filter((id) => id !== boardId)].slice(0, max);
}
