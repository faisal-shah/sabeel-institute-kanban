/**
 * Taps on a push notification — WEB (native sibling: pushOpen.ts).
 *
 * Inert, and honestly so. Web push in this app is dormant: `notify.web.ts`
 * returns before registering unless EXPO_PUBLIC_FCM_VAPID_KEY is set, and no
 * key is (see TODO.md § I), so no browser here can receive a notification to
 * tap. Wiring a service-worker `notificationclick` path would be code that has
 * never once run.
 *
 * The seam exists so App.tsx mounts one hook for both platforms instead of
 * branching on Platform.OS. If web push is ever turned on, this file — not the
 * caller — is what changes.
 */
export type PushData = Record<string, string>;

export function takeInitialPush(): PushData | null {
  return null;
}

export function subscribePushOpens(_cb: (data: PushData) => void): () => void {
  return () => {};
}

