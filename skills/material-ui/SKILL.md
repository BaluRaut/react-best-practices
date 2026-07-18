---
name: material-ui
description: "Use when building UI with Material UI (MUI) v9, or migrating MUI from v5/v6/v7: theming, sx vs styled, dark mode with CSS variables and color schemes, and the migration codemods. Notes why MUI skipped v8 and why to build on Emotion, not Pigment CSS."
metadata:
  source: https://baluraut.github.io/react-best-practices/mui
---

# Material UI v9 — Migration, Theming, and the Emotion Reality

Verified stack (2026-07-18): `@mui/material` **9.2.0**, React **19.2.7**, TypeScript **7.0.2**,
Vite **8.1.5**, Emotion **11.14.0**. Material UI **skipped v8 entirely** — the current major line is
v5 → v6 → v7 → **v9**.

This page covers the four-major migration path, why v8 does not exist, why you should build on Emotion
(not Pigment CSS), and the dark-mode / theming / TypeScript patterns that actually hold up in v9.

> Two facts to internalize before anything else, because both are traps the MUI blog itself sets:
> **Pigment CSS is on hold and dormant — build on Emotion.** And **`NumberField`/`Menubar`, announced
> in the v9 blog, do not ship in `@mui/material@9.2.0`.** Details in their sections below.

---

## Why there is no v8

Material UI went from **v7 straight to v9**. This was a *renumbering*, not a cancelled release. From the
v9 release blog, verbatim:

> "Material UI moves from v7 straight to v9 (there is no Material UI v8, like there is no v2)."

The purpose was to **re-align Material UI's major with MUI X's major**. When MUI X v6 shipped in 2023,
its major was decoupled from Material UI (which was still on v5) so the advanced components could ship
breaking changes on their own cadence. That divergence never grew the way MUI expected, while the
version-mismatch tax stayed high. v9 restores a single shared major across the suite; going forward they
move in lockstep (when MUI X ships v10, Material UI ships v10).

The thing that became v9 was being built as v8 — an earlier MUI blog post described "the next major
version of Material UI (v8)" — and was renamed before the first alpha (the first published prerelease is
`9.0.0-alpha.0`, 2026-02-17). The npm registry confirms **zero `8.x` releases ever published**, including
prereleases.

**Why this matters for you:** engineers reasonably assume a skipped major means two majors' worth of
accumulated breakage. It does not. Migrating **v7 → v9 is one major hop, not two.** There is no lost
feature set and no failed release hiding in the gap.

| major | first stable | date | gap |
|---|---|---|---|
| v5 | 5.0.0 | 2021-09-16 | — |
| v6 | 6.0.0 | 2024-08-27 | ~35 mo |
| v7 | 7.0.0 | 2025-03-26 | ~7 mo |
| **v9** | **9.0.0** | **2026-04-07** | ~12.5 mo |

Current dist-tags: `latest=9.2.0`, `latest-v7=7.3.11`, `latest-v6=6.5.0`, `latest-v5=5.18.0`. The
`next=9.0.0-beta.1` tag is stale (never repointed after GA) — read no meaning into it.

---

## Styling engine: use Emotion, not Pigment CSS

**The default styling engine of Material UI is Emotion, and it is the only realistic choice in v9.**
Pigment CSS is officially **on hold, still alpha, and effectively dormant.** Do not build on it.

### Why Pigment CSS looks alive but isn't

`npm view @mui/material peerDependencies` shows `@mui/material-pigment-css: ^9.2.0`, which *looks* like a
first-class, version-matched, actively-developed dependency. It is not, for two reasons:

1. **It's an optional peer.** In v9, *both* styling engines are optional peers — Emotion and Pigment
   alike. npm installs neither automatically.
   ```json
   "peerDependenciesMeta": {
     "@emotion/react":            { "optional": true },
     "@emotion/styled":           { "optional": true },
     "@mui/material-pigment-css": { "optional": true }
   }
   ```
2. **The `9.2.0` version number is a monorepo lockstep artifact.** `@mui/material-pigment-css` lives in
   the material-ui monorepo and gets version-bumped with every release train. Its *own* peer is
   `@pigment-css/react: ^0.0.30` — and that actual engine has published **once in 16 months** and is
   still `0.0.x` after two-plus years.

