import { Alert } from 'react-native';

/**
 * OK/Cancel confirmation — NATIVE side of the seam (web sibling: confirm.web.ts).
 *
 * Consequential access changes are confirmed rather than applied on tap, and the
 * message spells out what actually happens. Matches the sibling time-tracker
 * app, deliberately: the two apps share admins, and controls that behave
 * differently between them would be a trap.
 */
export function confirmAction(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Confirm', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
