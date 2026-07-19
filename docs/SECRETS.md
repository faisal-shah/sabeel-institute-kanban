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

## Reporting is off against the emulators

Both app seams gate on `USE_EMULATORS`, so a DSN in `.env.local` is ignored
whenever the app points at the emulators. Local runs and e2e passes would
otherwise file fake errors into the production project, burning a 5K/month quota
on noise. It was not only wasteful: the browser SDK wraps `fetch` and beacons to
an ingest host the test environment cannot reach, which stalled a sign-in flow
and aborted the suite until this gate was added.

## Deliberately NOT configured

- **`SENTRY_AUTH_TOKEN`** — would enable source-map upload so release stack
  traces are readable. Not wired because it is a real secret and because
  `@sentry/wizard`, the usual way to set it up, rewrites committed native files
  and metro config. Events, tags and user ids arrive without it; only the stack
  frames are minified.
- **Any Cloud Storage credential** — attachments are out of scope and no bucket
  is provisioned.

## What Sentry is allowed to know

`setErrorUser` sends the **uid only — never email or display name**. The uid
correlates with the `users` collection when someone needs to trace a report,
which is all triage requires. Putting staff email addresses into a third-party
service is a disclosure this app has no reason to make. The web and native seams
must not diverge on this.
