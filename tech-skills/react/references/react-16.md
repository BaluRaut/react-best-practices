# React 16 Era (16.0 – 16.14)

React 16 is not "old React." It is the era in which React acquired *every* mental model it still
uses today — Fiber scheduling, error boundaries, the modern context API, and hooks — and
simultaneously accumulated a set of patterns that are now actively harmful. A codebase stuck on 16
is rarely broken. It is *stuck*, and the cost is paid at upgrade time, not today. This page is about
recognizing the 16-era patterns that will bite you, and knowing which ones are fine to leave alone.

> This page carries the original author's inline confidence hedges deliberately. Where a claim is
> inferred rather than directly sourced, it says so. Do not read a hedge as an assertion.

## Timeline (all dates from primary sources)

| Version | Date | What actually landed |
|---|---|---|
| 16.0 | 2017-09-26 | Fiber rewrite, error boundaries, portals, return arrays/strings from render, rewritten streaming SSR, MIT license, custom DOM attributes pass through |
| 16.2 | 2017-11 | `<React.Fragment>` / `<>` syntax |
| 16.3 | 2018-03-29 | `createContext`, `createRef`, `forwardRef`, `getDerivedStateFromProps`, `getSnapshotBeforeUpdate`, `StrictMode`; legacy lifecycles deprecated |
| 16.4 | 2018-05-23 | **Behavior change:** `getDerivedStateFromProps` now fires on *every* render |
| 16.6 | 2018-10-23 | `React.memo`, `React.lazy`, `Suspense` (code-split only), `contextType`, `getDerivedStateFromError` |
| 16.8 | 2019-02-06 | **Hooks** |
| 16.9 | 2019-08-08 | `UNSAFE_` renames + codemod, async `act()`, `React.Profiler`, `javascript:` URL deprecation, factory component deprecation |
| 16.13 | 2020-02-26 | "Cannot update a component from inside the function body of a different component" warning; `createFactory` deprecated |
| 16.14 | 2020-10-14 | New JSX transform support. **That is the entire release.** |

