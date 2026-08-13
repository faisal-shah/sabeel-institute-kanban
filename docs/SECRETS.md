# Secrets and config

**Names and locations only. No value from this table is ever written down here,
pasted into chat, or committed.**

## The distinction that matters

Not everything here is a secret, and treating them alike leads to the wrong
instinct in both directions — hiding things that are meant to be public, and
being casual with the one thing that actually grants access.

| Kind | Examples | Handling |
|---|---|---|
| **Public by design** | Firebase web config, `WEB_CLIENT_ID` | **Committed.** Access is controlled by `firestore.rules`, never by hiding these. Hiding them would buy nothing and make setup harder. |
| **Not secret, still not committed** | Sentry client DSNs | Gitignored `app/.env.local`. They ship inside every browser and app bundle, so they cannot be secret; they are kept out of git only so a fork or public mirror does not inherit this project's event quota. |
| **Genuinely secret** | `SENTRY_DSN` (functions), `SENTRY_AUTH_TOKEN`, any service-account key | **Secret Manager**, or nothing. Never in the repo, never in chat. |

## Client — gitignored `app/.env.local`

| Name | Used by | Where to get it |
|---|---|---|
| `EXPO_PUBLIC_SENTRY_DSN_WEB` | `app/src/sentry.web.ts` | Sentry → web project → Client Keys (DSN) |
| `EXPO_PUBLIC_SENTRY_DSN_NATIVE` | `app/src/sentry.ts` | Sentry → React Native project → Client Keys (DSN) |

Web and native are **separate Sentry projects** with separate DSNs, so their
releases and source maps do not collide. A single shared variable would send
Android crashes to the web project.

`EXPO_PUBLIC_*` values are **inlined into the bundle at build time**. That is why
they must be non-secret: anyone with the app has them.

## Server — Secret Manager

| Name | Used by | Set with |
|---|---|---|
| `SENTRY_DSN` | `functions/src/sentry.ts` | `firebase functions:secrets:set SENTRY_DSN` |

Bind it on any function whose failures matter, via `secrets: [sentryDsn]`.
Currently bound on: `setUserAccess`, `removeBoardMember`,
`countMemberAssignments`.

Locally, `functions/.secret.local` (gitignored) sets it empty so the emulator
never reports. The emulator still logs one 403 at startup trying to reach real
Secret Manager — harmless, not silenced, and not a new failure.

## Build machine — the shell that archives for iOS, and nowhere else

| Name | Used by | Where to get it |
|---|---|---|
| `SENTRY_ORG` | `@sentry/react-native/expo` at prebuild | Sentry → Settings → the org URL slug |
| `SENTRY_PROJECT` | same | the **React Native** project, shared with Android |
| `SENTRY_AUTH_TOKEN` | same | Sentry → Settings → Auth Tokens, scopes `project:releases` + `org:read` |

Only the first two are non-secret. **The token is genuinely secret** and belongs
in the build shell's environment, never in a file this repo tracks.

They are environment variables rather than plugin options deliberately: the
plugin writes whatever options it is given verbatim into `ios/sentry.properties`,
**this repo is public**, and the plugin's own code warns that an `authToken`
option "will be written to the application package". Registered bare, it falls
back to these three names.

Absent, the Xcode build **succeeds and uploads no dSYMs**, so iOS crashes arrive
as raw addresses instead of function names — with nothing failing to say so.
`npm run check:ios` warns about them rather than failing, since only the Mac
needs them.

**Do NOT run `npx @sentry/wizard`** to set this up. It rewrites committed native
files and Metro config and writes a `sentry.properties` containing a real token.
The plugin registration in `app/app.json` is the whole configuration.

## Reporting is off against the emulators

Both app seams gate on `USE_EMULATORS`, so a DSN in `.env.local` is ignored
whenever the app points at the emulators. Local runs and e2e passes would
otherwise file fake errors into the production project, burning a 5K/month quota
on noise. It was not only wasteful: the browser SDK wraps `fetch` and beacons to
an ingest host the test environment cannot reach, which stalled a sign-in flow
and aborted the suite until this gate was added.

## Deliberately NOT configured

- **Web and Android source-map upload.** Still not wired, for the reason below:
  events, tags and user ids arrive, only the stack frames are minified. Android
  would need a hand edit to the committed `app/android/app/build.gradle`, since a
  config plugin cannot reach a folder that is never prebuilt.
- **Any Cloud Storage credential** — the bucket is reached through the Admin SDK
  and the client Firebase config, neither of which is a secret. No bucket
  is provisioned.

## What Sentry is allowed to know

`setErrorUser` sends the **uid only — never email or display name**. The uid
correlates with the `users` collection when someone needs to trace a report,
which is all triage requires. Putting staff email addresses into a third-party
service is a disclosure this app has no reason to make. The web and native seams
must not diverge on this.
