# Store release: no account creation in the mobile app

**Status:** design, not yet built. Kanban is the pilot; the other two follow.

## Who this is for

Three apps, three repos, one shape:

| App | Repo | Surfaces today | Store plan |
|---|---|---|---|
| Kanban | `sabeel-institute-kanban` | Android, iOS, web | iOS **unlisted**; Play **closed testing** |
| Timesheet | `sabeel-institute-time-tracker` | Android, web | Play **closed testing**; iOS later |
| Class recordings | `sabeel-recording-app` | Android, web | Play **production**; iOS later |

**Kanban goes first.** It is the only one with a working iOS build, so it proves
the whole route. The other two adapt this document rather than re-deriving it —
§ 8 lists exactly what differs per app.

If you are the agent for the timesheet or recordings app: read § 1 to § 3 as
requirements, § 8 for what is different about yours, and treat § 4 to § 7 as the
release checklist you will need when your turn comes.

---

## 1. The one rule everything else hangs off

> **The mobile app must never cause an account to come into existence.**

Not "must not show a signup screen". Must not *create*. Everything in this
document follows from that sentence, and one careless line of code destroys it.

### Why it is worth the refactor

Both stores require in-app account deletion **only if the app supports account
creation**:

- **Apple 5.1.1(v)** — "If your app supports account creation, you must also
  offer account deletion within the app." There is no clause about directing
  users elsewhere.
- **Google Play** — triggers if "a user can complete creating an app account
  directly in the app **or if the app directs the user to an app account
  creation flow outside of the app**."

Satisfy neither trigger and the requirement is not engaged. That saves building
a deletion flow that would have to decide what happens to organisation-owned
content when a board owner, or a student with a transcript, deletes themselves —
which is the genuinely hard part, not the button.

**The Workspace account is not the app account.** Play defines an app account as
"a unique user identity that developers provide". A staff member's
`@oursabeel.com` login is the *credential*; the app account is the Firebase Auth
uid plus the `users/{uid}` document your backend creates. Do not confuse
them —
"they already had a Google account" is not an argument that survives review.

---

## 2. The sign-in refactor

### What breaks it

```ts
// WRONG. The account exists by the end of line 1.
await signInWithCredential(auth, cred);
const me = await getDoc(doc(db, 'users', auth.currentUser.uid));
if (me.data()?.status !== 'active') await signOut(auth);
```

Signing out afterwards does not unmake the Auth record or the `users/` document
the create-trigger already wrote. This is account creation in the app.

### What works

Native Google Sign-In is **pure Google OAuth** — it yields an ID token and
touches nothing in your Firebase project. That is the window the design lives in.

```ts
const { idToken } = await GoogleSignin.signIn();   // creates nothing
const { exists } = await accountExists({ idToken });  // callable, Admin SDK
if (!exists) return showRefusal();                 // never reach Firebase Auth
await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
// from here, App.tsx routes on status exactly as it does today
```

### The `accountExists` callable

- Unauthenticated callable (there is no session yet, by definition).
- Verifies the Google ID token server-side. Do **not** trust an email sent by the
  client.
- Looks the user up with the Admin SDK and returns **one boolean: does an account
  exist.** Nothing about role, status or why. Never return *why* — that is an
  account-enumeration oracle, and it is the reason Firebase disabled the
  client-side check in the first place.

**It deliberately does not check status.** Existence is the whole compliance
question, because signing in to an account that already exists creates nothing.
Everything else is already handled:

| State | Mobile behaviour | Why it is safe |
|---|---|---|
| No account | Refuse; never call `signInWithCredential` | The one case that would create |
| Pending | Sign in, show the waiting-for-approval screen | Account exists; the screen already updates live on approval |
| Disabled | Sign in, show the account-disabled screen | Account exists; disabling sets a claim and revokes tokens, it does not set Firebase's own `disabled` flag, so sign-in still succeeds and `App.tsx` routes on the claim |
| Active | Sign in normally | — |

So the status routing in `App.tsx` is untouched. **The entire change is one
existence gate in front of `signInWithCredential`**, which is worth saying plainly
because it is far smaller than the compliance argument behind it.