```
@pigment-css/react release cadence:
  0.0.1   2024-03-08   ... 30 releases in 10 months ...
  0.0.30  2025-01-14
  0.0.31  2026-05-22   <-- ONE release in 16 months, still 0.0.x
```

The `mui/pigment-css` repo description reads, verbatim: *"⚠️ Alpha phase, currently, on hold."* The MUI
blog states Pigment "remains in alpha phase and is currently on hold" because "the underlying problems
were not fully solved yet" — effort was redirected to Base UI. There are no active plans or timelines.

> **The lesson worth keeping.** Package metadata told a true fact (optional peer, version 9.2.0) from
> which it is easy to draw a false conclusion (therefore actively developed). Lockstep monorepo
> versioning launders an alpha package into looking production-ready. When a dependency's version looks
> healthy, check the *transitive* engine version — here `@pigment-css/react@0.0.31` tells the real story.

### Why Pigment stalled (and why it's irrelevant to a Vite SPA)

Pigment is a **build-time CSS extraction tool** — zero runtime, RSC-safe — but it "does not support dynamic
styles that depend on runtime variables." That is fundamentally at odds with MUI's runtime-dynamic
`sx`/theme API, and reconciling the two is the unsolved problem. The original motivation was React Server
Components support, which Emotion lacks; **that problem remains unsolved for Material UI as of v9.** For an
RSC / Next.js App Router app today you still use `@mui/material-nextjs` + Emotion with `'use client'`
boundaries.

For a Vite SPA there are no Server Components in play, so this is moot. The v9 blog states an aspiration to
"target independence from Emotion" and to "explore refactoring the styling layer," but that is intent with
**no ship date.** Emotion is not deprecated, not removed, and has no announced removal version.

### The clean Emotion-only install

```bash
npm i @mui/material@9.2.0 @emotion/react @emotion/styled react@19.2.7 react-dom@19.2.7
# exit 0, zero peer warnings. Pigment is NOT installed. This is the happy path.
```

---

## Package layout, imports, and tree-shaking

`@mui/material@9.2.0` ships a proper dual ESM/CJS `exports` map with distinct `.d.mts` / `.d.ts`, a flat
layout (`.mjs` siblings next to `.js`, **no separate `/esm` directory**), and `sideEffects: false`.

- **`sideEffects: false` means top-level named imports tree-shake correctly** in Vite 8 / Rollup.
  `import { Button, Stack } from '@mui/material'` is fine for production bundle size.
- **`babel-plugin-import` / `modularizeImports` are obsolete and actively harmful.** v7 removed the
  "modern" bundle aliases and the migration guide calls them "no longer significant." Remove them.
- **1-level deep imports (`@mui/material/Button`) still help dev-server cold start** — fewer modules for
  Vite to prebundle — but no longer help prod size. That's the honest tradeoff.
- **2-level deep imports throw.** Since v7 the exports map hard-blocks them:
  ```ts
  import { createTheme } from '@mui/material/styles/createTheme'; // ERR_PACKAGE_PATH_NOT_EXPORTED
  import { createTheme } from '@mui/material/styles';             // correct
  ```
- **`@mui/icons-material` is the real bundle risk** (~11k named exports). Always import the single icon:
  ```ts
  import MenuIcon from '@mui/icons-material/Menu'; // not: import { Menu } from '@mui/icons-material'
  ```

Myth-check on v9: it did **not** drop `prop-types` (`^15.8.1` is still a runtime dep) and did **not** swap
Popper for floating-ui (`@popperjs/core ^2.11.8` is still there). Any claim otherwise is false at 9.2.0.

> **Version-skew gotcha.** `@mui/styled-engine`'s `latest` dist-tag is **9.1.1**, not 9.2.0 — a real
> `@mui/material@9.2.0` install pulls `@mui/styled-engine@9.1.1`. The migration guide says "update
> `@mui/styled-engine` to v9"; if you pin it to `9.2.0` exactly, **npm 404s.** Use a caret (`^9.1.1`) or
> just leave it transitive. The monorepo only republishes packages that changed on a given release.

---

## What actually changed in v9

