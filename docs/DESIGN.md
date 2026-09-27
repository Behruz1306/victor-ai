# Victor AI — design direction

## Personality

**A calm control room for operators under pressure.** Dispatchers run 30 chats at once, the
owner checks in from a phone between meetings. The interface is the quiet one in the room:
**precise, quiet, trustworthy, fast.** It never shouts unless something is actually on fire, it
shows its sources for every claim, and it answers in the time it takes to glance.

## Principles

1. **Information density without noise.** Dense lists (13 px, tight rows, hairline dividers)
   instead of big padded cards; whitespace is used to group, not to decorate. Every element
   earns its place: if removing it loses nothing, it goes.
2. **One accent.** Violet marks _the product acting for you_: the primary action, the selected
   item, the AI suggestion, focus rings. Nothing else is colored for decoration. Chat types,
   avatars and charts are neutral or near-neutral.
3. **Severity is the only loud color.** Critical / high / medium / low / ok, always as
   **color + icon + text label** — never color alone (color-blind safe, grayscale-printable).
4. **Every number has context.** A KPI shows its window, its previous value (delta) and its
   shape (sparkline). A time shows its timezone or "ago". A count says what it counts.
   Seeded history is labeled _Demo data_. We never show invented metrics.
5. **Evidence over assertion.** Anything the AI claims links to the message that proves it
   (quote + source chat + time).
6. **Motion only to explain change.** A new item slides in and glows once; a status step
   advances; a counter ticks; the live dot breathes. No decorative motion, and none at all with
   `prefers-reduced-motion`.
7. **Designed twice.** Light and dark are separately tuned palettes, not an inversion: dark uses
   lifted surfaces instead of shadows and a lighter accent, keeping the same hierarchy.

## Tokens

All tokens are CSS variables in `src/app/globals.css`, exposed to Tailwind v4 through `@theme`.
Components never use raw hex values.

### Typography

- **Geist Sans** (UI) and **Geist Mono** (numbers that align, IDs, load numbers, times),
  self-hosted from the `geist` package — no external font requests.
- Scale (px / line-height): `12/16` caption · `13/18` dense (tables, lists, timeline) ·
  `14/20` base UI · `16/24` emphasis · `20/28` section title · `24/30` page title ·
  `32/38` hero numbers.
- `font-variant-numeric: tabular-nums` wherever numbers align (tables, KPIs, times, counters).
- Letter-spacing: 0 up to 20 px; `-0.01em` at 24; `-0.02em` at 32+.
- Weights: 400 body, 500 labels and UI, 600 titles. No 700+ except the wordmark.

### Color

Accent: **Victor violet** — a deep blue-violet (`#4F46E5`-family, tuned to `#4B42D6` light /
`#8C84FF` dark). _Why violet, not teal:_ the severity scale owns red → orange → amber and "ok"
owns green; teal sits next to that green and would make "the AI did something" read like
"done". Blue-violet is the one hue family that no severity uses, so the accent can never be
confused with an alarm — and it reads as intelligence without looking like a generic SaaS blue.

| Token             | Light     | Dark      | Use                                            |
| ----------------- | --------- | --------- | ---------------------------------------------- |
| `--bg`            | `#F6F7F9` | `#0B0D12` | app background                                 |
| `--surface`       | `#FFFFFF` | `#12151C` | cards, panes                                   |
| `--surface-2`     | `#F1F3F6` | `#181C25` | hover, inset panels, quotes                    |
| `--surface-3`     | `#E9ECF1` | `#212632` | pressed, selected rows (neutral)               |
| `--border`        | `#E3E6EB` | `#232834` | hairlines                                      |
| `--border-strong` | `#CDD2DA` | `#333A48` | inputs, dividers that must show                |
| `--fg`            | `#0F1217` | `#E9EBF1` | primary text                                   |
| `--fg-2`          | `#434A57` | `#B4BAC7` | secondary text                                 |
| `--fg-3`          | `#5F6776` | `#8C95A6` | tertiary text, captions (AA on surface and bg) |
| `--accent`        | `#4B42D6` | `#8C84FF` | primary action, selection, focus               |
| `--accent-fg`     | `#FFFFFF` | `#0B0D12` | text on accent                                 |
| `--accent-soft`   | `#EEEDFC` | `#1F1C40` | AI suggestion wash, selected row               |
| `--accent-text`   | `#3D34C2` | `#B2ACFF` | accent text on soft/surface                    |

Severity (each has `fg`, `soft` background and `border`):

| Level    | Icon           | Light fg / soft       | Dark fg / soft        |
| -------- | -------------- | --------------------- | --------------------- |
| critical | octagon-alert  | `#B42318` / `#FEF1F0` | `#FF7B70` / `#2A1313` |
| high     | triangle-alert | `#B54708` / `#FFF4EA` | `#FDA35A` / `#2A1A0B` |
| medium   | circle-alert   | `#8A5A00` / `#FEF6DD` | `#F2C14E` / `#272010` |
| low      | info           | `#475467` / `#F1F3F6` | `#A3ADBD` / `#1C212C` |
| ok       | check-circle   | `#067647` / `#EAF8F0` | `#4DD492` / `#0D271B` |

Signal severity 5 → critical, 4 → high, 3 → medium, 1–2 → low. All text/background pairs above
meet **WCAG AA (≥ 4.5:1)**; `tests/unit/contrast.test.ts` checks every pair in both themes.

### Space and shape

- 4 px base grid (Tailwind spacing = 4 px steps). Dense rows 32–36 px, controls 32/36 px.
- Radius: **6** controls (buttons, inputs, chips) · **10** cards and panes · **14** dialogs,
  sheets, the command palette.
- Hairline 1 px borders define structure. No drop shadows on cards.
- One elevation, `--shadow-pop`, for popovers, menus, dialogs, toasts only.

### Motion

- Durations 120 ms (hover, press), 160 ms (enter/exit), 200 ms (layout change); easing
  `cubic-bezier(0.2, 0.8, 0.2, 1)` (ease-out).
- Allowed motion: new list item slides in 4 px + one-time accent glow (1.2 s fade); stepper
  segment fills forward; numbers tick to their new value; live dot breathes (2 s); the
  "rule learned" card flies to the Playbook nav item.
- `@media (prefers-reduced-motion: reduce)` disables all of it (instant state changes).

## Components (src/components)

`Button`, `Card`, `Badge`, `Input`/`Textarea`/`Select`, `Kbd`, `Tooltip`, `Dialog`/`Sheet`,
`Menu`, `SeverityBadge`, `StatusStepper` (full + mini, animated, stuck state), `KpiTile`
(value, delta vs previous period, sparkline), `EvidenceQuote` (quote + chat chip + time + link),
`ChatTypeChip` (customer / internal / fleet / billing / support — neutral chip, distinct icon),
`SuggestionCard`, `Avatar` (initials, deterministic muted hue), `EmptyState` (original line
illustration + one line of guidance), `Skeleton` rows for every list, toasts (`sonner`),
command palette (`cmdk`, ⌘K).

## Screen notes

- **Shell:** slim left sidebar (icons + labels), product mark, demo role switcher, live
  indicator, ⌘K hint, compact menu for language/theme. Mobile: top bar + sheet.
- **Dispatcher:** three panes like a professional inbox — urgency-sorted list, merged timeline,
  suggestion pinned above open tasks. Keyboard: `J/K`, `A`, `E`, `Esc`.
- **Owner:** mobile first; one calm headline, 3 KPI tiles, ≤ 5 attention cards.
- **Sources:** the chaos is the point — a dense wall of raw chats with an overlay toggle
  "Show what Victor AI sees".