**You cannot do this on the client.** `fetchSignInMethodsForEmail` returns an
empty array for every project created after 15 September 2023 — email enumeration
protection is on by default and the method is deprecated on all platforms.
Firebase's documented replacement is exactly this: Admin SDK behind a callable.

### No server-side backstop, deliberately

Decided 2026-08-18. A `beforeCreate` blocking function would run before the
record is persisted and could reject by throwing `HttpsError`, so it *would* be a
true backstop rather than a cleanup. It is still not worth having here.

The web app keeps self-service sign-in, so `beforeCreate` cannot reject
everything — it would have to tell web from mobile, and `EventContext` carries
`ipAddress` and `userAgent` but **no client identifier**. That leaves
user-agent sniffing, which a Firebase SDK update could silently break: the
failure mode is real staff being refused at web signup, which is worse than the
risk it covers.

The rule governs what the *app* does, and the app does not create. A modified
client is not the app. If this ever needs to be airtight — say the exemption is
challenged — the answer is admin pre-provisioning, not heuristics: creation moves
behind an admin action and `beforeCreate` rejects anything not pre-provisioned.

### The refusal copy, which matters more than it looks

The honest instruction — *"sign in on the website first"* — is the exact sentence
Google's second clause forbids. So the app must not say it:

> **This account isn't set up for the app yet.**
> Contact your administrator.

No URL, no product name, no "web". The real instruction goes in the onboarding
email, out of band, where it does not count. Accept one support question per new
person; it is the price of the exemption.

Put a comment in the sign-in code saying why there is no "Sign up" link, or
somebody adds a helpful one in two years and never connects it to a policy
declaration made today.

---

## 3. What moves, and what does not

**Moves to the web app:** creating an account. That is all.

Because sign-in on web stays self-service (staff sign in with Google and land
pending; an admin approves), nothing new has to be built there — the existing
flow already is the creation flow. The change is entirely on the mobile side.

**Stays in the mobile app:** role changes, disable and re-enable, membership,
and every other admin action. None of them creates an identity, and an admin
should still be able to cut off a departing colleague from a phone. Do not strip
features you are allowed to keep.

---

## 4. What each web app must provide

All three routes must be **served as static pages by Firebase Hosting, outside
the authenticated SPA**, and must return content to an anonymous fetch. Store
crawlers and reviewers do not sign in, and a client-side route behind auth looks
empty to them.

### 4.1 `/privacy` — the privacy policy

Required by Apple in App Store Connect metadata **and inside the app** (5.1.1(i)),
and by Play in the store listing. It must:

- identify what data is collected, how, and every use of it;
- name every third party with access — Google (sign-in), Firebase/Google Cloud
  (hosting, database, storage), Sentry (crash reports) — and confirm they give
  equal protection;
- state retention, and **describe how a user requests deletion**.

That last clause is not optional and is not removed by the exemption. The
exemption removes the *button*, not the *route*.

### 4.2 Deletion by email

No automated delete is required. The policy names an address and states the
process and the timeframe. Retention is legitimate and should be stated plainly
rather than hidden: organisation-owned records — cards, timesheets, academic
records — are retained as institutional records; the account, its credentials and
personal data are removed.

Address: **`privacy@oursabeel.com`** (decided 2026-08-18), one address across all
three apps. It does not exist yet — create it as a Workspace group with two
admins on it, so the policy does not go stale when one person changes role.

### 4.3 `/get-app` — the download page

A durable page linking the Android and iOS builds. Placeholders are fine for now;
the page must exist and be linked from somewhere permanent in the signed-in web
UI so people can find it without being sent a link each time.

This direction — web pointing at the app — is unrestricted. Only app-pointing-at-
web-signup is the problem.

### 4.4 `/support` — support page

App Store Connect requires a support URL. It can be minimal: what the app is, who
it is for, and the same contact address.

---

## 5. What each mobile app must add

