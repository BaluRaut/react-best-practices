---
name: ant-design-v5
description: "Use when building UI with Ant Design (antd) v5: the CSS-in-JS design-token system, ConfigProvider theming, dark and compact algorithms, the static-method context pitfall (message/notification/Modal), and tree-shaking. Targets antd 5.29.x."
metadata:
  source: https://baluraut.github.io/react-best-practices/antd-v5
---

# Ant Design v5 — Design Tokens, Theming, and the Static-Method Trap

Verified stack (2026-07-19): `antd` **5.29.3** (the `latest-5` line), `@ant-design/icons` on the
`^5` line for v5 apps, React **16 / 17 / 18**. antd's current major is **v6.5.1** (shipped
2025-11-21), which dropped React 16/17 — if you are upgrading, read the v6 page. This page is about
building and maintaining a healthy **v5** codebase.

v5's headline change is architectural: it deleted Less and replaced it with a **CSS-in-JS design-token
system**. Almost every "why does antd do it this way now?" question traces back to that one decision, so
we start there, then work through the theming API, the one bug that bites nearly every v5 team
(static `message`/`Modal`/`notification` ignoring your theme), tree-shaking, Forms, TypeScript, and
performance.

---

## The token system: why Less had to go

**Problem.** In v4, theming meant Less variables (`@primary-color`, `@border-radius-base`, …) overridden
at **build time** via `modifyVars`, usually wired through `craco` / `craco-antd`. A theme was baked into
the compiled CSS. You could not switch themes at runtime without shipping a second stylesheet and
toggling it, dark mode was a bolt-on, and per-component tweaks meant fighting selector specificity.

**Why v5 changed it.** v5 moved styling into `@ant-design/cssinjs` and expresses every visual decision as
a **runtime design token** — a plain JS value resolved while React renders. Themes become data you pass
through context, so they switch instantly with no rebuild, dark mode is a first-class algorithm, and
component styles inject on demand instead of shipping one giant stylesheet.

Tokens are organized in three layers — understanding them is what makes `ConfigProvider` legible:

| Layer | What it is | Example |
|---|---|---|
| **Seed Token** | The origin values you set | `colorPrimary: '#1677ff'`, `borderRadius: 6` |
| **Map Token** | Gradients/scales derived from seeds by an **algorithm** | `colorPrimaryHover`, `colorPrimaryBg` |
| **Alias Token** | Semantic aliases components consume in batch | `colorLink`, `controlHeight` |

You set a seed; the algorithm derives the map; components read aliases. Change one seed and the whole
scale re-derives — that is the mechanism dark mode and compact mode use.

> 🟢 **Best practice** — override design **tokens**, never component CSS. In v5 a token change flows
> through the whole derivation and stays theme-consistent (light/dark/compact all follow). Reaching for
> a global CSS override or `!important` to hit an antd class re-introduces exactly the specificity war
> v5's token layer exists to end.

> 🔴 **Advanced / gotcha** — the class-name hashes are **not stable across versions or configs**.
> CSS-in-JS emits hashed selectors like `.css-dev-only-do-not-override-xxxx`. Never target antd internals
> in your own stylesheets or E2E selectors; use `data-*` attributes, roles, or accessible names instead.
> Styles that "worked" by matching a hash will silently break on the next `antd` patch.

Two migration mechanics that trip people up on day one:

- **Style reset changed.** Import `antd/dist/reset.css` (v4 imported `antd/dist/antd.css`). It is a
  *minimal reset only* — components inject their own styles at runtime, so there is no full component
  stylesheet to import anymore.
- **Dates use Day.js, not Moment.** `DatePicker`/`TimePicker` values are Day.js objects in v5. IE is no
  longer supported at all.

---

## ConfigProvider: token, algorithm, components

**Problem.** You need one place to set brand color, corner radius, dark mode, density, and the occasional
one-off ("make *just* the Buttons rounder") without leaking those tweaks across the app.

**Better.** `ConfigProvider`'s `theme` prop takes three keys: `token` (global seed overrides),
`algorithm` (how the map derives), and `components` (isolated per-component overrides).

```tsx
import { ConfigProvider, theme, type ThemeConfig } from 'antd';
import 'antd/dist/reset.css';

const appTheme: ThemeConfig = {
  // Global seed tokens — brand-wide decisions.
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 6,
    fontSize: 14,
  },
  // Derivation algorithm(s). Presets live on the `theme` export.
  algorithm: theme.defaultAlgorithm,
  // Per-component overrides, isolated from everything else.
  components: {
    Button: {
      // `algorithm: true` makes THIS block's overrides run through the
      // global algorithm too (so they still adapt to dark/compact).
      algorithm: true,
      controlHeight: 40,
    },
  },
};

export function Root({ children }: { children: React.ReactNode }) {
  return <ConfigProvider theme={appTheme}>{children}</ConfigProvider>;
}
```

