---
name: react-practices
description: "Use when writing or reviewing React components and hooks: deciding whether a useEffect is needed, placing state, using keys, composing components, or configuring the React Compiler and manual memoization. Encodes react.dev guidance and the current (mature) React Compiler behaviour."
metadata:
  source: https://baluraut.github.io/react-best-practices/react-practices
---

# React Practices

Version-agnostic rules that hold across React 17–19, verified against React 19.2.7,
`babel-plugin-react-compiler@1.0.0`, and `eslint-plugin-react-hooks@7.1.1` on a real install
(2026-07-18). The through-line: React shipped a compiler and a 29-rule lint plugin, and both of them
turned advice that used to be discipline into something a machine now enforces. Purity stopped being
an ideal and became a performance feature.

---

## You Might Not Need an Effect

This is the single highest-leverage rule in React, and as of `eslint-plugin-react-hooks@7` it is
machine-enforceable.

**The rule:** Effects are for **synchronizing with an external system** — a subscription, the DOM, a
network connection, a non-React widget. From react.dev, verbatim:

> "Use Effects only for code that should run *because* the component was displayed to the user."

If there is no external system, you almost certainly do not need an Effect. Most Effects in real
codebases exist to compute state from other state, or to react to a prop change, or to chain one
state update to the next — none of which involve an external system, all of which are bugs waiting to
fire.

**Why it exists:** an Effect runs *after* render and commit. Anything you do there that could have
been done during render costs an extra render pass, and any state you set from an Effect can tear —
the user sees the intermediate value for one frame. Worse, Effect-derived state drifts out of sync
with its inputs the moment you add a new code path that forgets to update it.

**The failure it prevents:** stale UI, render flicker, infinite render loops (`setState` in an Effect
that depends on that state), and the whole category of "why is my data one keystroke behind" bugs.

### The rule you most want is off by default

`eslint-plugin-react-hooks@7.1.1` grew from **2 rules** (`rules-of-hooks`, `exhaustive-deps` — the
list for a decade) to **29 rules**. The compiler's static analysis now ships as lint. Running ESLint
10.7.0 on the canonical "derive state in an effect" anti-pattern produces:

```
error  Values derived from props and state should be calculated during render, not in an effect.
       (https://react.dev/learn/you-might-not-need-an-effect#updating-state-based-on-props-or-state)
       react-hooks/no-deriving-state-in-effects
```

The lint message literally cites the blog post. But `no-deriving-state-in-effects` is **not in the
`recommended` preset** — the most valuable React lint rule is one almost nobody has enabled. You must
opt in explicitly.

```js
// eslint.config.js — flat config, eslint 10 + eslint-plugin-react-hooks 7
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  reactHooks.configs['recommended-latest'],
  {
    rules: {
      // NOT enabled by recommended — opt in. This enforces "You Might Not Need an Effect".
      'react-hooks/no-deriving-state-in-effects': 'error',
      // Also opt-in, also high value:
      'react-hooks/exhaustive-effect-dependencies': 'warn',
      'react-hooks/memoized-effect-dependencies': 'warn',
    },
  },
];
```

> `recommended` and `recommended-latest` are **not the same object** in this plugin. `recommended` is
> the stable set; `recommended-latest` tracks newer rules. Pick one deliberately — don't assume they
> are aliases.

One rule that catches a large slice of the same bug class, `react-hooks/set-state-in-effect`, **is**
on in `recommended`. So even the default preset stops the worst offenders; opting into
`no-deriving-state-in-effects` closes the rest.

### The anti-patterns and their fixes

Every one of these comes straight from react.dev's "You Might Not Need an Effect". Learn the shape,
not the list.

| Smell | Fix |
|---|---|
| Deriving state from props/state | Compute during render: `const fullName = first + ' ' + last;` |
| Expensive calc in an Effect | `useMemo` — or let the compiler do it (see below) |
| Reset all state when a prop changes | Pass a `key`: `<Profile userId={id} key={id} />` |
| Adjust *some* state when a prop changes | Derive it, or adjust during render with a prev-value guard |
| Shared logic between two handlers | A plain function both handlers call |
| POST on a user action | Do it in the event handler, not an Effect |
| Chains of Effects that trigger each other | Compute all the next state in the one handler |
| App-wide init | Module scope, or a module-level `didInit` guard (StrictMode double-invokes) |
| Notifying the parent of a change | Call `onChange` in the same handler that calls `setState` |
| Subscribing to an external store | `useSyncExternalStore` |
| Fetching data | A framework loader or query library; bare Effect fetch is a last resort |

Analytics-on-display is the one thing that legitimately belongs in an Effect: it *should* run because
the component was shown. That is the litmus test in one example.

### The "adjust during render" escape hatch is narrow