v9 is overwhelmingly an **accessibility + web-standards-alignment release**, not a feature release. Say
that honestly. The headline additions are semantic-HTML upgrades, roving tabindex, keyboard/a11y fixes,
and theme CSS variables extended with `color-mix()` for derived colors.

### Environment: less changed than you'd expect

- **React peer is unchanged:** `^17 || ^18 || ^19`. v9 did **not** raise the minimum React version.
- **`engines.node` is unchanged:** `>=14.0.0`.
- **The real minimum bump is the browser floor:** **Chrome 117, Edge 121, Firefox 121, Safari 17.0.**
  This — not React — is what unlocks `color-mix()`.
- Packages to update together: `@mui/icons-material`, `@mui/system`, `@mui/lab`, `@mui/material-nextjs`,
  `@mui/styled-engine`, `@mui/utils`.

> **`@mui/lab` has never had a stable release, in any major.** Its dist-tags are all alpha/beta:
> `latest=9.0.0-beta.6`, `latest-v7=7.0.1-beta.25`, `latest-v5=5.0.0-alpha.177`. Anything you use from
> lab can break in a **minor**. MUI has been steadily graduating lab components into core (v7 moved
> Alert / Autocomplete / Rating / Skeleton / SpeedDial and others), so "is it still in lab?" is
> version-dependent — check per component.

### Announced ≠ shipped: NumberField and Menubar

The v9 release blog, under "Components highlights," attributes to **Material UI**: *"new NumberField and
Menubar."* **Neither ships in `@mui/material@9.2.0`.** Verified three ways against a real install:

```
'NumberField' in require('@mui/material')     → false
'Menubar'     in require('@mui/material')     → false
require.resolve('@mui/material/NumberField')  → ERR_PACKAGE_PATH_NOT_EXPORTED
require.resolve('@mui/material/Menubar')      → ERR_PACKAGE_PATH_NOT_EXPORTED
```

They are also **not** in `@mui/lab@9.0.0-beta.6`. Where they actually live could not be confirmed (Base UI,
currently `1.0.0-rc.0`, is the plausible-but-unverified home). **Do not list NumberField or Menubar as
available Material UI v9 components.** This is the "announced != shipped" failure mode coming from the most
trustworthy-looking source there is — MUI's own release blog. Verify component existence against the
installed package, not the announcement.

### Breaking changes that bite

**`GridLegacy` removed entirely.** The v6/v7 escape hatch is gone. If you deferred the Grid migration by
renaming to `GridLegacy`, v9 is where the bill comes due.
```tsx
// dead in v9
<Grid item xs={12} sm={6}>…</Grid>
// v9
<Grid size={{ xs: 12, sm: 6 }}>…</Grid>
```

**ButtonBase — the nastiest one.** Enter/Spacebar key activation now bubbles as a **`MouseEvent`, not a
`KeyboardEvent`.** Any handler doing `if (e.key === 'Enter')` on a bubbled event, or narrowing with
`instanceof KeyboardEvent`, **silently breaks** — no error, the branch just never runs. Also: the
`nativeButton` prop is now **required** when replacing the native `<button>` with a non-interactive
component, and disabled non-native buttons no longer fire handlers.

**These four break silently and TypeScript cannot catch them:**

| change | what breaks | symptom |
|---|---|---|
| ButtonBase key events → `MouseEvent` | `e.key` / `instanceof KeyboardEvent` handlers | handler silently no-ops |
| `ListItemIcon` min-width 56px → 36px | layout assuming 56px | menus get narrower, nothing errors |
| CSS class consolidation | `styleOverrides` keyed on old compound classes | styles silently stop applying |
| `TablePagination` uses `Intl.NumberFormat` | exact-string test assertions (`103177` → `"103,177"`) | test/snapshot failures |

**Other breaks that surface as errors or test failures:**

- **Dialog/Modal:** `disableEscapeKeyDown` removed → filter via `onClose(event, reason)`.
- **Slider:** pointer events now — use `onPointerDown`, not `onMouseDown`, to cancel drags.
- **Stepper/Step:** now semantic HTML — `Stepper` renders `<ol>`, `Step` renders `<li>`, plus roving
  tabindex. Breaks CSS/tests that assumed `<div>`.