React 16.14.0's release notes contain exactly one line: *"Add support for the new JSX transform."*
This matters — see the [16.14 section](#react-1614-and-the-new-jsx-transform).

## Fiber: what it bought, and what it cost

React 16.0 shipped the Fiber rewrite. The user-visible payoff in 16.0 was modest and worth being
honest about: error boundaries, portals, fragments, and a ~32% smaller bundle (~30% gzipped). Async
rendering was *not* enabled. Fiber was the foundation — collected over two years — that made 16.6
Suspense and 16.8 hooks possible at all.

**The rule:** don't tell people "React 16 made rendering async." It didn't. Concurrent features did
not ship stable until React 18. Fiber in 16 is an *architecture*, and the only reason it appears in
a best-practices doc is that it explains why the legacy `componentWill*` lifecycles became unsafe
(see [below](#the-legacy-lifecycles-and-why-they-became-unsafe)): Fiber can start rendering, abort,
and restart, so a render-phase lifecycle can run multiple times per commit.

Also from 16.0, and still a live footgun:

> Unrecognized HTML/SVG attributes are now passed through to the DOM. Before 16, a typo'd prop was
> silently dropped. From 16 on, `<div clasName="x">` renders a literal `clasName="x"` attribute into
> the DOM instead of doing nothing. React stopped protecting you here.

## Error boundaries: still the only mechanism, still misunderstood

Error boundaries are the one React 16 feature that is *not* superseded by anything newer. They
remain **class-only in React 19**. There is no hook equivalent.

`componentDidCatch` (16.0) fires **after** the commit — it's for logging. `getDerivedStateFromError`
(16.6) fires **during** render — it's for the fallback UI. You need both, for different reasons.

```jsx
// BAD — logs the error, but relies on setState in the commit phase to swap the UI.
// The broken subtree has already committed once (torn) before you react to it.
class Boundary extends React.Component {
  componentDidCatch(error, info) {
    logToService(error, info.componentStack);
    this.setState({ failed: true }); // too late to be the render-phase source of truth
  }
  render() {
    return this.state?.failed ? <p>Error</p> : this.props.children;
  }
}
```

```jsx
// GOOD — derive fallback state during render; log as a side effect in commit.
class Boundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };            // render-phase: decides what to paint
  }

  componentDidCatch(error, info) {
    logToService(error, info.componentStack); // commit-phase: side effect only
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? <p>Something went wrong.</p>;
    }
    return this.props.children;
  }
}
```

> 🟢 **Best practice** — derive the fallback in `getDerivedStateFromError` (render-phase) and log in
> `componentDidCatch` (commit-phase). This is a correctness rule, not an optimization: the split
> mirrors [render vs commit](fundamentals#render-vs-commit). If you swap the UI from
> `componentDidCatch` via `setState`, the broken subtree has already committed once — torn — before
> your fallback paints.

**Gotchas that bite in production:**

- Error boundaries do **not** catch: event handlers, `setTimeout`/`requestAnimationFrame` callbacks,
  server-side rendering, or errors thrown in the boundary itself. Almost every "our error boundary
  didn't fire" incident is one of these four. Event handlers are the usual culprit — they run outside
  the render/commit phases, so use `try/catch` there.
- `getDerivedStateFromError` was documented at the 16.6 release as **not available for SSR** ("It is
  designed to work with server-side rendering in a future release"). A 16-era app that leans on
  boundaries for resilience has *no* boundary protection during SSR.

> Since 16.0, **an uncaught error unmounts the entire React tree.** This is deliberate — a corrupted
> UI is considered worse than no UI. Teams upgrading from 15 discover this as a total white screen
> where they previously got a half-broken page. If you have no boundaries, you have chosen white
> screens.

## The legacy lifecycles, and why they became unsafe

Deprecated in 16.3: `componentWillMount`, `componentWillReceiveProps`, `componentWillUpdate`.
Renamed with the `UNSAFE_` prefix in 16.9, with a codemod:

```bash
npx react-codemod rename-unsafe-lifecycles
```

**Why they're unsafe (the rationale that matters):** these are *render-phase* lifecycles. Fiber can
start rendering, abort, and start again. A render-phase lifecycle can therefore run **multiple times
for one commit**, or run and never commit at all — a violation of [purity](fundamentals#purity). Any
side effect there — a fetch, a subscription, a mutation — fires an unpredictable number of times.
This is the defining hazard, and it stops being theoretical the moment concurrent rendering is
enabled.

> 🟢 **Best practice** — run `rename-unsafe-lifecycles` even though the unprefixed names still work in
> React 19. The rename is free, reversible, and turns an invisible hazard into a reviewable `UNSAFE_`
> in every diff. A correctness/maintainability rule, not an optimization.

### The correction most references get wrong

React 16.9's blog post stated the old names *"will keep working in both React 16.9 and in React
17.x"* and framed removal around React 17. **In practice the unprefixed names were never removed.**
They do not appear in the React 17.0.0 changelog's removal list, and they are absent from the React
19 upgrade guide's removals section — which *does* explicitly list string refs, legacy context,
`createFactory`, module pattern factories, `propTypes`, `defaultProps` for function components,
`ReactDOM.render`, `hydrate`, `unmountComponentAtNode`, and `findDOMNode`.

So `componentWillReceiveProps` still runs — and still warns — in React 19. **This is why codebases
never migrated:** the deprecation had no enforcement date, so the pressure never arrived. Run the
codemod anyway; `UNSAFE_` in a diff is the point.

> *Confidence: high that these names are absent from the 17 changelog and the 19 removal list;
> medium on "still functional in 19," since that is inferred from absence rather than an explicit
> affirmative statement. Verify against React 19 source before treating it as a flat assertion.*

## `getDerivedStateFromProps` — the 16.4 trap

`gDSFP` was introduced in 16.3 as the "safe" replacement for `componentWillReceiveProps`. **React
16.4 then changed its behavior**: it is now *"properly called regardless of the reason for
re-rendering"* — i.e. on **every** render, including renders caused by the component's own
`setState`, not just when the parent passes new props.

This was a bugfix that *exposed* bugs. Code written against 16.3 semantics broke on 16.4. An app
pinned at 16.3 carries a latent bug the moment it bumps a patch version.

```jsx
// BAD — the anti-pattern: unconditionally copying props into state.
// On 16.4+ this fires on EVERY render, so every keystroke is erased the moment
// anything triggers a re-render. The classic "the input clears itself" bug.
class EmailInput extends React.Component {
  state = { email: this.props.email };

  static getDerivedStateFromProps(props) {
    return { email: props.email }; // wipes local edits
  }

  render() {
    return (
      <input
        value={this.state.email}
        onChange={e => this.setState({ email: e.target.value })}
      />
    );
  }
}
```

Guarding with `if (props.email !== prevState.email)` is *also* an anti-pattern per the React team:
in a password-manager UI, switching between two accounts that happen to share an email won't reset
the field. The value is identical, so the guard never fires. The bug is that you're conditioning on
the *value* when you mean to condition on *identity*.

```jsx
// GOOD — fully uncontrolled, reset by identity via `key`.
// Parent: <EmailInput key={account.id} defaultEmail={account.email} />
// When the id changes, React unmounts and remounts — state resets for free,
// with no lifecycle at all. Works whether or not the email value changed.
class EmailInput extends React.Component {
  state = { email: this.props.defaultEmail };

  render() {
    return (
      <input
        value={this.state.email}
        onChange={e => this.setState({ email: e.target.value })}
      />
    );
  }
}
```

The other sanctioned alternative is **fully controlled** — delete the state, take `value` +
`onChange` as props, let the parent own it.

**The rule:** derived state is harmful because it destroys the single source of truth. The moment a
value is both derived from props *and* updatable via `setState`, no one can answer "who owns this?"
The `key`-based reset is almost always the right answer, and it survives the class→hooks migration
unchanged.

> 🟢 **Best practice** — reset component state by changing its `key`, not by copying props into state.
> A new `key` makes [reconciliation](fundamentals#reconciliation) unmount the old instance and mount
> a fresh one, so state resets for free regardless of whether the prop *value* changed — which is
> exactly why the `if (props.email !== prevState.email)` guard fails on two accounts that share an
> email. This is a correctness rule.

## Context: three APIs, one of which is now deleted

React 16.3 shipped `React.createContext()`. 16.6 added `contextType` for classes. The **legacy**
context API (`contextTypes` / `getChildContext`) was deprecated at 16.6 and **removed in React 19**.

This is the sharpest upgrade cliff in a 16-era codebase: legacy context is one of the few things
here that *hard-breaks* rather than warns.

```jsx
// BAD — legacy context. Removed in React 19; silently skipped updates when an
// intermediate component blocked re-rendering via shouldComponentUpdate.
class ThemeProvider extends React.Component {
  static childContextTypes = { theme: PropTypes.string };
  getChildContext() { return { theme: 'dark' }; }
  render() { return this.props.children; }
}

class Button extends React.Component {
  static contextTypes = { theme: PropTypes.string };
  render() { return <button className={this.context.theme} />; }
}
```

```jsx
// GOOD — createContext (16.3+). Propagates through sCU/PureComponent blockers.
const ThemeContext = React.createContext('light');

function ThemeProvider({ children }) {
  return <ThemeContext.Provider value="dark">{children}</ThemeContext.Provider>;
}

// Class consumer (16.6+): single context only.
class Button extends React.Component {
  static contextType = ThemeContext;
  render() { return <button className={this.context} />; }
}

// Function consumer (16.8+): composes freely, multiple contexts, no nesting.
function Button() {
  const theme = React.useContext(ThemeContext);
  return <button className={theme} />;
}
```

The stated reason `createContext` exists: it *"supports deep updates"* — it propagates past
components that return `false` from `shouldComponentUpdate`. Legacy context did not, which is why
theme/locale updates mysteriously failed to reach leaves in `PureComponent` trees.

> 🟢 **Best practice** — use `createContext` over the legacy `contextTypes`/`getChildContext` API.
> Beyond the deep-update fix, legacy context is **removed in React 19**, so this is one of the few
> 16-era patterns that hard-breaks rather than warns.

> `contextType` (class) consumes exactly **one** context. Needing two forces you back to nested
> `<Consumer>` render props — the pyramid that `useContext` exists to delete. This is one of the
> strongest concrete arguments for migrating a given component to a function.

> `<Provider value={{ user, setUser }}>` allocates a new object every render and re-renders every
> consumer. Memoize the value. This bites *worse* after migrating to hooks, because inline object
> literals in JSX are more idiomatic there.

> 🟡 **Optimization** — memoizing the Provider `value` (and, separately, splitting one context into
> several) only earns its keep once a context updates often and has many consumers. **Any** context
> value change re-renders **every** consumer, even ones reading a field that didn't change: in a
> small reproduction (React 19, jsdom) a context holding `{ a, b }` updated on `a` alone still
> re-rendered a `b`-only consumer on all 6 renders — every one wasted. Production numbers will
> differ, but the direction is fixed.
>
> **Pros:** a stable `value` lets consumers that also sit behind `memo`/`PureComponent` bail out;
> splitting unrelated state into separate contexts stops cross-field fan-out entirely.
> **Cons:** `useMemo` adds bookkeeping and a dependency array to keep honest; splitting multiplies
> Providers.
> **When NOT to use it:** low-frequency values (theme, locale, current user set once at login) with
> few consumers — the fan-out is invisible and the memo is pure ceremony. Reach for a selector store
> (Zustand, Redux `useSelector`) instead of hand-splitting once consumers genuinely need different
> high-frequency slices.

## React 16.14 and the new JSX transform

The new JSX transform is supported in **React 17 RC+, and backported to 16.14.0, 15.7.0, and
0.14.10**. It compiles JSX to imports from `react/jsx-runtime` rather than `React.createElement`:

```js
// Old transform output — needs React in scope.
React.createElement('h1', null, 'Hello world');

// New transform output — auto-injected import, no React needed.
import { jsx as _jsx } from 'react/jsx-runtime';
_jsx('h1', { children: 'Hello world' });
```

Requires React ≥16.14 **and** a compatible compiler: Babel ≥7.9.0, TypeScript ≥4.1, CRA ≥4.0.0,
Next.js ≥9.5.3, or Gatsby ≥2.24.5.

**Why this belongs in a migration plan:** 16.14 is a zero-risk, single-feature release. Getting a
stuck codebase from 16.x → 16.14 costs nothing, removes thousands of `import React from 'react'`
lines (via `npx react-codemod update-react-imports`), and shrinks bundles slightly. It's the
cheapest possible first step, and it de-risks the 17 jump by proving the release pipeline works.

> `import React from 'react'` is only removable for files that use *nothing else* from React. Files
> calling hooks still need `import { useState } from 'react'`. The codemod handles this distinction;
> hand-editing does not.

## Hooks (16.8) — the inflection point

Every React package must be **≥16.8.0** for hooks to work. React Native got support in **0.59**.
Hooks shipped with *no* breaking changes, and the team stated they have **"no plans to remove
classes from React"** — still true in React 19.

**Rule: do not rewrite. Adopt at the boundary.** The 16.8 announcement explicitly recommends against
rewriting existing apps; hooks code works "side by side" with classes. The failure mode of a "hooks
migration project" is that it's a giant untested refactor with zero user-visible value — it gets 60%
done, gets deprioritized, and leaves you maintaining two idioms forever with no migration completed.
Convert a class when you're already changing it for a real reason.

> 🟢 **Best practice** — adopt hooks at the boundary (new components, files you're already touching),
> not as a top-down rewrite. Classes have no removal plans and still work in React 19, so a class is
> never a bug to fix on sight; a half-finished rewrite is.

### `eslint-plugin-react-hooks` is non-optional

The React team *"strongly recommend[s]"* it. This is not a style preference — the Rules of Hooks are
a correctness requirement of the implementation. Hook state is stored positionally in a linked list
on the fiber; a conditional hook shifts every subsequent hook's slot and hands you another hook's
state.

> 🟢 **Best practice** — enable `eslint-plugin-react-hooks` and treat `rules-of-hooks` as an error.
> Because slots are positional, this catches a correctness bug the type system cannot see; there is
> no case where you want a conditional or reordered hook.

```jsx
// BAD — conditional hook call. The linter catches this. Without it, useState
// below silently reads whatever hook occupied slot 1 on the previous render.
function Profile({ userId }) {
  if (!userId) return <Login />;          // early return BEFORE hooks
  const [user, setUser] = useState(null); // hook count varies per render
  useEffect(() => { fetchUser(userId).then(setUser); }, [userId]);
  return <div>{user?.name}</div>;
}
```

```jsx
// GOOD — hooks unconditional and first; branch on the render output instead.
function Profile({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchUser(userId).then(u => { if (!cancelled) setUser(u); });
    return () => { cancelled = true; };   // prevents setState-after-unmount + races
  }, [userId]);

  if (!userId) return <Login />;
  return <div>{user?.name}</div>;
}
```

The `cancelled` flag is the part people omit. Without it, fast `userId` changes let a stale response
win the race and overwrite fresher data — a bug that only appears on slow networks, i.e. in
production and never on localhost.

> 🟢 **Best practice** — every effect that starts async work or subscribes to something returns a
> cleanup that cancels it. This is the correctness rule the whole hooks model rests on; it's also
> what makes an effect idempotent, which is exactly what React 18's StrictMode double-invoke (below)
> checks for. When several effects each fetch independent, unrelated data, fire them in parallel
> rather than awaiting one after another — in a small reproduction (React 19, jsdom) three
> independent requests took 604 ms sequentially vs 221 ms under `Promise.all` (production will
> differ). If request B needs A's result, they *must* stay sequential.

### The class→hooks mapping is not 1:1 (this is the real migration cost)

| Class | Hooks | Trap |
|---|---|---|
| `componentDidMount` | `useEffect(fn, [])` | Not equivalent: runs after paint, not synchronously after mount. Use `useLayoutEffect` if you measure/mutate the DOM, or you'll ship a visible flicker. |
| `componentDidUpdate` | `useEffect(fn, [deps])` | Also runs on mount. There is no "skip first run" built in. |
| `componentWillUnmount` | effect cleanup | Also runs before *every* re-run of the effect, not only at unmount. |
| `this.state` object | multiple `useState` | `setState` merges partially; `useState` **replaces**. `setUser({name})` drops every other field. |
| `this.props` in async callback | closure capture | The class reads the *latest* `this.props`; a hook closure captures the props from *that render*. Stale closures are the #1 migration bug. |
| `shouldComponentUpdate` | `React.memo` | `memo` is a shallow prop compare only; it cannot see state or context. Not a drop-in for a custom `sCU`. |
| `getDerivedStateFromProps` | (nothing) | No equivalent, by design. Use `key`, or compute during render. |

The `useEffect` [dependency array](fundamentals#dependency-arrays) is where migrations actually fail.
`exhaustive-deps` is a warning, not an error, and every large 16-era codebase has hundreds of
suppressed instances. A lied-about dep array is a [stale closure](fundamentals#closures): the effect
keeps reading the first render's values forever — this is the class→hooks trap the mapping table
above calls the #1 migration bug.

```jsx
// BAD — lying to the linter. `count` is frozen at 0 forever; the interval
// sets count to 1 on every tick, permanently.
useEffect(() => {
  const id = setInterval(() => setCount(count + 1), 1000);
  return () => clearInterval(id);
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

```jsx
// GOOD — functional update removes the dependency honestly.
useEffect(() => {
  const id = setInterval(() => setCount(c => c + 1), 1000);
  return () => clearInterval(id);
}, []); // genuinely has no deps now
```

The rule: when the linter demands a dep you don't want, **change the code so the dep isn't needed**
(functional updates, refs, moving the function inside the effect). Never silence it.

> 🟢 **Best practice** — resolve an exhaustive-deps warning by removing the dependency honestly, not
> by disabling the rule. The functional updater `setCount(c => c + 1)` reads the latest value without
> naming `count` as a dep, so the [closure](fundamentals#closures) is no longer stale. A correctness
> rule: a suppressed warning is an unaudited bug, not a resolved one.

## `React.memo` / `lazy` / `Suspense` (16.6)

`React.memo` is *"a function component optimization equivalent to `PureComponent`"* — shallow prop
comparison.

```jsx
// BAD — memo defeated on every render. `onSelect` and `style` are fresh
// references each time the parent renders, so the shallow compare always fails.
// You've added comparison cost and gained nothing.
const Row = React.memo(function Row({ item, onSelect, style }) { /* … */ });

function List({ items }) {
  return items.map(item => (
    <Row key={item.id} item={item} onSelect={() => select(item.id)} style={{ padding: 8 }} />
  ));
}
```

```jsx
// GOOD — stable references, so memo can actually short-circuit.
const ROW_STYLE = { padding: 8 };            // hoisted: same ref forever
const Row = React.memo(function Row({ item, onSelect }) {
  return <div style={ROW_STYLE} onClick={() => onSelect(item.id)}>{item.name}</div>;
});

function List({ items }) {
  const onSelect = React.useCallback(id => select(id), []); // stable
  return items.map(item => <Row key={item.id} item={item} onSelect={onSelect} />);
}
```

Note the pattern: pass `item.id` back *up* through a stable callback rather than closing over it in a
per-row arrow. That's what makes the reference stable.

> 🟡 **Optimization** — `React.memo` (plus the `useCallback`/hoisting that keeps its props stable) is
> a render-count optimization, never a correctness fix. When it lands, it lands hard: in a small
> reproduction (React 19, jsdom) a child whose props never changed rendered **11 times** across 10
> parent updates as a plain component and **1 time** wrapped in `memo` (production will differ). But
> `memo` runs a shallow prop compare on *every* parent render, so on the BAD example above — fresh
> `onSelect`/`style` each render — it only adds cost.
>
> **Pros:** skips re-rendering (and re-[reconciling](fundamentals#reconciliation)) a subtree whose
> props are referentially unchanged; the win scales with how often the parent re-renders.
> **Cons:** the comparison itself isn't free, and it's load-bearing on *every* prop staying stable —
> one inline `{}` or arrow silently defeats it while you keep paying the compare.
> **When NOT to use it:** cheap children, children that re-render rarely, or children whose props you
> can't or won't keep stable. On this stack, prefer letting the React Compiler memoize automatically
> over hand-wrapping — but verify the compiler didn't silently bail before deleting a manual `memo`.

### Suspense/lazy in the 16 era — the production gotchas

- **`React.lazy` only supports default exports.** *"React.lazy currently only supports default
  exports."* The documented workaround is an intermediate module that re-exports:
  `export { MyComponent as default } from "./ManyComponents.js"`.
- **Suspense did not work for SSR in 16.** *"This feature is not yet available for server-side
  rendering."* This is the single biggest reason 16-era SSR apps use `loadable-components` instead of
  `React.lazy` — and the reason ripping it out is a real project, not a find-and-replace. (Streaming
  SSR + Suspense landed in React 18.)
- **Wrap lazy boundaries in an error boundary.** A chunk fetch fails on a flaky network, or after a
  deploy invalidates the old chunk hash; without a boundary the whole tree unmounts. The "user had
  the tab open during a deploy and the app white-screened" incident is exactly this.

> 🟢 **Best practice** — pair every `Suspense`/`lazy` boundary with an error boundary. Since 16.0 an
> uncaught error unmounts the whole tree, and a failed chunk load *is* an uncaught error; the
> boundary is what turns a white screen into a retry prompt. Correctness, not optimization.

> 🟡 **Optimization** — route-splitting with `lazy` cuts first-load JS but adds a fallback on first
> navigation. Splitting this very reference site's build dropped the eager bundle from **258 KB** to
> a **92 KB** entry (gzip), deferring the markdown renderer and each doc page until opened (measured
> on this repo; your split will differ). **When NOT to use it:** a tiny SPA where the whole app is
> smaller than the chunking overhead, or a route reached on nearly every session — prefetch that one
> on link hover instead of paying a fallback for it.

## What breaks moving off 16

### 16 → 17 (the "no new features" release that still breaks things)

React 17's whole purpose was gradual upgrades, and *"fewer than twenty components out of 100,000+ in
the Facebook product code"* needed changes. Still, these are the real hazards:

1. **Event delegation moved from `document` to the root container.** React no longer attaches event
   handlers at the `document` level; it attaches them to the root DOM container. Breaks anything
   doing `document.addEventListener` and relying on ordering vs. React's handlers —
   outside-click-to-close dropdowns, analytics interceptors, `e.stopPropagation()` expecting
   document-level capture. This is the #1 real-world 17 break, and it hits third-party libraries you
   don't control.
2. **Event pooling removed.** This is a *fix* (no more `e.persist()`), but code calling `e.persist()`
   is now a no-op — harmless — while code that *worked around* pooling by copying `e.target` may now
   be dead weight.
3. **`onScroll` no longer bubbles.** Handlers on ancestors that fired via React's synthetic bubbling
   stop firing. Silent.
4. **`onFocus`/`onBlur` switched to native `focusin`/`focusout`.**
5. **`useEffect` cleanup runs asynchronously.** Cleanup no longer blocks screen updates. Code that
   assumed synchronous cleanup before the next paint can flicker.
6. **`forwardRef`/`memo` returning `undefined` now throws.** Catches a real bug class (a missing
   `return`), but it's a hard runtime failure, not a warning.

> The React 17 blog URLs on react.dev now 404; the breaking-change list above is inherited from
> CHANGELOG citations, not re-sourced first-hand.

### 17 → 18

`createRoot` replaces `ReactDOM.render`. **Automatic batching** now batches updates from promises,
`setTimeout`, and native handlers (previously only React event handlers), which can change render
counts in tests and expose code depending on intermediate renders. `flushSync` is the opt-out.

> You **can** go 16 → 18 directly, skipping the 17 *install*. React 18 deliberately emulates React
> 17 — its own console warning says *"your app will behave as if it's running React 17."* But
> skipping the 17 install does **not** skip 17's *breaking changes* (event delegation moved to the
> root, JSX transform, no event pooling), and the React 18 upgrade guide never documents them. The
> folklore ("you must pass through 17") is wrong about the mechanism but right about the danger.

**The StrictMode change that breaks 16-era code**, from the React 18 upgrade guide: in development,
React simulates unmounting and remounting each component — mount → run effects → simulate unmount →
destroy effects → simulate remount with previous state → run effects again.

Every `useEffect(fn, [])` written as `componentDidMount` — no cleanup, fire a fetch, open a socket,
send an analytics event — now runs **twice in dev**. Double-fetches, double-fired events, leaked
sockets. This is not a React bug; it surfaces the missing cleanup that was always wrong. But it is
the moment a 16-era hooks codebase discovers its effects were never idempotent, and it arrives all
at once.

### 18 → 19

The hard removals finally land: **legacy context** (`contextTypes`/`getChildContext`), **string
refs**, **module pattern factories**, **`createFactory`**, **`propTypes`**, **`defaultProps` on
function components**, **`ReactDOM.render`**, **`hydrate`**, **`unmountComponentAtNode`**,
**`findDOMNode`**, **`react-dom/test-utils`**. Every one of these was deprecated during the 16 era
(2017–2020) with warnings the team maintained for ~6 years. **The 16 warnings were the migration
notice.**

> Two migration-tooling facts worth carrying into the 19 jump. First, the codemod command the
> official React 19 upgrade guide prints — `npx codemod@latest react/19/migration-recipe` — is
> **dead**; it fails with "No command provided" on the current `codemod` CLI. The working form is
> `npx codemod@latest run react-19-migration-recipe -t ./src --no-interactive`. Second, React 19
> removed string refs but **not** `this.refs` — it still initializes `this.refs` to an object on
> class instances, so don't reject the codemod's output on the belief that `this.refs` is gone.

## Patterns from this era that are now actively harmful

Ranked by how much damage they do:

1. **String refs** (`ref="input"`). Deprecated 16.3, **removed in React 19**. Can't be typed, can't
   be composed, break under multiple React copies. A codemod exists; there's no argument for keeping
   them.
2. **Legacy context.** Deprecated 16.6, **removed in React 19**. Hard break.
3. **`findDOMNode`.** **Removed in React 19.** Never worked with fragments returning multiple
   children; breaks abstraction by reaching into a child's DOM. Replace with an explicit ref +
   `forwardRef`.
4. **Derived state via `gDSFP`.** Semantics changed under everyone in 16.4. Replace with `key` reset
   or full control.
5. **`componentWillReceiveProps` for data fetching.** Render-phase; fires unpredictably under
   concurrent rendering. This is the pattern Fiber was designed to make impossible.
6. **Render props purely for state sharing.** Not deprecated and not broken — still correct for
   *rendering* injection. But when it exists only to share stateful logic, `useContext`/custom hooks
   delete the wrapper pyramid outright.
7. **HOC stacks** (`withRouter(connect(...)(withStyles(...)(C)))`). Not deprecated. But: they collide
   on prop names, erase types, produce unreadable stacks, and force `hoist-non-react-statics`. Custom
   hooks are the replacement.
8. **`ReactDOM.render`** as app entry. **Removed in React 19**; on 18 it silently runs your app in
   React 17 compatibility mode — you get *none* of the 18 features while believing you upgraded.
9. **`e.persist()`** — dead code after 17. Harmless, but it signals a codebase that hasn't been read
   since 2020.
10. **`javascript:` URLs in `href`.** Deprecated 16.9; the blog notes it *"poses security risks and
    will eventually throw errors."* It's an XSS vector, not a style issue.

**Explicitly NOT harmful** (don't let a rewrite-happy engineer tell you otherwise): class components
(no removal plans, still true in 19), `PureComponent`, error boundaries (classes are the *only* way),
`getSnapshotBeforeUpdate` (no hook equivalent exists — for scroll restoration it's still the right
tool), and `UNSAFE_`-prefixed lifecycles as a *temporary* state.

## What a codebase stuck on 16 looks like

Diagnostic signature, roughly in order of how much each tells you:

- `enzyme` in devDependencies — never supported React 18; its presence is a hard blocker, not a
  preference. This is usually the *real* reason a team can't upgrade, and it's a test-suite rewrite
  (→ `@testing-library/react`), not a React upgrade. *(Enzyme's lack of a React 18 adapter is widely
  known and the enzyme repo is effectively unmaintained; not confirmed against an enzyme primary
  source in this pass.)*
- `import React from 'react'` at the top of every file → pre-16.14 JSX transform.
- Mixed `this.setState` and `useState` in the same directory → migration started, stalled.
- `// eslint-disable-next-line react-hooks/exhaustive-deps` in double digits → latent stale closures;
  each one is an unaudited bug.
- `componentWillReceiveProps` with no `UNSAFE_` prefix → the 16.9 codemod was never run.
- `loadable-components` → SSR + code splitting predating Suspense SSR (18).
- `PropTypes` as the only type system → **removed in 19**; this is a TypeScript project in disguise.
- React 16.8.x specifically → someone upgraded exactly far enough to use hooks and stopped.

> The diagnostic signature and the upgrade ordering below are engineering judgment, not
> version-verified facts. Treat them as a playbook, not a spec.

**Recommended upgrade order** — each step independently shippable, which is the whole point:

1. **16.x → 16.14** + `update-react-imports` codemod. One feature, zero risk, proves the pipeline.
2. Run `rename-unsafe-lifecycles`. Now `UNSAFE_` is visible in every code review.
3. **Replace enzyme with RTL.** Biggest, most boring, entirely unavoidable. Do it on 16 where the
   test suite still passes, so a failure means "bad test," not "bad test *or* React change."
4. Kill string refs, legacy context, `findDOMNode` — all removed in 19, all fixable on 16 today.
5. **16.14 → 17.** Audit `document.addEventListener` first. Nothing else new to learn.
6. **17 → 18** with `ReactDOM.render` still in place (runs in 17 compat mode — a legitimate
   intermediate step, not a failure).
7. Flip to `createRoot`. Expect StrictMode to surface every non-idempotent effect at once.
8. **18 → 19.** The deprecations from steps 2–4 come due. If you did them, this is small.

The load-bearing insight: **steps 3 and 4 are React-16-compatible.** Almost all the cost of leaving
React 16 can be paid *while still on React 16*, in small independently-shippable pieces, before
touching a version number. Teams that treat "upgrade React" as one atomic ticket are why codebases
stay on 16 for six years.

## Sources

All primary — React blog, React docs, facebook/react repo.

- React v16.0 — https://legacy.reactjs.org/blog/2017/09/26/react-v16.0.html
- React v16.3 — https://legacy.reactjs.org/blog/2018/03/29/react-v-16-3.html
- You Probably Don't Need Derived State (16.4 gDSFP change) — https://legacy.reactjs.org/blog/2018/06/07/you-probably-dont-need-derived-state.html
- React v16.6 — https://legacy.reactjs.org/blog/2018/10/23/react-v-16-6.html
- React v16.8 (Hooks) — https://legacy.reactjs.org/blog/2019/02/06/react-v16.8.0.html
- React v16.9 — https://legacy.reactjs.org/blog/2019/08/08/react-v16.9.0.html
- React v16.13.0 — https://legacy.reactjs.org/blog/2020/02/26/react-v16.13.0.html
- React v16.14.0 release tag — https://github.com/facebook/react/releases/tag/v16.14.0
- Introducing the New JSX Transform — https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html
- React v17.0 — https://legacy.reactjs.org/blog/2020/10/20/react-v17.html
- React 18 Upgrade Guide — https://react.dev/blog/2022/03/08/react-18-upgrade-guide
- React 19 Upgrade Guide — https://react.dev/blog/2024/04/25/react-19-upgrade-guide
- StrictMode reference — https://react.dev/reference/react/StrictMode
- Code-Splitting (React.lazy limitations) — https://legacy.reactjs.org/docs/code-splitting.html
- facebook/react CHANGELOG — https://github.com/facebook/react/blob/main/CHANGELOG.md