When you genuinely must reset state in response to a prop change and `key` won't do, you may set state
*during render* — but only for the component's **own** state, and only behind a prev-value guard.

```tsx
// ✅ legal — own state, guarded, no Effect
const [prevItems, setPrevItems] = useState(items);
if (items !== prevItems) {
  setPrevItems(items);
  setSelection(null);
}
```

React discards the returned JSX and immediately re-runs the component with the new state — no commit,
no flicker, no extra Effect. The guard is mandatory: without it you loop forever.

> Do this in a **child's** render — setting a *different* component's state during your render — and
> you get "Cannot update a component while rendering a different component." `react-hooks/set-state-in-render`
> catches it. Prefer `key` over this hatch; prefer plain derivation over both.

---

## The React Compiler: mature, not new

`babel-plugin-react-compiler@1.0.0` shipped **2025-10-07**. As of this writing it has been stable for
roughly nine months. Treat it as a mature, production tool — not a bleeding-edge experiment.

### Do not mass-delete your `useMemo` / `useCallback`

This is the dominant advice online and it is **harmful**. The official guidance, verbatim:

> "For **new code**, we recommend relying on the compiler for memoization and using
> `useMemo`/`useCallback` where needed to achieve precise control."

> "For **existing code**, we recommend either leaving existing memoization in place (**removing it can
> change compilation output**) or carefully testing before removing the memoization."

That parenthetical is the whole point. The `recommended` preset enables
**`react-hooks/preserve-manual-memoization` at error level** — the compiler *reads* your existing
`useMemo`/`useCallback` as a semantic signal about what you intended to keep stable, and preserves it.
Rip them out and you can get *different* output, not merely less of it. "The compiler is on, so delete
all the memo" is the single worst piece of advice circulating about it.

The legitimate remaining reason to hand-memoize new code: when a memoized value is an **Effect
dependency** and you need it referentially stable so the Effect doesn't re-fire.

**Net policy:**

- Turn the compiler **on**. Turn `eslint-plugin-react-hooks@7` `recommended-latest` **on**.
- Do **not** mass-delete existing `useMemo`/`useCallback`. Leave them.
- Write new code without manual memo. Reach for `useMemo` only for Effect-dep stability or measured
  precise control.
- `React.memo` at boundaries you don't compile (third-party children) still matters.

### Never pin `@rc`

The compiler's version line **reset** at 1.0. It decoupled from React's version numbers, so the npm
`rc` dist-tag is a *higher* semver (`19.1.0-rc.3`) than `latest` (`1.0.0`) — but it points at an
**older** August-2025 prerelease.

```bash
npm view babel-plugin-react-compiler dist-tags
# latest: 1.0.0    rc: 19.1.0-rc.3   ← older code, higher number
```

> Reflexively pinning `babel-plugin-react-compiler@rc` **downgrades you to a prerelease**. Install
> `@latest` or pin `1.0.0`. (The *reason* for the version reset is not stated in the v1 blog post;
> the "decoupled from React's line" explanation is inference, not an official claim.)

### The compiler wins where `useMemo` legally cannot

The strongest concrete argument for the compiler, demonstrable in 30 seconds: it can memoize **after
an early return**. The Rules of Hooks forbid a `useMemo` below a conditional `return`; the compiler
has no such constraint.

```tsx
function Total({ cond, items }: { cond: boolean; items: number[] }) {
  if (cond) return null;                          // early return
  const total = items.reduce((a, b) => a + b, 0); // ← a useMemo here is ILLEGAL
  return <div>{total}</div>;
}
```

The compiled output wraps the `reduce` in a cache check (`if ($[0] !== items)`) placed *after* the
return — memoization you cannot hand-write.

### Bailouts are silent — this is the gotcha that bites in production

The compiler cannot memoize code it can't prove is safe. When it hits such code it **bails out for
that function** and emits it uncompiled. Running five components through
`babel-plugin-react-compiler@1.0.0` with a logger:

| Case | Result |
|---|---|
| Derived filter from props | ✅ compiled |
| Local array built in a `for` loop | ✅ compiled (local mutation is fine) |
| **Mutating a prop** (`user.lastSeen = Date.now()`) | ❌ bailout |
| Compute after early return | ✅ compiled |
| **Mutating a module-level global** (`counter++`) | ❌ bailout |

```
BAILOUT: This value cannot be modified. Modifying component props or hook arguments
         is not allowed. Consider using a local variable instead.
BAILOUT: (BuildHIR::lowerExpression) Support UpdateExpression where argument is a global
```

Three things to internalize:

- **Bailouts are per-function, not per-file.** One dirty component does not poison its neighbours.
- **Bailouts are silent by default.** No warning, no build failure, nothing in the terminal.
  Compilation simply does not happen for that component. You ship believing you're memoized; you're
  not, and the perf regression is invisible.
