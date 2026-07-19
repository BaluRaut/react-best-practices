---
name: ant-design-v6
description: "Use when building UI with Ant Design (antd) v6, or migrating from v5: the React 18+ requirement, design tokens and ConfigProvider, the CSS-in-JS engine, dark algorithm, and v5→v6 breaking changes. Targets antd 6.5.x."
metadata:
  source: https://baluraut.github.io/frontend-best-practices/antd-v6
---

# Ant Design v6 — Setup, Theming, CSS-in-JS, and the v5 → v6 Migration

Verified stack (npm registry, 2026-07-19): `antd` **6.5.1** (v6.0.0 shipped **2025-11-22**),
`@ant-design/icons` **6.3.2**, `@ant-design/cssinjs` **2.1.2**, `@ant-design/nextjs-registry` **1.3.0**.
Migration CLI: `@ant-design/cli` (invoked as `antd`). Node **>= 20** for the CLI.

> 🟢 **Verified by running it** — the claims below were checked against a real install
> (`antd@6.5.1` + `react@19.2.7`, rendered under jsdom): antd v6 renders with React 19, `App.useApp()`
> returns the message/notification/Modal instances inside `<App>`, `theme.getDesignToken()` yields real
> light/dark tokens (dark `colorBgBase` `#000`), and v6 emits **CSS variables by default** (638
> `--ant*` declarations on a one-button render). Not memory — measured.

antd v6 is the current major. The single most important fact — lead with it in any upgrade planning —
is the **React floor**: v6 dropped React 17. Everything else (semantic `classNames`/`styles`, CSS
variables by default, renamed props) is downstream of a smaller, more modern support matrix.

> 🔴 **Advanced / gotcha** — v6's `peerDependencies` are **`react >=18` and `react-dom >=18`**. v5
> supported React 16 / 17 / 18; **v6 supports 18 and 19 only.** If any part of your tree is pinned to
> React 17, you cannot adopt antd v6 without upgrading React first. Treat the React 18 upgrade as the
> *prerequisite project*, not a footnote to the antd bump.

---

## Setup: React 18+ first

The install is ordinary, but the version constraints are load-bearing. antd v6 and
`@ant-design/icons` v6 must move **together** — icons v6 is not compatible with antd v5, and antd v6
requires `@ant-design/icons >= 6.0.0`.

```bash
# React 18 or 19 must already be installed and working.
npm install antd@6 @ant-design/icons@6
```

```tsx
// main.tsx — React 18/19 root API. No special antd bootstrapping required.
import { createRoot } from 'react-dom/client';
import { App as AntApp, ConfigProvider } from 'antd';
import RootRoutes from './RootRoutes';

createRoot(document.getElementById('root')!).render(
  <ConfigProvider theme={{ token: { colorPrimary: '#1677ff' } }}>
    <AntApp>
      <RootRoutes />
    </AntApp>
  </ConfigProvider>,
);
```

