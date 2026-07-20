# Rich-text editing for card descriptions — research, 2026-07-20

**No code changed.** This revisits the `CLAUDE.md` invariant *"descriptions are
markdown in a native TextInput — never a WebView rich-text editor"*, at Faisal's
request. The goal he set: **the user sees and edits rich text; markdown stays the
storage format.**

Our stack: Expo ~57, React Native 0.86, React 19.2, react-native-web.

## The honest state of the ecosystem

Expo's own guide is unusually blunt: *"There is currently no default solution for
that in the React Native ecosystem."* It splits the field in two, and every
option lands in one of them.

**1. Wrap a web editor in a WebView.** Real WYSIWYG with a toolbar, one
implementation across web and native. Expo names a *"performance and UX
penalty"*.

**2. Style a native `TextInput` as you type.** Native keyboard behaviour, no
WebView, but the user still sees markers — `**bold**` rendered bold rather than
a toolbar button. Expo calls this "markdown editors with visible styling
markers".

There is no third category. Feature-complete native rich text input does not
exist: React Native's `TextInput` returns plain strings from its callbacks, so
styled editing has to be faked either in a WebView or by re-styling the raw text.

## Candidates, checked against our versions

| Package | Version | Fits our stack? | Output | Verdict |
|---|---|---|---|---|
| `@10play/tentap-editor` | 1.0.1 | peer deps are `*` — unverified against RN 0.86 | **HTML or plain text** | Closest to true WYSIWYG. Markdown needs a conversion layer. |
| `@expensify/react-native-live-markdown` | 0.1.333 | needs `react-native-worklets` ≥0.7, `expensify-common` | **markdown, unconverted** | Native input, no WebView. **ExpensiMark flavour only** out of the box, not CommonMark. |
| `@siposdani87/expo-rich-text-editor` | 1.3.0 | requires Expo ≥55, RN ≥0.83 — we satisfy this | HTML | WebView + `contentEditable`. Smaller and less proven than TenTap. |
| `react-native-enriched-markdown` | 0.7.4 | pulls in `katex`, a config plugin | — | **Not an editor.** "Markdown Text component" — rendering only. |

Also available and worth naming: **Expo DOM components** (`'use dom'`, SDK 52+,
so we qualify). These let a plain React *web* component render inside a WebView
on native and natively on web. That means TipTap or Lexical could be used
directly with no React-Native-specific wrapper — the same WebView cost on
native, but no dependency on a third-party bridge staying maintained.

## The part that actually decides it

**Markdown is not a lossless target for a WYSIWYG editor.** TenTap emits HTML;
turning that into markdown needs `tiptap-markdown` (0.9.0, pre-1.0) or Turndown.
The risk is not the first conversion, it is the round trip: open → edit → save →
reopen. Anything the editor can express that markdown cannot — nested tables,
coloured text, arbitrary spans — degrades silently, and it degrades on someone's
real notes rather than on a test string.

That risk is controllable by **constraining the editor to exactly what our
renderer supports** (bold, italic, code, headings, lists, links, quotes) and
disabling everything else. A toolbar with six buttons that round-trips perfectly
is a better product than a rich toolbar that quietly eats formatting.

The second consideration is specific to us and recent: **we have just spent a
long session fixing keyboard behaviour** — edge-to-edge insets, a submit button
under the keyboard, a composer on a non-scrolling screen. A WebView introduces
its own keyboard, focus, and selection layer inside the one we just tuned, and
bugs in it are markedly harder to diagnose because the usual inspection tools
stop at the WebView boundary.

## Recommendation

**Do it, but prove the round trip before committing, and do web first.**

1. **Prototype on web only**, where the cost is zero. TipTap runs natively in the
   browser — no WebView, no bridge, no `@10play` dependency. Our
   `.web.tsx`/`.tsx` seams already exist for exactly this kind of split.
2. **Constrain the toolbar** to what `Markdown.tsx` renders today, so markdown
   remains a faithful representation rather than a lossy export.
3. **Measure fidelity with real content**, not samples: take the descriptions
   from the ClickUp export once it arrives, round-trip every one, and diff.
   Anything that does not survive is a feature to disable, not a bug to fix
   later.
4. **Only then decide native**, choosing between a DOM component (one codebase,
   WebView cost) and `live-markdown` (native input, needs a CommonMark parser to
   replace ExpensiMark). Web usage patterns should inform which.

Staging it this way means the invariant is retired on evidence rather than
enthusiasm, and the fallback at every point is the editor we already ship.

## What would change the recommendation

- If the team edits mostly on phones, web-first is the wrong order.
- If descriptions are consistently short and plain, this is effort spent on a
  problem the team does not have — worth checking against the ClickUp export
  before building anything.