- **A privacy policy link, inside the app.** Store metadata alone does not
  satisfy 5.1.1(i). A row in settings, and on the sign-in screen where a
  not-yet-signed-in reviewer can reach it.
- **The refusal path from § 2.**
- **iOS privacy manifest.** `expo.ios.privacyManifests` in `app.json`; Expo writes
  `PrivacyInfo.xcprivacy` from it during prebuild. Expect at least
  `NSPrivacyAccessedAPICategoryUserDefaults` with reason `CA92.1`.

**One accepted residual.** The policy lives on the same domain as the web app, so
a curious user could edit the URL down to the root and find the sign-in page. The
rule governs what the *app* directs users to, and a privacy policy link is not an
account creation flow — so this is fine. Mitigate it anyway: the privacy page
carries no navigation, no "sign in" link and no app branding beyond the name.

---

## 6. iOS release — unlisted

Full App Review, once. Then a direct link, not searchable, **no expiry and no
install cap** — unlike TestFlight external, where builds die after 90 days.

1. Submit as a normal App Store submission.
2. In **Review Notes**, state the exemption explicitly (§ 7).
3. The **Account Holder** files Apple's unlisted request at
   `developer.apple.com/contact/request/unlisted-app/`. The app must be submitted
   to review and must not be in a beta/prerelease state when the request is filed.

The Apple Developer account is an **Organization** account under Sabeel Institute,
so listings show the institute's name and the Account Holder files the request.

### Metadata never filled in, because TestFlight does not ask for it

- App Privacy questionnaire — Contact Info (email), User Content, Identifiers,
  Diagnostics. All **Linked to You**, none **Used to Track**.
- Age rating questionnaire.
- Support URL, privacy policy URL, screenshots at required sizes.

### Third-party SDK manifests

`GoogleSignIn`, `AppAuth`, `GTMAppAuth`, `GTMSessionFetcher` and `GoogleUtilities`
are all on Apple's required-manifest list and arrive via CocoaPods. Verify in
`ios/Pods` after a prebuild on the Mac — this cannot be checked from Linux.
Sentry is **not** on Apple's list. Watch for `ITMS-91053` warning emails after any
upload.

### Not required

- **Sign in with Apple.** Kanban and the timesheet are exempt under 4.8's
  education/enterprise carve-out (existing Workspace account). The recordings app
  needs the two-door split — see § 8.
- **ATT prompt or consent gate for crash reporting.** Apple's own guidance is
  explicit that analytics and crash reporting confined to your own app is not
  tracking. Disclosure in App Privacy is sufficient.

---

## 7. Android release

**Internal apps (Kanban, timesheet): closed testing.** Play has no equivalent of
Apple's unlisted, and production means a public listing. Closed testing stays
invisible, and membership is a Google Group an admin edits — which works because
every staff member has a Workspace Google account. Kanban is already on internal
testing, which is equally unlisted; moving to closed testing buys Google Group
management and a higher cap, nothing else.

**Recordings app: production.** Student intake is rolling and a student's Play
account is not the address the institute holds, so allowlisting does not scale.
The Play developer account is organizational, so production is available directly
— the 12-testers-for-14-days gate applies only to personal accounts created after
13 November 2023.

### Data safety form

Answer **No** to account creation, which under this design is true rather than
arguable, and the account-deletion questions fall away with it. Everything
declared must match the privacy policy — Google checks consistency.

### Already satisfied, do not regress

- `targetSdk 36` — meets the 31 August 2026 requirement.
- `minSdk 33`.
- Both external-storage permissions stripped with `tools:node="remove"`.

---

## 8. Per-app adaptation

### Kanban — the pilot

Already has iOS, purpose strings, and a released Play track. Needs: the § 2
refactor, the § 4 web pages, the § 5 in-app additions, and the § 6 metadata.

### Timesheet

`platforms: ["android", "web"]`. Same refactor and same web pages. iOS is a later
project — when it happens, § 6 applies unchanged. Its Play track stays unlisted.

### Sequencing

Kanban ships through App Review **first, alone** (decided 2026-08-18). The other
two follow once it is through. The pilot exists so that a correction from Apple
costs one app's rework rather than three — and the exemption argument in § 9 is
exactly the kind of thing a reviewer might push back on.

