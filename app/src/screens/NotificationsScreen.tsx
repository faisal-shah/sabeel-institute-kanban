import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { NOTIFY_EVENTS } from '@sabeel/shared';
import {
  dismiss,
  markAllRead,
  markRead,
  setNotifyPref,
  useInbox,
  useNotifyPrefs,
  type InboxItem,
} from '../notifications';
import { useMyBoards } from '../boards';
import { setBoardMuted } from '../notifications';
import type { SessionUser } from '../session';
import { useNav } from '../nav';
import {
  Body,
  Button,
  Caption,
  Card as Panel,
  Heading,
  Row,
  Screen,
  Spinner,
  Title,
} from '../components/ui';
import { radius, space, useTheme } from '../theme';
import { toUserMessage } from '../errors';

function when(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The in-app inbox and notification preferences.
 *
 * The inbox exists because push alone is lossy: a notification swiped away, or
 * arriving while the phone is off, would otherwise be gone. Everything sent is
 * recorded here.
 */
export function NotificationsScreen({ user }: { user: SessionUser }) {
  const nav = useNav();
  const inbox = useInbox(user);
  const prefsDoc = useNotifyPrefs(user);
  const boards = useMyBoards(user);
  const t = useTheme();
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = inbox.data ?? [];
  const prefs = prefsDoc.data?.prefs ?? {};
  const muted = prefsDoc.data?.mutedBoardIds ?? [];

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(toUserMessage(e, 'notifications'));
    }
  }

  function open(item: InboxItem) {
    void markRead(user, item).catch(() => {});
    if (item.cardId && item.boardId) {
      nav.push({ name: 'card', boardId: item.boardId, cardId: item.cardId });
    } else if (item.boardId) {
      nav.push({ name: 'board', boardId: item.boardId });
    }
  }

  if (inbox.status === 'loading') return <Spinner label="Loading notifications…" />;

  const unread = items.filter((i) => !i.read).length;

  return (
    <Screen>
      <Row style={styles.between}>
        <Title>Notifications</Title>
        <Row>
          <Button
            label={showSettings ? 'Inbox' : 'Settings'}
            variant="secondary"
            onPress={() => setShowSettings((s) => !s)}
          />
          <Button label="Back" variant="secondary" onPress={nav.pop} />
        </Row>
      </Row>

      {error ? (
        <Panel>
          <Body>{error}</Body>
        </Panel>
      ) : null}

      {showSettings ? (
        <>
          <Heading>What you are told about</Heading>
          {NOTIFY_EVENTS.map((spec) => {
            const on = prefs[spec.event] ?? spec.defaultOn;
            return (
              <Panel key={spec.event}>
                <Row style={styles.between}>
                  <View style={styles.grow}>
                    <Body>{spec.label}</Body>
                    <Caption>{spec.description}</Caption>
                  </View>
                  <Button
                    label={on ? 'On' : 'Off'}
                    variant={on ? 'primary' : 'secondary'}
                    onPress={() =>
                      run(() => setNotifyPref(user, spec.event, !on, prefs))
                    }
                  />
                </Row>
              </Panel>
            );
          })}

          <Heading>Mute a board</Heading>
          <Caption>
            Muting silences everything from a board without changing what you are
            told about elsewhere.
          </Caption>
          {(boards.data ?? []).map((b) => {
            const isMuted = muted.includes(b.id);
            return (
              <Panel key={b.id}>
                <Row style={styles.between}>
                  <Body>{b.name}</Body>
                  <Button
                    label={isMuted ? 'Muted' : 'Mute'}
                    variant={isMuted ? 'danger' : 'secondary'}
                    onPress={() => run(() => setBoardMuted(user, b.id, !isMuted, muted))}
                  />
                </Row>
              </Panel>
            );
          })}
        </>
      ) : (
        <>
          <Row style={styles.between}>
            <Caption>
              {items.length === 0
                ? 'Nothing here yet.'
                : `${unread} unread of ${items.length}`}
            </Caption>
            {unread > 0 ? (
              <Button
                label="Mark all read"
                variant="secondary"
                onPress={() => run(() => markAllRead(user, items))}
              />
            ) : null}
          </Row>

          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => open(item)}
              accessibilityRole="button"
              accessibilityLabel={item.text}
            >
              <Panel
                style={
                  item.read
                    ? undefined
                    : { borderColor: t.accent.base, borderWidth: 2 }
                }
              >
                <Row style={styles.between}>
                  <View style={styles.grow}>
                    <Body>{item.text}</Body>
                    <Caption>
                      {when(item.at)}
                      {item.read ? '' : ' · unread'}
                    </Caption>
                  </View>
                  <Button
                    label="Dismiss"
                    variant="secondary"
                    onPress={() => run(() => dismiss(user, item))}
                  />
                </Row>
              </Panel>
            </Pressable>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  grow: { flex: 1, gap: space.xs },
});

/** Small unread badge for the boards header. */
export function UnreadDot({ count }: { count: number }) {
  const t = useTheme();
  if (count <= 0) return null;
  return (
    <View style={[badge.dot, { backgroundColor: t.accent.base }]}>
      <Caption>{count > 9 ? '9+' : String(count)}</Caption>
    </View>
  );
}

const badge = StyleSheet.create({
  dot: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