- **TextField `select`:** the underlying `InputLabel` renders `<div>`, not `<label>`. **Breaks
  `getByLabelText()` in React Testing Library** — a very common upgrade failure.
- **Menu/MenuList (`variant="selectedMenu"`) and Tabs:** roving tabindex — only one item is
  `tabindex="0"` at a time. Breaks selectors assuming all items are focusable.
- **Autocomplete:** `getOptionLabel` / `isOptionEqualToValue` now accept `string` when `freeSolo` — a
  type-level break TS *will* catch.
- **Material Icons:** 23 legacy `*Outline` exports removed (exact dupes of `*Outlined`).
- **Theme:** `MuiTouchRipple` removed from theme component types → use global CSS `.MuiTouchRipple-*`.

**Systematic deprecation removals:**

- `components` → `slots`, `componentsProps` → `slotProps` (completed across the board).
- Component-specific slot props (`TransitionComponent`, `PaperProps`, …) → `slots.*` / `slotProps.*`.
- **System props removed** from Box, Grid, Link, Stack, Typography, DialogContentText, and the Timeline
  content components → you **must** use `sx`. This is the highest-volume mechanical change in most
  v7 → v9 codebases:
  ```tsx
  // dead in v9
  <Box mt={2} color="primary.main" />
  // v9
  <Box sx={{ mt: 2, color: 'primary.main' }} />
  ```
- **CSS class consolidation** — breaks `styleOverrides` keyed on old compound classes:
  ```
  .MuiButton-textPrimary             → .MuiButton-text.MuiButton-colorPrimary
  .MuiChip-clickableColorPrimary     → .MuiChip-clickable.MuiChip-colorPrimary
  .MuiLinearProgress-bar1Determinate → .MuiLinearProgress-determinate > .MuiLinearProgress-bar1
  ```

> **`tsc` passing does NOT mean your v9 migration is done.** TypeScript catches the two highest-volume
> breakages — `<Grid item xs>` (TS2769) and `<Box mt>` (TS2769) — and the Autocomplete signature change.
> It cannot catch the four silent ones in the table above. A green typecheck is necessary, not sufficient;
> grep for old class names and exercise keyboard handlers, list icons, and pagination formatting by hand.

### Codemods for v9

```bash
# per-component deprecation codemods (30+ of them)
npx @mui/codemod@latest deprecations/button-classes <path>
npx @mui/codemod@latest deprecations/dialog-props <path>
npx @mui/codemod@latest deprecations/text-field-props <path>
# ... accordion-props, alert-props, autocomplete-props, avatar-props, checkbox-props,
#     drawer-props, menu-props, slider-props, tooltip-props, and more
```

