/**
 * A one-button notice — NATIVE (web sibling: alert.web.ts).
 *
 * Mirrors the confirm.ts seam: a plain acknowledgement dialog for the rare case
 * a shared link cannot be opened (deleted card, or a recipient who is not a
 * member of its board). Not for routine per-screen feedback — that goes through
 * useAction's inline error.
 */
import { Alert } from 'react-native';

export function notifyUser(title: string, message: string): void {
  Alert.alert(title, message);
}
