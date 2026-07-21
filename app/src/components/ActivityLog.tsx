import { useMemo } from 'react';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { describeActivity, type ActivityType, type BoardColumn } from '@sabeel/shared';
import { db } from '../firebase';
import { useLiveQuery } from '../liveQuery';
import type { BoardMemberProfile } from '../boards';
import { Caption, Hint, Row, Spinner } from './ui';
import { StyleSheet, View } from 'react-native';
import { radius, space, useTheme } from '../theme';

interface Entry {
  id: string;
  type: ActivityType;
  actorUid: string;
  at: number;
  from?: string;
  to?: string;
}

function when(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The card's history, newest first.
 *
 * Capped at 50 entries: the timeline answers "what happened recently and who did
 * it", and an unbounded log on an old card would be a slow query nobody scrolls
 * to the end of.
 */
export function ActivityLog({
  boardId,
  cardId,
  members,
  columns,
}: {
  boardId: string;
  cardId: string;
  members: readonly BoardMemberProfile[];
  columns: readonly BoardColumn[];
}) {
  const t = useTheme();

  const log = useLiveQuery<Entry[]>(
    'activity',
    () =>
      query(
        collection(db, 'boards', boardId, 'cards', cardId, 'activity'),
        orderBy('at', 'desc'),
        limit(50),
      ),
    (docs) =>
      docs.map((d) => ({
        id: d.id,
        type: (d.data.type as ActivityType) ?? 'edited',
        actorUid: (d.data.actorUid as string) ?? '',
        at: (d.data.at as number) ?? 0,
        from: d.data.from as string | undefined,
        to: d.data.to as string | undefined,
      })),
    [boardId, cardId],
  );

  const nameFor = useMemo(() => {
    const m = new Map(members.map((x) => [x.uid, x.displayName]));
    return (uid: string) => m.get(uid) ?? 'Someone';
  }, [members]);

  const columnNameFor = useMemo(() => {
    const m = new Map(columns.map((c) => [c.id, c.name]));
    return (id: string) => m.get(id) ?? 'another column';
  }, [columns]);

  if (log.status === 'loading') return <Spinner />;

  const entries = log.data ?? [];
  if (entries.length === 0) return <Hint>No activity recorded yet.</Hint>;

  return (
    <View style={styles.list}>
      {entries.map((e) => (
        <Row key={e.id} style={styles.row}>
          <View style={[styles.tick, { backgroundColor: t.border.strong }]} />
          <Caption>
            {nameFor(e.actorUid)} {describeActivity(e, nameFor, columnNameFor)} ·{' '}
            {when(e.at)}
          </Caption>
        </Row>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.xs },
  row: { alignItems: 'flex-start' },
  tick: { width: 6, height: 6, borderRadius: radius.pill, marginTop: 6 },
});