### Recordings app — the one that differs

`platforms: ["android", "web"]`, and **Google auth only today**; the student
email/password system does not exist yet.

- **Two labelled doors on the sign-in screen** — "Teacher sign in" (Google
  Workspace) and "Student sign in" (email/password). Make the split *visible*; a
  reviewer needs to see it, and it stops students tapping Google and hitting a
  wall.
- **Sign in with Apple is not needed** provided the student door stays
  first-party. The moment any social login appears on the student side, 4.8
  triggers and Sign in with Apple becomes mandatory.
- **Student accounts are created on the web app by a teacher**, and the student's
  first sign-in is on the web. The mobile refusal applies to both doors.
- **Password reset** must exist, and it is a first-party flow — no third-party
  login service involved, so it changes nothing about 4.8.
- Retention: academic records are retained. FERPA grants students the right to
  inspect and amend, never to erase, and transcripts are normally kept
  permanently.

---

## 9. Review Notes — the text to paste

```text
This app does not support account creation. Accounts are provisioned by the
organisation through its web application; the app refuses sign-in for any
identity that does not already have an account, and no account is created from
the app under any circumstance. Guideline 5.1.1(v) is therefore not engaged.

Sign-in uses Google with the organisation's existing enterprise accounts, which
is the education/enterprise exemption under Guideline 4.8.

[Recordings app only] The sign-in screen has two separate paths. Staff sign in
with the organisation's Google Workspace accounts. Students use a first-party
email and password system operated by the institution. No third-party login
service is offered on the student path.

Account deletion is requested by email; the privacy policy states the address,
the process and what is retained. Organisation-owned records — [cards /
timesheets / academic records] — are retained as institutional business records.
```

---

## 10. Legal position

Driven by store rules, not statute:

- **Texas TDPSA** — nonprofits are fully exempt, and small businesses separately.
- **CCPA** — applies to for-profit businesses. Not applicable.
- **FERPA** — **does not apply.** Confirmed 2026-08-18: the institute receives no
  US Department of Education funding. Retention of student records rests on
  institutional and contractual grounds instead, which is equally solid and is
  how the policy should word it. Do not cite FERPA.
- **GDPR** — **out of scope.** Confirmed 2026-08-18: all students are in the US.
  No erasure-rights section is needed. Revisit if the institute ever enrols
  someone in the EU or UK, because that single fact brings it back.
- **COPPA** — not applicable; no under-13 users on any app.

So the privacy policy can be short, plain and honest rather than a compliance
document. Have someone read it who is not the person who wrote it.

---

## 11. Open decisions

- [ ] Create `privacy@oursabeel.com` as a Workspace group and put two admins on
      it. Decided 2026-08-18; does not exist yet.
- [ ] Who reviews the privacy policy text. It should be read by somebody who did
      not write it.
- [ ] App Store listing copy, screenshots and category, per app.
- [ ] Whether a Google sign-in links correctly to a pre-created Auth user —
      depends on the project's one-account-per-email setting. Only matters if the
      backstop in § 2 is implemented as pre-provisioning.
- [ ] Whether `beforeCreate` fires for Admin SDK `createUser`. If it does not, an
      unconditional reject makes the backstop airtight.

---

## Sources

- Apple — [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- Apple — [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
  (2.1 demo accounts, 4.8 login services, 5.1.1 privacy and deletion)
- Apple — [User Privacy and Data Use](https://developer.apple.com/app-store/user-privacy-and-data-use/)
- Apple — [Unlisted app distribution](https://developer.apple.com/support/unlisted-app-distribution)
- Apple — [Third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/)
- Google Play — [App account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)
- Google Play — [Open, closed and internal tests](https://support.google.com/googleplay/android-developer/answer/9845334)
- Google Cloud — [Blocking functions](https://docs.cloud.google.com/identity-platform/docs/blocking-functions)
- Expo — [Privacy manifests](https://docs.expo.dev/guides/apple-privacy/)
