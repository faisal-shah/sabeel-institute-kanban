# Sabeel Institute brand colors

**Source of truth: `docs/brand/sabeel-color-usage-guide.jpg`** (the official
Brand & Website Color Usage Guide). Consult it before any design or color
decision. This file is the machine-readable restatement plus the decisions
needed to apply it to an app with a dark mode, which the guide does not cover.

## The palette

| Color | Hex | Share | Role | Where |
|---|---|---|---|---|
| Warm Ivory | `#F9F1E7` | 35% | Foundation | Main backgrounds, cards, content areas, forms |
| Soft Sage | `#B4C4AA` | 30% | Calm & community | Alternate sections, highlights, footer, decor |
| Dark Raspberry | `#8A1538` | 20% | Brand identity | Logo, headings, buttons, links, CTAs, titles |
| Antique Gold | `#C89B3C` | 10% | Elegance | Icons, dividers, borders, accents, hover states |
| Mushroom Taupe | `#9C8B7A` | 5% | Support | Secondary text, borders, shadows, captions |

The guide's stated principles, which the app follows:

- **Keep it light and airy** — Warm Ivory and Soft Sage carry the base.
- **Use raspberry with purpose** — reserved for key actions, headings and brand
  presence. It is the primary button and the accent, never a background wash.
- **Let gold shine sparingly** — small touches only: dividers, focus rings,
  selected states.
- **Ensure accessibility** — strong contrast between text and background.

## Two deliberate departures, and why

**1. Body text is a darkened taupe, not Mushroom Taupe.**
The guide lists Mushroom Taupe (`#9C8B7A`) for body text. On Warm Ivory that is
roughly **2.3:1** contrast — well below the WCAG AA minimum of 4.5:1 for body
text, and genuinely hard to read on a phone outdoors. Since the guide *also*
insists on accessibility, the two instructions conflict, and legibility wins:

- Primary text: `#3A2F28` — a deep warm brown that reads as the same family.
- Secondary text: `#6B5D51` — a darkened taupe, ~5.6:1 on ivory.
- Mushroom Taupe itself is kept for **borders, dividers, shadows and muted
  captions**, exactly where its softness is an asset and contrast is not
  load-bearing.

Raspberry on ivory is ~9:1, so headings and links are comfortably fine as
specified.

**2. Dark mode is derived, because the guide does not define one.**
The app follows the OS setting, so a dark palette is required. Rather than invent
new hues, each brand color is lifted to stay recognisable on a dark ground:

- Backgrounds become deep warm browns rather than neutral greys, so the palette
  keeps its warmth instead of turning clinical.
- Raspberry lightens to `#E0577F` — the brand hue at a luminance that reads on
  dark. The true `#8A1538` is near-invisible against a dark background.
- Gold and sage lighten slightly for the same reason.

If the brand ever publishes an official dark palette, replace
`palette.dark` in `app/src/theme/palette.ts` and nothing else needs to change.

## The logo

Source: `docs/brand/sabeel-logo.png` (also copied to
`app/assets/brand/sabeel-logo.png`, which is what the app bundles).

Arabic calligraphy reading *Sabeel* with gold accent strokes, alongside the
wordmark. Two rules follow from its construction:

- **Light mode: no plate.** The mark ships with transparency and sits directly
  on the Warm Ivory canvas, exactly as supplied. An earlier version put it on an
  ivory plate in both themes; that altered how the brand reads in the common case
  to solve a problem that only exists in dark mode.
- **Dark mode: a light plate**, via the `bg.brandPlate` token. The mark is dark
  calligraphy with gold accents, so on a near-black canvas it would be invisible,
  and flattening it to white would discard the gold. **A light-on-dark version of
  the logo would be better than a plate — worth asking the brand owner for one**,
  after which `palette.dark.brandPlate` becomes `transparent` too and the second
  asset is swapped in.
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