To read the resolved tokens inside a component — the right way to make *your own* components
theme-aware — use the `theme.useToken()` hook rather than hardcoding hex values:

```tsx
import { theme } from 'antd';

function Panel() {
  const { token } = theme.useToken();
  return (
    <div style={{ background: token.colorBgContainer, borderRadius: token.borderRadius }}>
      {/* stays correct in light, dark, and compact automatically */}
    </div>
  );
}
```

> 🟢 **Best practice** — style your own components from `theme.useToken()`, not literal colors. This keeps
> custom UI in lockstep with the active algorithm, so dark/compact "just work" for your code the same way
> they do for antd's.

### Dark and compact algorithms

`algorithm` accepts a preset or an **array of presets**, composed left to right:

```tsx
import { theme } from 'antd';

// Dark mode:
{ algorithm: theme.darkAlgorithm }

// Compact (denser control sizing):
{ algorithm: theme.compactAlgorithm }

// Both at once — dark AND compact:
{ algorithm: [theme.darkAlgorithm, theme.compactAlgorithm] }
```

Because the algorithm is runtime state, a dark-mode toggle is just `useState` driving which algorithm you
pass — no stylesheet swap, no flash of the wrong theme once mounted:

```tsx
function ThemedApp({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = React.useState(false);
  return (
    <ConfigProvider
      theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}
    >
      <button onClick={() => setDark((d) => !d)}>toggle</button>
      {children}
    </ConfigProvider>
  );
}
```

**Tradeoffs.**

| Pros | Cons |
|---|---|
| Instant runtime theme switching; no rebuild | Style objects are computed during render → CSS-in-JS runtime cost |
| Dark/compact are one-line composable algorithms | First paint of each component pays a style-injection cost |
| Per-component isolation without specificity wars | Class hashes are opaque — you cannot hand-target them |

**When NOT to.** For a truly static single theme that never changes, the runtime derivation is pure
overhead — but you still take it in v5 because it is the only styling path. If that cost matters, it is a
signal to evaluate SSR style extraction (below) or, longer term, v6's static-extraction options.

---

## The static-method trap: `message`/`Modal`/`notification` ignore your theme

> 🔴 **Advanced / gotcha** — this is the single most common real v5 bug. The static calls
> `message.success(...)`, `notification.open(...)`, and `Modal.confirm(...)` render **outside** your React
> tree, so they do **not** subscribe to `ConfigProvider` context. They silently ignore your `theme`
> tokens, `locale`, `direction`, and `prefixCls`. Symptom: your app is dark and localized, but toasts and
> confirm dialogs render in default light theme and English.

**Why it happens.** A static method has no React parent — antd mounts it into a detached root on demand.
There is no `ConfigProvider` above that root, so there is nothing to read your tokens from. This is not a
bug in your setup; it is inherent to calling into React from outside the tree.

**Wrong — looks fine, silently unthemed:**

```tsx
import { message, ConfigProvider, theme } from 'antd';

function SaveButton() {
  // This toast ignores the darkAlgorithm below it — it renders light + in English.
  return <button onClick={() => message.success('Saved')}>Save</button>;
}

<ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
  <SaveButton />
</ConfigProvider>;
```

**Better — `App` + `App.useApp()`:** wrap the tree in `<App>` (itself inside `<ConfigProvider>`), then
pull context-aware instances from the `App.useApp()` hook:

```tsx
import { App, ConfigProvider, theme } from 'antd';

function Root({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      {/* App must be INSIDE ConfigProvider — they work as a pair. */}
      <App>{children}</App>
    </ConfigProvider>
  );
}

function SaveButton() {
  const { message } = App.useApp(); // context-aware instance
  // Now the toast reads the darkAlgorithm + locale from ConfigProvider.
  return <button onClick={() => message.success('Saved')}>Save</button>;
}
```

`App.useApp()` returns `{ message, notification, modal }`, all wired to the surrounding context.
`App` is available since **antd@5.1.0** (message/notification config since 5.3.0). `App.useApp()` only
works in descendants of `<App>`.

> 🟢 **Best practice** — put exactly one `<App>` just inside your top-level `<ConfigProvider>`, and
> **always** obtain `message`/`notification`/`modal` from `App.useApp()`. Treat the bare `import { message }
> from 'antd'` static calls as a lint-forbidden anti-pattern in app code.