- **The bail set is *larger* than "breaks the Rules of React."** The second bailout above is an
  unimplemented-syntax bailout — the compiler is conservative about code it can't model. You cannot
  reason your way from "this code is pure" to "this code was compiled." (The cases here are five
  hand-picked probes, not an exhaustive bailout catalogue.)

> Impurity is not *fixed* by the compiler — it is *punished* by it. All of the compiler's leverage is
> downstream of purity. Rules-of-React compliance stopped being an ideal and became a performance
> feature.

**Make bailouts visible.** Wire the logger so bailouts show up instead of hiding:

```ts
// vite.config.ts
react({
  babel: {
    plugins: [['babel-plugin-react-compiler', {
      logger: {
        logEvent(filename, event) {
          if (event.kind === 'CompileError') {
            console.warn('[react-compiler] bailout', filename, event.detail.reason);
          }
        },
      },
    }]],
  },
})
```

The supported complement is the lint rules: `recommended` surfaces most bail causes
(`immutability`, `globals`, `purity`, `refs`) as **editor errors before build**. That is the intended
workflow — *lint catches it at author time, the compiler silently skips it at build time.* Ship both.

### The compiler is not React 19–only

The blog states the compiler is compatible with **React 17 and up**. The `target` option controls the
runtime import:

| `target` | emitted runtime import | extra dependency |
|---|---|---|
| `19` (default) | `react/compiler-runtime` | none — built into React 19 |
| `18` | `react-compiler-runtime` | `npm i react-compiler-runtime@1.0.0` |
| `17` | `react-compiler-runtime` | `npm i react-compiler-runtime@1.0.0` |

On React 19.2.7 the default target is correct and no extra dependency is needed.

> The runtime symbol is `c` / `_c` imported from `react/compiler-runtime`. `useMemoCache` was the
> RC-era name and no longer exists — if a guide mentions it, the guide is stale.

---

## Render must be pure

Same inputs → same output, no side effects during render. This is the foundation the compiler stands
on, and it is enforced from three directions.

- **StrictMode** double-invokes render and Effects in dev, surfacing impurity as visible weirdness.
- **Lint:** `react-hooks/purity`, `immutability`, `globals`, and `set-state-in-render` are all
  **error** in `recommended`.
- **The compiler**, which bails on impure code — silently.

```tsx
// 🔴 mutates a prop — a real bug AND a verified compiler bailout
function Row({ user }: { user: User }) {
  user.lastSeen = Date.now();
  return <div>{user.name}</div>;
}

// ✅ pure — computed by the owner, passed in
function Row({ user }: { user: User }) {
  return <div>{user.name}</div>;
}
```

Pre-compiler, impure render was a latent correctness bug. Post-compiler it is *also* a silent perf
cliff, because the impure component is the one that quietly doesn't get memoized.

---

## Keys: identity, not order

The index-as-key bug is not about "wrong order." It is about **state and DOM identity being bound to
list position instead of to the item**. It is invisible with pure-text children, which is exactly why
it survives code review and then corrupts data in production.

```tsx
// 🔴 BAD — key bound to position
{todos.map((todo, i) => <TodoRow key={i} todo={todo} />)}
// where TodoRow renders <input defaultValue={todo.text} />  (uncontrolled)
```

Type "buy milk" into row 2, then delete row 1. The surviving todo shifts to index 1. React sees
`key=1` still exists, so it **reuses the old row 1 instance and its DOM node** — including the old
uncontrolled input value. You now display a *deleted* todo's text against a *surviving* todo. Nothing
throws.

```tsx
// ✅ GOOD — key bound to the item
{todos.map((todo) => <TodoRow key={todo.id} todo={todo} />)}
```

**Why it passes review:** with fully controlled children, props reflow correctly and everything looks
fine. The bug only manifests where state lives *outside* props — uncontrolled inputs, focus, scroll
position, CSS transitions, a `useState` inside the row, a media playhead. It passes tests, then
corrupts data in prod.

Index-as-key is safe **only if** the list is never reordered, never filtered, and items are never
inserted or removed except at the end. That is rare enough that a stable `id` is always the right
default.

> `key` is an API, not a chore. Changing a component's `key` unmounts and remounts it — this is the
> *documented* way to reset state on a prop change (the `<Profile key={id} />` fix above). Reach for
> it deliberately.

---

## Server data is a cache, not state

The most consequential architectural rule here: **server state does not belong in `useState`.**
`useState` + `useEffect` + `fetch` reimplements a cache, badly. Once server data lands in `useState`
you have silently signed up to hand-write: race-condition cleanup, deduplication of concurrent
callers, revalidation, invalidation on mutation, retry/backoff, refetch on focus and reconnect,
garbage collection, offline handling, and request-waterfall avoidance.

