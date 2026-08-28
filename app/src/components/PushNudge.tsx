import { Pressable, StyleSheet, Text } from 'react-native';
import { Body, Button, Card } from './ui';
import { usePushNudge } from '../pushNudge';
import { useTheme } from '../theme';

/**
 * The sign-in nudge. Renders nothing unless this device can still be asked and
 * the person has not already waved it away — see pushNudge.ts.
 *
 * "Not now" is deliberately a low-emphasis link rather than a second button:
 * this sits above the board list, and two equal-weight buttons both out-shouted
 * that list and doubled the height the card steals from it.
 */
export function PushNudge({ uid }: { uid: string }) {
  const { visible, busy, failed, enable, dismiss } = usePushNudge(uid);
  const t = useTheme();
  if (!visible) return null;
  return (
    <Card>
      <Body>
        {failed
          ? 'Notifications can’t be set up on this device.'
          : 'Notifications are not enabled on this device.'}
      </Body>
      {/* No Enable button once it has failed — pressing again would do the same
          nothing. Dismissing is the only useful action left. */}
      {failed ? null : <Button label="Enable notifications" busy={busy} onPress={enable} />}
      {/* Disabled while the attempt runs, for the same reason `Button` disables
          itself: on web the page stays interactive behind the permission chip,
          so this was clickable mid-attempt — and the attempt's own result then
          landed after the dismissal and put the card back, against a stored flag
          that said it had been waved away. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Not now"
        onPress={dismiss}
        disabled={busy}
        style={styles.dismiss}
      >
        {/* Accent + underline, the link treatment: Hint's secondary grey read
            as a caption under the button rather than something to tap. */}
        <Text style={[styles.dismissText, { color: t.text.accent, opacity: busy ? 0.45 : 1 }]}>
          Not now
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  /**
   * Left, hugging its text — NOT centred across the card. On a wide screen the
   * button above sizes to its label and sits left, so a centred dismiss floated
   * off on its own with nothing to belong to. Still a real 44pt box rather than
   * hitSlop, because neighbouring slops overlap.
   */
  dismiss: {
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  dismissText: { fontSize: 14, textDecorationLine: 'underline' },
});