There is an older, lower-level alternative: the `message.useMessage()` / `notification.useNotification()`
/ `Modal.useModal()` hooks, each returning `[api, contextHolder]` where you must render `contextHolder`
yourself. `App` bundles all three and manages the holders for you, so prefer `App` unless you have a
specific reason to hold a single API in isolation.

> 🔴 **Advanced / gotcha** — you cannot call `App.useApp()` outside React (e.g. from an Axios interceptor
> or a plain util that fires a toast on error). Options: pass the `message` instance down from a component,
> or route errors through a component that owns the instance. Do not "solve" it by falling back to the
> static import — that reintroduces the exact theming bug.

**When NOT to.** If you render zero toasts/modals/notifications, you do not need `<App>` at all. But the
cost of adding it preemptively is one wrapper component, and it removes a whole class of future bugs — so
most apps should include it.

---

## Tree-shaking: delete `babel-plugin-import`

**Problem.** v4 needed `babel-plugin-import` to rewrite `import { Button } from 'antd'` into deep
per-component paths, both to shrink JS and to pull in each component's Less. Teams carried that Babel
config forward out of habit.

**Why it's now harmful.** v5 ships ESM and tree-shakes natively — `import { Button } from 'antd'` already
drops unused components from your JS bundle. And because CSS-in-JS injects styles **on demand at runtime**,
there is no per-component stylesheet to import, which was the plugin's other job. In v5 the plugin is **no
longer needed and no longer supported**; leaving it in can break the build or the styles.

> 🟢 **Best practice** — on a v4→v5 upgrade, remove `babel-plugin-import` from `babel.config`/`.babelrc`
> **and** from `devDependencies`, and use plain named imports. This also cuts compile time. Keep using
> named imports (`import { Button, Table } from 'antd'`) — do not hand-write deep paths.

Icons follow the same rule: `@ant-design/icons` named imports tree-shake on their own.

```tsx
import { SmileOutlined } from '@ant-design/icons'; // tree-shakes; no plugin needed
```

**When NOT to.** There is no v5 scenario where you keep `babel-plugin-import` for antd. (You may still have
it for an *unrelated* library — scope the removal to antd's entry.)

---

## Form best practices

v5's `Form` is uncontrolled by design: the `Form` instance owns field state, and you talk to it through an
imperative handle. Fighting that with your own `useState` mirror is the most common Form mistake.

**Wrong — shadowing form state in React state:**

```tsx
function BadForm() {
  const [name, setName] = React.useState(''); // duplicate source of truth
  return (
    <Form onFinish={() => submit({ name })}>
      <Form.Item>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Form.Item>
    </Form>
  );
}
```

**Better — let the form own it; read via the instance:**

```tsx
import { Form, Input, Button } from 'antd';

interface Values {
  name: string;
  email: string;
}

function GoodForm() {
  const [form] = Form.useForm<Values>();

  const onFinish = (values: Values) => {
    // values is fully typed and collected by the form.
    submit(values);
  };

  return (
    <Form<Values>
      form={form}
      layout="vertical"
      initialValues={{ name: '', email: '' }}
      onFinish={onFinish}
      onFinishFailed={({ errorFields }) => console.warn(errorFields)}
    >
      <Form.Item name="name" label="Name" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item
        name="email"
        label="Email"
        rules={[{ required: true }, { type: 'email' }]}
      >
        <Input />
      </Form.Item>
      <Button htmlType="submit" type="primary">Submit</Button>
    </Form>
  );
}
```

Key instance methods: `form.setFieldsValue`, `form.getFieldsValue`, `form.validateFields`,
`form.resetFields`. For dynamic field arrays use `Form.List`; for conditional/linked fields use a
`Form.Item`'s `dependencies` or `shouldUpdate`.

> 🟡 **Optimization** — to read one field's live value in JSX (e.g. show a preview), reach for
> `Form.useWatch(name, form)` rather than `shouldUpdate` re-rendering the whole item. `useWatch` subscribes
> to just that field, so only the watching component re-renders. It is an optimization, not a default:
> plain uncontrolled fields need no watch at all — add it only where you actually render derived UI.

> 🟢 **Best practice** — keep the `Form` uncontrolled and read values through the instance
> (`onFinish`, `getFieldsValue`, `useWatch`). Mirroring every field into `useState` doubles your sources of
> truth and forfeits antd's built-in validation and dirty-tracking. See [forms](forms) for the general
> uncontrolled-form principle.

**When NOT to.** If a field's value must drive logic on *every* keystroke across the app (not just render
a local preview), a controlled input or a form library with fine-grained subscriptions may fit better —
but for standard submit-on-finish forms, uncontrolled `Form` is the right default.