The v9 guide indexes codemods under `deprecations/*` rather than a single `v9.0.0/preset-safe` umbrella —
whether a one-shot preset exists is unconfirmed, so don't script one blindly. **Low-risk ordering:** run
the `deprecations/*` codemods **while still on v7** (they're forward-compatible), then bump the major.

---

## Migration matrix

### v5 → v6

| area | change |
|---|---|
| Node | min 14 (was 12) |
| React | min 17 (unchanged) |
| TypeScript | **min 4.7** (was 3.5) |
| IE11 | support **removed** |
| Grid2 | `Unstable_Grid2` → `Grid2`; `xs={12} sm={6} xsOffset={2}` → `size={{xs:12,sm:6}} offset={{xs:2}}` |
| CssVarsProvider | `Experimental_CssVarsProvider` → `CssVarsProvider` (stable) |
| dark mode | **`theme.applyStyles()` replaces `theme.palette.mode` checks** |
| LoadingButton | merged into `Button` |
| Typography | `color` no longer a system prop → `sx` |
| Accordion | summary wrapped in `<h3>` by default |
| ListItem | `button` / `autoFocus` / `disabled` / `selected` removed |

```bash
npx @mui/codemod@latest v6.0.0/grid-v2-props <path>
npx @mui/codemod@latest v6.0.0/styled <path>
npx @mui/codemod@latest v6.0.0/sx-prop <path>
```

The `applyStyles` change, verbatim from the guide:
```diff
- borderColor: theme.palette.mode === 'dark' ? '#fff' : '#000',
+ borderColor: '#000',
+ ...theme.applyStyles('dark', { borderColor: '#fff' })
```

### v6 → v7

| area | change |
|---|---|
| **Grid** | `Grid` → **`GridLegacy`**; `Grid2` → **`Grid`** (then `GridLegacy` dies in v9) |
| TypeScript | **min 4.9** (was 4.7) |
| ESM layout | **multi-level deep imports removed** — `@mui/material/styles/createTheme` → `import { createTheme } from '@mui/material/styles'` |
| bundler aliases | "modern" bundle aliases **eliminated** — remove them |
| Lab → core | Alert, Autocomplete, Pagination, Rating, Skeleton, SpeedDial, ToggleButton moved to `@mui/material` |
| StyledEngineProvider | now from `@mui/material/styles` (was `@mui/material`) |
| removed | `createMuiTheme` → `createTheme`; `experimentalStyled` → `styled`; **`Hidden` removed** → `sx`/`useMediaQuery`; `onBackdropClick` → `onClose(e, reason)` |
| InputLabel | `size="normal"` → `size="medium"` |
| react-is | React ≤18 requires `react-is` matching your React major, or runtime errors |
| theme + CSS vars | theme object **no longer re-renders** on color-scheme toggle — only `mode` from `useColorScheme` changes; use `theme.vars.*` |

```bash
npx @mui/codemod@latest v7.0.0/grid-props <path>
npx @mui/codemod@latest v7.0.0/lab-removed-components <path>
npx @mui/codemod@latest v7.0.0/input-label-size-normal-medium <path>
```

> **The v7 "theme doesn't re-render" gotcha is subtle and production-biting.** With CSS variables on,
> `styled(Box)(({ theme }) => ({ color: theme.palette.mode === 'dark' ? … : … }))` **silently stops
> updating** on toggle, because `theme` is now a stable object — it freezes at the initial scheme with no
> error. The fix is `theme.applyStyles('dark', …)` or `theme.vars.palette.*`. This is *the* reason
> `applyStyles` exists.

### The Grid table to bookmark

| version | legacy component | modern component | modern API |
|---|---|---|---|
| v5 | `Grid` | `Unstable_Grid2` | `xs={12}` |
| v6 | `Grid` (deprecated) | `Grid2` | `size={{xs:12}}` |
| v7 | `GridLegacy` | **`Grid`** | `size={{xs:12}}` |
| v9 | **removed** | `Grid` | `size={{xs:12}}` |

The theme key follows the rename: `MuiGrid` → `MuiGridLegacy` for the legacy component in v7.

---

## Dark mode — the correct v9 way

Providing `colorSchemes` activates CSS variables and automatic light/dark switching from user preference:

```tsx
import { ThemeProvider, createTheme } from '@mui/material/styles';

const theme = createTheme({ colorSchemes: { dark: true } }); // enables CSS vars + auto switching

<ThemeProvider theme={theme} defaultMode="system">
  {children}
</ThemeProvider>
```

### The `colorSchemeSelector` / `InitColorSchemeScript` attribute trap (verified)

To avoid a flash-of-wrong-theme, MUI writes the active scheme onto a DOM attribute before React
hydrates, using `InitColorSchemeScript`. **Its default attribute is `data-mui-color-scheme`**, so it emits
selectors like `[data-mui-color-scheme="dark"]`.

The theme's `colorSchemeSelector` must produce **the same attribute**, or the CSS variable rules never
match what the init script wrote — and you get exactly the flash you were trying to prevent. The trap is
the `'data'` shorthand:

```tsx
// BAD — mismatch. The `'data'` shorthand emits [data-dark] / [data-light],
// which does NOT match InitColorSchemeScript's default `data-mui-color-scheme` attribute.
const theme = createTheme({
  colorSchemes: { dark: true },
  cssVariables: { colorSchemeSelector: 'data' },   // yields [data-dark]
});
<InitColorSchemeScript defaultMode="dark" />        // writes data-mui-color-scheme="dark"
// → selectors and attribute disagree → flash of wrong theme

// GOOD — pass the full attribute name so selector and init-script agree.
const theme = createTheme({
  colorSchemes: { dark: true },
  cssVariables: { colorSchemeSelector: 'data-mui-color-scheme' },
});
<InitColorSchemeScript attribute="data-mui-color-scheme" defaultMode="dark" />
```

Keep `defaultMode` identical on `ThemeProvider` and `InitColorSchemeScript`.

### SPA (Vite / GitHub Pages) considerations

`InitColorSchemeScript` is aimed at server-rendered apps (in Next.js it goes in `<body>` before children).
A Vite SPA ships a static prerendered `index.html` shell and the JS bundle decides the theme late, so it
has the *same* class of flash problem. Levers:

- **`ThemeProvider`'s `noSsr` prop** — the docs call it useful for SPAs to prevent double-rendering and
  flickering. This is the SPA-appropriate switch.
- **`disableTransitionOnChange`** — snaps the theme on toggle instead of smearing the CSS transition.
- **`storageManager={null}`** — disables localStorage persistence (usually you want it *on*).

> The exact `InitColorSchemeScript` import path was not independently verified here (likely
> `@mui/material/InitColorSchemeScript`) — confirm it against your installed package before wiring the
> script into a hand-written Vite `index.html`.

### The `useColorScheme` hydration trap

> The docs state: *"The mode is always undefined on first render, so make sure to handle this case."*
> Render the toggle icon before `mode` resolves and you ship a hydration mismatch or a toggle that flashes
> the wrong icon on first paint.

```tsx
import { useColorScheme } from '@mui/material/styles';

function ThemeToggle() {
  const { mode, setMode } = useColorScheme();
  if (!mode) return null; // or a skeleton — do NOT render the icon yet
  return <Button onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}>{mode}</Button>;
}
```

### `applyStyles` — the pattern that survives CSS variables

`theme.applyStyles(mode, styles)` returns a `CSSObject`. Use it instead of `palette.mode` ternaries so
your styles keep updating after the v7 "theme doesn't re-render" change:

```tsx
// GOOD — array form in styled(); survives CSS vars
const Card = styled('div')(({ theme }) => [
  { backgroundColor: '#fff', color: '#000' },
  theme.applyStyles('dark', { backgroundColor: '#111', color: '#fff' }),
]);

// GOOD — sx form (array of callbacks)
<Button sx={[{ color: '#000' }, (theme) => theme.applyStyles('dark', { color: '#fff' })]} />

// BAD — silently freezes at the initial scheme once CSS vars are on (v7+)
const Frozen = styled('div')(({ theme }) => ({
  backgroundColor: theme.palette.mode === 'dark' ? '#111' : '#fff',
}));
```

---

## sx vs styled vs Box — the real cost

- **`sx` is serialized and hashed by Emotion on every render** — a runtime CSS-in-JS call per element.
  Fine for page-level or one-off elements; measurably bad in a hot list/table cell rendered thousands of
  times.
- **`styled()` hoists the style computation to module scope** — the class is generated once. Prefer it for
  anything rendered in a loop or a virtualized list.
- **The `sx` object-literal trap:** an inline `sx={{…}}` is a **new object identity every render**, so it
  defeats `React.memo` on the child. Hoist static ones to module scope.

```tsx
// BAD — new object each render: breaks memo, re-serializes every time
{rows.map((r) => <Box key={r.id} sx={{ p: 1, display: 'flex' }}>{r.name}</Box>)}

// GOOD — hoist the static object...
const rowSx = { p: 1, display: 'flex' };            // module scope

// ...or better in a hot path, a styled component (class generated once)
const Row = styled('div')({ padding: 8, display: 'flex' });
```

- **`Box` is not free** — it's a real component that runs `sx` processing. In hot paths a plain `<div>` +
  `styled` beats `<Box sx>`. Reserve `Box` for convenience at low render counts.
- v9 removes system props, so `sx` is now the *only* shorthand — which makes this hoisting discipline more
  important, not less.

> The Emotion-per-render serialization mechanism is well established, but the exact "N× slower" number
> depends on your components — measure before quoting a figure.

---

## Theming properly

Order of preference when customizing a component — cheapest first:

1. **`components.MuiX.defaultProps`** — free, no style cost. Use for `disableRipple`, `variant`, `size`.
2. **`components.MuiX.styleOverrides`** — keyed by slot; supports the callback form
   `({ theme, ownerState }) => …`.
3. **`components.MuiX.variants`** — for *new* named variants, matched on props.

```tsx
const theme = createTheme({
  colorSchemes: { dark: true },
  components: {
    MuiButton: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        root: ({ theme }) => [
          { borderRadius: 8 },
          theme.applyStyles('dark', { borderColor: theme.vars.palette.divider }),
        ],
      },
      variants: [{ props: { variant: 'danger' }, style: { backgroundColor: 'red' } }],
    },
  },
});
```

> **v9 gotcha:** `styleOverrides` keyed on old compound classes (`textPrimary`, `clickableColorPrimary`)
> **silently stop applying** — those classes were consolidated. No error, just unstyled components. Grep
> your theme for the old class names.

---

## Module augmentation (TypeScript)

Custom theme keys and variants require declaration merging, or TypeScript rejects them:

```ts
declare module '@mui/material/styles' {
  interface Theme { status: { danger: string } }
  interface ThemeOptions { status?: { danger?: string } }
  interface Palette { brand: Palette['primary'] }
  interface PaletteOptions { brand?: PaletteOptions['primary'] }
}

declare module '@mui/material/Button' {
  interface ButtonPropsVariantOverrides { danger: true } // enables variant="danger"
}
```

> **Gotcha 1 — right module.** The variant augmentation lives in the **component's own module**
> (`@mui/material/Button`), not `@mui/material/styles`. Put it in the wrong module and it fails silently —
> the type never widens.
>
> **Gotcha 2 — it must be a module.** Augmentation only applies if the file is in the TS program *and*
> has a top-level `import`/`export`. A stray `.d.ts` with no imports is treated as a global script and the
> `declare module` is ignored.

---

## Material UI + TypeScript 7

**`@mui/material@9.2.0` + `typescript@7.0.2` + `@types/react@19.2.17` type-checks clean** — `strict: true`,
`skipLibCheck: false` (MUI's own `.d.ts` files fully checked), `moduleResolution: "bundler"`,
`jsx: "react-jsx"` → `tsc --noEmit` exit 0, zero errors.

This is notable because **MUI could not have tested against TS 7** — TS 7.0.2 shipped 2026-07-08, MUI 9.2.0
shipped 2026-07-03. It works anyway, which de-risks the pinned toolchain. Exercised in the passing check:
`createTheme({ colorSchemes: { dark: true } })`, `theme.applyStyles('dark', …)` in `styled()` array form,
`<Grid size={{ xs: 12, sm: 6 }}>`, `<Box sx={{ mt: 2 }}>`, and both module augmentations above.

TS minimums: v6 → **4.7**, v7 → **4.9**. The v9 guide does not state a TS minimum; empirically 7.0.2 works.
`@types/react` is an optional peer at `^17 || ^18 || ^19`, so TS 7 + `@types/react@19.2.17` is in range.

The removed v9 APIs genuinely fail to compile — good news for migration confidence:
```
<Grid item xs={12}>                → TS2769: Property 'item' does not exist ...
<Box mt={2} color="primary.main">  → TS2769: Property 'mt' does not exist ...
@mui/material/GridLegacy           → ERR_PACKAGE_PATH_NOT_EXPORTED (GridLegacy is gone)
```

---

## Sources

- https://mui.com/blog/introducing-mui-v9/ — v9 release blog; the v8-skip rationale, NumberField/Menubar announcement
- https://mui.com/material-ui/migration/upgrade-to-v9/ — v9 breaking changes + codemods
- https://mui.com/material-ui/migration/upgrade-to-v7/
- https://mui.com/material-ui/migration/upgrade-to-v6/
- https://mui.com/material-ui/migration/migrating-to-pigment-css/ — "the default styling engine is Emotion"
- https://mui.com/material-ui/customization/dark-mode/ — applyStyles, InitColorSchemeScript, useColorScheme
- https://mui.com/blog/2026-and-beyond/ — Pigment CSS on hold; the next major referred to as "v8"
- https://github.com/mui/pigment-css — repo banner: "Alpha phase, currently, on hold"
- npm registry, queried 2026-07-17 (`npm view`, live install) — all empirical version/build facts
