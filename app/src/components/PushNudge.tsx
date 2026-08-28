import { Pressable, StyleSheet } from 'react-native';
import { Body, Button, Card, Hint } from './ui';
import { usePushNudge } from '../pushNudge';

/**
 * The sign-in nudge. Renders nothing unless this device can still be asked and
 * the person has not already waved it away — see pushNudge.ts.
 *
 * "Not now" is deliberately a low-emphasis link rather than a second button:
 * this sits above the board list, and two equal-weight buttons both out-shouted
 * that list and doubled the height the card steals from it.
 */
export function PushNudge({ uid }: { uid: string }) {
  const { visible, busy, enable, dismiss } = usePushNudge(uid);
  if (!visible) return null;
  return (
    <Card>
      <Body>Notifications are not enabled on this device.</Body>
      <Button label="Enable notifications" busy={busy} onPress={enable} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Not now"
        onPress={dismiss}
        style={styles.dismiss}
      >
        <Hint>Not now</Hint>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  /** A real 44pt box, not hitSlop — neighbouring slops overlap. */
  dismiss: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