---

## TypeScript

antd is written in TypeScript and ships its own definitions.

> 🟢 **Best practice** — do **not** install `@types/antd`. It does not exist as a maintained package; the
> types come with `antd` itself. Installing a stray `@types/antd` shadows the real types and causes
> confusing mismatches.

Types worth importing by name:

```tsx
import type { ThemeConfig, FormInstance, FormProps, MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';

interface Row { id: string; name: string; }

const columns: ColumnsType<Row> = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
];
```

- `ThemeConfig` — type your `ConfigProvider` `theme` object (as in the theming example above).
- `FormInstance` / `FormProps` — type a form you pass down or a wrapper component.
- `ColumnsType<T>` — type `Table` columns against your row type so `dataIndex` and `render` are checked.
- Parameterize the form: `Form.useForm<Values>()` and `<Form<Values>>` thread your value type through
  `onFinish`.

---

## Performance notes

CSS-in-JS is the double-edged part of v5: the ergonomics are excellent, but style resolution and injection
happen at runtime. A few measured levers, in rough order of impact:

> 🟡 **Optimization** — for SSR / Next.js, extract critical styles so the first paint is not blocked on
> client-side style injection. Use `@ant-design/cssinjs`'s `StyleProvider` + `extractStyle`, or the
> `@ant-design/nextjs-registry` package for the App Router. Skip this for a pure client-rendered SPA where
> there is nothing to extract — it is SSR-specific work.

> 🟡 **Optimization** — memoize the `theme` object you pass to `ConfigProvider`. A fresh object literal on
> every render forces token re-derivation and can invalidate cached styles. Hoist a static theme to
> module scope, or wrap a dynamic one in `useMemo` keyed on the values that actually change (e.g. the
> dark/compact flags). This is only worth it when the provider's parent re-renders often.

> 🟡 **Optimization** — for very large `Table`s, the re-render cost is your own cell renderers, not antd's
> tokens. Stabilize `columns` (define outside render or `useMemo`), give rows stable `rowKey`s, and paginate
> or virtualize. This is the same [render vs commit](fundamentals#render-vs-commit) discipline as any React
> list — antd does not exempt you from it.

> 🔴 **Advanced / gotcha** — nesting many `ConfigProvider`s (e.g. one per widget to tweak a token) multiplies
> theme derivation and style caches. Prefer a single top-level provider plus the `components` map for
> per-component overrides; reach for a nested provider only for a genuinely isolated subtree (an embedded
> theme island), knowingly.

None of these are defaults. Reach for them when a profile shows a real cost — premature CSS-in-JS tuning
just adds complexity. Keep components [pure](fundamentals#purity) and let the token system do its job first.

---

## Upgrading to v6

antd **v6.5.1** is the current major (v6.0.0 shipped 2025-11-21). The most load-bearing difference for
planning: **v6 dropped React 16 and 17** — its peer dependencies require **React >= 18** and
**react-dom >= 18**. v5 remains the choice if you must support React 16/17. (v5 can run on React 19 via the
`@ant-design/v5-patch-for-react-19` compatibility package.) For the full upgrade path — breaking changes,
codemods, and the v6 token/runtime changes — see the **[Ant Design v6 page](antd-v6)**.

A note on v4→v5 mechanics, if you are still on v4: the `@ant-design/codemod-v5` CLI automates most API
renames (`visible`→`open`, `dropdownClassName`→`popupClassName`), and `@ant-design/compatible` bridges
v4-style Less theming during a gradual migration.

---

## Sources

- [Ant Design — Customize Theme (tokens, algorithm, components)](https://ant.design/docs/react/customize-theme)
- [Ant Design — Migration from v4 to v5](https://ant.design/docs/react/migration-v5)
- [Ant Design — App component & static-method context](https://ant.design/components/app)
- [Ant Design — `theme.useToken` and `ConfigProvider` theme API](https://ant.design/components/config-provider)
- [Ant Design — Form component](https://ant.design/components/form)
- [Ant Design — Getting Started (reset.css, ESM/tree-shaking)](https://ant.design/docs/react/getting-started)
- [Ant Design — Server-Side Rendering / style extraction](https://ant.design/docs/react/server-side-rendering)
- [Ant Design — Use in TypeScript](https://ant.design/docs/react/use-in-typescript)
- [antd on npm (5.29.3 / 6.5.1)](https://www.npmjs.com/package/antd)
- [@ant-design/v5-patch-for-react-19](https://www.npmjs.com/package/@ant-design/v5-patch-for-react-19)
