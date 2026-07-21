# Sabeel Institute brand colors

**Source of truth: the designer's "Option 1" palette (2026-07-21).** This is a
deliberate *revision* of the original `docs/brand/sabeel-color-usage-guide.jpg`,
not a re-measure of it — the guide JPG is **superseded** and kept only for
history. This file is the machine-readable restatement plus the decisions needed
to apply it to an app with a dark mode, which the palette does not cover.

**Both apps share this palette exactly** — the Kanban board and the sibling
`sabeel-institute-time-tracker`. It is one identity across two products; the
values here are the authority for both.

## The palette

| Color | Hex | Share | Role | Where |
|---|---|---|---|---|
| Warm Ivory | `#F6EBDD` | 35% | Foundation | Main backgrounds, cards, content areas, forms |
| Soft Sage | `#A8B89A` | 30% | Calm & community | Alternate sections, highlights, footer, decor |
| Dark Raspberry | `#83114F` | 20% | Brand identity | Logo, headings, buttons, links, CTAs, titles |
| Antique Gold | `#C6A15B` | 10% | Elegance | Icons, dividers, borders, accents, hover states |
| Mushroom Taupe | `#A58D7A` | 5% | Support | Secondary text, borders, shadows, captions |

### What changed from the old guide, and why it matters

Two colours moved far enough to reread as different colours; the other three
barely shifted. Both apps had shipped the *old* values, so adopting Option 1 was
a coordinated change to both — not a correction of one against the other.

- **Raspberry `#8A1538` → `#83114F`** (ΔE ~17): brick red to plum. This is the
  most visible change in either app — it is every primary button, heading and
  link. Anything that hand-tuned a tint of the old red (a soft accent
  background, a dark-mode lift) had to be re-derived, not nudged.
- **Gold `#C89B3C` → `#C6A15B`** (ΔE ~13): a brighter yellow-gold to a muted tan.
- Ivory, sage and taupe shifted only slightly (ΔE 3–5).

The guide's stated principles, which the app follows:

- **Keep it light and airy** — Warm Ivory and Soft Sage carry the base.
- **Use raspberry with purpose** — reserved for key actions, headings and brand
  presence. It is the primary button and the accent, never a background wash.
- **Let gold shine sparingly** — small touches only: dividers, focus rings,
  selected states.
- **Ensure accessibility** — strong contrast between text and background.

## Two deliberate departures, and why

**1. Body text is a darkened taupe, not Mushroom Taupe.**
The palette lists Mushroom Taupe (`#A58D7A`) for support text. On Warm Ivory that
is roughly **2.7:1** contrast — well below the WCAG AA minimum of 4.5:1 for body
text, and genuinely hard to read on a phone outdoors. Since the guide *also*
insists on accessibility, the two instructions conflict, and legibility wins:

- Primary text: `#3A2F28` — a deep warm brown that reads as the same family.
- Secondary text: `#6A5748` — a darkened taupe, ~5.8:1 on ivory.
- Mushroom Taupe itself is kept for **borders, dividers, shadows and muted
  captions**, exactly where its softness is an asset and contrast is not
  load-bearing.

Raspberry on ivory is ~8.3:1, so headings and links are comfortably fine as
specified. A second, quieter case of the same rule: **gold as a functional
signal is deepened** — `#C6A15B` is ~2.1:1 on ivory, so the `warning` token uses
`#977535`. True gold stays true where it is decoration (dividers, borders), not
signal.

**2. Dark mode is derived, because neither the guide nor Option 1 defines one.**
The app follows the OS setting, so a dark palette is required. Rather than invent
new hues, each brand color is lifted to stay recognisable on a dark ground:

- Backgrounds become deep warm browns rather than neutral greys, so the palette
  keeps its warmth instead of turning clinical.
- Raspberry lifts to `#D85A9F` — the new **plum** hue (327°) at a luminance that
  reads on dark. Note this is NOT the old dark-accent `#E0577F`, which was a
  lighter version of the brick-red raspberry; re-deriving off the new hue was
  the whole point, since a pink lift of a plum is subtly wrong.
- Gold and sage lift slightly for the same reason.

If the brand ever publishes an official dark palette, replace
`palette.dark` in `app/src/theme/palette.ts` and nothing else needs to change.

## The logo

Source: `docs/brand/sabeel-logo.png` (also copied to
`app/assets/brand/sabeel-logo.png`, which is what the app bundles).

Arabic calligraphy reading *Sabeel* with gold accent strokes, alongside the
wordmark. Two rules follow from its construction:

**Two assets, no plate and no tint:**

| Theme | Asset |
|---|---|
| Light | `sabeel-logo.png` — dark calligraphy, gold accents |
| Dark | `sabeel-logo-reverse.png` — ivory calligraphy, **gold accents preserved** |

Both ship with transparency and sit directly on the canvas. This is the approach
the sibling time-tracker app already uses, and it is the right one: a flat
`tintColor` would recolour the whole mark and **throw the gold away**, and a
light plate behind the dark mark in dark mode changes how the brand reads to
work around a missing asset.
- **It appears on the sign-in screen only.** Inside the app the brand is carried
  by the palette. A logo repeated on every screen is chrome, and on a phone it
  costs space the board needs.

If a vector version (SVG/PDF) exists, add it alongside — the PNG will soften on
large displays and at print sizes.

## How this is enforced in code

- `app/src/theme/palette.ts` is the **only** file allowed to contain color
  literals. An ESLint rule rejects hex/rgb/hsl anywhere else under `app/src`.
- Screens consume **semantic tokens** from `app/src/theme/index.ts`
  (`bg.canvas`, `text.primary`, `accent.base`, …), never brand names. That way a
  brand refresh is a one-file change, and no screen needs to know that "accent"
  currently means raspberry.
- Card **priority** colors are a functional scale, not brand colors: red/amber/
  green must read as urgency and cannot be replaced by the brand palette without
  losing that meaning. They are tuned to sit harmoniously beside it, and to stay
  distinguishable in both themes.
- Board **label** colors offer a fixed palette rather than a free picker, so
  nobody picks something that vanishes on one of the two backgrounds.