react.dev says so directly:

> "Modern frameworks provide more efficient built-in data fetching mechanisms than writing Effects
> directly in your components."

Draw the line by ownership:

- **Server state** — owned by the server, shared across clients, stale the instant you read it.
  Belongs in a cache: React Query, SWR, RSC, or router loaders. **Never `useState`.**
- **Client state** — owned by this UI and authoritative here: form drafts, modal open/closed,
  selected filters. Belongs in `useState` / `useReducer` / context.

Confusing the two is the root cause of most "React is slow" and "my data is stale" complaints.

> The `ignore`-flag Effect-fetch pattern in the docs is presented as **damage control** for when you
> have no framework — not as a recommendation. Don't cargo-cult it as *the* data-fetching pattern.

---

## State placement and composition

**Colocate state; lift only when it's shared.** Hoisting everything to the root is the number-one
cause of self-inflicted re-render storms. The compiler does not save you here — it memoizes values, it
does not restructure your tree.

**Composition beats configuration.** `<Card>{children}</Card>` beats
`<Card title icon action footerVariant>`. This is a performance pattern, not just an aesthetic one:
children passed as props are created in the **parent's** scope, so they don't re-render when the
wrapper's own state changes.

**Prop drilling → context → store, in that order.** Two levels of drilling is fine and *explicit*.
Reach for context when drilling gets deep, and a real store only when context can't keep up.

> Context is not a store. **Any** change to a context value re-renders **all** of its consumers,
> regardless of which field each one actually reads. Split contexts by update frequency, and put
> `dispatch` in its own context — `dispatch` is stable, so its consumers never re-render.

---

## Hooks, boundaries, and escape hatches

**Custom hooks are the unit of reuse — for stateful logic, not markup.** A custom hook that returns
JSX is a component wearing a hat; make it a component. Naming must start with `use`, or both lint and
the compiler stop analyzing it correctly (`react-hooks/hooks`, `react-hooks/capitalized-calls`).

**Error boundaries and Suspense are a pair.** Suspense means "not yet"; an error boundary means
"never." Boundaries catch errors thrown during **render and lifecycle only** — they do **not** catch
errors in event handlers, in async callbacks, or in SSR-hydration mismatch content. React 19 added
`onCaughtError` / `onUncaughtError` on the root for reporting. `react-hooks/error-boundaries` is
**error** in `recommended`.

**Controlled vs uncontrolled: pick one per field, at mount.** Switching mid-life
(`value={undefined}` → `value="x"`) triggers React's classic warning and loses state. Uncontrolled +
`defaultValue` is the right default for large forms; remount via `key` to reset.

**Refs are an escape hatch.** Use a ref for values that don't drive rendering. Reading or writing a
ref *during render* is impure (`react-hooks/refs`, error).

> React 19 makes `ref` a plain prop for function components, so most `forwardRef` wrappers are no
> longer needed. But `forwardRef` is **deprecated, not removed** — it still works, and codemods exist
> to migrate. Don't tell people it's gone.

---

## Which lint rules are on by default

Verified by direct introspection of `eslint-plugin-react-hooks@7.1.1`'s `recommended` preset.

**On by default** (`recommended`): `rules-of-hooks` (error), `exhaustive-deps` (warn),
`static-components`, `use-memo`, `preserve-manual-memoization`, `incompatible-library` (warn),
`immutability`, `globals`, `refs`, `set-state-in-effect`, `error-boundaries`, `purity`,
`set-state-in-render`, `unsupported-syntax` (warn), `config`, `gating`.

**Exists but OFF by default** — opt in for the high-value ones:
`no-deriving-state-in-effects`, `exhaustive-effect-dependencies`, `memoized-effect-dependencies`,
`hooks`, `capitalized-calls`, `void-use-memo`, `memo-dependencies`, `invariant`, `todo`, `syntax`,
`rule-suppression`, `fbt`, `component-hook-factories`.

> `eslint-plugin-react-compiler` is a dead end — frozen at an RC (`19.1.0-rc.2`), its rules absorbed
> into `eslint-plugin-react-hooks`. It carries **no npm deprecation flag**, so nothing warns you on
> install. Call it "superseded," not "deprecated," and check the version. Use
> `eslint-plugin-react-hooks@7`.

---

## Sources

- https://react.dev/learn/you-might-not-need-an-effect
- https://react.dev/blog/2025/10/07/react-compiler-1
- https://react.dev/reference/rules/components-and-hooks-must-be-pure
- https://react.dev/reference/react-compiler/target
- Empirical, run locally 2026-07-17: `babel-plugin-react-compiler@1.0.0`,
  `eslint-plugin-react-hooks@7.1.1`, `eslint@10.7.0`, and `npm view` dist-tags/timestamps.