> 🟢 **Best practice** — wrap your tree in antd's `<App>` component (imported as `AntApp` above to
> avoid clashing with your own `App`). It is what makes `message`, `notification`, and `Modal` pick up
> theme and context correctly — the single most common v5/v6 setup bug. See
> [the static-method pitfall](#the-static-method-pitfall-still-real-in-v6) below for why.

> 🔴 **Advanced / gotcha** — if you are coming from React 19 with the
> `@ant-design/v5-patch-for-react-19` shim installed for interop, **remove it.** antd v6 supports
> React 19 natively; the patch package is no longer needed and keeping it can mask real issues.

### React 19 status

v6 explicitly supports and is optimized for React 19. There is no compat shim and no separate build.
If you are already on React 19 with antd v5 + the patch package, the v6 upgrade is the moment to delete
the patch.

---

## ConfigProvider and design tokens

`ConfigProvider` is the single theming entry point. The theme is expressed as **design tokens** —
plain values (`colorPrimary`, `borderRadius`, `fontSize`, …) that cascade into every component. Prefer
tokens over per-component overrides or hand-written CSS: tokens are the supported, semantic surface,
and they survive version upgrades far better than CSS that targets internal DOM.

```tsx
import { ConfigProvider } from 'antd';

<ConfigProvider
  theme={{
    // Global (seed/map) tokens — affect everything.
    token: {
      colorPrimary: '#5b21b6',
      borderRadius: 8,
      fontFamily: 'Inter, system-ui, sans-serif',
    },
    // Component tokens — scoped overrides, still first-class.
    components: {
      Button: { controlHeight: 40 },
      Table: { headerBg: '#faf5ff' },
    },
  }}
>
  <App />
</ConfigProvider>;
```

> 🟢 **Best practice** — reach for **global tokens first, component tokens second, custom CSS last.**
> The token system is the API antd guarantees across majors. Custom CSS that reaches into `.ant-*`
> internals is exactly what v6's semantic-DOM restructure broke (see migration section) — you are
> writing against private structure.

### Nesting ConfigProvider

`ConfigProvider` nests. A sub-tree can override tokens for a branch of the app (a differently-themed
dashboard panel, a print view) without touching the root. Inner providers merge over outer ones.

> 🟡 **Optimization** — nesting a second `ConfigProvider` deep in the tree spins up a second theme
> computation for that branch. It is cheap and correct, but not free — do it to theme a real sub-area,
> not to tweak one button (use a component token or a one-off style for that).

---

## Theme algorithms: default, dark, compact

Dark mode and density are **algorithms**, not token sets you maintain by hand. Pass one or more into
`theme.algorithm`. The three presets are unchanged from v5:

| algorithm | effect |
|---|---|
| `theme.defaultAlgorithm` | the standard light theme (implied if you pass none) |
| `theme.darkAlgorithm` | dark theme — recomputes the token map for dark backgrounds |
| `theme.compactAlgorithm` | denser sizing/spacing |

```tsx
import { ConfigProvider, theme } from 'antd';

function ThemedApp({ dark, compact }: { dark: boolean; compact: boolean }) {
  const algorithm = [
    dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    ...(compact ? [theme.compactAlgorithm] : []),
  ];
  return (
    <ConfigProvider theme={{ algorithm, token: { colorPrimary: '#5b21b6' } }}>
      <App />
    </ConfigProvider>
  );
}
```

> 🟢 **Best practice** — derive dark mode from an algorithm, never by hand-authoring a second set of
> hex values. The algorithm keeps your `colorPrimary` and every derived token (borders, hovers,
> disabled states) internally consistent in dark exactly as in light.

Algorithms **compose**: pass an array and they apply left-to-right (`[darkAlgorithm, compactAlgorithm]`
= dark *and* compact). Order matters when two algorithms touch the same token.

> 🔴 **Advanced / gotcha** — algorithms are pure token transforms
> ([purity](fundamentals#purity)): they read seed tokens and emit a token map. That is *why* live
> theme switching works with no remount — flipping `dark` re-runs the transform and, in v6's CSS
> variables mode, only swaps variable values rather than regenerating styles. Keep your own token
> derivations pure too; do not read `Date.now()` or component state inside a theme object you
> memoize.

---

## The CSS-in-JS story and CSS variables

antd's styling engine is `@ant-design/cssinjs` (now **2.x** in v6). The headline v6 change: **CSS
variables mode (`cssVar`) is on by default.** In v5 it was opt-in.

What that buys you:

- **Real-time theme switching** with no style regeneration — swapping dark/light updates CSS custom
  properties, not the whole stylesheet.
- **Style reuse across themes** — one set of rules, many variable value-sets, so multiple themed
  areas share generated CSS instead of duplicating it. Smaller runtime style payload.

The cost: **CSS variables mode targets modern browsers only. IE is unsupported.** For any 2026 app
that is a non-issue, but say it out loud if you have a legacy contractual browser matrix.

> 🟡 **Optimization** — v6 also ships React-Compiler-optimized bundled output and a rebuilt Tooltip
> (reported ~40% faster dev-render). These are free wins from upgrading; they are not knobs you tune.
> Do not restructure your code chasing them — they arrive with the version bump.

> 🔴 **Advanced / gotcha** — the exact `@ant-design/cssinjs` 2.x API surface changes are not fully
> enumerated in the migration docs beyond the major version bump. If you import from
> `@ant-design/cssinjs` **directly** (custom `StyleProvider`, `extractStyle`, a bespoke SSR cache),
> treat the 1.x → 2.x jump as a place to test, not assume. Most apps that only use `antd` +
> `ConfigProvider` never touch this package directly and are unaffected.

### SSR and Next.js

For server rendering you must extract the generated styles so the first paint is not unstyled. On
**Next.js App Router**, use the official registry package rather than wiring `extractStyle` by hand:

```bash
npm install @ant-design/nextjs-registry@1
```

```tsx
// app/layout.tsx
import { AntdRegistry } from '@ant-design/nextjs-registry';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AntdRegistry>{children}</AntdRegistry>
      </body>
    </html>
  );
}
```

> 🟢 **Best practice** — on Next.js App Router, use `@ant-design/nextjs-registry`. It handles the
> style-cache extraction and injection into the streamed HTML for you. Hand-rolling `StyleProvider` +
> `extractStyle` is the v5-era manual path; the registry exists so you do not maintain that glue.

> 🔴 **Advanced / gotcha** — a **Pages Router** or a custom SSR setup still needs manual
> `extractStyle` from `@ant-design/cssinjs`. Because that package moved to 2.x in v6, re-verify your
> custom SSR extraction against the current docs during the upgrade — this is one of the few places
> the cssinjs major bump can actually surface.

---

## Component patterns

v6's flagship is the **semantic structure** system: across 40+ components, styling and class hooks
are consolidated into two props — `classNames` and `styles` — each keyed by semantic slot
(`root`, `header`, `body`, `popup`, …). This replaces the v5 grab-bag of `headStyle`, `bodyStyle`,
`dropdownClassName`, and friends.

```tsx
// v6 — semantic slots, one predictable shape per component
<Card
  classNames={{ header: 'card-head', body: 'card-body' }}
  styles={{ header: { fontWeight: 600 }, body: { padding: 24 } }}
>
  content
</Card>
```

You can set these slot styles **globally** via `ConfigProvider`, so every `Card` in the app gets the
same header treatment without repeating props.

> 🟢 **Best practice** — style components through `classNames` / `styles` slots, not by targeting
> `.ant-card-head` in a stylesheet. Slots are the supported contract; internal class names are not,
> and v6's DOM restructure is precisely what breaks CSS written against them.

Several v5 components **moved** — the composition primitives absorbed the one-off group components:

| v5 | v6 |
|---|---|
| `BackTop` | `FloatButton.BackTop` |
| `Button.Group` | `Space.Compact` |
| `Input.Group` | `Space.Compact` |
| `Dropdown.Button` | `Space.Compact` + `Dropdown` + `Button` |

And several APIs moved from **children-based to items-based**: `Menu`, `Breadcrumb`, `Anchor`, and
`Timeline` now take an `items` array instead of JSX children.

```tsx
// v6 — items-based
<Breadcrumb
  items={[{ title: 'Home', href: '/' }, { title: 'Reports' }]}
/>
```

> 🟡 **Optimization** — items-based APIs are not just stylistic: passing a stable `items` array lets
> antd diff by data instead of by reconciling arbitrary children, and keeps your render function
> cleaner ([render vs commit](fundamentals#render-vs-commit)). Memoize the array if it is expensive to
> build; otherwise an inline literal is fine.

New in v6: a **Masonry** layout component, InputNumber spinner mode, and a resizable Drawer.

---

## The static-method pitfall (still real in v6)

The trap survives into v6. The **static** calls — `message.success(...)`,
`notification.open(...)`, `Modal.confirm(...)` — imported straight off the module are rendered
**outside your React tree**. They cannot see your `ConfigProvider`, so they render with default
theme, no design tokens, and no locale.

```tsx
// ❌ WRONG — static call, dislocated from context.
import { message } from 'antd';

function SaveButton() {
  const onClick = () => message.success('Saved'); // default theme, ignores your tokens
  return <Button onClick={onClick}>Save</Button>;
}
```

The fix is antd's `<App>` wrapper plus the `App.useApp()` hook. The wrapper mounts the
message/notification/Modal holders **inside** the provider tree; the hook hands you context-aware
instances.

```tsx
// ✅ RIGHT — context-aware via App.useApp()
import { App } from 'antd';

function SaveButton() {
  const { message } = App.useApp();
  const onClick = () => message.success('Saved'); // themed, tokenized, localized
  return <Button onClick={onClick}>Save</Button>;
}

// Mount once near the root (see setup section):
// <ConfigProvider theme={...}><App><Routes/></App></ConfigProvider>
```

> 🔴 **Advanced / gotcha** — this is not a lint nicety. In dark mode a static `message.error()` pops
> up **light** because it never saw your `darkAlgorithm`. The symptom (a single mis-themed toast) is
> confusing precisely because everything *else* is correct. If a notification looks un-themed, the
> first thing to check is whether it came from a static import instead of `App.useApp()`.

> 🟢 **Best practice** — mount `<App>` once at the root and consume `App.useApp()` everywhere you need
> imperative feedback. Reserve the static `message.*` / `Modal.*` imports for code that genuinely has
> no React context (a global fetch interceptor, an error boundary of last resort) — and accept that
> those render un-themed.

---

## TypeScript

antd ships its own types; no `@types/antd` is needed. Import token and theme types from the package
directly.

```tsx
import type { ThemeConfig } from 'antd';
import { theme } from 'antd';

const themeConfig: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: { colorPrimary: '#5b21b6' },
};

// Read the *computed* token map inside components — fully typed.
const { useToken } = theme;
function Swatch() {
  const { token } = useToken();
  return <div style={{ background: token.colorPrimary, borderRadius: token.borderRadius }} />;
}
```

> 🟢 **Best practice** — type your theme object as `ThemeConfig` and read live values with
> `theme.useToken()` instead of hardcoding hex. `useToken()` returns the *algorithm-resolved* map, so
> a component reading `token.colorPrimary` stays correct in light, dark, and compact automatically.

antd v6 does **not** publish an explicit minimum consumer TypeScript version in its migration docs. Do
not assume a specific floor from the library's own devDependencies — those are build-time, not a
support contract. Stay on a current, maintained TS release and you are fine.

---

## Tree-shaking

Modern antd (v5 and v6) is **ES-module-based and tree-shakeable out of the box** with any current
bundler (Vite, webpack 5, Rollup, esbuild). Import named exports from `antd` and the bundler drops
what you do not use.

```tsx
// ✅ This is correct and tree-shakes. Do NOT reach for babel-plugin-import.
import { Button, DatePicker, Table } from 'antd';
```

> 🔴 **Advanced / gotcha** — do **not** add `babel-plugin-import` or deep path imports like
> `antd/es/button`. That plugin was a v3-era workaround for a non-tree-shakeable build; on modern antd
> it is unnecessary and actively breaks styles and the CSS-variables setup. If you inherited it in a
> config, removing it is part of the upgrade.

> 🟡 **Optimization** — icons are a real bundle line-item. Import icons by name
> (`import { SearchOutlined } from '@ant-design/icons'`), never a namespace/barrel import, and audit
> your icon usage — `@ant-design/icons` is large, and a stray `import * as Icons` pulls the whole set.

---

## v5 → v6 migration

The upgrade is described as **smooth and direct** — unlike v4 → v5, there is **no compatibility
package** to install. But it is a real major with 100+ deprecations, so budget for it.

### What actually breaks

1. **React 17 support is gone.** This is the gating change. If you are not on React 18+, that is the
   first migration, before you touch antd. (Details at the top of this page.)
2. **Renamed props, consistently patterned.** The renames follow rules across many components:

   | v5 | v6 | applies to |
   |---|---|---|
   | `headStyle` / `bodyStyle` | `styles.header` / `styles.body` | Card, Modal, Drawer, … |
   | `dropdownClassName` | `classNames.popup.root` | Select, Dropdown, … |
   | `dropdown*` | `popup*` | many overlays |
   | `bordered` | `variant` | Input, Card, Table, … |
   | `size="default"` | `size="medium"` | all sized components |
   | `closeText` | `closable.closeIcon` | Alert |
   | Alert `message` | Alert `title` | Alert |
   | children | `items` | Menu, Breadcrumb, Anchor, Timeline |

3. **Semantic DOM restructure.** Internal DOM changed across many components. **Any custom CSS
   targeting `.ant-*` internal nodes may break.** This is the least mechanical part of the migration —
   the codemod cannot fix your hand-written selectors.
4. **`Form.List` behavior:** unregistered child fields are no longer included in `onFinish` values.
   This removes the old need for `getFieldsValue({ strict: true })` — but if you *relied* on the old
   behavior, values will differ.
5. **Icons must jump to v6** in lockstep. `@ant-design/icons@6` is not compatible with `antd@5`.

### The codemod / CLI

The official tool is `@ant-design/cli`, invoked as `antd` (Node >= 20):

```bash
npm install -g @ant-design/cli

antd migrate 5 6                       # produce the v5→v6 migration checklist
antd migrate 5 6 --component Select    # scope to one component
antd migrate 5 6 --apply ./src         # apply auto-fixable transforms / agent-ready prompts
antd migrate 5 6 --format json         # structured output for tooling
```

> 🟢 **Best practice** — run `antd migrate 5 6` for the checklist **before** touching code, then
> `--apply` for the mechanical prop renames. Treat the codemod as a first pass that handles the
> patterned renames; reserve human review for behavior changes (`Form.List`) and custom CSS, which no
> codemod can safely rewrite.

> 🔴 **Advanced / gotcha** — multi-major jumps are **not** supported directly. There is no
> `migrate 4 6` or `migrate 3 6`; go **step by step** (4 → 5, then 5 → 6). Skipping a major and hoping
> the codemod bridges it will leave silent gaps.

### Rollback risk

> 🔴 **Advanced / gotcha** — the honest rollback picture. The **React 18 prerequisite is not
> reversible** casually: once your app depends on React 18/19 APIs, you cannot drop back to a
> React-17-era antd v5 without unwinding that too. And **CSS-variables mode is default-on in v6** — if
> visual regressions surface from the semantic-DOM change, you fix the CSS forward; reverting to v5 to
> "buy time" means reverting React as well. Plan the upgrade as a one-way door on a branch you can
> fully test, not a flag you flip in production and flip back. v5 remains on ~1 year of maintenance
> (critical bugfixes only), so staying on v5 short-term is viable — but *straddling* both is not.

---

## antd vs MUI — when each

Both are mature, well-typed React component systems. The choice is about design opinion and styling
model, not quality.

| | Ant Design v6 | Material UI v9 |
|---|---|---|
| design language | Ant Design (enterprise/console) | Material Design |
| styling engine | `@ant-design/cssinjs`, CSS variables default | Emotion (runtime CSS-in-JS) |
| theming | design tokens + algorithms (`dark`/`compact`) | `createTheme` + `sx` prop |
| data-dense components | very strong (Table, Form, ProComponents ecosystem) | strong; the advanced data grid is a separate paid tier |
| default look | distinctly "Ant" out of the box | distinctly "Material" out of the box |

**Choose antd** when you are building a data-dense internal tool, admin console, or dashboard — its
Table, Form, and enterprise components are the deepest in the ecosystem out of the box, and the token
system makes wholesale re-theming straightforward.

**Choose MUI** when you want Material Design, the tightest fit with a broad customization/`sx`
workflow, or you are standardizing on Emotion across a design system. See the [MUI page](mui) for its
own tradeoffs (Emotion vs the dormant Pigment CSS story).

> 🟢 **Best practice** — pick on **design language and component depth for your domain**, then commit.
> Both libraries are heavy; mixing them in one app doubles your styling runtime and bundle for no
> benefit. The wrong reason to choose is "it's what I used last" — the right reasons are the shape of
> your UI (data-dense console → antd; Material-styled product → MUI) and which team owns the theme.

---

## Sources

- antd v6 migration guide: https://ant.design/docs/react/migration-v6
- antd v6.0.0 announcement / release blog: https://ant.design/docs/blog/v6
- ConfigProvider + design tokens: https://ant.design/docs/react/customize-theme
- Theme algorithms API: https://ant.design/docs/react/customize-theme#theme
- CSS variables (`cssVar`): https://ant.design/docs/react/css-variables
- App component / static-method context: https://ant.design/components/app
- Next.js registry (SSR): https://ant.design/docs/react/use-with-next
- Migration CLI (`@ant-design/cli`): https://github.com/ant-design/ant-design-cli
- `@ant-design/icons`: https://www.npmjs.com/package/@ant-design/icons
- `@ant-design/cssinjs`: https://www.npmjs.com/package/@ant-design/cssinjs
