import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ROLES, type Role, type UserStatus } from '@sabeel/shared';
import { setUserAccess, useAllUsers, type AdminUserRow } from '../users';
import type { SessionUser } from '../session';
import { useNav } from '../nav';
import {
  Body,
  Button,
  Caption,
  Card,
  Heading,
  Pill,
  Row,
  Screen,
  Spinner,
  Title,
} from '../components/ui';
import { space } from '../theme';

const STATUS_TONE: Record<UserStatus, 'good' | 'warn' | 'bad' | 'neutral'> = {
  active: 'good',
  pending: 'warn',
  rejected: 'bad',
  disabled: 'neutral',
};

function UserRow({
  row,
  actor,
  onChange,
}: {
  row: AdminUserRow;
  actor: SessionUser;
  onChange: (uid: string, role: Role, status: UserStatus) => void;
}) {
  // An admin cannot change their own access — the server enforces it, and
  // showing the controls anyway would just produce a confusing failure.
  const isSelf = row.uid === actor.uid;

  return (
    <Card>
      <Row style={styles.headerRow}>
        <View style={styles.grow}>
          <Body>{row.displayName}</Body>
          <Caption>{row.email}</Caption>
        </View>
        <Row>
          <Pill label={row.role} tone="accent" />
          <Pill label={row.status} tone={STATUS_TONE[row.status]} />
        </Row>
      </Row>

      {isSelf ? (
        <Caption>This is you — ask another admin to change your access.</Caption>
      ) : (
        <>
          {row.status === 'pending' ? (
            <Row style={styles.wrap}>
              <Button
                label="Approve"
                onPress={() => onChange(row.uid, row.role, 'active')}
              />
              <Button
                label="Reject"
                variant="danger"
                onPress={() => onChange(row.uid, row.role, 'rejected')}
              />
            </Row>
          ) : null}

          {row.status === 'active' ? (
            <>
              <Caption>Role</Caption>
              <Row style={styles.wrap}>
                {ROLES.map((r) => (
                  <Button
                    key={r}
                    label={r}
                    variant={r === row.role ? 'primary' : 'secondary'}
                    onPress={() => onChange(row.uid, r, 'active')}
                    disabled={r === row.role}
                  />
                ))}
              </Row>
              <Button
                label="Disable account"
                variant="danger"
                onPress={() => onChange(row.uid, row.role, 'disabled')}
              />
            </>
          ) : null}

          {row.status === 'rejected' || row.status === 'disabled' ? (
            <Button
              label="Restore access"
              onPress={() => onChange(row.uid, row.role, 'active')}
            />
          ) : null}
        </>
      )}
    </Card>
  );
}

export function UsersScreen({ actor }: { actor: SessionUser }) {
  const nav = useNav();
  const users = useAllUsers();
  const [error, setError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  async function change(uid: string, role: Role, status: UserStatus) {
    setBusyUid(uid);
    setError(null);
    try {
      await setUserAccess(uid, role, status);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyUid(null);
    }
  }

  if (users.status === 'loading') return <Spinner label="Loading people…" />;

  const rows = users.data ?? [];
  const pending = rows.filter((r) => r.status === 'pending');
  const others = rows.filter((r) => r.status !== 'pending');

  return (
    <Screen>
      <Row style={styles.headerRow}>
        <Title>People</Title>
        {/* Without this the screen is a dead end — there is no other way back. */}
        <Button label="Back" variant="secondary" onPress={nav.pop} />
      </Row>
      <Caption>
        Only admins approve accounts and change roles. Managers create boards and
        may join any board; members see only the boards they&rsquo;re added to.
      </Caption>

      {error ? (
        <Card>
          <Body>{error}</Body>
        </Card>
      ) : null}

      {busyUid ? <Caption>Applying change…</Caption> : null}

      <Heading>Waiting for approval ({pending.length})</Heading>
      {pending.length === 0 ? (
        <Caption>Nobody is waiting.</Caption>
      ) : (
        pending.map((r) => (
          <UserRow key={r.uid} row={r} actor={actor} onChange={change} />
        ))
      )}

      <Heading>Everyone else ({others.length})</Heading>
      {others.map((r) => (
        <UserRow key={r.uid} row={r} actor={actor} onChange={change} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { justifyContent: 'space-between', alignItems: 'flex-start' },
  grow: { flex: 1, gap: space.xs },
  wrap: { flexWrap: 'wrap' },
});
