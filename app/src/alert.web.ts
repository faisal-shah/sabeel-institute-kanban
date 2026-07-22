/**
 * A one-button notice — WEB (native sibling: alert.ts).
 *
 * `window.alert` for the same reason confirm.web.ts uses `window.confirm`: it is
 * synchronous, unmissable, and cannot render off-screen — right for the rare
 * "this shared link cannot be opened" case, not for routine feedback.
 */
export function notifyUser(title: string, message: string): void {
  window.alert(`${title}\n\n${message}`);
}
