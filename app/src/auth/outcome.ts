/**
 * What a sign-in attempt ended as.
 *
 * A RESULT rather than an exception, and that is the point of the type. The
 * native app refuses any identity with no account (see `google.ts`), and that
 * refusal is an ordinary, expected outcome — a colleague who has not signed in
 * on the web yet. Throwing would send it through `toUserMessage`, which calls
 * `captureError`, and every un-provisioned sign-in would arrive in Sentry as an
 * application error. It is not one.
 *
 * `'no-account'` is native-only; `google.web.ts` never returns it, because the
 * web app is where accounts are created.
 */
export type SignInOutcome = 'signed-in' | 'cancelled' | 'no-account';
