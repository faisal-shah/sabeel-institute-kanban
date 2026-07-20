# Stack gotchas — Expo + react-native-web + Firebase JS SDK

Cross-project notes for **this stack**, not this app. Everything here was paid
for at least once, in this repo or in `sabeel-institute-time-tracker`, and every
entry cost more time than it should have because the symptom pointed somewhere
other than the cause.

Written **symptom-first**, because that is how you find a thing you have
forgotten. Intended to graduate into a skill — keep entries in the form
*symptom → cause → fix*, and keep them stack-level rather than app-specific.

---

## Auth and sign-in

### Sign-in works in a normal browser but dies when the link is opened from WhatsApp/Slack
**Symptom:** `auth/missing-initial-state`, or a silent bounce back to the sign-in
screen. Only from links tapped inside a chat app.
**Cause:** chat apps open an in-app webview with **partitioned storage**. Firebase's
default `authDomain` (`<project>.firebaseapp.com`) puts the auth helper on a
*different origin* from the app, and the cross-origin handoff loses its state.
**Fix — two halves, both required:**
1. Console: GCP → APIs & Services → Credentials → the Firebase-created **Web
   client** → add `https://<project>.web.app` to **Authorized JavaScript
   origins** and `https://<project>.web.app/__/auth/handler` to **Authorized
   redirect URIs**.
2. Code: set `authDomain: '<project>.web.app'` (the hosting domain, not
   `firebaseapp.com`). Hosting serves `/__/auth/*` itself, so the whole redirect
   stays same-origin.

**Order matters:** register the redirect URI *before* flipping `authDomain`, or
sign-in breaks for everyone in between.

### Popups are blocked in in-app browsers
**Symptom:** tapping sign-in does nothing inside a webview.
**Fix:** catch `auth/popup-blocked` and
`auth/operation-not-supported-in-this-environment` from `signInWithPopup` and
fall back to `signInWithRedirect`.
**And:** call `getRedirectResult(auth)` on load and report its rejection. A failed
redirect surfaces *only* there — without it the user lands back on the sign-in
screen with no error anywhere.

### Native Google Sign-In fails with `DEVELOPER_ERROR`
**Symptom:** works on web, opaque failure on Android. Looks like a code bug.
**Cause:** `google-services.json` has no `client_type: 1` (Android OAuth client).
Adding the SHA-1 in the console does **not** update a file you already
downloaded.
**Fix:** add the SHA-1, then **re-download** `google-services.json`. Verify before
building:
```sh
python3 -c "import json;d=json.load(open('app/google-services.json'));print([o['client_type'] for o in d['client'][0]['oauth_client']])"
```
`1` must be in that list. Also pass the **web** client id (`client_type: 3`) as
`webClientId` — passing the Android one is its own `DEVELOPER_ERROR`.

Debug SHA-1 (the keystore is committed, so this is stable per repo):
```sh
keytool -list -v -keystore app/android/app/debug.keystore \
  -alias androiddebugkey -storepass android -keypass android
```
The **release** key is different and must be registered separately.

### "Make internal" is greyed out on the OAuth consent screen
**Cause:** Internal requires the Cloud project to belong to a **Google Cloud
organization**. A project created under a personal Google account has none.
**Options:** move the project into the Workspace org (keeps project id and data),
or accept External — in which case **publish it**, because in `Testing` only
explicitly-listed test users can sign in at all.
**Either way:** enforce the domain **server-side**. The client `hd` hint is UX and
is trivially bypassed.

### The domain check must delete, not mark
Rejecting a non-org account by writing `status: 'rejected'` leaves junk in the
users collection. Delete the auth user instead: nothing is written, the person
can retry with the right address, and everything in `users` is then someone who
legitimately reached the approval queue.

---

## Firebase emulators

### Writes succeed, triggers log success, and the client swears the doc does not exist
**Symptom:** listener returns a *server* snapshot (`fromCache=false`) saying
absent.
**Cause:** the Firestore emulator **partitions data by project id**. A client
configured with a different id talks to a different database inside the same
emulator.
**Fix:** the client must use the same project id as
`firebase emulators:exec --project`. Keep one exported constant and use it on
both sides.

### One snapshot arrives, then silence (React Native only)
**Cause:** the WebChannel stream dies silently under RN's networking.
**Fix:** `experimentalForceLongPolling` on native; `experimentalAutoDetectLongPolling`
on web.

### Emulator logs a Secret Manager 403 for every bound secret
**Cause:** `secrets: [...]` makes the emulator try real Secret Manager.
**Fix:** `functions/.secret.local` (gitignored). Note an **empty value is not
treated as an override**, so the 403 may persist — harmless, but document it or
people learn to ignore emulator errors.

### Rules pass in the emulator and fail in production
Composite indexes are **not enforced** by the emulator. Every composite index
needs a production probe before launch.

---

## Expo / Metro / builds

### A UI change appears to have no effect
**Symptom:** screenshots byte-identical across a real code change.
**Cause:** a long-running `expo start` went stale and serves a bundle that no
longer matches source.
**Fix:** restart the dev server before concluding the code is wrong. Compare
screenshot **file sizes** — byte-identical output across a real change means a
stale bundle, not an ineffective fix.

### A perfectly good build shows a red screen quoting another repo's paths
**Cause:** Metro port 8081 is shared machine-wide, and the emulator reaches it at
`10.0.2.2:8081` — the host directly — so `adb reverse` does not redirect it.
Whoever holds 8081 serves your app.
**Fix:** a preflight check that refuses to start when 8081 belongs to another
project.

