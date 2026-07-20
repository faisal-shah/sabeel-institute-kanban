# Stack gotchas — moved

The stack-level traps (Expo / react-native-web / Firebase JS SDK / FCM / Metro)
now live in ONE place, the `expo-firebase-stack` skill:

    ../agent-skills/skills/expo-firebase-stack/SKILL.md
    https://github.com/faisal-shah/agent-skills

This file used to hold a second copy. It drifted — 250 lines here against 640
there — and the sync was manual, so entries written during a debugging session
landed in one and not the other. A stub cannot drift, which is the whole point.

## Where a new lesson goes

Ask: **would this be true for a different company building on the same stack?**

- **Yes** → the skill. Expo, Metro, react-native-web, the Firebase JS SDK,
  Cloud Functions, FCM, emulator behaviour, build and export mechanics.
  Keep it symptom-first (*symptom → cause → fix*), and keep it clean of anything
  naming this project: the repo is **public**. No project ids, domains, emails,
  AVD names, secrets, or product decisions.
- **No** → `CLAUDE.md` in this repo. Product invariants, brand rules, our port
  and emulator conventions, phase process, division of labour.

The test is not "is it secret", it is "is it about the stack or about us".

## Using it

Install from the `agent-skills` repo (`./install.sh`, or
`./skills/expo-firebase-stack/install.sh`). It installs machine-wide to the
agent skill directories, so it applies to every project on this stack — this
one, the time tracker, and anything built the same way later.

Read its closing section, **"How this stack fools you"**, before debugging
anything subtle. The recurring shape is that failures here imitate success.
