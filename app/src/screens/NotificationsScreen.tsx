import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { NOTIFICATION_RETENTION_DAYS, NOTIFY_EVENTS } from '@sabeel/shared';
import {
  dismiss,
  dismissAll,
  markAllRead,
  markRead,
  routeForNotification,
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
  Hint,
  Card as Panel,
  Heading,
  IconAction,
  LoadError,
  Row,
  Screen,
  Spinner,
  Title,
  Toggle,
} from '../components/ui';
import { space, useTheme } from '../theme';
import { useAction } from '../useAction';

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
  // Emptying the inbox cannot be undone, so it asks first — same shape as
  // deleting a column.
  const [confirmingDismissAll, setConfirmingDismissAll] = useState(false);
  const { run, busy, error } = useAction('notifications');

  const items = inbox.data ?? [];
  const prefs = prefsDoc.data?.prefs ?? {};
  const muted = prefsDoc.data?.mutedBoardIds ?? [];


  function open(item: InboxItem) {
    void markRead(user, item).catch(() => {});
    // Shared with the push-tap handler so both land on the same screen — see
    // routeForNotification.
    const route = routeForNotification(item);
    if (route) nav.push(route);
  }

  if (inbox.status === 'loading') return <Spinner label="Loading notifications…" />;
  if (inbox.status === 'error') {
    return (
      <Screen width="read">
        <Title>Notifications</Title>
        <LoadError what="your notifications" />
      </Screen>
    );
  }

  const unread = items.filter((i) => !i.read).length;

  return (
    <Screen width="read">
      {/* No Back button: Alerts is a tab root reached from the nav bar. */}
      <Row style={styles.between}>
        <Title>Notifications</Title>
        <IconAction
          icon={showSettings ? 'inbox' : 'settings'}
          label={showSettings ? 'Inbox' : 'Notification settings'}
          size={24}
          onPress={() => setShowSettings((s) => !s)}
        />
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
                    <Hint>{spec.description}</Hint>
                  </View>
                  {/* A setting that is on or off is a toggle, not a button that
                      says which way it is currently pointing. */}
                  <Toggle
                    value={on}
                    disabled={busy}
                    label={spec.label}
                    onValueChange={(next) =>
                      run(() => setNotifyPref(user, spec.event, next, prefs))
                    }
                  />
                </Row>
              </Panel>
            );
          })}

          <Hint>
            Alerts keeps the last {NOTIFICATION_RETENTION_DAYS} days. Anything
            older is removed automatically — the card itself keeps its comments
            and history.
          </Hint>

          <Heading>Mute a board</Heading>
          <Hint>
            Muting silences everything from a board without changing what you are
            told about elsewhere.
          </Hint>
          {(boards.data ?? []).map((b) => {
            const isMuted = muted.includes(b.id);
            return (
              <Panel key={b.id}>
                <Row style={styles.between}>
                  <Body>{b.name}</Body>
                  {/* The bell says the state and changes it in one tap: struck
                      through means silenced. */}
                  <IconAction
                    icon={isMuted ? 'notifications-off' : 'notifications'}
                    label={isMuted ? `Unmute ${b.name}` : `Mute ${b.name}`}
                    danger={isMuted}
                    size={22}
                    disabled={busy}
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
            <Hint>
              {items.length === 0
                ? 'Nothing here yet.'
                : `${unread} unread of ${items.length}`}
            </Hint>
            {/* A tight gap: each IconAction is a laid-out 44pt box, so a wide
                one would push this bar past a narrow phone. */}
            <Row style={styles.actions}>
              {unread > 0 ? (
                <IconAction
                  icon="done-all"
                  label="Mark all read"
                  size={22}
                  disabled={busy}
                  onPress={() => run(() => markAllRead(user, items))}
                />
              ) : null}
              {items.length > 0 ? (
                <IconAction
                  icon="delete-sweep"
                  label="Dismiss all"
                  danger
                  size={22}
                  disabled={busy}
                  onPress={() => setConfirmingDismissAll(true)}
                />
              ) : null}
            </Row>
          </Row>

          {confirmingDismissAll ? (
            <Panel>
              <Body>
                Dismiss all {items.length} notification
                {items.length === 1 ? '' : 's'}? They cannot be brought back.
              </Body>
              <Row>
                <Button
                  busy={busy}
                  label="Dismiss all"
                  variant="danger"
                  onPress={() =>
                    run(async () => {
                      await dismissAll(user, items);
                      setConfirmingDismissAll(false);
                    })
                  }
                />
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setConfirmingDismissAll(false)}
                />
              </Row>
            </Panel>
          ) : null}

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
                  <IconAction
                    icon="close"
                    label={`Dismiss: ${item.text}`}
                    disabled={busy}
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
  between: { justifyContent: 'space-between', alignItems: 'center' },
  grow: { flex: 1, gap: space.xs },
  actions: { gap: space.xs },
});