### Something works in dev and vanishes in the exported build
**Cause:** `expo export` sets `__DEV__` to **false**. Anything gated on it is
stripped — correctly, but surprisingly.
**Consequence:** e2e flows needing dev-only affordances must drive `expo start`,
not the export. Assert the *absence* separately so the safety property is tested
rather than assumed.

### Bundles built under different env values
Use `--clear`. `EXPO_PUBLIC_*` values are **inlined at build time**, so a cached
bundle can carry yesterday's config. Corollary: `EXPO_PUBLIC_*` can never hold a
secret — anyone with the app has it.

---

## react-native-web

### A control ignores your theme colours
`Switch` ignores `thumbColor`/`trackColor`, and the RNW-specific
`activeThumbColor`/`activeTrackColor` are gone in 0.21 — it renders Material
teal. **Build toggles from `Pressable` + views you control.** Assume any RNW
control that wraps a platform widget may not be themeable, and check with a
screenshot rather than trusting the props.

### There is no dropdown primitive in React Native
Use a **platform seam**: `<select>` on web (free keyboard nav, type-ahead,
scrolling), a bounded modal list on native. Rendering one button per option is
the trap — it looks fine with three options and fills the screen with twelve.

### Emoji arrows render as colour glyphs
`◀`/`▶` ignore text colour. Use text-presentation glyphs (`‹`, `›`, `▾`) or
draw them.

### Layout must key off WIDTH, not platform
A tablet deserves the desktop layout; a narrow window deserves the phone one.
Branch on a measured breakpoint, and treat drag-and-drop as a *capability*
layered on the wide layout rather than a platform feature.

---

## Observability

### Test runs pollute the production error project
**Fix:** gate reporting on the same flag that points the app at emulators. Beyond
wasting quota, the browser SDK wraps `fetch` for breadcrumbs and beacons to an
ingest host a sandbox cannot reach — enough to stall a sign-in flow and fail a
suite.

### Do not run `@sentry/wizard` on a repo with committed native dirs
It rewrites native files and metro config and writes a `sentry.properties`
containing a real auth token. Wire the SDK by hand.

### Serverless events never arrive
**Cause:** the instance can freeze the moment the handler resolves.
**Fix:** `await Sentry.flush(...)` before returning. Also exclude expected
domain errors (`HttpsError`) — otherwise real defects drown in users mistyping
things.

### Send the uid, not the email
It correlates with your users collection, which is all triage needs, without
putting staff addresses into a third-party service.

---

## Push notifications (FCM)

### Nothing is delivered, and nothing anywhere reports an error
The send path was complete and the **registration path was never written**. The
function reads each recipient's tokens, finds an empty list, and returns early —
a success, not an error. The inbox, the preferences and the mute control all
worked, so the feature looked finished from the outside for weeks.

Check that a token exists on a real user before debugging delivery at all.

### A token is registered and still nothing arrives
`getExpoPushTokenAsync()` returns an Expo token, deliverable only by Expo's push
service. The **Firebase Admin SDK** needs the native FCM token from
`getDevicePushTokenAsync()`. Both store a plausible string; the mismatch is
silent.

### `googleServicesFile` in `app.json` does nothing in a bare workflow
It is read by **prebuild**, and with a committed `android/` nobody runs prebuild.
`android/app/google-services.json`, the `com.google.gms:google-services`
classpath, and `apply plugin:` must all physically exist. Proof the build used
them:

```bash
ls app/android/app/build/generated/res/processReleaseGoogleServices/values/values.xml
```

### Tokens go in a subcollection, not an array field
`users/{uid}/pushTokens/{token}`. Two devices registering at once cannot race,
and the rule grants nothing beyond a person's own tokens. Use `isSignedIn`, not
`isActive` — **registration happens before an admin approves the account**; gate
the send instead. Nobody else may read the collection, admins included.

Unregister on sign-out (a push targets the *device*, so a handed-on phone keeps
receiving the previous account's notifications), and prune tokens FCM rejects as
`registration-token-not-registered` / `invalid-registration-token` — an uninstall
leaves one behind forever. Prune on nothing else; the other codes are transient.

### Web push is inert without a VAPID key and a service worker
Make the missing key an explicit early return rather than a throw during
sign-in. Half-configured web push should do nothing, by design, while native
keeps working.

### Arrival is the one part you cannot test
FCM has no emulator. Registration, rules and pruning are all testable; delivery
needs real hardware. Say which one you did not verify.

## Testing

### A seed or test "did nothing" — and did it repeatedly
**Symptom:** duplicate records, or an approval loop that approved nobody.
**Cause:** a live query returns **empty before it returns data**, and empty is
indistinguishable from absent. Sampling the UI immediately after navigating gets
the empty state.
**Fix:** wait for the list to *render* before deciding something is absent. Verify
against the database directly, not the UI, when checking whether a write landed.

### Confirmation dialogs silently do nothing under Playwright
Playwright **auto-dismisses** `window.confirm`. Register
`page.on('dialog', d => d.accept())` — and assert on the dialog *text*, so the
test proves a confirmation was demanded rather than just clicking through.

### An intermittent failure on a race the test created
Waiting for condition A and asserting condition B in the same tick. A trigger
that deletes an auth user can still have a doc write in flight. The assertion is
about what *survives*, so poll for it instead of sampling an instant — and re-run
a suspected flake several times, since one green run does not distinguish a fix
from luck.

### Verify UI by looking at it
Take the screenshot and actually read it. "The code looks right" has been wrong
often enough in this stack — teal toggles, off-screen buttons, overflowing
pagers — that it is not evidence.
