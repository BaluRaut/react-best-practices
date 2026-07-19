---
name: react
description: "Use for any React work — components, hooks, state, effects, forms, data fetching, performance, architecture, typing, or upgrading across versions. A consolidated, version-verified best-practices reference (React 19, the React Compiler) covering the fundamentals through production patterns, with bad-vs-good examples and when-not-to guidance."
metadata:
  source: https://baluraut.github.io/frontend-best-practices
---

# React — Best Practices (consolidated)

A single-file, version-verified React reference, consolidated from [baluraut.github.io/frontend-best-practices](https://baluraut.github.io/frontend-best-practices/). Every rule is labelled 🟢 best practice / 🟡 optimization / 🔴 advanced-gotcha, with bad-vs-good examples and a "when not to". These are guidelines and trade-offs, not laws.

## Contents

- [React Fundamentals](#react-fundamentals)
- [React Practices](#react-practices)
- [Design Principles for React](#design-principles-for-react)
- [TypeScript with React 19](#typescript-with-react-19)
- [Where State Should Live](#where-state-should-live)
- [Custom Hooks](#custom-hooks)
- [Forms](#forms)
- [The Data Layer](#the-data-layer)
- [Architecture: folders, colocation, and barrels](#architecture-folders-colocation-and-barrels)
- [Quality: Testing, Accessibility, Performance, Tooling, Structure](#quality-testing-accessibility-performance-tooling-structure)
- [Front-End Security](#front-end-security)
- [The React 16 → 19 Migration Matrix](#the-react-16-19-migration-matrix)
- [React 19](#react-19)
- [React 18 — Concurrent Rendering and the Traps](#react-18-concurrent-rendering-and-the-traps)
- [React 17 — the stepping stone](#react-17-the-stepping-stone)
- [React 16 Era (16.0 – 16.14)](#react-16-era-160-1614)

---

## React Fundamentals

This is the primer every other page assumes. It is not a first React tutorial — it takes JSX,
props, `useState`, and `useEffect` as known — and instead explains the five internal ideas that make
the rest of the site's advice follow from *reasons* rather than recipes: how a render becomes a DOM
change, how React decides what to keep versus rebuild, why a function you wrote three renders ago is
still holding old data, what a dependency array is actually comparing, and why "render must be pure"
is now a performance feature and not just an ideal.

Verified against React 19.2.7. The mechanisms here are stable across React 17–19; where a version
matters, it is called out.

Unlike the rest of the site, this page has no "when not to" — these aren't guidelines you weigh against
trade-offs, they're *how React actually works*. Everything else here is advice you apply with judgment;
this is the machine the judgment reasons about. Get these five right and most other pages become obvious.

Every recommendation is tagged so you can tell a **rule** from an **optimization**:

> 🟢 **Best practice** — do this by default; it's a correctness/maintainability rule.

> 🟡 **Optimization** — apply only when a measured problem calls for it; it has a cost.

> 🔴 **Advanced / gotcha** — a sharp tool or a trap; reach for it knowingly.

Most of this page is 🟢, because fundamentals are rules, not options.

---

### Render vs commit

React does its work in two distinct phases, and almost every "why did this happen" question resolves
once you keep them separate.

- **Render phase** — React calls your component function. It runs your code top to bottom and gets
  back a tree of React elements (the return value of JSX). This is pure computation: no DOM is
  touched. React may run it, throw the result away, and run it again.
- **Commit phase** — React compares the new element tree with the previous one (see
  [reconciliation](fundamentals#reconciliation)) and applies the *minimum* set of real DOM mutations.
  Only here do `ref`s attach, the DOM change, and the browser paint.

The word "re-render" means **the render phase ran again** — your function was called. It does **not**
mean the DOM changed. A component can re-render hundreds of times and produce zero DOM mutations,
because the commit phase found nothing different to apply.

#### Why it matters

The cost of a re-render is real even when the commit is empty: React still calls your function, runs
your `useMemo`/`useState` hooks, allocates a new element tree, and diffs it. On a cheap component
that's negligible; multiplied across a large subtree that re-renders on every keystroke, it's the
single most common cause of a janky React app. Performance work in React is overwhelmingly about
**cutting re-renders that produce no commit**, not about making the DOM faster.

#### A concrete measurement

Ten parent state updates where a child's props never change. The child does no useful work on those
ten updates — but React still calls it, because **a parent re-render re-renders its children by
default**, props-changed or not.

| Child | Times its render phase ran (1 initial + 10 updates) |
|---|---|
| Plain function component | **11** |
| Wrapped in `React.memo` | **1** |

*Measured on a small reproduction (React 19, jsdom); your numbers differ in production. The ratio is
the point.* `React.memo` adds a props comparison and skips the render when props are shallow-equal —
turning 11 render-phase calls into 1.

> 🟡 **Optimization** — `React.memo` is not a default. It costs a props comparison on every parent
> render and only pays off when the child is expensive or renders often with stable props. On a cheap
> child it can cost more than it saves. Reach for it against a *measured* re-render problem, not
> preemptively. (The [React Compiler](react-practices#the-react-compiler-mature-not-new) automates
> most of this — same reproduction, same 11 → 1, no manual `memo`.)

#### The trap this explains: Context re-renders everyone

One context holding `{ a, b }`. Update **only `a`**, five times. A consumer that reads **only `b`**:

| Consumer | Times it re-rendered |
|---|---|
| `ConsumerA` (reads `a`) | 6 |
| `ConsumerB` (reads only `b`) | **6 — every update, all wasted** |

*Measured on a small reproduction (React 19, jsdom).* **Any** change to a context value re-renders
**every** consumer, regardless of which field it read — because from React's perspective the provider
re-rendered with a new value, so its consumer subtree re-renders. This is render-vs-commit in one
table: six wasted render-phase calls, zero of them producing a `b`-related DOM change. It's why
"just put it in Context" scales badly for high-frequency state, and why the fix is to split contexts
or use a selector store — covered in [state placement](state-management).

---

### Reconciliation

When a component re-renders, React holds two element trees: the one you just returned and the one
from last time. **Reconciliation** is the algorithm that turns the difference between them into the
smallest possible set of DOM operations. Understanding its two core rules explains a whole class of
"my component's state randomly reset" and "my input lost focus" bugs.

**Rule 1 — different element *type* at the same position ⇒ destroy and rebuild.** If position 0 was a
`<Profile>` last render and is a `<Settings>` this render, React does not try to reconcile them. It
unmounts `<Profile>` (running cleanup, discarding its state and DOM) and mounts a fresh `<Settings>`.
Same type ⇒ React keeps the existing instance and DOM node and just updates props.

**Rule 2 — children in a list are matched by `key`, or by position if no key is given.** The `key`
is how React answers "is this the same item as before, or a different one?" It is **identity**, not
ordering.

#### Why it matters

The thing React preserves or destroys during reconciliation is not just the DOM node — it's
everything attached to that node's position in the tree: `useState` values inside the component,
uncontrolled input contents, focus, scroll position, a running CSS transition, a video's playback
time. Get identity wrong and React silently reuses the wrong instance, carrying that hidden state
onto the wrong data.

#### A concrete bug: swapping types resets state

```tsx
// 🔴 The <input> is a DIFFERENT element type on each branch's position.
function Field({ editing }: { editing: boolean }) {
  return editing
    ? <input value={draft} onChange={...} />   // position 0 = <input>
    : <textarea value={draft} onChange={...} /> // position 0 = <textarea>
}
```

Toggling `editing` swaps `<input>` for `<textarea>` at the same position — different types, so
reconciliation destroys one and builds the other. Focus is lost and any DOM-level state (selection,
scroll) is gone. If instead both branches rendered the *same* type with different props, React would
keep the node and the focus. The mechanism is Rule 1, not a bug in your code.

#### A concrete bug: index-as-key

```tsx
// 🔴 key bound to list POSITION, not to the item
{todos.map((todo, i) => <TodoRow key={i} todo={todo} />)}
```

Type text into row 2's uncontrolled input, then delete row 1. Every surviving item shifts up one
index. React sees `key={0}` and `key={1}` still exist, so by Rule 2 it **reuses those instances** —
including the DOM node and its typed-in value — and simply feeds them the shifted `todo` props. The
text you typed against the *deleted* item now appears against a *surviving* one. Nothing throws;
tests with controlled inputs pass; production data corrupts.

```tsx
// ✅ key bound to the item's stable identity
{todos.map((todo) => <TodoRow key={todo.id} todo={todo} />)}
```

> 🟢 **Best practice** — keys must be **stable, unique, and tied to the item's identity**, not to its
> array index. Index-as-key is safe only when the list is append-only and never reordered, filtered,
> or spliced — rare enough that a real `id` is the right default. This is a correctness rule, not an
> optimization.

> 🔴 **Advanced / gotcha** — the same mechanism is a *feature*: changing a component's `key` forces a
> destroy-and-rebuild, which is the documented way to **reset all state** on a prop change, e.g.
> `<Profile key={userId} />`. Reach for it knowingly; it unmounts the whole subtree.

---

### Closures

Every render is a **snapshot**. When React calls your component, the props and state for that call are
fixed values, and every function you define during that call — event handlers, effect callbacks,
`setTimeout` bodies — closes over *those* values. It does not see a "current" value that updates
later; it sees the value from the render that created it. This is ordinary JavaScript closure
behavior, but React's re-render-on-every-update model makes it constant and surprising.

#### Why it matters

A closure created in render 1 keeps render 1's state forever. If that closure outlives the render —
because you stored it in a ref, registered it with `setInterval`, or gave stale
[dependencies](fundamentals#dependency-arrays) to an effect — it will read and act on data that is now
several renders out of date. That's the **stale closure**.

#### A concrete bug: the frozen interval

```tsx
// 🔴 count is frozen at 0 forever
function Counter() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setCount(count + 1) // `count` is the 0 captured on the first render
    }, 1000)
    return () => clearInterval(id)
  }, []) // empty deps: the effect (and its closure) is created once, on mount
  return <p>{count}</p>
}
```

The effect runs once on mount. The interval callback it created closes over `count === 0`. Every
second it computes `setCount(0 + 1)` — the counter jumps to 1 and sticks. It never sees 2, because the
callback was born in the first render and that render's `count` is permanently 0.

#### Two correct fixes

```tsx
// ✅ Fix A — functional updater: don't read the captured value at all.
setInterval(() => setCount((c) => c + 1), 1000)
// `c` is React's latest committed state, passed in — no stale capture.
```

```tsx
// ✅ Fix B — a ref holds a value that survives renders and is always current.
const countRef = useRef(count)
countRef.current = count // updated every render
useEffect(() => {
  const id = setInterval(() => setCount(countRef.current + 1), 1000)
  return () => clearInterval(id)
}, [])
```

> 🟢 **Best practice** — when the next state derives from the previous state, use the **functional
> updater** `setCount(c => c + 1)`. It sidesteps stale closures entirely and is correct even when
> updates batch. This is a default, not an optimization.

> 🔴 **Advanced / gotcha** — the ref-holds-latest pattern (Fix B, sometimes packaged as `useLatest`)
> is a real escape hatch, but a sharp one: a ref read during render is impure, and reading "latest"
> instead of "the value at the time this was set up" can hide the very bug you meant to fix. Use it
> when you deliberately want an always-current value inside a long-lived callback — not as a reflex to
> silence a lint warning.

---

### Dependency arrays

`useEffect`, `useMemo`, `useCallback`, and `useImperativeHandle` all take a dependency array. It
answers one question: **since the last render, did any input this code depends on change?** React
compares each entry to its previous value with `Object.is` (reference equality for objects and
functions, value equality for primitives). If every entry is unchanged, React skips the work — reuses
the memoized value, or does not re-run the effect. If any entry changed, it re-runs.

A dependency array is therefore the bridge between the two failure modes of the previous section:
**too few deps** freezes your closure (stale data — the interval bug); **unstable deps** re-runs the
work on every render (the effect that never stops firing).

#### Why it matters — and why `Object.is` is the whole story

Objects, arrays, and functions created *during render* are brand-new references every render, even
when their contents are identical. So they never compare equal by `Object.is`, and any effect or memo
that depends on one re-runs every single render — as if the dependency array weren't there.

```tsx
// 🔴 `options` is a new object every render → the effect re-subscribes on every render
function Chat({ roomId }: { roomId: string }) {
  const options = { serverUrl: 'https://chat', roomId } // new reference each render
  useEffect(() => {
    const conn = connect(options)
    return () => conn.disconnect()
  }, [options]) // Object.is(options_prev, options_next) is always false
}
```

Every render allocates a fresh `options`, so `Object.is` reports a change, so the effect tears down
and rebuilds the connection on every render — a reconnect storm the linter tried to warn you about.

#### The fix is usually to depend on primitives, not objects

```tsx
// ✅ Depend on the stable primitive, and construct the object inside the effect.
function Chat({ roomId }: { roomId: string }) {
  useEffect(() => {
    const conn = connect({ serverUrl: 'https://chat', roomId })
    return () => conn.disconnect()
  }, [roomId]) // a string: compares equal until it actually changes
}
```

Moving `options` *inside* the effect removes it from the dependency graph entirely; the only real
input is `roomId`, a primitive that only changes when the room changes.

> 🟢 **Best practice** — let `react-hooks/exhaustive-deps` fill the array, and never silence it by
> deleting a dependency. The honest fixes are: depend on primitives, move the object construction
> inside the effect, use a functional updater, or genuinely stabilize the reference (below). Lying to
> the dependency array is how you get the [stale closure](fundamentals#closures) bug.

> 🟡 **Optimization** — `useMemo`/`useCallback` exist to *stabilize a reference* so a dependency array
> sees it as unchanged. That's their real job — not "make this faster" but "keep `Object.is` happy for
> a downstream dep or a `React.memo` child." They cost an allocation and a comparison of their own, and
> under the React Compiler most become redundant. Add them when a measured re-render or a re-firing
> effect calls for it — see [React practices](react-practices#the-react-compiler-mature-not-new).

---

### Purity

A React component's render must be **pure**: given the same props, state, and context, it returns the
same JSX and causes **no observable side effects** while doing so. No mutating props or existing
state, no writing to module-level variables, no network calls, no DOM writes, no reading/writing a
ref for logic. Side effects belong in event handlers (in response to a user action) or in effects (to
synchronize with an external system) — never in the render body.

#### Why it matters — React *assumes* purity and acts on it

Purity is not politeness; React's execution model depends on it:

- React may call your render, **discard the result, and call it again** (concurrent features do this;
  it's how a render can be interrupted and restarted).
- **StrictMode double-invokes** render and effects in development specifically to surface impurity —
  if rendering twice produces different results or visible effects, you have an impure render.
- The **React Compiler** memoizes based on the assumption that render is pure. Impure code doesn't get
  "fixed" — it gets **silently skipped** by the compiler and quietly stays un-memoized, with no error.
  See [React practices](react-practices#render-must-be-pure).

Because React may run your render more than once and in an order you don't control, any side effect
you smuggle into it will fire an unpredictable number of times at an unpredictable moment.

#### A concrete bug: mutation during render

```tsx
// 🔴 mutates a prop during render — a correctness bug AND a compiler bailout
function Row({ user }: { user: User }) {
  user.lastSeen = Date.now() // side effect + mutation, in render
  return <div>{user.name}</div>
}
```

Under StrictMode this runs twice, writing `lastSeen` twice; under concurrent rendering it may run and
be thrown away, writing to an object another component still reads. The fix is to compute the value
where the data is owned and pass it in — render only reads.

```tsx
// ✅ pure: render reads its inputs and returns JSX, nothing else
function Row({ user }: { user: User }) {
  return <div>{user.name}</div>
}
```

#### The other common form: setState during render

Calling a setter unconditionally in the render body creates an infinite loop — the render schedules a
re-render, which renders, which schedules again. React throws "Too many re-renders." There is exactly
one legitimate form: setting a component's **own** state during render, **guarded** by a comparison,
to adjust state when a prop changes without an extra effect pass:

```tsx
// ✅ legal — own state, guarded so it runs only when `items` actually changed
const [prevItems, setPrevItems] = useState(items)
if (items !== prevItems) {
  setPrevItems(items)
  setSelection(null)
}
```

React discards the in-progress render and immediately re-renders with the new state — no commit, no
flicker. The guard is mandatory; without it, it loops forever.

> 🟢 **Best practice** — treat render as a pure function of (props, state, context). Mutate nothing,
> call nothing with side effects, read no refs for logic. This is the foundation the rest of the
> site's advice — keys, effects, the compiler — is built on. It is a correctness rule first; the
> performance payoff (compiler memoization) is a bonus that only exists because you followed it.

---

### How the five fit together

These aren't five topics; they're one chain. **Purity** lets React re-run **render** freely and lets
**reconciliation** trust that same-input means same-output. Reconciliation's identity rules (**keys**)
decide what survives a render. Each render is a **closure** snapshot, and the **dependency array** is
how you tell React which snapshots are still valid. Get one wrong and the symptom usually shows up in
another: an unstable dependency (deps) re-runs an effect that reconnects a subscription (render vs
commit); a missing dependency (deps) freezes a callback on old state (closures); an index key
(reconciliation) carries old component state (purity of the tree) onto new data. When a later page
says "this is a correctness rule," this is the machinery it's protecting.

---

### Sources

- https://react.dev/learn/render-and-commit
- https://react.dev/learn/preserving-and-resetting-state
- https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key
- https://react.dev/learn/removing-effect-dependencies
- https://react.dev/reference/rules/components-and-hooks-must-be-pure
- https://react.dev/reference/react/useState#storing-information-from-previous-renders
- Empirical, run locally 2026-07-18: render-count and Context fan-out reproductions on
  React 19.2.7 + `@testing-library/react` 16.3.2 (jsdom).

---

## React Practices

Version-agnostic rules that hold across React 17–19, verified against React 19.2.7,
`babel-plugin-react-compiler@1.0.0`, and `eslint-plugin-react-hooks@7.1.1` on a real install
(2026-07-18). The through-line: React shipped a compiler and a 29-rule lint plugin, and both of them
turned advice that used to be discipline into something a machine now enforces. Purity stopped being
an ideal and became a performance feature.

---

### You Might Not Need an Effect

This is the single highest-leverage rule in React, and as of `eslint-plugin-react-hooks@7` it is
machine-enforceable.

**The rule:** Effects are for **synchronizing with an external system** — a subscription, the DOM, a
network connection, a non-React widget. From react.dev, verbatim:

> "Use Effects only for code that should run *because* the component was displayed to the user."

If there is no external system, you almost certainly do not need an Effect. Most Effects in real
codebases exist to compute state from other state, or to react to a prop change, or to chain one
state update to the next — none of which involve an external system, all of which are bugs waiting to
fire.

**Why it exists:** an Effect runs *after* [render and commit](fundamentals#render-vs-commit). Anything
you do there that could have been done during render costs an extra render pass, and any state you set
from an Effect can tear — the user sees the intermediate value for one frame. Worse, Effect-derived
state drifts out of sync with its inputs the moment you add a new code path that forgets to update it.

**The failure it prevents:** stale UI, render flicker, infinite render loops (`setState` in an Effect
that depends on that state), and the whole category of "why is my data one keystroke behind" bugs.

> 🟢 **Best practice** — Reach for an Effect only to synchronize with an external system. Deriving
> state from other state, reacting to a prop change, or chaining state updates are correctness bugs,
> not optimizations to defer. This is a rule, not a tuning knob.

#### The rule you most want is off by default

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

> 🟢 **Best practice** — Enable `no-deriving-state-in-effects` explicitly. It is off in `recommended`,
> so its correctness value is opt-in; the cost of enabling it is near zero (it only fires on a genuine
> anti-pattern), which is exactly why it belongs on by default in your config even though the preset
> leaves it off.

#### The anti-patterns and their fixes

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

#### The "adjust during render" escape hatch is narrow

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

### The React Compiler: mature, not new

`babel-plugin-react-compiler@1.0.0` shipped **2025-10-07**. As of this writing it has been stable for
roughly nine months. Treat it as a mature, production tool — not a bleeding-edge experiment.

The win it buys, measured on a small reproduction (React 19, jsdom; your numbers will differ in
production): the *same un-memoized child* that renders **11 times** across 10 parent updates renders
**once** with the compiler on (`target: '19'`) — same 11→1 result you'd get from a hand-written
`React.memo`, but with zero source changes. The direction and ratio are the point, not the absolute
count.

> 🟡 **Optimization** — Turning the compiler on is a performance change, not a correctness one. Its
> leverage is real and broad, but it is downstream of [purity](fundamentals#purity): it silently
> skips any component it can't prove safe (see bailouts below), and it changes build output, so it
> earns the same "verify before you trust it" caution as any optimization.
>
> **Pros:** auto-memoization across the whole tree; memoizes cases `useMemo` legally can't; no manual
> dependency arrays to keep correct. **Cons:** bailouts are silent, so "compiler is on" ≠ "this
> component is memoized"; adds a Babel transform to the build; can change output if you later remove
> manual memo. **When NOT to use it:** if your code isn't lint-clean against the `recommended` purity
> rules, turn those on and fix violations *first* — an impure tree gets you the transform cost with
> few of the gains.

#### Do not mass-delete your `useMemo` / `useCallback`

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

> 🟢 **Best practice** — Do not mass-delete existing `useMemo`/`useCallback` when you turn the compiler
> on. This is a correctness rule, not a style preference: `preserve-manual-memoization` is
> error-level in `recommended` precisely because the compiler reads your manual memo as a semantic
> signal, and removing it can change compilation output.

**Net policy:**

- Turn the compiler **on**. Turn `eslint-plugin-react-hooks@7` `recommended-latest` **on**.
- Do **not** mass-delete existing `useMemo`/`useCallback`. Leave them.
- Write new code without manual memo. Reach for `useMemo` only for Effect-dep stability or measured
  precise control.
- `React.memo` at boundaries you don't compile (third-party children) still matters.

> 🟡 **Optimization** — `React.memo` skips a child's [re-render](fundamentals#render-vs-commit) when
> its props are shallow-equal to last time. Measured on a small reproduction (React 19, jsdom;
> production will differ): a child whose props never change dropped from **11 renders to 1** across 10
> parent updates once wrapped in `memo`.
>
> **Pros:** cuts wasted renders at a boundary the compiler doesn't reach. **Cons:** it runs a props
> comparison on *every* parent render, and only pays off when the child is expensive OR re-renders
> often with stable props. **When NOT to use it:** on a cheap child, or one whose props change every
> render (a fresh object/array/callback prop defeats the shallow compare) — there the comparison costs
> more than it saves. Under the compiler, don't hand-wrap components you already compile; save `memo`
> for third-party or otherwise-uncompiled children.

#### Never pin `@rc`

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

#### The compiler wins where `useMemo` legally cannot

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

#### Bailouts are silent — this is the gotcha that bites in production

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

#### The compiler is not React 19–only

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

### Render must be pure

Same inputs → same output, no side effects during render. This is the foundation the compiler stands
on, and it is enforced from three directions. See [purity](fundamentals#purity) for why React is free
to call, skip, or restart your render at any time — a guarantee that only holds if render is pure.

> 🟢 **Best practice** — Keep render pure: never mutate props, state, or module globals during render.
> This is a correctness rule first (React may call render any number of times), and under the compiler
> it is *also* the precondition for memoization — impurity isn't fixed by the compiler, it's silently
> punished by a bailout.

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

### Keys: identity, not order

The index-as-key bug is not about "wrong order." It is about **state and DOM identity being bound to
list position instead of to the item**. During [reconciliation](fundamentals#reconciliation) the key
is how React decides *which* previous instance a rendered element corresponds to; bind it to position
and React matches the wrong instances. It is invisible with pure-text children, which is exactly why
it survives code review and then corrupts data in production.

> 🟢 **Best practice** — Key list items by a stable identity (`todo.id`), not by array index. This is
> a correctness rule about instance identity, not a performance tweak.

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

### Server data is a cache, not state

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

> 🟢 **Best practice** — Keep server state in a cache (React Query, SWR, RSC, router loaders), never in
> `useState`. This is an architecture rule: `useState` + `useEffect` + `fetch` silently commits you to
> reimplementing caching, dedup, and revalidation by hand.

One of the things a query library or loader does for you is fan independent requests out in parallel.
Request-waterfall avoidance is measurable: three independent requests (simulated 200/180/220 ms) took
**604 ms** awaited one-by-one versus **221 ms** with `Promise.all` — measured on a small reproduction
(React 19, jsdom; production will differ). Parallel time ≈ the single slowest request; sequential ≈
their sum.

> 🟡 **Optimization** — Parallelize with `Promise.all` only when the requests are genuinely
> independent. **When NOT to use it:** if request B needs A's result, they *must* stay sequential —
> `Promise.all` would fire B with missing input. The library gives you the parallelism for free where
> it's safe; don't force it where a real data dependency exists.

> The `ignore`-flag Effect-fetch pattern in the docs is presented as **damage control** for when you
> have no framework — not as a recommendation. Don't cargo-cult it as *the* data-fetching pattern.

---

### State placement and composition

**Colocate state; lift only when it's shared.** Hoisting everything to the root is the number-one
cause of self-inflicted re-render storms — it widens the [re-render](fundamentals#render-vs-commit)
blast radius on every update. The compiler does not save you here — it memoizes values, it does not
restructure your tree.

**Composition beats configuration.** `<Card>{children}</Card>` beats
`<Card title icon action footerVariant>`. This is a performance pattern, not just an aesthetic one:
children passed as props are created in the **parent's** scope, so they don't re-render when the
wrapper's own state changes.

**Prop drilling → context → store, in that order.** Two levels of drilling is fine and *explicit*.
Reach for context when drilling gets deep, and a real store only when context can't keep up.

> 🟢 **Best practice** — Context is not a store. **Any** change to a context value re-renders **all**
> of its consumers, regardless of which field each one actually reads. Measured on a small
> reproduction (React 19, jsdom; production will differ): a context holding `{ a, b }`, with only `a`
> updated 5 times, still re-rendered a consumer that reads *only* `b` all **6 times — every render
> wasted**. Split contexts by update frequency, and put `dispatch` in its own context — `dispatch` is
> stable, so its consumers never re-render.

> 🔴 **Advanced / gotcha** — When consumers need different *slices* of the same high-frequency state,
> a single context can't help — even split, the value object changes on every update. Reach for a
> selector store (Zustand, Redux `useSelector`) that re-renders only the components whose selected
> slice actually changed. **When NOT to use it:** low-frequency or genuinely-shared-whole state —
> there a plain context is simpler and the store is overkill.

---

### Hooks, boundaries, and escape hatches

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

### Which lint rules are on by default

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

### Sources

- https://react.dev/learn/you-might-not-need-an-effect
- https://react.dev/blog/2025/10/07/react-compiler-1
- https://react.dev/reference/rules/components-and-hooks-must-be-pure
- https://react.dev/reference/react-compiler/target
- Empirical, run locally 2026-07-17: `babel-plugin-react-compiler@1.0.0`,
  `eslint-plugin-react-hooks@7.1.1`, `eslint@10.7.0`, and `npm view` dist-tags/timestamps.

---

## Design Principles for React

SOLID and its cousins were written for classes, but the *ideas* are about change: where it lands, how
far it spreads, and whether you can absorb it without editing working code. React has no classes worth
speaking of anymore — the units are **components, hooks, and modules** — so this page translates the
principles into those terms, with the bad-and-better code a reviewer would actually flag.

The goal is not to recite SOLID. It's to give you (and any tool reading these as a skill) a small set of
**named forces** to point at during design, so component APIs are chosen deliberately instead of guessed.

---

### Single Responsibility: one reason to change

A component or hook should have **one reason to change**. Not "do one thing" — that's too vague — but:
if two different kinds of requirement (a layout tweak and a data-format change) force edits to the same
function, it's carrying two responsibilities.

```tsx
// 🔴 Three reasons to change live in one component: fetching, formatting, and layout.
function UserCard({ id }: { id: string }) {
  const [user, setUser] = useState<User | null>(null)
  useEffect(() => {
    fetch(`/api/users/${id}`).then((r) => r.json()).then(setUser)
  }, [id])
  if (!user) return <Spinner />
  const name = `${user.first} ${user.last}`.trim()
  const joined = new Date(user.createdAt).toLocaleDateString()
  return <article className="card"><h3>{name}</h3><time>{joined}</time></article>
}
```

```tsx
// 🟢 Each layer changes for its own reason.
function useUser(id: string) {          // changes when fetching/caching changes
  return useQuery({ queryKey: ['user', id], queryFn: () => getUser(id) })
}
const fullName = (u: User) => `${u.first} ${u.last}`.trim()   // changes when naming rules change

function UserCard({ id }: { id: string }) {                    // changes when layout changes
  const { data: user } = useUser(id)
  if (!user) return <Spinner />
  return (
    <article className="card">
      <h3>{fullName(user)}</h3>
      <time>{formatDate(user.createdAt)}</time>
    </article>
  )
}
```

> 🟢 **Best practice** — extract a custom hook when a component mixes *how it gets data* with *how it
> looks*, and extract pure functions for *how it formats*. The test: can you change the date format
> without scrolling past JSX, and restyle the card without touching a `fetch`? If not, it's doing too
> much.

> 🟡 **Optimization** — don't over-split. A 30-line component that fetches and renders one thing has one
> reason to change in practice; shattering it into five files to "obey SRP" trades a real cost
> (indirection, jumping between files) for a principle it didn't violate. **When NOT to extract:** when
> the parts always change together anyway. SRP is about *independent* reasons to change, not line count.

---

### Open/Closed: extend without editing

Code should be **open to extension, closed to modification** — you add behavior by adding code, not by
editing a working component and risking its existing callers. In React the lever is almost always
**props and composition**, and the anti-pattern is almost always a growing `if`/`switch` on a `type`.

```tsx
// 🔴 Every new variant edits this component — and can break the existing ones.
function Button({ variant, ...props }: { variant: 'primary' | 'danger' | 'ghost' }) {
  if (variant === 'primary') return <button className="btn-primary" {...props} />
  if (variant === 'danger') return <button className="btn-danger" {...props} />
  if (variant === 'ghost') return <button className="btn-ghost" {...props} />
  return <button {...props} />
}
```

```tsx
// 🟢 Closed for modification: adding a variant is data, not a code edit to the component.
const VARIANTS = {
  primary: 'btn-primary',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
} as const

function Button({ variant = 'primary', className, ...props }:
  { variant?: keyof typeof VARIANTS } & React.ComponentProps<'button'>) {
  return <button className={clsx(VARIANTS[variant], className)} {...props} />
}
```

> 🟢 **Best practice** — when you feel the urge to add another branch to a component's `if`/`switch`,
> reach instead for a lookup table (data-driven), a new prop, or composition. Adding an entry to a map
> can't break the existing entries; editing a shared conditional can. This is the single most useful
> SOLID idea in day-to-day React.

See [Data-driven over conditional](#data-driven-over-conditional) below — it's OCP in its most common
React form.

---

### Liskov Substitution: honor the contract you extend

If a component accepts the props of an element or a base component, it must behave like one — a caller
who swaps your component in for a plain `<button>` shouldn't get surprised. The usual violation is
**swallowing the props a caller reasonably expects to pass through**.

```tsx
// 🔴 Looks like a button, isn't substitutable for one: no ref, no onKeyDown, no type, no aria-*.
function IconButton({ icon, onClick }: { icon: ReactNode; onClick: () => void }) {
  return <div className="icon-btn" onClick={onClick}>{icon}</div>
}
```

```tsx
// 🟢 Substitutable: forwards the native contract, so it drops in anywhere a <button> would.
const IconButton = ({ icon, ...props }: { icon: ReactNode } & React.ComponentProps<'button'>) => (
  <button className="icon-btn" {...props}>{icon}</button>
)
// keyboard, focus, disabled, aria-*, ref (React 19 ref-as-prop) all work because they pass through.
```

> 🟢 **Best practice** — when a component stands in for a native element, extend
> `React.ComponentProps<'button'>` (or `'input'`, `'a'`, …) and spread the rest through. You inherit
> accessibility, keyboard behavior, and `ref` for free, and callers can treat your component as the
> thing it claims to be. A `<div onClick>` that impersonates a button fails LSP *and* accessibility at
> once — see [the a11y notes](quality).

---

### Interface Segregation: no fat prop bags

Don't force a component to accept props it doesn't use, and don't make callers supply a giant config
object when they need three fields. A component that takes fifteen optional props is usually several
components wearing a trench coat.

```tsx
// 🔴 One component, one giant prop bag; callers pass undefined for the half they don't use.
<DataTable
  rows={rows} columns={cols} sortable filterable paginated exportable
  editable selectable virtualized stickyHeader onSort={...} onFilter={...}
  onExport={...} onEdit={...} onSelect={...} pageSize={20} density="compact"
/>
```

```tsx
// 🟢 Compose the capabilities you actually need; each part has a small, honest interface.
<DataTable rows={rows} columns={cols}>
  <DataTable.Toolbar><ExportButton /><DensityToggle /></DataTable.Toolbar>
  <DataTable.Pagination pageSize={20} />
</DataTable>
```

> 🟡 **Optimization** — the fat-props form is fine for a small, stable component; segregating a
> three-prop component is over-engineering. **When NOT to split:** until the prop list actually hurts —
> when callers routinely pass `undefined` for whole feature-groups, or when the props form obvious
> clusters (sorting props, pagination props). That clustering is the signal to break the interface up,
> often via [compound components](#polymorphism-in-react).

---

### Dependency Inversion: depend on abstractions, not concretions

High-level components shouldn't import low-level details directly; both should depend on an abstraction.
In React this is the difference between a component that `import`s a concrete API client (and now can't
be tested or reused) and one that receives its dependencies through **props, context, or a hook**.

```tsx
// 🔴 The component is welded to fetch + a URL + the shape of the response.
function Notifications() {
  const [items, setItems] = useState([])
  useEffect(() => {
    fetch('https://api.acme.com/v2/notifications', { headers: authHeaders() })
      .then((r) => r.json()).then(setItems)
  }, [])
  return <List items={items} />
}
```

```tsx
// 🟢 Depends on an abstraction (a hook); the transport is swappable and the component is testable.
function Notifications() {
  const { data: items = [] } = useNotifications()   // could be REST, GraphQL, a mock in tests
  return <List items={items} />
}
```

> 🟢 **Best practice** — put I/O and third-party SDKs behind a hook or a small module boundary, and let
> components depend on that seam. Tests inject a fake, the transport can change (REST → GraphQL → RSC
> loader) without touching the UI, and the component's dependency is a *name*, not a *URL*. This is the
> [Data Layer](data-layer) principle stated as a design rule.

> 🔴 **Advanced / gotcha** — Context is the DIP tool for cross-cutting dependencies (the current user,
> a theme, an API client), but every value change re-renders every consumer — see the measured
> [fan-out on the state page](state-management). Invert dependencies through context for things that
> change *rarely*; for hot dependencies, pass a stable object or use a selector store.

---

### Composition over configuration

The most React-specific principle, and the one that resolves most "how should this component's API
look" arguments: prefer **giving components to a component** (`children`, slots, render props) over
**giving it flags that describe what to render**. Configuration props multiply (`showHeader`,
`headerText`, `headerIcon`, `headerAlign`…); composition doesn't.

```tsx
// 🔴 Configuration creep — every new header need is another prop.
<Modal title="Delete?" showCloseButton closeIcon={<X/>} footerAlign="right"
       confirmText="Delete" cancelText="Keep" danger onConfirm={...} onCancel={...} />
```

```tsx
// 🟢 Composition — the caller supplies structure; the Modal supplies behavior.
<Modal onClose={close}>
  <Modal.Header>Delete?</Modal.Header>
  <Modal.Body>This can't be undone.</Modal.Body>
  <Modal.Footer>
    <Button variant="ghost" onClick={close}>Keep</Button>
    <Button variant="danger" onClick={onConfirm}>Delete</Button>
  </Modal.Footer>
</Modal>
```

> 🟢 **Best practice** — when a prop exists only to control *what* a component renders (`showX`,
> `xText`, `xPosition`), that's usually a slot in disguise. Hand the caller `children` or named slots
> and let them compose. You stop predicting every need, and the component's API stops growing.

> 🟡 **Optimization** — composition has a cost: a fully-composable `<Modal.Header/.Body/.Footer>` is
> more ceremony than `<Modal title=…/>` for the 90% case. **When NOT to:** for a component with one
> obvious shape and no variation, a couple of props are clearer than compound children. Offer
> composition when variation *appears*, not preemptively.

---

### Polymorphism in React

"Same interface, different behavior" shows up in React as a few concrete patterns. Reach for them
instead of duplicating components or branching on a `type`.

**The `as` / polymorphic prop** — one component, many rendered elements, same styling contract:

```tsx
// 🟢 <Text as="h1">, <Text as="label">, <Text as="span"> — one API, correct semantics each time.
function Text<E extends React.ElementType = 'span'>(
  { as, ...props }: { as?: E } & React.ComponentPropsWithoutRef<E>,
) {
  const Tag = as ?? 'span'
  return <Tag {...props} />
}
```

**Compound components** — a family that shares implicit state through context (`<Tabs><Tab/></Tabs>`),
the polymorphic answer to a fat prop bag.

**Render props / children-as-function** — the caller supplies the behavior for each item:

```tsx
// 🟢 <List items={users}>{(u) => <UserRow user={u} />}</List> — List owns iteration, caller owns the row.
function List<T>({ items, children }: { items: T[]; children: (item: T) => ReactNode }) {
  return <ul>{items.map((it, i) => <li key={keyOf(it) ?? i}>{children(it)}</li>)}</ul>
}
```

> 🔴 **Advanced / gotcha** — a polymorphic `as` component is genuinely advanced to *type* well
> (`ElementType`, `ComponentPropsWithoutRef`, forwarding `ref` across the generic). It's a 🔴 tool:
> reach for it for a real design-system primitive (`Text`, `Box`, `Button`), not for a one-off. For a
> single component that occasionally renders an `<a>` vs a `<button>`, a plain conditional is simpler
> and honest. See [typing generic/polymorphic components](ts-react).

---

### Data-driven over conditional

The everyday form of Open/Closed. When rendering branches on a value, a **lookup table or a config
array** is usually clearer than an `if`/`switch` ladder, and it's closed for modification — new cases
are new data.

```tsx
// 🔴 Adding a status means editing this ladder and hoping the others still work.
function StatusBadge({ status }: { status: Status }) {
  if (status === 'active') return <Badge color="green">Active</Badge>
  if (status === 'pending') return <Badge color="amber">Pending</Badge>
  if (status === 'closed') return <Badge color="gray">Closed</Badge>
  return null
}
```

```tsx
// 🟢 New status = new row. The component never changes.
const STATUS: Record<Status, { color: string; label: string }> = {
  active: { color: 'green', label: 'Active' },
  pending: { color: 'amber', label: 'Pending' },
  closed: { color: 'gray', label: 'Closed' },
}
function StatusBadge({ status }: { status: Status }) {
  const s = STATUS[status]
  return s ? <Badge color={s.color}>{s.label}</Badge> : null
}
```

> 🟢 **Best practice** — a `Record<Key, Config>` typed by a union gives you exhaustiveness for free:
> add a member to `Status` and TypeScript flags the table as incomplete. Conditionals give you no such
> safety. This is the pattern to prefer for variants, routes, feature flags, and form-field registries.

> 🟡 **Optimization** — a two-branch conditional is not a crisis; don't build a config system for an
> `isLoggedIn ? … : …`. The table earns its keep at ~3+ cases, when the branches share a shape, or when
> the set will grow. **When NOT to:** genuinely divergent branches that share no structure — force-fitting
> those into a table obscures more than it saves.

---

### How to use these

These aren't a checklist to satisfy; they're **forces to name**. In review, instead of "this feels
off," you can say *"this fails Open/Closed — a new variant edits shared code"* or *"this is a fat
interface; segregate it into compound components."* Precise names make the fix obvious and make
disagreements about design concrete instead of aesthetic.

The through-line: **push change to the edges.** Data-driven tables, composition, and dependency
inversion all do the same thing — they turn "edit working code and hope" into "add new code that
can't break the old." That's the whole game.

### Sources

- [react.dev — Thinking in React, Passing props, Passing data with context](https://react.dev/learn)
- [react.dev — Reusing logic with custom hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- Robert C. Martin, *the SOLID principles* (original class-oriented framing) — translated to components here.
- [Kent C. Dodds — Compound components / inversion of control patterns](https://kentcdodds.com/blog)
- [React TypeScript Cheatsheet — polymorphic components](https://react-typescript-cheatsheet.netlify.app/)

---

## TypeScript with React 19

Typing props, children, events, refs, hooks, and generic/polymorphic components against
`@types/react@19`. This page targets the verified stack: **React 19.2.7**, **`@types/react` 19.2.17**,
**TypeScript 7.0.2**. Every rule below was checked against a real `tsc` run — the specific error
codes are the ones the compiler actually emits, not the ones the internet remembers.

`@types/react@19` shipped four breaking type changes that will not surface until you compile: implicit
`children` is gone, the global `JSX` namespace moved, `useRef()` requires an argument, and
`ReactElement.props` defaults to `unknown`. None of them are runtime changes, so tests pass and the app
runs — the failure is a wall of `tsc` errors on upgrade. Read the four, run the codemod, then adopt the
patterns.

---

### Type strictness is already on — stop asserting it

`strict` is the default in TypeScript 6 and 7. A tsconfig generated by `npm create vite` in 2026
contains **no `"strict": true`** line, yet `noImplicitAny`, `strictNullChecks`, and the rest fire
anyway — `tsc --showConfig` reports them as `<unset>` while the compiler enforces them.

```ts
// With NO strict flag in tsconfig, TS 7 still rejects both of these:
export function f(x) { return x.length }          // TS7006: Parameter 'x' implicitly has an 'any' type
export function g(s: string | null) { return s.length } // TS18047: 's' is possibly 'null'
```

The single most-repeated piece of TypeScript advice — "always set `strict: true`" — is now redundant
boilerplate on a modern config. What is **not** on by default, and is still worth opting into
deliberately:

```jsonc
{
  "compilerOptions": {
    "noUncheckedIndexedAccess": true,      // arr[i] is T | undefined, not T
    "exactOptionalPropertyTypes": true     // { x?: number } rejects { x: undefined }
  }
}
```

> 🟢 **Best practice** — turn these two on in a new project. They close soundness holes `strict`
> deliberately leaves open (array/index access and the `undefined`-vs-absent distinction), so the
> compiler catches a class of `undefined` bugs before runtime does.

**Tradeoffs.** _Pros:_ every `arr[i]` and every optional property now forces you to handle the
missing case, turning a category of runtime `TypeError` into a compile error. _Cons:_ real friction
on existing code — `noUncheckedIndexedAccess` makes every indexed read `T | undefined`, which is
noisy in hot loops and tuple-heavy code where you know the index is in range. **When NOT to use it:**
enabling both on a large legacy codebase mid-migration floods you with thousands of errors unrelated
to the React 19 upgrade you are actually doing. Land the `@types/react@19` errors first, then adopt
these deliberately, module by module.

> The default flipped in the compiler, not in the config file. `showConfig` prints `<unset>` for
> `strict` while behaviour is strict, which trips people writing tooling that reads the effective
> config. Trust the compiler's behaviour, not the printed config.

---

### The four `@types/react@19` breaking changes

All four verified with `tsc 7.0.2` + `@types/react 19.2.17`, `strict`, `jsx: react-jsx`. Real output:

```
src/a.tsx(4,46): error TS2339: Property 'children' does not exist on type '{ title: string; }'.
src/a.tsx(6,12): error TS2503: Cannot find namespace 'JSX'.
src/a.tsx(10,14): error TS2554: Expected 1 arguments, but got 0.
src/a.tsx(17,11): error TS18046: 'e.props' is of type 'unknown'.
```

#### 1. Implicit `children` is gone from `FC`

**Why:** `React.FC` used to inject `children?: ReactNode` into every component's props whether or not
the component rendered children. That silently accepted children on leaf components that ignored them.
`@types/react@19` removed the injection. **The failure it prevents:** passing children to a component
that drops them on the floor is now a type error instead of a silent bug.

```tsx
// BAD — TS2339: Property 'children' does not exist on type '{ title: string; }'
const Card: FC<{ title: string }> = ({ title, children }) =>
  <section>{title}{children}</section>;

// GOOD — declare children explicitly
type CardProps = { title: string; children?: ReactNode };
function Card({ title, children }: CardProps) {
  return <section><h2>{title}</h2>{children}</section>;
}
```

Prefer dropping `FC` entirely (see [Generic components](#generic-components-are-why-fc-has-to-go)). A
plain function with an explicit props type is now strictly better: it does not inject phantom
`children`, and it does not block generics — the two things `FC` used to do are one bug and one
limitation.

> 🟢 **Best practice** — type components as plain functions with an explicit props type, not `FC`.
> This is a maintainability/correctness rule, not an optimization: it costs nothing at runtime and
> removes the phantom-`children` footgun. The only thing you give up is `FC`'s implicit return-type
> annotation, which inference already supplies.

#### 2. The global `JSX` namespace moved to `React.JSX`

**Why:** the types stopped declaring a global `namespace JSX`. It now exists exactly once, scoped under
`React`. **The failure it prevents:** two libraries each augmenting a global `JSX` used to collide;
scoping it under `React` removes the global mutable surface.

```tsx
// BAD — TS2503: Cannot find namespace 'JSX'
const el: JSX.Element = <div />;

// GOOD
const el: React.JSX.Element = <div />;
```

> The bite in production: custom-element typing via `declare global { namespace JSX { interface
> IntrinsicElements { … } } }` **silently stops applying** — no error, your custom tags just fall back
> to `any` or error as unknown. Augment `React.JSX` instead:
>
> ```tsx
> declare global {
>   namespace React {
>     namespace JSX {
>       interface IntrinsicElements {
>         'my-widget': { count?: number };
>       }
>     }
>   }
> }
> ```

#### 3. `useRef` now requires an argument

**Why:** the old zero-arg overload returned a `MutableRefObject<T | undefined>` while the one-arg form
returned a read-only `RefObject<T>` — same call, different mutability, a constant source of confusion.
`@types/react@19` ships only three overloads and **all three take an argument**:

```ts
function useRef<T>(initialValue: T): RefObject<T>;
function useRef<T>(initialValue: T | null): RefObject<T | null>;
function useRef<T>(initialValue: T | undefined): RefObject<T | undefined>;
```

```tsx
// BAD — TS2554: Expected 1 arguments, but got 0
const id = useRef<number>();

// GOOD — the type argument must INCLUDE undefined, and you must pass undefined
const id = useRef<number | undefined>(undefined);

// DOM refs are unchanged in shape:
const node = useRef<HTMLDivElement | null>(null);
```

> `useRef<number>(undefined)` does **not** typecheck. The overload only infers
> `RefObject<T | undefined>` when `T` itself permits `undefined`, so the type argument has to be
> `number | undefined`, not bare `number`. This is the single most common mechanical edit on a React 19
> type upgrade — the codemod handles it.

#### 4. `ReactElement.props` defaults to `unknown` (was `any`)

**Why:** `any` on element props let you read `element.props.whatever` with zero checking. The default is
now `unknown`, forcing you to type the element. **The failure it prevents:** `React.Children.map` /
`cloneElement` code that blindly reached into `.props` was unsound; now it will not compile until you
say what the props are.

```tsx
// BAD — TS18046: 'e.props' is of type 'unknown'
const e: React.ReactElement = <div className="x" />;
e.props.className;

// GOOD — parameterize the element's props
const e: React.ReactElement<{ className?: string }> = <div className="x" />;
e.props.className; // ok
```

This is the quiet one. It does not show up in ordinary component code — it bites `cloneElement`-heavy
libraries, render-prop plumbing, and anything walking `React.Children`.

---

### Run the codemod, don't hand-edit

`types-react-codemod` (latest **3.5.3**) ships jscodeshift transforms for exactly the four changes
above plus the deprecated-type renames. Run it before touching anything by hand:

```bash
npx types-react-codemod@latest preset-19 ./src
```

> 🟢 **Best practice** — run the codemod before hand-editing. The four breaking changes are mostly
> mechanical, and the `useRef` fix alone touches every ref site in the codebase; a jscodeshift pass is
> both faster and more consistent than a human sweep. It only clears the mechanical bulk, so treat the
> `tsc` errors that remain as the real work, not as codemod failures.

Individually useful transforms inside that preset:

| transform | fixes |
|---|---|
| `useRef-required-argument` | breaking change #3 — inserts the missing argument |
| `scoped-jsx` | breaking change #2 — rewrites `JSX.X` to `React.JSX.X` |
| `deprecated-react-type` | renames deprecated `React.*` types (e.g. `ReactChild`, `VoidFunctionComponent`) |
| `context-any-types`, `element-ref` | assorted `any`→`unknown` and ref-type fallout |

The codemod cannot fix implicit `children` (#1) or `props: unknown` (#4) in every case — those need a
human to decide the actual type — but it clears the mechanical bulk so the remaining `tsc` errors are
the ones worth reading.

> 🔴 **Advanced / gotcha — the `npx tsc` decoy footgun.** When verifying an upgrade, run the project-local binary:
> `./node_modules/.bin/tsc`, never bare `npx tsc`. In a directory without `node_modules`, `npx tsc` can
> resolve to a **decoy package** that prints `This is not the tsc command you are looking for` — and in
> at least one observed case emitted a plausible `Version 7.0.2` banner plus **four fabricated type
> errors for files that did not exist**, errors that happened to match the textbook expectation exactly.
> A green-looking `tsc` run proves nothing until you confirm `node_modules/typescript` is actually
> installed and you invoked *that* binary. Treat it as a supply-chain-shaped trap, not a curiosity.

---

### Ref mutability and `forwardRef`

`RefObject<T>` is now a single mutable interface — `{ current: T }`, **not** readonly:

```ts
interface RefObject<T> { current: T; }
```

So `ref.current = null` on a `useRef<HTMLDivElement>(null)` typechecks. The JSDoc comment shipped
directly above `RefObject` still shows `ref.current = …; // Error` — **that comment is stale**; the type
disagrees with its own doc. Trust the type.

`MutableRefObject` **still exists**, marked `@deprecated Use RefObject instead`. Deprecated is not
removed — existing code that references it compiles.

#### `ref` is a plain prop now — `forwardRef` is optional

In React 19 a function component can accept `ref` as an ordinary prop. No `forwardRef` wrapper:

```tsx
// GOOD — React 19: ref as a normal prop
function TextInput({ ref, ...props }: ComponentPropsWithoutRef<'input'> & {
  ref?: React.Ref<HTMLInputElement>;
}) {
  return <input ref={ref} {...props} />;
}
```

`forwardRef` is **deprecated** in React 19 but **not removed** — it still compiles and still works. Do
not tell people it errors. Migrate at your leisure; the codemod does not force it.

> 🟢 **Best practice** — in new React 19 components, accept `ref` as a plain prop instead of reaching
> for `forwardRef`. The reason it can be a plain prop at all is that a ref never participates in
> rendering — reading or writing `ref.current` happens at [commit, not
> render](fundamentals#render-vs-commit), so passing it like any other prop is sound. Since
> `forwardRef` still works, this is a low-priority migration: convert on touch, not in a big-bang
> sweep.

---

### Extending host element props

Reach for `ComponentPropsWithoutRef<'tag'>` when wrapping a DOM element. It gives you every native
attribute of that element, correctly typed, so consumers get `onClick`, `aria-*`, `data-*`, and the
rest for free.

```tsx
type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: 'primary' | 'ghost';
};

function Button({ variant = 'primary', ...rest }: ButtonProps) {
  return <button data-variant={variant} {...rest} />;
}
```

> 🟢 **Best practice** — extend `ComponentPropsWithoutRef<'tag'>` when wrapping a host element rather
> than re-declaring `onClick`, `className`, `aria-*` by hand. Hand-listing attributes is where wrapper
> components silently drop the one prop a consumer needs; deriving from the element keeps the surface
> complete and correct for free.

> Why `WithoutRef` and not plain `ComponentProps<'button'>`: the plain form drags in a `ref` field, and
> its type was wrong for function components before React 19. `ComponentPropsWithoutRef` is still the
> right default even in 19 — if the component needs to forward a ref, add `ref?: Ref<T>` yourself
> explicitly (see above), which keeps the ref type under your control.

---

### Typing events

Let React infer the event type from the handler position rather than annotating it. When you must name
the type, use the specific `React.*Event` generic parameterized by the element:

```tsx
function SearchBox() {
  // e is correctly React.ChangeEvent<HTMLInputElement>
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log(e.currentTarget.value);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
  };

  return (
    <form onSubmit={onSubmit}>
      <input onChange={onChange} />
    </form>
  );
}
```

> 🟢 **Best practice** — prefer `e.currentTarget` over `e.target`. `currentTarget` is typed as the
> element the handler is attached to, while `target` is the more general `EventTarget` and needs a
> cast to reach `.value`. Reaching for a cast to silence the error is the trap: the cast can lie at
> runtime (`target` may be a descendant element), so the typed `currentTarget` is the safer read as
> well as the cleaner one.

---

### Hooks: discriminated unions and `as const`

#### Model async state as a discriminated union

A single `status` discriminant lets the compiler narrow `data`/`error` for you — no `data!` non-null
assertions, no "loading but data is also set" impossible states.

> 🟢 **Best practice** — model async state as a discriminated union rather than parallel
> `isLoading` / `data` / `error` booleans. Independent flags admit contradictory combinations
> (`isLoading: true` _and_ `data` present) that the compiler cannot rule out; a `status` discriminant
> makes those states unrepresentable and narrows `data`/`error` at each branch, deleting the `data!`
> assertions that would otherwise paper over the gap.

```tsx
type State<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'err'; error: Error };

function view(s: State<string>) {
  switch (s.status) {
    case 'ok':  return s.data;   // narrowed: data exists here
    case 'err': return s.error.message;
    default:    return null;     // data/error not accessible — correct
  }
}
```

#### `as const` on tuple returns from custom hooks

Without `as const`, a returned array widens to a union-element array and destructuring loses the
per-position types.

```tsx
function useThing() {
  const [s, set] = useState<State<string>>({ status: 'idle' });
  return [s, set] as const;
  // WITHOUT as const → (State<string> | Dispatch<SetStateAction<State<string>>>)[]
  //   — both destructured names collapse to that union, which is useless.
}
```

#### Context without the null hack

Wrap `createContext<T | null>(null)` in a factory that throws when consumed outside its provider. The
throw narrows the return type to `T`, so consumers never see `null`:

```tsx
function makeCtx<T>(name: string) {
  const Ctx = createContext<T | null>(null);
  function use() {
    const v = useContext(Ctx);
    if (v === null) throw new Error(`use${name} must be used inside ${name}Provider`);
    return v; // narrowed to T
  }
  return [use, Ctx.Provider] as const;
}
```

> 🟢 **Best practice** — hide the nullable default behind a hook that throws. Typing the context as
> `createContext<T | null>(null)` is honest (there _is_ no value outside a provider), but forcing every
> consumer to null-check is noise. The throwing hook narrows the return to `T` at one chokepoint and
> converts a silent "used outside provider" bug into a loud, located error.

---

### Generic components are why `FC` has to go

`React.FC` cannot express a generic component — the type parameter has nowhere to live. A plain function
declaration can, and it is the idiomatic way to type a `List`, `Select`, `Table`, or any component whose
props are parameterized by an item type.

```tsx
// A generic list — impossible to type cleanly with FC
function List<T>({ items, render }: {
  items: readonly T[];
  render: (item: T) => ReactNode;
}) {
  return <ul>{items.map((it, i) => <li key={i}>{render(it)}</li>)}</ul>;
}

// Usage — T is inferred as User from items
<List items={users} render={(u) => <span>{u.name}</span>} />;
```

The `key={i}` above is fine only because this minimal `List` never reorders. If `items` can be
reordered, inserted into, or filtered, derive the key from a stable id on the item — an index key
makes [reconciliation](fundamentals#reconciliation) match the wrong element to the wrong DOM node and
carries state (focus, input values) to the wrong row.

This is the concrete payoff of the `children` change: since a plain function no longer loses implicit
`children` versus `FC`, there is no remaining reason to use `FC`, and dropping it unlocks generics.

#### Polymorphic components (the `as` prop)

A component that can render as different elements needs its props to follow the chosen element. The
canonical typing uses a generic constrained to `ElementType` plus `ComponentPropsWithoutRef`:

```tsx
type BoxProps<E extends React.ElementType> = {
  as?: E;
  children?: ReactNode;
} & Omit<React.ComponentPropsWithoutRef<E>, 'as' | 'children'>;

function Box<E extends React.ElementType = 'div'>({ as, ...rest }: BoxProps<E>) {
  const Tag = as ?? 'div';
  return <Tag {...rest} />;
}

// href is valid here because as="a" pulls in anchor props:
<Box as="a" href="/home">Home</Box>;
// href here would be a type error — button has no href:
<Box as="button" onClick={() => {}}>Go</Box>;
```

> 🔴 **Advanced / gotcha** — the `as`-prop pattern is a sharp tool. The generic-over-`ElementType`
> typing above compiles, but the full version (correct `ref` forwarding per element, prop-collision
> handling, default-element inference) is one of the hardest things to type in React, and the error
> messages it produces when a consumer gets it wrong are notoriously opaque.
>
> **Tradeoffs.** _Pros:_ one component covers `a`/`button`/`div` with element-correct prop checking —
> `href` allowed under `as="a"`, rejected under `as="button"`. _Cons:_ every maintainer now has to
> understand the generic machinery to change the component, and the inferred types slow the editor on
> large prop unions. **When NOT to use it:** if you have two or three concrete variants, ship two or
> three plain components instead — the polymorphism is not worth the typing cost. And if a library in
> your stack (MUI, Radix) already ships a polymorphic primitive, use it rather than re-deriving the
> `as`-prop machinery; the edge cases around `ref` types and prop collisions are a well-known time
> sink.

---

### Does TypeScript 7 change any of this?

**No — TS 7 does not change React typing semantics.** The identical four `@types/react@19` errors appear
under `tsc 7.0.2`, and a file exercising `ComponentPropsWithoutRef`, generic components, `as const`
hook returns, discriminated-union state, the context factory, and ref-as-prop typechecks clean
(`EXIT=0`) under `strict`, `moduleResolution: bundler`, `jsx: react-jsx`.

What TS 7 **does** change is the config surface. TS 7 is the native Go port ("Project Corsa"), and it
**removed compiler options** that legacy React configs still carry. These fail before any file is
checked:

| removed / changed in TS 7 | error | note |
|---|---|---|
| `moduleResolution: "node"` (a.k.a. node10, classic) | TS5108 | only `bundler`, `node16`, `nodenext` remain |
| `target: "ES5"` | TS5108 | valid list is `es6`/`es2015` … `es2025`/`esnext` |
| `module: "UMD"` / `"System"` / `"AMD"` | TS5108 | |
| `outFile` | TS5102 | |

The one that bites the migration audience hardest is `moduleResolution: "node"` → **TS5108** (some
setups report TS5109). A legacy CRA/webpack React app carrying `"moduleResolution": "node"` and
`"target": "es5"` **cannot run `tsc` at all** under TS 7 until the tsconfig moves to
`"bundler"`/`"node16"`/`"nodenext"` and a modern target. This is a hard compile failure, not a warning,
and it fires before any React error does.

> 🔴 **Advanced / gotcha** — on TS 7 the config surface breaks _before_ any of the four
> `@types/react@19` errors can appear. A legacy React app inherits `moduleResolution: "node"` and
> `target: "es5"`, and `tsc` refuses to check a single file until they are removed (TS5108). Sequence
> the migration accordingly: fix the tsconfig, get `tsc` running, _then_ let the React type errors
> surface. Chasing the codemod first on TS 7 just means staring at a compiler that never got far
> enough to look at your components.

> **`@types/react` version resolution under TS 7.** `@types/react` publishes dist-tags `ts5.0`…`ts6.0`
> but **no `ts7.0` tag** — TS 7 consumers resolve `latest` (19.2.17). The `typesVersions` redirect in
> the package only rewrites paths for TS ≤ 5.0. In practice 19.2.17 is a single codebase serving
> TS 5.4 through TS 7, and its only runtime dep is `csstype ^3.2.2` — `@types/prop-types` is gone.

> **Readiness note, stated honestly.** The official `npm create vite -- --template react-ts` template
> still pins `typescript: ~6.0.2`, one major behind `latest` (7.0.2). TS 7 works with the full React 19
> + `@types/react` 19.2.17 stack — verified — and measured ~2.7x faster on a small project's
> `tsc --noEmit` (a startup-dominated floor, not a scaling claim). But if you are on TS 6, you are not
> wrong; the ecosystem default is deliberately conservative here.

---

### Checklist

- Run `npx types-react-codemod@latest preset-19 ./src` before manual edits.
- Drop `React.FC`; use plain functions with explicit props types. Declare `children?: ReactNode` only
  when the component renders children.
- Replace `JSX.X` with `React.JSX.X`; augment `React.JSX`, not the old global `JSX`.
- `useRef<T>()` → `useRef<T | undefined>(undefined)`; DOM refs stay `useRef<T | null>(null)`.
- Parameterize `ReactElement<Props>` anywhere you read `.props`.
- Extend host elements with `ComponentPropsWithoutRef<'tag'>`; add `ref?: Ref<T>` explicitly if needed.
- Do not add `"strict": true` — it is the TS 6/7 default. Do add `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`.
- Verify with `./node_modules/.bin/tsc`, never bare `npx tsc`.
- On TS 7, purge `moduleResolution: "node"` and `target: "es5"` from any inherited tsconfig first.

### Sources

- React 19 upgrade guide — https://react.dev/blog/2024/04/25/react-19-upgrade-guide
- `types-react-codemod` — https://github.com/eps1lon/types-react-codemod
- `@types/react` (DefinitelyTyped) — https://www.npmjs.com/package/@types/react
- React `ref` as a prop — https://react.dev/reference/react/forwardRef
- TypeScript 7 / native port ("Project Corsa") — https://devblogs.microsoft.com/typescript/typescript-native-port/
- React + TypeScript cheatsheet — https://react-typescript-cheatsheet.netlify.app/

---

## Where State Should Live

Most React state problems are *placement* problems. State that lives too low can't be shared; state
that lives too high re-renders half the app on every keystroke. This page is a **ladder**: start at
the lowest rung that works, and climb exactly one rung when a concrete pressure forces you to — never
more. The single most expensive mistake in React state management is skipping straight to the top
rung (a global store) "to be safe."

Verified stack as of 2026-07-18: React 19.2.7, TypeScript 7.0.2. Measured figures below come from a
small reproduction (React 19, jsdom); the *ratio and direction* are the point, not the absolute
numbers — your production numbers will differ.

Before anything else, one distinction decides half your architecture:

- **Server state** — data owned by a server, shared across clients, stale the instant you read it
  (user profiles, product lists, search results). This is a *cache*, not state. It does **not** go on
  this ladder. It goes to React Query / SWR / an RSC framework loader. See the [Data Layer](data-layer)
  page. Putting server data in `useState` means hand-reimplementing caching, dedup, revalidation, and
  race handling — badly.
- **Client state** — data owned by *this UI* and authoritative here (which modal is open, a wizard's
  current step, a hover). This is what the ladder below is for.
- **URL state** — anything a user should be able to bookmark, share, or reload into: the current
  filters, the search query, the active tab, the page number. This belongs in the address bar
  (`useSearchParams`), **not** `useState`. See below.
- **Form state** — a form's draft values, dirty/touched flags, and validation. It has its own tools
  (React Hook Form + Zod); see the [Forms](forms) page. Don't lift every keystroke into global state.

> 🟢 **Best practice** — classify every piece of state as *server*, *client*, *URL*, or *form* before
> deciding where it lives. The two most common mistakes are putting **server** data in `useState` (the
> root of most "React is slow / my data is stale" complaints) and putting **URL** state there (the root
> of "I can't share a link to this filtered view").

#### URL state — the category everyone forgets

If losing a value on refresh would annoy the user, or they'd reasonably want to share a link to it, it
is URL state. Filters, sort order, the open tab, pagination, a search term — all of it. Storing these in
`useState` makes them un-bookmarkable, un-shareable, and gone on reload.

```tsx
// 🔴 The filter is trapped in the component; refresh loses it, and you can't share the view.
const [status, setStatus] = useState('open')

// 🟢 The URL is the source of truth: bookmarkable, shareable, survives reload, back-button works.
import { useSearchParams } from 'react-router-dom'
const [params, setParams] = useSearchParams()
const status = params.get('status') ?? 'open'
const setStatus = (s: string) => setParams((p) => { p.set('status', s); return p }, { replace: true })
```

> 🟡 **Optimization** — use `{ replace: true }` for high-frequency updates (typing in a search box) so
> you don't push a history entry per keystroke and break the back button. **When NOT to use URL state:**
> ephemeral, non-shareable UI (a dropdown's open/closed, a hover) — that's plain client state; putting it
> in the URL just makes ugly links. The test is "would a user want to bookmark or share this?"

---

### The ladder at a glance

| Rung | Mechanism | Reach for it when | Cost you take on |
|---|---|---|---|
| 1 | **`useState`, colocated** | State is used by one component | None. This is the floor. |
| 2 | **Lifted `useState`** | Two siblings need the same value | Parent re-renders; some prop drilling |
| 3 | **`useReducer`** | Many related transitions, next-state-depends-on-prev | A reducer + action types to maintain |
| 4 | **Context** | A value is needed deep, by many, and changes *rarely* | Every consumer re-renders on any change |
| 5 | **External store** (Zustand / Redux Toolkit / Jotai) | High-frequency or app-wide state read by scattered consumers who each need a *slice* | A dependency, a store concept, devtools setup |

The rule that governs the whole ladder: **climb only when the current rung causes a concrete,
observed problem** — a value that can't be shared, a re-render storm you measured, a reducer that
grew unmaintainable. Climbing on speculation is premature optimization with a maintenance bill.

```
Does exactly one component use this state?
├─ YES ──────────────────────────────► useState, right there.            (rung 1)
└─ NO: do a few nearby components need it?
   ├─ YES, and they share a close parent ──► lift to that parent.        (rung 2)
   │        Is prop drilling now >2–3 levels, or are transitions complex?
   │        ├─ complex transitions ─────────► useReducer.                (rung 3)
   │        └─ deep drilling, value changes rarely ─► Context.           (rung 4)
   └─ NO, it's read all over the app by consumers that each want a slice,
      and/or it updates frequently ─────────► external store.            (rung 5)
```

---

### Rung 1 — Local `useState`, colocated

**What it's for.** State that a single component owns and uses. A toggle, an input's draft value, a
hover flag. This is the default and the destination you should try hardest to stay at.

```tsx
function SearchBox() {
  const [query, setQuery] = useState('');
  return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
}
```

**Why React makes this cheap.** A `setState` on a component re-renders that component and its
subtree — not the whole app. Colocating state means the [render](fundamentals#render-vs-commit) blast
radius stays small by construction. You do not need any optimization to make local state fast; you
need only to keep it local.

**When to climb.** The moment a *second* component needs to read or write the same value. Not
before. "I'll probably need this elsewhere later" is not a reason — move it when *later* arrives.

> 🟢 **Best practice** — colocate state as low as it will go. Lifting everything to the root "so it's
> available" is the number-one cause of self-inflicted re-render storms. This is a placement rule, not
> an optimization.

---

### Rung 2 — Lifted state

**The problem.** Two sibling components need the same value — a filter `<Toolbar>` and the `<List>`
it filters. Siblings can't see each other's state.

**Why React behaves this way.** Data flows down through props. The only way two siblings share a
value is for their nearest common parent to own it and pass it to both. This is "lifting state up,"
and it is a [reconciliation](fundamentals#reconciliation) consequence, not a limitation to route
around.

```tsx
// ✅ shared value owned by the common parent, passed down
function ProductPage() {
  const [filter, setFilter] = useState('');
  return (
    <>
      <Toolbar filter={filter} onFilterChange={setFilter} />
      <List filter={filter} />
    </>
  );
}
```

**Tradeoffs.**

- **Pros:** explicit data flow — you can read the wiring off the JSX; no extra concepts; fully typed.
- **Cons:** the owning parent re-renders on every change and re-renders *both* children; if the tree
  between owner and consumer is deep, you get **prop drilling** — passing a prop through components
  that don't use it.

**When NOT to climb further.** Two or three levels of prop drilling is *fine*, and it's more honest
than the alternatives — the dependency is visible in the types. Do not reach for Context to eliminate
one or two hops.

> 🟢 **Best practice** — lift state to the *nearest* common ancestor, not to the root. Every level
> above the real owner is a level of needless prop drilling and a wider re-render radius.

---

### Rung 3 — `useReducer`

**The problem.** A `useState` grows a cluster of related transitions where the next state depends on
the previous one, and update logic gets duplicated across many handlers. A cart with add / remove /
change-quantity / apply-coupon, each touching several fields, becomes a tangle of `setX` calls.

**Why it helps.** A reducer centralizes *all* transitions for one state shape into a single pure
function, `(state, action) => newState`. Because it's [pure](fundamentals#purity) and gets the
current state as an argument, it sidesteps a whole class of [stale-closure](fundamentals#closures)
bugs that `setCount(count + 1)` invites — you write `setCount(c => c + 1)`, or in a reducer you just
read `state`.

```tsx
type Action =
  | { type: 'add'; item: Item }
  | { type: 'remove'; id: string }
  | { type: 'setQty'; id: string; qty: number };

function cartReducer(state: CartState, action: Action): CartState {
  switch (action.type) {
    case 'add':
      return { ...state, items: [...state.items, action.item] };
    case 'remove':
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };
    case 'setQty':
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, qty: action.qty } : i,
        ),
      };
  }
}

function Cart() {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });
  // dispatch({ type: 'add', item }) from anywhere in the subtree
}
```

**Tradeoffs.**

- **Pros:** all transitions in one testable pure function; `dispatch` has a **stable identity**, so
  passing it down never causes a re-render the way a fresh callback would; complex updates read
  clearly.
- **Cons:** more ceremony than `useState` — action types, a switch, an extra indirection. Overkill
  for one or two independent fields.

**When NOT to use it.** For a couple of unrelated booleans, `useReducer` is heavier than two
`useState`s and reads worse. Reach for it when the *transitions* are complex, not merely because
there are several fields.

> 🟡 **Optimization** — `useReducer` doesn't change *where* state lives; it's still local or lifted
> state. Its stable `dispatch` is a genuine perf property (a stable value to pass down), but adopt it
> for the transition-complexity payoff, not reflexively.

`useReducer` composes with rung 4: a common pattern is a reducer's `state` and `dispatch` provided
through Context to a subtree — see below.

---

### Rung 4 — Context

**What it's for.** A value that is needed *deep* in the tree, by *many* components, that you don't
want to drill through every intermediate layer: the current theme, the logged-in user, a locale, a
`dispatch` from a reducer. Context solves **distribution**, not storage — it's a way to make a value
available without prop drilling.

**Why the mechanism matters.** A Context provider broadcasts *one value*. When that value changes by
`Object.is`, **every consumer re-renders** — regardless of which part of the value it actually reads.
Context has no built-in selectivity. This is the fact that decides whether Context is the right rung.

#### The measured trap: one big Context fans out to everyone

One context holding `{ a, b }`. We updated **only `a`**, five times. `ConsumerB` reads **only `b`**:

| Consumer | Renders (1 initial + 5 updates) |
|---|---|
| `ConsumerA` (reads `a`) | 6 |
| `ConsumerB` (reads only `b`) | **6 — every update, all wasted** |

Measured on a small reproduction (React 19, jsdom); your numbers will differ. `ConsumerB` never uses
`a`, yet it re-rendered on every `a` change, because any change to the context value re-renders all
consumers. Put high-frequency state (mouse position, a fast-typing input, a live counter) in a shared
Context and you fan that frequency out across every consumer in the tree.

**A naive single Context:**

```tsx
// 🔴 one context, mixed update frequencies — every consumer re-renders on any change
const AppContext = createContext<{ user: User; mouse: Point } | null>(null);
// a component that only needs `user` still re-renders on every mousemove
```

**Better — split by update frequency, and isolate stable values:**

```tsx
// ✅ unrelated / different-frequency state lives in separate contexts
const UserContext = createContext<User | null>(null);       // changes rarely
const MouseContext = createContext<Point>({ x: 0, y: 0 });  // changes often

// ✅ dispatch is stable — its own context means consumers of it never re-render
const CartStateContext = createContext<CartState | null>(null);
const CartDispatchContext = createContext<React.Dispatch<Action> | null>(null);
```

Splitting `dispatch` into its own context is a specific, high-value move: `dispatch` from
`useReducer` is identity-stable, so a component that only dispatches (a button) subscribes to a
context that never changes and therefore never re-renders from it.

**Tradeoffs.**

- **Pros:** kills prop drilling; native to React, zero dependencies; great for low-frequency,
  broadly-read values (theme, auth, locale).
- **Cons:** no selective subscription — the fan-out above; a new object as the provider `value`
  (`value={{ user, mouse }}`) re-renders all consumers on *every parent render* unless you memoize it;
  many small contexts means provider nesting ("provider hell").

**When NOT to use it.** Context is a poor fit for **high-frequency state read by consumers that each
want a different slice.** That's exactly what an external store's selector model is built for — the
next rung. Also: Context is not a state manager. It has no reducer, no devtools, no middleware. It
*distributes* whatever you put in it.

> 🟢 **Best practice** — split unrelated state into separate contexts, and give a stable `dispatch`
> its own context. This is a correctness/scalability rule about update boundaries, not a
> speculative optimization.

> 🔴 **Advanced / gotcha** — a provider whose `value` is an inline object (`value={{ a, b }}`) hands
> every consumer a brand-new object on each parent render, defeating the point. Memoize it
> (`useMemo(() => ({ a, b }), [a, b])`) *or* provide already-stable values. This bites silently:
> nothing errors, consumers just all re-render.

---

### Rung 5 — External store (Zustand / Redux Toolkit / Jotai)

**The problem an external store solves.** You have state that is (a) read by many components
scattered across the tree, *and* (b) each consumer needs only a **slice** of it, *and/or* (c) it
updates frequently. Context can't do (b) — it re-renders every consumer. Lifting to a common ancestor
would put the value near the root and re-render huge subtrees. This is the precise gap external stores
fill: a store lives outside the React tree, and components **subscribe to a selected slice**, so a
component re-renders only when *its* slice changes.

**Why this works when Context doesn't.** A store is a single source of truth outside React. Consumers
call a `useSelector`-style hook with a selector function; the store compares the selected value
(usually by `Object.is` or a shallow/custom equality) and re-renders the component only if *that
slice* changed. Under the hood, correctly-built stores use
[`useSyncExternalStore`](react-18#4-tearing-and-usesyncexternalstore) so concurrent rendering can't
tear them (show two different values for the same state in one frame). react-redux v8+, Zustand, and
Jotai all migrated to it.

```tsx
// Zustand — the whole store is a hook; selectors are the subscription
import { create } from 'zustand';

interface CartStore {
  items: Item[];
  add: (i: Item) => void;
  remove: (id: string) => void;
}

const useCart = create<CartStore>((set) => ({
  items: [],
  add: (i) => set((s) => ({ items: [...s.items, i] })),
  remove: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));

// This component re-renders ONLY when items.length changes — not on unrelated store updates.
function CartBadge() {
  const count = useCart((s) => s.items.length);
  return <span>{count}</span>;
}
```

**Tradeoffs.**

- **Pros:** selective subscriptions eliminate the Context fan-out; state lives outside the tree so it
  survives component unmounts; devtools, middleware, persistence; testable in isolation from React.
- **Cons:** a dependency and a new concept everyone must learn; state that lives "nowhere in the tree"
  is easier to overuse and harder to trace than a prop; easy to slide into using it as a global bag for
  things that were fine as local state.

**When NOT to use it.** If your shared state changes rarely and is read by a handful of components,
Context is simpler and dependency-free — don't add a store. If it's *server* data, use a query library
instead; a client store is the wrong tool and you'll reimplement caching. And never install a store on
day one "because the app will grow" — that's the anti-pattern this whole page is built to prevent.

> 🟡 **Optimization** — reach for an external store when you have a *measured* re-render problem from
> shared/high-frequency state, or genuinely app-wide state read by scattered slices. It has real costs
> (dependency, concept, indirection); the selector model is what you're buying.

> 🔴 **Advanced / gotcha** — **global-state-by-default is the anti-pattern.** Putting most state in a
> global store because it's "convenient" trades a small, traceable local blast radius for an app-wide
> web of implicit subscriptions. Start local; promote to global only what is provably shared.

#### Zustand vs Redux Toolkit vs Jotai — an honest comparison

All three are actively maintained, all three use `useSyncExternalStore` under the hood, all three are
production-solid. They differ in *shape* and *ceremony*, not in whether they work.

| | **Zustand** | **Redux Toolkit (RTK)** | **Jotai** |
|---|---|---|---|
| Model | One hook-store, selector subscriptions | Single global store, slices + actions + `useSelector` | Bottom-up atoms composed together |
| Mental model | "a store that is a hook" | "one predictable state tree, explicit actions" | "useState, but shareable across the tree" |
| Boilerplate | Low | Moderate (RTK slashed classic Redux's; still the most) | Low |
| Devtools | Redux DevTools via middleware | First-class, best-in-class time-travel | Devtools available, less central |
| Async / caching | Bring your own (or RTK Query separately) | **RTK Query** built in — real server-cache layer | Bring your own / async atoms |
| Bundle (rough, min+gzip) | smallest of the three | largest — it bundles the toolkit + immer | small |
| Best when | You want a store with minimal ceremony | Large app, many contributors, you want structure, conventions, and devtools discipline; RTK Query for server state | State composes from many small independent pieces; you like atom-level granularity |

Guidance, not dogma:

- **Zustand** — the low-friction default when you've established you need a store. Minimal API, tiny,
  selectors built in. Great when you want *just* shared client state without prescribing an
  architecture.
- **Redux Toolkit** — pick it for *structure at scale*: many engineers, a desire for enforced
  conventions, serious devtools/time-travel, and (via RTK Query) a first-class server-cache layer in
  the same ecosystem. RTK is modern Redux — if your mental image is 2018 Redux with hand-written
  action constants and `connect`, that's gone. Its cost is still the most ceremony of the three.
- **Jotai** — pick it when state naturally decomposes into many small, independent values that compose,
  and you want `useState`-like ergonomics that happen to be shareable. Its atom model avoids the "one
  big object" selector dance entirely.

The bundle-size row is deliberately rough — exact figures move release to release and the difference
is rarely the deciding factor. Choose on *model fit and team*, not on a few kilobytes.

---

### Putting it together — a worked decision

A dashboard with: a theme toggle, a live-updating notifications count, a multi-step settings form, and
a product table fed by an API.

| State | Nature | Rung | Why |
|---|---|---|---|
| Product table data | Server | Off-ladder | Query library — it's a cache, not state |
| Settings form draft | Client, local | 1 → 2 | `useState` in the form; lift only the fields a sibling preview needs |
| Multi-step form flow | Client, complex transitions | 3 | `useReducer` — step transitions depend on prior state |
| Theme | Client, broadly read, changes rarely | 4 | Context — perfect low-frequency broadcast |
| Notifications count + live feed | Client, high-frequency, scattered slice consumers | 5 | Store with selectors — Context would fan out every tick |

Notice no single rung wins the whole app. **The skill is matching each piece of state to the lowest
rung that fits it** — not picking one tool for everything.

---

### Does the React Compiler change any of this?

No. The [React Compiler](react-practices#2-react-compiler-1-0-what-actually-changes) auto-memoizes to
cut wasted re-renders (measured 11 → 1 on an unchanged child in a small reproduction), but it
memoizes *values* — it does **not** restructure your tree or change *where state lives*. A giant
Context still fans out to every consumer; the compiler can't fix a placement problem. State placement
is an architecture decision the compiler is downstream of.

> 🟢 **Best practice** — decide state placement first (this ladder), then let the compiler handle
> memoization. Good placement makes the compiler's job smaller; the compiler never substitutes for it.

---

### Sources

- https://react.dev/learn/sharing-state-between-components
- https://react.dev/learn/scaling-up-with-reducer-and-context
- https://react.dev/learn/passing-data-deeply-with-context
- https://react.dev/reference/react/useReducer
- https://react.dev/reference/react/useContext
- https://react.dev/reference/react/useSyncExternalStore
- https://react.dev/learn/you-might-not-need-an-effect
- https://zustand.docs.pmnd.rs/
- https://redux-toolkit.js.org/
- https://jotai.org/

---

## Custom Hooks

A custom hook is the unit of reuse for **stateful logic** — not markup. It is an ordinary function
whose name starts with `use` and which calls other hooks. That is the entire mechanism: there is no
special runtime, no shared instance, no lifecycle of its own. Two components calling the same hook get
two fully independent copies of its state, because the hook body simply runs inline as part of each
caller's [render](fundamentals#render-vs-commit).

This page covers the design principles first — naming, return shape, when to extract — then the
advanced ref/`useEffectEvent` patterns the reviewer flagged, which exist to solve one specific problem:
[stale closures](fundamentals#closures) inside effects and subscriptions.

Verified against React 19.2.7, `@types/react` 19.2.17, TypeScript 7.0.2,
`eslint-plugin-react-hooks@7.1.1` (2026-07-18).

---

### A custom hook is a function, not a component

The `use` prefix is not decoration. It is how both the linter and the compiler know a function may call
hooks, so they can enforce the [Rules of Hooks](fundamentals#render-vs-commit) inside it and skip that
analysis everywhere else.

> 🟢 **Best practice** — name every custom hook `use*`, and only functions that call hooks. A helper
> that calls no hooks should *not* be named `use…`; a function that calls hooks *must* be. Misnaming
> either way makes `react-hooks/hooks` and the compiler stop analyzing it correctly.

The corollary matters just as much:

> 🟢 **Best practice** — a hook that returns JSX is a component wearing a hat. If the reusable thing is
> markup, make it a component. Custom hooks return **data and behavior** (values, callbacks, refs), not
> elements.

Because the body runs inline in the caller, a hook has no persistent identity across callers. This is
why "share one timer between two components with a hook" does not work: each caller gets its own timer.
Shared, cross-component state needs a store or context — a hook can *wrap* that, but the hook itself is
not the sharing mechanism.

---

### When to extract — and when not to

Extract a hook for one of exactly two reasons:

1. **The logic is reused** in more than one place, or
2. **The concept deserves a name** — `useDebouncedValue`, `useOnlineStatus`, `usePagination` — even at
   a single call site, because the name makes the component read like prose.

> 🟢 **Best practice** — extract to reuse logic or to name a concept. Do **not** extract merely to make
> a component shorter. A hook you invented only to move lines out of view adds an indirection with no
> reader payoff, and it usually leaks a bad abstraction (a jumble of unrelated `useState`s that happened
> to be adjacent).

**The problem it prevents:** premature extraction produces hooks with five parameters and four return
values that are used once. The abstraction boundary is in the wrong place, so the next change has to
cut across it. A good hook has a **single, nameable responsibility** and a small surface.

#### When NOT to extract

| Situation | Do this instead |
|---|---|
| Two `useState`s that are only *near* each other | Leave them inline; adjacency isn't cohesion |
| A block you'll "probably reuse later" | Wait for the second real call site |
| Logic that's really rendering | Make a component |
| Shared logic between two event handlers | A plain function both call — not a hook |
| Deriving state from props/state | Compute during [render](fundamentals#render-vs-commit); no hook, no effect |

That last row is the big one: most logic people try to extract into a hook with a `useEffect` inside is
[derived state](react-practices#you-might-not-need-an-effect) that should just be computed during
render. Extracting it into a hook hides the effect but keeps the bug.

---

### Return a stable shape: tuple vs object

The single most common design decision in a custom hook is what to return. Two shapes, two different
jobs.

#### Tuple — for two values the caller renames

```tsx
function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn((v) => !v), []);
  return [on, toggle] as const;
}

const [isOpen, toggleOpen] = useToggle();   // caller names both positions
const [isDark, toggleDark] = useToggle();
```

A tuple works precisely because the caller **assigns the names** at the call site, exactly like
`useState`. That is its whole reason to exist. It breaks down past two or three positions — nobody can
read `const [, , , d] = useThing()`.

#### Object — for three or more values, or optional consumption

```tsx
function useUser(id: string) {
  const [data, setData] = useState<User | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setLoading] = useState(true);
  // ...
  return { data, error, isLoading };
}

const { data, isLoading } = useUser(id);   // take only what you need, by name
```

An object gives every value a fixed, self-documenting name and lets the caller destructure only the
subset it uses. Order-independence is the point.

| Return shape | Use when |
|---|---|
| `[a, b] as const` (tuple) | Exactly 2 values (3 at most), order is obvious, caller renames — mirrors `useState`/`useReducer` |
| `{ a, b, c }` (object) | 3+ values, names carry meaning, or caller consumes a subset |

> 🟢 **Best practice** — pick the shape by these rules, and keep it consistent across your codebase's
> hooks. Returning a bare positional array of four things is the worst of both: no names, easy to
> mis-destructure.

#### Type the tuple with `as const`

Without `as const`, TypeScript widens a returned array to `(T | U)[]` and destructuring collapses both
positions to that union — useless. See [TS with React](ts-react#hooks-discriminated-unions-and-as-const).

```tsx
function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn((v) => !v), []);
  return [on, toggle] as const;
  // WITHOUT as const → (boolean | (() => void))[]  — both names become that union
}
```

Objects don't need `as const`; TypeScript infers a precise object type from the return expression.

---

### Referential stability of the return value

A hook that returns a fresh object or callback **every render** is usually fine — until that value
becomes a [dependency array](fundamentals#dependency-arrays) entry or a prop to a
[memoized](react-practices#the-react-compiler-mature-not-new) child. Then the new reference each render
defeats the optimization it was supposed to feed.

> 🟡 **Optimization** — stabilize a hook's returned callbacks/objects (`useCallback`/`useMemo`) only
> when the return value is consumed as an effect dependency or crosses a `React.memo` boundary. On a
> small reproduction, a `React.memo` child whose props never changed rendered **1** time across 10
> parent updates versus **11** without memo — but that only holds if the props (often a hook's return
> value) are referentially stable. Measured on React 19 + jsdom; your numbers will differ in production.
>
> **Pros:** downstream memo/effects actually bail out. **Cons:** every `useCallback`/`useMemo` adds a
> dependency array you must keep correct, and on a cheap consumer the stabilization costs more than it
> saves.
>
> **When NOT to use it:** if the return value never feeds an effect dep or a memo boundary, leave it
> unstable — the reference churn is harmless. And if the [React Compiler](react-practices#the-react-compiler-mature-not-new)
> is on, it memoizes the hook's return for you; don't hand-stabilize preemptively, and don't
> mass-delete existing memoization either (the compiler reads it as a signal).

#### A hook over context re-renders on *any* context change

If your hook reads context (`const auth = useContext(AuthCtx)`), every consumer re-renders whenever
*any* field of that context value changes — not just the field it reads.

> 🔴 **Advanced / gotcha** — measured on a small reproduction: a context holding `{ a, b }` updated only
> in `a`, five times; a consumer reading **only `b`** still re-rendered on all 6 renders — every one
> wasted (React 19 + jsdom; production will differ). A convenient `useAuth()` hook hides this fan-out.
> If the context updates frequently, split it by update frequency or back the hook with a selector store
> (`useSyncExternalStore`, Zustand, Redux `useSelector`) so consumers subscribe to slices. See
> [state management](state-management).

---

### Compose small hooks

Prefer several small, single-purpose hooks composed together over one hook with a mode flag. A hook can
call other hooks freely; that is the composition mechanism.

```tsx
// Small, testable, nameable pieces:
function useOnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

// Composed by a higher-level hook — no new machinery, just a call:
function useSyncStatus() {
  const online = useOnlineStatus();
  const label = online ? 'Synced' : 'Offline';   // derived during render, no effect
  return { online, label };
}
```

> 🟢 **Best practice** — effects inside hooks must clean up. `useOnlineStatus` removes both listeners in
> its cleanup; a hook that subscribes without unsubscribing leaks a listener on every unmount and
> double-fires under StrictMode. This is a correctness rule, not an optimization.

---

### Advanced: stale closures in effects and subscriptions

This is the class of problem the reviewer specifically flagged, and the reason the ref/`useEffectEvent`
patterns exist. Everything below is 🔴 — reach for it knowingly.

#### The problem

An effect with an empty (or narrow) [dependency array](fundamentals#dependency-arrays) sets up a
subscription **once**. The callback it registers closes over props and state from that first render.
When state later changes, the callback still sees the **original** values — a
[stale closure](fundamentals#closures).

```tsx
// 🔴 BUG — the interval logs 0 forever
function Counter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => console.log(count), 1000); // captures count = 0
    return () => clearInterval(id);
  }, []); // empty deps: effect runs once, closure frozen at first render

  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}
```

**Why React behaves this way:** the effect callback is an ordinary JavaScript closure created during the
render that scheduled it. Empty deps tell React "never re-run this," so the closure — and every
variable it captured — is never refreshed. This is [closures](fundamentals#closures), not a React
quirk.

The "obvious" fix is to add `count` to the deps, but for a `setInterval` that **tears down and recreates
the interval on every count change**, resetting the timer. You want the latest `count` *without*
re-subscribing. That tension is what the following patterns resolve.

#### Fix 1 (preferred on React 19.2+): `useEffectEvent`

`useEffectEvent` shipped **stable in React 19.2.0** (2025-10-01; you are on 19.2.7). It wraps
*non-reactive* logic that an effect calls: the wrapped function always sees the latest props/state, but
it is **not** a reactive dependency, so it never appears in — and never re-triggers — the dep array.

```tsx
import { useEffectEvent, useEffect, useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);

  const onTick = useEffectEvent(() => {
    console.log(count); // always the latest count
  });

  useEffect(() => {
    const id = setInterval(onTick, 1000);
    return () => clearInterval(id);
  }, []); // onTick is NOT a dependency — that is the whole point

  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}
```

**Rules the linter enforces** (`eslint-plugin-react-hooks@7`):

- Declare it in the **same component or custom hook** as the effect that uses it.
- **Never** put it in a dependency array (that would defeat it, and it's flagged).
- Only call it from **inside effects** — calling an effect event from render or an arbitrary closure is
  flagged (`react-hooks/rules-of-hooks` additions in 7.x).

> 🔴 **Advanced / gotcha** — `useEffectEvent` is for logic that reads reactive values but should **not**
> cause the effect to re-run. It is the supported answer to "my effect re-fires because a callback dep
> changed." It is **not** a general escape hatch for silencing `exhaustive-deps`.

#### Fix 2 (pre-19.2, or non-effect cases): the latest-ref / `useLatest` pattern

Before `useEffectEvent`, the community solution was to stash the current value in a ref and read
`ref.current` from inside the long-lived callback. A ref's identity is stable, so it never needs to be a
dependency, yet `.current` is always current.

```tsx
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value; // update after commit — safe, not a render-phase write
  });
  return ref;
}

function Counter() {
  const [count, setCount] = useState(0);
  const latestCount = useLatest(count);

  useEffect(() => {
    const id = setInterval(() => console.log(latestCount.current), 1000);
    return () => clearInterval(id);
  }, []); // latestCount is a stable ref — correct to omit

  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}
```

> 🔴 **Advanced / gotcha** — you will see `useLatest` written as `ref.current = value` **directly in the
> render body**. That is a render-phase write to a ref, which is impure and is flagged by
> `react-hooks/refs` (error in the `recommended` preset). Updating in a `useEffect` (as above) is the
> lint-clean form, at the cost that during the same commit the ref is one render behind — fine for
> intervals, subscriptions, and event callbacks; **not** fine if a layout effect must read the newest
> value synchronously.

**Tradeoffs — ref-in-effect (`useLatest`):**

| Pros | Cons |
|---|---|
| Works on any React version (no 19.2 needed) | Reintroduces a manual indirection (`.current`) at every read |
| Stable identity, legitimately omitted from deps | One-render-behind under the lint-clean (effect-update) form |
| Handles values *and* handlers | Easy to abuse to silence `exhaustive-deps` on deps that **should** re-run |

**When NOT to reach for either pattern:**

- **The value *should* re-run the effect.** If re-subscribing on change is correct (e.g. the effect
  connects to a room whose `roomId` changed), just put it in the deps. A ref here hides a real
  reactive dependency and produces subtle "why didn't it reconnect" bugs.
- **It's an event handler passed to a child**, not an effect callback. Usually just define the handler
  inline — with the [React Compiler](react-practices#the-react-compiler-mature-not-new) on, or when the
  child isn't memoized, there is nothing to stabilize.
- **You're only silencing `exhaustive-deps`.** The lint warning is signal, not noise. Reach for a ref or
  `useEffectEvent` because a value is genuinely *non-reactive*, never merely to make the warning go away.

> 🟡 **Optimization** — storing a handler in a ref to keep a subscription's identity stable is a real
> tool, but it has a cost: indirection and a class of stale/one-behind bugs. Apply it when you have a
> measured re-subscription problem (an effect tearing down and rebuilding on every keystroke), not by
> default. On React 19.2+, prefer `useEffectEvent`, which encodes the same intent with lint enforcement.

---

### Checklist

- Name hooks `use*`; only hooks call hooks. A hook that returns JSX should be a component.
- Extract to reuse logic or name a concept — not to shorten a component.
- Tuple return for two renamed values (`as const`); object return for three-plus named values.
- Stabilize returned callbacks/objects only when they feed an effect dep or a memo boundary.
- Effects inside hooks must clean up their subscriptions.
- For stale closures in long-lived effects: `useEffectEvent` (React 19.2+) first; latest-ref/`useLatest`
  as the version-agnostic fallback. Update the ref in an effect, not during render.
- Never use a ref or effect event to silence a dependency that genuinely should re-run the effect.

### Sources

- Reusing logic with custom Hooks — https://react.dev/learn/reusing-logic-with-custom-hooks
- Separating events from Effects (`useEffectEvent`) — https://react.dev/learn/separating-events-from-effects
- `useEffectEvent` reference — https://react.dev/reference/react/useEffectEvent
- React 19.2 release notes — https://react.dev/blog/2025/10/01/react-19-2
- Referencing values with refs — https://react.dev/learn/referencing-values-with-refs
- Empirical, run locally 2026-07-18: `React@19.2.7`, `eslint-plugin-react-hooks@7.1.1`; render-count and
  context-fan-out reproductions under `measure/`.

---

## Forms

Forms are where three hard things collide: local UI state, async submission, and validation you can't trust. React 19 changed the default answer to the second one — `<form action>` + `useActionState` now own pending/error state that everyone used to hand-roll (see [React 19](react-19#actions--the-organizing-idea) for the mechanics). This page is about the *decisions*: whether an input is controlled, when the per-keystroke re-render actually costs you anything, where validation lives, and the point at which a form library stops being overhead and starts paying rent.

The through-line: **most forms should be uncontrolled**, read once on submit via `FormData`; reach for controlled inputs only where a field's *current* value drives other UI. That's the opposite of the tutorial default, and it's the single highest-leverage decision on this page.

---

### Label every input — this one is not negotiable

Before any performance talk: an input without a programmatically associated label is broken for screen readers, breaks click-to-focus, and breaks autofill. It is a correctness bug, not a polish item.

```tsx
// BAD — placeholder is not a label; it vanishes on focus and is invisible to a11y tools
<input placeholder="Email" />

// GOOD — explicit association via htmlFor/id
<label htmlFor="email">Email</label>
<input id="email" name="email" type="email" />

// GOOD — implicit association by wrapping (no id needed)
<label>
  Email
  <input name="email" type="email" />
</label>
```

> 🟢 **Best practice** — every input has an associated `<label>` (via `htmlFor`/`id` or by wrapping), and every input that carries data has a `name`. The `name` is not optional decoration: it's the key `FormData` and `<form action>` read by. A field with no `name` is invisible to native submission — a silent data-loss bug.

Native attributes do real work for free: `type="email"`, `required`, `minLength`, `autoComplete="email"`. They drive mobile keyboards, password managers, and the browser's built-in validation UI. Don't reimplement in JS what the platform already does.

---

### Controlled vs uncontrolled — the core decision

#### The problem

A **controlled** input has its `value` driven by React state: `value={x} onChange={e => setX(...)}`. Every keystroke is a `setState`, and every `setState` is a [render](fundamentals#render-vs-commit) of the component holding that state — plus everything it renders that isn't memoized. On a login form nobody notices. On a 40-field settings page where the whole form is one component, every keystroke re-renders all 40 fields.

An **uncontrolled** input lets the DOM keep its own value. React writes an initial `defaultValue` and then stays out of the way; you read the value at submit time via a ref or `FormData`. Typing causes **zero React renders**.

#### Why React behaves this way

`value={x}` is a promise to React: "this input displays exactly `x`, always." To keep that promise, React must re-render on every change so the new `x` flows back into the DOM. That re-render is the mechanism, not a bug — it's what makes the value a single source of truth you can validate, transform, or mirror elsewhere mid-typing. The cost is inherent to the guarantee. See [render vs commit](fundamentals#render-vs-commit) for why "re-render" here means running the function, not rebuilding the DOM.

#### A naive example — everything controlled, one big component

```tsx
// Every keystroke in ANY field re-renders the whole form and all its children.
function ProfileForm() {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [email, setEmail] = useState('');
  // ...37 more fields...

  return (
    <form onSubmit={/* ... */}>
      <input value={name} onChange={e => setName(e.currentTarget.value)} />
      <textarea value={bio} onChange={e => setBio(e.currentTarget.value)} />
      <input value={email} onChange={e => setEmail(e.currentTarget.value)} />
      <ExpensiveMarkdownPreview source={bio} /> {/* re-renders on every keystroke, everywhere */}
      {/* ... */}
    </form>
  );
}
```

#### A better example — uncontrolled, read once on submit

```tsx
function ProfileForm({ save }: { save: (data: FormData) => Promise<void> }) {
  return (
    <form action={save}>            {/* React 19: async action, see below */}
      <label htmlFor="name">Name</label>
      <input id="name" name="name" defaultValue="" />

      <label htmlFor="bio">Bio</label>
      <textarea id="bio" name="bio" defaultValue="" />

      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" defaultValue="" />

      <button type="submit">Save</button>
    </form>
  );
}
// Typing produces zero re-renders. `save` receives a FormData with every named field.
```

#### The measured cost, honestly

The per-keystroke re-render is real but usually *cheap*. A plain function component re-running is fast; the DOM diff for an unchanged subtree is a no-op (React bails at the [reconciliation](fundamentals#reconciliation) step when the element is identical). The cost only becomes visible when a re-render drags an **expensive** child along — a heavy list, a chart, a markdown preview. In a small reproduction, an un-memoized child re-rendered **11 times** across 10 parent updates; wrapping it in `React.memo` cut that to **1** (measured on React 19 + jsdom; your numbers will differ in production).

> 🔴 **Advanced / gotcha** — the controlled-input re-render cost. It is easy to *over-fear* this. A form of cheap inputs stays under the [INP "good" threshold of 200ms](https://web.dev/articles/inp) no matter how you type; controlled is perfectly fine there. It only bites when (a) the form is large *and* (b) a keystroke re-renders something genuinely expensive. Measure with the Profiler before restructuring — don't rip out controlled inputs on a hunch.

> 🟡 **Optimization** — go uncontrolled for large or hot forms. It removes per-keystroke renders entirely, but you give up mid-typing derived UI (live validation, character counters, dependent fields) unless you add it back deliberately. Apply it when you've *seen* input lag or a Profiler flame graph, not by default on every form. For a 3-field form it buys nothing and costs you the ability to react to input.

If you need controlled behavior *and* an expensive neighbor, the surgical fix is to isolate the expensive part, not to abandon control:

> 🟡 **Optimization** — extract the expensive subtree into its own `React.memo`'d component so a field's keystrokes don't re-render it. This is a targeted move with a real cost (an extra component boundary, a props-equality check on every parent render, and `memo` only helps if the props are actually stable). Note that the [React Compiler](react-19#react-compiler-10) auto-memoizes this same subtree — same 11→1 result measured — so on a compiled codebase you often get the isolation for free and shouldn't hand-write the `memo`.

#### Tradeoffs

| | Controlled | Uncontrolled |
|---|---|---|
| Source of truth | React state | The DOM |
| Renders per keystroke | 1 (+ un-memoized children) | 0 |
| Live derived UI (counter, live validation, dependent fields) | Trivial | Needs extra wiring |
| Read value | Already in state | On submit via `FormData`/ref |
| Reset / programmatic set | `setState` | `form.reset()` / imperative |
| Best fit | Small forms; fields that drive other UI | Large forms; write-then-submit |

#### When NOT to go uncontrolled

- A field's current value must **drive other UI as you type** — a password-strength meter, a live search, a "slug" that mirrors a title, cross-field validation. That's controlled's whole reason to exist.
- You need to **transform input on the fly** — force uppercase, mask a phone number, clamp a number. The DOM can't do that without your `onChange`.
- The value is **owned elsewhere** (a store, a URL param) and the input just reflects it. That's controlled by definition.

A common middle ground: keep the form uncontrolled, but make the *one* field that needs live behavior controlled. You don't have to pick one mode for the whole form.

---

### Async submit — React 19 Actions, not hand-rolled state

Before React 19, "submit a form to a server" meant three or four `useState`s (`isPending`, `error`, maybe `success`) and a `try/catch/finally`, and almost everyone got the stale-response race wrong. React 19 folds all of that into `<form action>` + `useActionState`. The full treatment — signature order, the form auto-reset, the `useFormStatus` parent-only footgun — is on the [React 19 page](react-19#actions--the-organizing-idea); here's the shape as it applies to forms.

```tsx
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

type Errors = { email?: string; _form?: string } | null;

function NewsletterForm({ subscribe }: { subscribe: (email: string) => Promise<void> }) {
  const [errors, action] = useActionState(
    async (_prev: Errors, formData: FormData): Promise<Errors> => {
      const email = String(formData.get('email') ?? '');
      if (!email.includes('@')) return { email: 'Enter a valid email' };
      try {
        await subscribe(email);
        return null;                          // success — returned value becomes state
      } catch (err) {
        return { _form: (err as Error).message };
      }
    },
    null,
  );

  return (
    <form action={action}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" defaultValue="" />
      {errors?.email && <p role="alert">{errors.email}</p>}
      {errors?._form && <p role="alert">{errors._form}</p>}
      <SubmitButton />
    </form>
  );
}

// useFormStatus reads the ENCLOSING form — it must live in a child of <form>, never the same component.
function SubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>Subscribe</button>;
}
```

Two things make this the good default:

- The action receives a `FormData` — it pairs naturally with **uncontrolled** inputs. No per-field state to wire.
- **Return** validation errors as state; do **not** `throw` them. A `throw` from an action propagates to the nearest Error Boundary and cancels queued actions — it nukes the subtree for what should be an inline "invalid email" message. Throw only for genuinely exceptional failures you want a boundary to catch.

> 🟢 **Best practice** — for async submit in React 19, let an Action own pending/error/ordering state instead of hand-rolling `useState` flags. It eliminates the stale-response race (a slow first request resolving after a fast second one) by construction, and it degrades to a working native form submit if JS hasn't hydrated. This is a correctness rule, not an optimization — the hand-rolled version is where the race bugs live.

If you're not on React 19 (or the submit isn't a form — e.g. a mutation triggered by a button), a controlled `isPending` flag is still fine. The Action pattern specifically earns its keep for `<form>` submission.

---

### Validation — client for UX, server for truth

Two validations with different jobs. Client-side validation is a **UX affordance**: instant feedback, fewer round-trips, a nicer error experience. Server-side validation is the **security boundary**: it's the only one that can't be bypassed.

> 🟢 **Best practice** — never trust the client. Client validation can be disabled, edited in devtools, or skipped entirely by hitting your endpoint with `curl`. Every rule that protects data integrity (uniqueness, authorization, length limits, type coercion) must be enforced on the server regardless of what the client checks. Client validation is for the honest user's convenience; server validation is for everyone else.

The cleanest way to keep the two in sync is one schema, run in both places:

```ts
import { z } from 'zod';

export const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  age: z.coerce.number().int().min(13),   // FormData values are strings — coerce
});
export type Signup = z.infer<typeof SignupSchema>;
```

```tsx
// Client: parse FormData for instant feedback…
async function action(_prev: unknown, formData: FormData) {
  const parsed = SignupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return parsed.error.flatten().fieldErrors;
  await submitToServer(parsed.data);        // …server parses the SAME schema again, authoritatively
  return null;
}
```

Layer the platform underneath the schema: `required`, `type="email"`, `minLength`, `pattern` give you the browser's native validation UI and block obviously-bad submits before any JS runs. They're the free first line; the schema is the real one. And remember `FormData.get()` always returns strings (or `File`) — coerce numbers and booleans explicitly, or you'll compare `"13"` to `13` and get surprised.

---

### Typing form events

Full detail is on the [TypeScript with React 19 page](ts-react#typing-events); the form-specific essentials:

```tsx
// Let React infer from the handler position when you can:
<input onChange={e => setX(e.currentTarget.value)} /> // e: React.ChangeEvent<HTMLInputElement>

// When you must name the type, parameterize by the element:
function onSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const data = new FormData(e.currentTarget);   // currentTarget is typed HTMLFormElement
  const email = data.get('email') as string;
}

function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
  console.log(e.currentTarget.value);
}
```

> 🟢 **Best practice** — read `e.currentTarget`, not `e.target`. `currentTarget` is typed as the element the handler is attached to (so `.value` is there); `target` widens to `EventTarget` and needs a cast. On a `<form onSubmit>` handler, `e.currentTarget` is the `HTMLFormElement` you can hand straight to `new FormData(...)`.

---

### When a form library earns its weight

Plain state and React 19 Actions cover most forms. A library (react-hook-form, TanStack Form) is not free — it's a dependency, an API to learn, and a layer between you and the DOM. It earns its weight at a specific scale.

**How react-hook-form makes big forms fast:** it registers inputs as **uncontrolled** (refs under the hood) and subscribes to them individually, so a keystroke re-renders only the field that changed, not the form. That's the same uncontrolled-perf win described above, packaged with validation, field arrays, and error handling you'd otherwise hand-write.

| Situation | Reach for a library? |
|---|---|
| 1–5 fields, simple submit | No — plain state or `<form action>` |
| Large form, input lag from re-renders | Yes — RHF's per-field subscription is the fix, pre-built |
| Complex cross-field / async validation, wizards | Yes — dedicated validation + `resolver` (zod/yup) integration |
| Dynamic field arrays (add/remove rows) | Yes — `useFieldArray` is a lot to build by hand |
| End-to-end type safety from schema to fields | TanStack Form is strongest here |
| Server-driven submit, minimal client validation | No — React 19 Actions already do this |

> 🟡 **Optimization** — adopt react-hook-form / TanStack Form when a form is large, dynamic, or validation-heavy. The cost is a real dependency and its API surface; the payoff is the uncontrolled-perf win plus validation and field-array machinery you don't have to maintain. Don't add it to a three-field login form — there you're paying the cost for none of the benefit, and `<form action>` + a schema is less code.

> 🔴 **Advanced / gotcha** — mixing a form library's controlled mode with React's controlled inputs. react-hook-form's default (`register`) is uncontrolled and fast; its `Controller` wrapper exists for inputs that *require* controlled state (many component-library inputs, e.g. an MUI `Select`). `Controller` re-introduces the per-keystroke render for that field — which is fine and necessary, but people wrap *every* field in `Controller` out of habit and then wonder why the library "didn't help performance." Use `register` by default; reach for `Controller` only for inputs that can't be uncontrolled.

---

### Checklist

- Every input has an associated `<label>` and a `name`. 🟢
- Default to **uncontrolled** + `FormData`; make a field controlled only when its value drives other UI as you type.
- Don't rip out controlled inputs for perf without a Profiler measurement — the re-render is usually cheap.
- Async submit in React 19 → `<form action>` + `useActionState`; **return** validation errors, never `throw` them.
- `useFormStatus` must live in a **child** of `<form>`, not the component that renders it.
- Validate on the client for UX and on the server for truth — never trust the client. One schema (zod), run twice.
- Coerce `FormData` values — they're always strings.
- Read `e.currentTarget`, not `e.target`.
- Add a form library when the form is large, dynamic, or validation-heavy — not before.

### Sources

- React 19 `useActionState` — https://react.dev/reference/react/useActionState
- React 19 `useFormStatus` — https://react.dev/reference/react-dom/hooks/useFormStatus
- React `<form>` (Actions) — https://react.dev/reference/react-dom/components/form
- Controlled vs uncontrolled inputs — https://react.dev/reference/react-dom/components/input
- MDN `FormData` — https://developer.mozilla.org/en-US/docs/Web/API/FormData
- Web Vitals — Interaction to Next Paint (INP) — https://web.dev/articles/inp
- react-hook-form — https://react-hook-form.com/
- TanStack Form — https://tanstack.com/form/latest
- Zod — https://zod.dev/

---

## The Data Layer

Most "React is slow" and "my data is stale" bugs are not React problems. They are the result of one
category error: **treating server data as component state.** This page is about the layer between
your components and the network — where it lives, how it cancels, how it parallelizes, and why the
default answer for server state in 2026 is a query library, not a hand-rolled `useEffect`.

Verified against React 19.2.7 and the measured reproductions in this repo (2026-07-18).

---

### Server data is a cache, not state

This is the reframe the whole page hangs on. `useState` holds values **your UI owns and is
authoritative for**: a form draft, whether a modal is open, the selected tab. Server data is none of
those things. It is owned by the server, shared across every other client, and **stale the instant
you read it**. Your copy is a *cache* of someone else's source of truth.

#### The problem

The moment server data lands in `useState`, you have silently signed a contract to hand-write, by
yourself, every feature a cache provides:

- race-condition handling (a slow early response overwriting a fast late one — see [stale closures](fundamentals#closures))
- deduplication (two components asking for the same user at once → two requests)
- revalidation (refetch when the data goes stale, on window focus, on reconnect)
- invalidation (after a mutation, everything showing that data is now wrong)
- retry/backoff, garbage collection, request-waterfall avoidance

Each of these is a genuine distributed-systems problem. Reinventing them per-component, badly, is the
tax you pay for putting a cache in `useState`.

#### Why React behaves this way

`useState` was built for values that change *because the user did something in this component*. It
has no concept of "this value has an owner elsewhere and might already be out of date." There is no
built-in freshness, no built-in sharing. react.dev is direct about it:

> "Modern frameworks provide more efficient built-in data fetching mechanisms than writing Effects
> directly in your components."

#### Draw the line by ownership

| | Server state | Client state |
|---|---|---|
| **Owner** | the server; shared across clients | this UI, authoritative here |
| **Freshness** | stale the moment you read it | always current by definition |
| **Examples** | user profile, product list, search results | form draft, modal open, selected filter |
| **Home** | a cache: TanStack Query / SWR / RSC / router loader | `useState` / `useReducer` / context |

> 🟢 **Best practice** — Classify every piece of data as server-owned or client-owned before you
> decide where it lives. Server data goes in a cache; client data goes in React state. Confusing the
> two is the root cause of most re-render storms and stale-UI bugs.

---

### A typed service layer, separate from components

Whatever caches your server data, the raw transport — URLs, headers, auth, JSON parsing, error
shaping — does **not** belong inline in components. Put it behind a typed module.

#### The problem

`fetch('/api/...')` scattered across twenty components means twenty places that each independently
get the base URL, auth header, error handling, and response typing slightly wrong. A backend route
rename becomes a twenty-file change, and every call site returns `any`.

#### A typed fetch wrapper

One wrapper owns the cross-cutting concerns and hands back typed data:

```ts
// api/http.ts
const BASE = import.meta.env.VITE_API_URL ?? '';

export class HttpError extends Error {
  constructor(public status: number, public url: string, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    throw new HttpError(res.status, path, `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}
```

#### A service module per resource

Components call named functions, never `fetch`. The signal is threaded through so calls stay
cancellable (next section):

```ts
// api/users.ts
import { http } from './http';

export interface User { id: string; name: string; email: string; }

export const usersApi = {
  get: (id: string, signal?: AbortSignal) =>
    http<User>(`/users/${id}`, { signal }),
  list: (signal?: AbortSignal) =>
    http<User[]>('/users', { signal }),
  update: (id: string, patch: Partial<User>) =>
    http<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
};
```

> 🟢 **Best practice** — Keep transport (URLs, headers, parsing, error shaping) in a typed service
> layer, not in components. Components should import `usersApi.get`, not know that it is a `GET` to
> `/users/:id`. This is a maintainability rule, not an optimization — it costs you one module and
> pays back on every backend change.

The service layer is also the seam your query library plugs into: the `queryFn` calls
`usersApi.get`, so the caching layer and the components share one typed definition of "what a user
request is."

---

### Cancellation with AbortController

Every request you start should be cancellable, and an in-flight request should be aborted when its
consumer goes away or its inputs change. The wrapper above already accepts a `signal`; wire it up.

This section assumes the `AbortController` / `AbortSignal` mechanics covered in
[Modern JavaScript](js-general#abortcontroller-abortsignal-cancellation) — timeouts vs user-cancel
rejecting differently, `AbortSignal.any`, `AbortSignal.timeout`. Here we focus on the React shape.

#### The problem it prevents is the race, not a warning

The real reason to abort on cleanup is **not** the (long-since-removed) "setState on an unmounted
component" warning. It is the race: type `a`, then `ab`, quickly. Two requests fly. If the response
for `a` is slower and lands *after* `ab`, it overwrites the correct results with stale ones — a
classic [stale-closure](fundamentals#closures)-adjacent bug that survives refresh roughly one time in
fifty and is miserable to reproduce.

#### The shape in an Effect

```tsx
useEffect(() => {
  const controller = new AbortController();

  usersApi.list(controller.signal)
    .then(setUsers)
    .catch((e) => {
      if (e.name !== 'AbortError') setError(e); // never surface an intentional cancel as an error
    });

  return () => controller.abort();
}, []);
```

> 🟢 **Best practice** — An Effect that starts a request must cancel it in cleanup, and its `.catch`
> must swallow `AbortError`. This is a correctness rule ([effects must clean up](fundamentals#purity)),
> not an optimization: without it you get the overwrite race, and without the `AbortError` guard you
> get spurious error toasts every time inputs change or StrictMode remounts in dev.

The `AbortError` guard is where teams go wrong: they add the abort, then their error state lights up
on every keystroke because the intentional cancel is being treated as a failure.

---

### Sequential vs parallel fetching

When one screen needs several independent pieces of data, how you `await` them decides your load
time. This is measurable, and the difference is large.

#### The problem

The natural way to write it — `await` each request in turn — makes each request wait for the previous
one to finish, even when they have nothing to do with each other.

```ts
// 🚩 Sequential: total time ≈ the SUM of all three requests.
const user   = await usersApi.get(id, signal);     // wait 200ms
const orders = await ordersApi.list(id, signal);   // then wait 180ms
const cart   = await cartApi.get(id, signal);      // then wait 220ms
```

#### The better version

If the requests don't depend on each other, fire them together and await the set:

```ts
// ✅ Parallel: total time ≈ the SLOWEST single request.
const [user, orders, cart] = await Promise.all([
  usersApi.get(id, signal),
  ordersApi.list(id, signal),
  cartApi.get(id, signal),
]);
```

Measured on a small reproduction (React 19, jsdom; three requests simulated at 200 / 180 / 220 ms) —
your numbers will differ in production:

| Strategy | Wall time |
|---|---|
| `await` each in turn | **604 ms** |
| `await Promise.all([...])` | **221 ms** |

The parallel time is essentially the single slowest request (220 ms + overhead); the sequential time
is the sum. A 2.7× win, and it grows with the number of independent requests.

**Pros / Cons**

- **Pro:** near-constant load time regardless of how many independent requests you add.
- **Pro:** no code complexity cost — `Promise.all` is if anything simpler than three `await`s.
- **Con:** `Promise.all` rejects as soon as *any* request fails — one failure loses all results.
  Use `Promise.allSettled` when partial success should still render.
- **Con:** fires all requests at once, which can spike server load or hit connection limits for very
  large fan-outs.

> 🟡 **Optimization** — Parallelize with `Promise.all` **only when the requests are truly
> independent.** It costs nothing here and wins big, but the independence precondition is not
> optional.

> 🔴 **Advanced / gotcha** — **Dependent requests must stay sequential.** If request B needs a value
> from A's response (`const user = await getUser(id); const org = await getOrg(user.orgId)`), you
> *cannot* parallelize them — `Promise.all` would fire `getOrg` with an undefined id. Forcing
> dependent calls into `Promise.all` is a correctness bug, not a speedup. Parallelize the independent
> ones and sequence only the genuine dependencies. When you find yourself with a chain of dependent
> requests, that chain is a *waterfall* — the thing route loaders (below) exist to flatten.

#### Prefetch the next screen before the user asks

The fastest request is the one already in cache when the component mounts. TanStack Query's
`prefetchQuery` lets you warm the cache on intent — a link hover, a route about to transition — so the
data is there by the time the screen renders.

```tsx
// 🟢 On hover, start fetching the detail data; by the time the click navigates, it's cached.
const queryClient = useQueryClient()
function onHover(id: string) {
  queryClient.prefetchQuery({ queryKey: ['product', id], queryFn: () => getProduct(id) })
}
<Link to={`/products/${id}`} onMouseEnter={() => onHover(id)}>{name}</Link>
```

> 🟡 **Optimization** — prefetch on a *strong* intent signal (link hover, a wizard's next step, a
> visible-but-not-yet-clicked row), not indiscriminately. **When NOT to:** prefetching everything on a
> list of 500 rows fires 500 requests and melts the server — the opposite of the waterfall problem, but
> just as real. Prefetch what the user is likely to reach next, not everything they *could*.

---

### Raw `useEffect` fetching is fragile

You *can* fetch with a bare `useEffect` + `fetch` + `useState`. For anything beyond a single
throwaway request, you shouldn't — and understanding exactly why is what justifies reaching for a
library.

#### What you are actually signing up for

A "simple" fetch-in-effect silently omits everything a cache does:

- **Races.** Without an `ignore` flag or `AbortController`, overlapping requests overwrite each other
  (see the cancellation section).
- **No cache.** Navigate away and back, and it refetches from scratch every time. Two components
  needing the same data fire two requests — **no deduplication.**
- **Waterfalls.** A parent fetches, renders a child, the child fetches — each network round trip
  gates the next. The user watches spinners cascade.
- **No revalidation.** The data is fetched once and then rots. Nothing refetches on window focus,
  reconnect, or after a mutation elsewhere invalidates it.
- **Manual everything else.** Loading flags, error state, retry, and pagination are all hand-rolled,
  per component, and drift.

react.dev ships the `ignore`-flag pattern explicitly as **damage control** for the no-framework case,
not as a recommendation:

```tsx
// The docs' own "if you have no better option" pattern — presented as damage control.
useEffect(() => {
  let ignore = false;
  usersApi.list().then((data) => { if (!ignore) setUsers(data); });
  return () => { ignore = true; };
}, []);
```

> 🔴 **Advanced / gotcha** — Bare `useEffect` fetching is a **last resort**, not a default pattern.
> It has no cache, no dedup, no revalidation, and invites waterfalls and races. Reach for it only for
> a genuinely one-off request in an app with no query library and no framework loader. Do not
> cargo-cult the `ignore`-flag snippet as *the* React data-fetching pattern — the docs present it as
> the thing you write when you have nothing better.

---

### TanStack Query as the default for server state

For a client-rendered React SPA (the stack this site targets), a query library is the default home
for server state. TanStack Query is the reference choice; SWR is a lighter equivalent with the same
core model.

#### What it gives you that `useEffect` cannot

Everything from the "fragile" list above, for free and correct:

- **Caching** keyed by a query key — navigate away and back, data is instant from cache while it
  revalidates.
- **Deduplication** — ten components asking for the same key at once produce **one** request.
- **Background refetch / stale-while-revalidate** — show cached data immediately, refetch in the
  background, swap in the fresh result. Refetch on focus and reconnect by default.
- **Invalidation** — after a mutation, `invalidateQueries` marks affected keys stale and everything
  showing them refetches.
- **Retry, pagination, and request-status** — built in, not hand-rolled.

```tsx
// Component-level read. Note it calls the SAME typed service function.
function UserCard({ id }: { id: string }) {
  const { data, isPending, error } = useQuery({
    queryKey: ['user', id],
    queryFn: ({ signal }) => usersApi.get(id, signal), // signal is provided — cancellation for free
  });

  if (isPending) return <Spinner />;
  if (error) return <ErrorNote error={error} />;
  return <div>{data.name}</div>;
}
```

```tsx
// Mutation, with invalidation so every reader of ['user', id] refreshes.
const queryClient = useQueryClient();
const mutation = useMutation({
  mutationFn: (patch: Partial<User>) => usersApi.update(id, patch),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', id] }),
});
```

The query library sits *on top of* the typed service layer — `queryFn` calls `usersApi.get`. You are
not choosing between a service layer and a query library; you layer them.

#### The three options, compared

| | Raw `useEffect` | Roll your own cache | TanStack Query / SWR |
|---|---|---|---|
| Dedup / cache | ✗ | you build it | ✓ |
| Background revalidate | ✗ | you build it | ✓ |
| Invalidation on mutation | ✗ | you build it | ✓ |
| Cancellation | manual | manual | built in (`signal`) |
| Bundle cost | 0 | your code | ~a few KB gzip |
| Right for | one throwaway fetch | ~never (you'll rebuild a query lib) | most client-rendered apps |

**Pros / Cons of adopting a query library**

- **Pro:** deletes the entire class of race / dedup / staleness bugs, and deletes the loading/error
  boilerplate from every component.
- **Pro:** one typed cache shared across the app; mutations keep every reader consistent.
- **Con:** a dependency and an API to learn (query keys, `staleTime`, invalidation) — real, if modest,
  conceptual overhead.
- **Con:** query-key discipline matters; a fumbled key means a cache miss or, worse, two components
  silently sharing the wrong entry.

> 🟡 **Optimization** — Adopt a query library when you have **server state that is read in more than
> one place, refetched, or mutated** — i.e. most real apps. The payoff is proportional to how much
> server data you have.
>
> **When not to reach for it:** a tiny app with a single fetch and no revalidation; or an app already
> using a **meta-framework whose router/RSC layer owns data fetching** (Next.js, Remix/React Router
> loaders, RSC). In those, the framework *is* your data layer — adding a second cache on top is
> duplicated machinery. Match the tool to where fetching already lives.

> 🔴 **Advanced / gotcha** — "Roll your own cache" is almost always a trap: the honest version of it
> *is* a query library, and you will rebuild dedup, invalidation, and revalidation one painful bug at
> a time. Choose it only with a specific constraint that rules the libraries out, knowing the cost.

---

### Where fetching belongs: loaders vs components

Two places can own a fetch, and the choice determines whether you get waterfalls.

**Component-level fetching** (a `useQuery` inside the component that needs the data) is colocated and
simple, but a parent that fetches, then renders a child that fetches, then a grandchild that fetches,
produces a **request waterfall** — each round trip gates the next, and the user watches spinners
cascade down the tree.

**Route-loader fetching** (React Router / TanStack Router / meta-framework loaders) hoists the fetch
to the route boundary and kicks off *all* of a route's requests **in parallel, before the component
tree renders**. The component renders once with data already in hand. This is the structural fix for
waterfalls that no amount of in-component `Promise.all` can fully achieve, because the child's request
no longer waits for the parent to render at all.

| | Component-level (`useQuery`) | Route loader |
|---|---|---|
| Colocation | ✓ data next to the component | fetch lives at the route |
| Waterfall risk | high for nested fetches | low — parallel at the boundary |
| Works without a router | ✓ | needs a data router / framework |
| Best for | leaf data, user-triggered reads | a route's primary data |

> 🟢 **Best practice** — Fetch a **route's primary data in its loader** (parallel, before render) and
> use **component-level queries for secondary or user-triggered data.** They compose: many stacks let
> the loader *prime* the query cache, so the loader kills the waterfall and the component still reads
> through the same cache. Prefer hoisting the fetch over accepting a cascade of nested spinners.

The through-line of this whole page: server data is a cache, you should not rebuild that cache by
hand, and *where* you start the fetch matters as much as *how* you await it.

---

### Sources

- https://react.dev/learn/you-might-not-need-an-effect
- https://react.dev/reference/react/useEffect#fetching-data-with-effects
- https://react.dev/learn/synchronizing-with-effects#fetching-data
- https://tanstack.com/query/latest/docs/framework/react/overview
- https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
- https://developer.mozilla.org/en-US/docs/Web/API/AbortController
- https://reactrouter.com/start/framework/data-loading
- Empirical, measured locally on a small reproduction (React 19.2.7, jsdom, 2026-07-18):
  sequential 604 ms vs parallel 221 ms fetch timing.

---

## Architecture: folders, colocation, and barrels

How you lay files out decides how a codebase ages. The wrong layout doesn't crash — it slowly makes
every change touch five directories and makes nothing safe to delete. This page covers the two
folder strategies (layer-based vs feature-based), colocation, and the barrel-file question, which is
more nuanced than the folklore claims.

Verified stack as of 2026-07-18: React 19.2.7, TypeScript 7.0.2, Vite 8.1.5 (ships Rolldown as its
bundler), MUI 9.2.0. Barrel numbers below were measured on a small reproduction — see the Sources.

---

### Layer-based vs feature-based folders

#### The problem with layer-based

The default layout most tutorials teach groups files by *what kind of thing they are*:

```
src/
  components/
    CheckoutForm.tsx
    CartSummary.tsx
    ProductCard.tsx
    UserAvatar.tsx
    ...42 more...
  hooks/
    useCart.ts
    useUser.ts
    useProductSearch.ts
  api/
    cart.ts
    user.ts
    products.ts
  types/
    cart.ts
    user.ts
  utils/
    formatPrice.ts
```

It looks tidy on day one. The failure shows up on the first real change. "Fix the checkout total"
now touches `components/CheckoutForm.tsx`, `hooks/useCart.ts`, `api/cart.ts`, `types/cart.ts`, and
`utils/formatPrice.ts` — five directories for one feature. Worse: when checkout is removed, nothing
tells you which of those 50 components, 12 hooks, and 8 api modules were checkout's and are now dead.
Layer-based layout **spreads a feature across the tree and makes deletion guesswork.**

#### Feature-based: change stays local

Group by *what the code is for*, not what kind of file it is. Each feature owns its components,
hooks, api calls, and types; a thin `shared/` holds genuinely cross-feature primitives.

```
src/
  features/
    checkout/
      components/
        CheckoutForm.tsx
        CartSummary.tsx
      hooks/
        useCart.ts
      api/
        cart.ts
      types.ts
      index.ts          # the ONLY surface other features may import
    catalog/
      components/
        ProductCard.tsx
      hooks/
        useProductSearch.ts
      api/
        products.ts
      index.ts
  shared/
    components/
      Button.tsx
    hooks/
      useDebounce.ts
    lib/
      formatPrice.ts
  app/
    router.tsx
    App.tsx
```

Now "fix the checkout total" lives inside `features/checkout/`. Removing checkout is one command:
delete the folder, delete its route, done — the only thing that can break is an import that reached
into it, which is exactly what the next rule forbids.

> 🟢 **Best practice** — organize by feature, not by file type, for anything past a toy app. It keeps
> each change local and makes deletion a mechanical operation instead of an archaeology project. This
> is a maintainability rule, not an optimization — it costs you nothing at runtime.

#### The rule that keeps it honest: no cross-feature internals

Feature folders only work if features don't reach into each other's guts. `catalog` may import from
`checkout`'s public entry (`features/checkout/index.ts`) or from `shared/`, but never from
`features/checkout/hooks/useCart.ts` directly. Without this rule, feature folders quietly turn back
into a tangled layer-based ball where everything imports everything.

```ts
// BAD — catalog reaches into checkout's internals; the boundary is already gone
import { useCart } from '../checkout/hooks/useCart'

// GOOD — through the public entry, or not at all
import { useCart } from '../checkout'
```

Enforce it mechanically — `eslint-plugin-boundaries` (7.0.2) or ESLint's built-in
`import/no-restricted-paths`. Unenforced, this convention decays within a quarter: the first person
in a hurry deep-imports, code review misses it, and the boundary is gone.

#### Make the dependency graph flow one way

The deeper rule (bulletproof-react's core contribution) is that imports point in **one direction
only**: `shared → features → app`. The app composes features; features use shared primitives; nothing
points back up. `shared/` never imports a feature, and a feature never imports from `app/`. A
one-directional graph has no import cycles, and you can reason about any layer without loading the ones
above it.

```
app/        ← composes features into routes; may import features + shared
  ↑ (imports downward only)
features/   ← self-contained; may import shared; NEVER app, NEVER a sibling's internals
  ↑
shared/     ← components, hooks, lib, utils, types; imports NOTHING app- or feature-specific
```

```js
// eslint.config — import/no-restricted-paths, the enforceable form of the arrows above
'import/no-restricted-paths': ['error', {
  zones: [
    // features and app may NOT be imported by shared
    { target: './src/{components,hooks,lib,utils,types}', from: './src/{features,app}' },
    // app may NOT be imported by features (features sit below app)
    { target: './src/features', from: './src/app' },
    // features may not import each other's internals (pair with the public-entry rule)
    { target: './src/features/checkout', from: './src/features', except: ['./checkout'] },
  ],
}]
```

> 🟢 **Best practice** — encode the layering as `import/no-restricted-paths` zones and let CI fail the
> build on a violation. The rule you can't lint is the rule you don't have; a diagram in a wiki does not
> stop the 4pm deep-import. This is [Dependency Inversion](design-principles#dependency-inversion-depend-on-abstractions-not-concretions)
> at the folder level — high layers depend on low ones, never the reverse.

**Pros / Cons — feature-based layout**

| Pros | Cons |
|---|---|
| One change touches one folder | Requires judgment on where a shared thing lives |
| Deletion is mechanical (`rm -rf` the folder) | "Is this shared or checkout's?" arguments are real |
| Clear ownership; teams map to features | Small apps don't need the ceremony |
| Public-entry rule makes the dependency graph legible | Boundary rule must be lint-enforced or it rots |

**When NOT to use it:** a genuinely small app (a few screens, one developer) is *more* legible flat.
Don't build `features/` with one feature in it. And beware over-splitting `shared/` into a
micro-library of 200 one-export files — that trades the layer-based problem for a different mess.
Feature folders earn their keep when you have real features that change independently.

---

### Colocation: keep related files adjacent

Colocation means a file lives next to the code it serves, not in a parallel tree of its kind. The
test sits beside the component; the feature's styles, stories, and helpers sit inside the feature.

```
features/checkout/components/
  CheckoutForm.tsx
  CheckoutForm.test.tsx      # test beside source, not in a mirror /tests tree
  CheckoutForm.module.css
  CheckoutForm.stories.tsx
```

The payoff is the same as feature folders, one level down: when you open `CheckoutForm.tsx` you can
see everything about it in one directory listing, and when you delete it the test and styles go with
it instead of rotting in `/tests/components/CheckoutForm.test.tsx` forever.

> 🟢 **Best practice** — colocate tests, styles, and stories with the component they cover. It makes
> the unit self-contained: everything moves, renames, and deletes together. A parallel `/tests` tree
> that mirrors `/src` guarantees the two drift apart.

**When NOT to colocate:** end-to-end tests that exercise *flows across features* (auth → checkout)
don't belong to any single component — keep those in a top-level `e2e/`. Colocation is for the unit;
cross-cutting suites are their own thing.

---

### Barrel files: the nuance folklore gets wrong

A barrel is an `index.ts` that re-exports a folder's contents so callers can import from one path:

```ts
// features/checkout/index.ts
export * from './components/CheckoutForm'
export * from './components/CartSummary'
export { useCart } from './hooks/useCart'
```

They're genuinely useful — they define a feature's public surface (the `index.ts` in the tree above
is exactly this, and it's what the no-internals rule leans on). The folklore claim is "barrels bloat
your production bundle." That claim is mostly wrong, and it matters to get right, because the *real*
cost is somewhere else.

#### What we measured

Importing **one** symbol out of 20, two ways, on a small reproduction (see Sources). With pure,
side-effect-free modules, tree-shaking makes the barrel and the direct import identical — both come
out to 99 bytes. The barrel costs nothing there. The cost appears only when the re-exported modules
have **side effects** (a registration call, a top-level `console`, a style import) that tree-shaking
is not allowed to drop:

| Import path | Bundle | Modules pulled into the graph |
|---|---|---|
| Direct (`./mods/m1`) | **143 bytes** | **2** |
| Via barrel (`./index`), side-effectful modules | **1571 bytes** | **22** |

Measured on a small reproduction (React 19, jsdom); your numbers will differ in production. The point
is the *direction*: with side effects, importing one symbol through the barrel dragged all 22 modules
into the bundle because tree-shaking couldn't prove the other 19 were safe to drop.

#### Why React/bundlers behave this way

Tree-shaking can only remove a module if it can prove removing it changes nothing observable. A pure
module that just exports a function is provably safe to drop. A module with a top-level side effect —
`registerComponent(Foo)`, `import './global.css'`, anything that runs at import time — is *not*
provably safe, so `export *` through a barrel keeps it. The barrel didn't create the cost; the side
effect did. The barrel just made it easy to pull in 19 modules you never named. This is the module
version of the same [purity](fundamentals#purity) idea that governs React components: no side effects
means the optimizer is free to skip you.

#### The cost that actually bites: dev cold-start and HMR

The production bundle is the *smaller* problem. In the Vite dev server there is no tree-shaking of
your source — when you import one symbol from a barrel, Vite must request and transform **every**
module the barrel re-exports so it can resolve the graph. A barrel over 50 components means ~50
module requests to get one `Button`, on cold start and again through HMR on save. This is the cost
you feel every day, and it's independent of whether the modules are pure.

> 🟡 **Optimization** — avoid deep barrels on hot import paths when dev cold-start or HMR is a felt
> pain. It has a cost: you lose the tidy single import path and callers write longer, deeper imports.
> Apply it when you've *felt* the slow startup, not preemptively. A feature's public `index.ts` (a
> handful of exports) is not the problem; a `components/index.ts` re-exporting 80 modules on the
> app's main import path is.

> 🔴 **Advanced / gotcha** — "barrels bloat production bundles" is only true for **side-effectful**
> modules or packages that forgot `"sideEffects": false` in `package.json`. Pure modules tree-shake
> through a barrel fine (measured: identical bytes). Diagnose before you delete every `index.ts`: set
> `"sideEffects": false` where it's true, and reserve barrel-flattening for modules that actually
> have side effects or for dev-startup pain. Blanket "barrels are slow" is folklore.

**Pros / Cons — barrel files**

| Pros | Cons |
|---|---|
| Define a clean public surface for a feature | Dev cold-start / HMR crawl every re-exported module |
| One import path; callers don't know internal layout | Side-effectful modules defeat tree-shaking through them |
| Enables the "import only via public entry" boundary | Create import cycles by accident (`A → index → B → index → A`) |
| Refactor internals without touching callers | Symptom of a cycle — `undefined` at module init, far from cause |

**When NOT to worry about barrels:** a small feature entry with a handful of pure exports and
`"sideEffects": false` set is fine — keep it; it's how you enforce the public-surface boundary. The
nuance is *scale and side effects*, not the pattern itself.

#### The MUI corollary

The old v4-era advice was "always deep-import `@mui/material/Button`, never
`import { Button } from '@mui/material'`, or you'll bundle all of MUI." For **production**, that's
stale — MUI v9 supports named imports and modern Rollup/Rolldown tree-shakes them. But `@mui/material`
is a giant barrel, so named imports still measurably slow **dev cold-start**, the same mechanism as
above.

> 🟡 **Optimization** — default to named MUI imports (`import { Button } from '@mui/material'`) for
> readability; reach for deep imports (`@mui/material/Button`) only if dev startup is a felt pain.
> Different problem (dev-time crawl), different fix — not a production-bundle rule in v9.

---

### Conventions worth lint-enforcing

Two smaller standards that pay off once a second person joins:

- **Kebab-case file and folder names**, enforced (`eslint-plugin-check-file`:
  `filename-naming-convention` / `folder-naming-convention`). Mixed `UserCard.tsx` / `user-card.tsx`
  casing causes phantom git conflicts on case-insensitive filesystems (macOS, Windows) that vanish on
  Linux CI — a genuinely maddening bug class. Pick one case and lint it.
- **Wrap third-party components at a boundary.** Import a UI library's `<Button>` through your own
  `<Button>` (and your API client through your own module — see [Dependency Inversion](design-principles#dependency-inversion-depend-on-abstractions-not-concretions)).
  When the library ships a breaking change or you swap it, you edit one adapter, not 300 call sites. Do
  this for the components you use *everywhere*; wrapping a one-off is just indirection.

> 🟡 **Optimization** — a [Storybook](https://storybook.js.org/) catalogue is worth it for a real design
> system or a team building shared components in isolation. **When NOT to:** it's real setup and
> maintenance; a small app with no shared-component library doesn't need it. Don't add it on day one.

### Putting it together

The whole architecture reduces to one idea: **make the boundaries of a change visible.** Feature
folders make a feature a thing you can see and delete. Colocation makes a component a thing you can
see and delete. Public-entry barrels make "what other features may touch" a thing you can see and
lint. Everything else — the barrel bundle question, MUI import style — is a measured optimization you
apply when a real cost shows up, not a rule you follow on faith.

When a decision here invokes *why* React or the bundler behaves a certain way — why an unchanged
prop identity or a side-effectful module matters — that's the domain of
[render vs commit](fundamentals#render-vs-commit), [reconciliation](fundamentals#reconciliation), and
[purity](fundamentals#purity) on the Fundamentals page.

---

### Sources

- Vite performance guide (dependency pre-bundling, barrel-file guidance) — https://vite.dev/guide/performance
- Vite 8 / Rolldown bundler — https://vite.dev/guide/rolldown
- `eslint-plugin-boundaries` (feature-isolation enforcement) — https://github.com/javierbrea/eslint-plugin-boundaries
- ESLint `import/no-restricted-paths` — https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md
- Webpack `"sideEffects"` field / tree-shaking — https://webpack.js.org/guides/tree-shaking/
- MUI named vs deep imports (minimizing bundle size) — https://mui.com/material-ui/guides/minimizing-bundle-size/

---

## Quality: Testing, Accessibility, Performance, Tooling, Structure

The four disciplines that keep a React codebase honest after the demo. Verified stack as of
2026-07-18: React 19.2.7, TypeScript 7.0.2, Vite 8.1.5, Vitest 4.1.10, MUI 9.2.0. Every version
claim below was checked against npm or measured on a real install; hedges are kept where the
evidence was second-hand.

---

### Tooling

#### The Vite template ships oxlint, not ESLint

Measured on a real `npm create vite@latest -- --template react-ts` (2026-07-17):

```json
"devDependencies": {
  "oxlint": "^1.71.0",
  "typescript": "~6.0.2",
  "vite": "^8.1.1"
},
"scripts": { "build": "tsc -b && vite build", "lint": "oxlint" }
```

There is no `eslint`, no `typescript-eslint`, and no flat config anywhere in the generated project.
The `lint` script is `oxlint`, and a `.oxlintrc.json` is generated with
`plugins: ["react","typescript","oxc"]` and `react/rules-of-hooks: error`. Vite's own default
answers the "is a Rust linter production-viable in 2026?" question in the affirmative — but read the
next section before you conclude it's *sufficient*.

> The template pins `typescript: ~6.0.2`, deliberately one major behind the npm `latest` of 7.0.2.
> That is a readiness signal, not a bug. Readers who stay on TS 6 are not wrong. This site pins 7.0.2
> because it was measured working with the full stack (see the TypeScript page), but the ecosystem
> default is still 6.

#### Is oxlint enough? An honest answer

oxlint (`latest` 1.74.0) and Biome (`@biomejs/biome` `latest` 2.5.4) are both production-viable
*linters* in 2026. The stale folklore — "Rust linters aren't ready" — is wrong. The real question is
narrower: **type-aware linting**, the rules that need a type checker to fire (no-floating-promises,
no-misused-promises, strict-boolean-expressions, and friends).

| Linter | Type-aware engine | Trade-off |
|---|---|---|
| oxlint | `tsgo` (the TypeScript 7 Go port) via `oxlint-tsgolint` 0.25.0 | Accuracy tracks the real compiler; type-aware mode reported ~10–20x slower than plain oxlint |
| Biome 2.x | Biome's *own* type inference (not `tsc`) | Full speed; reported ~75% of the floating-promises typescript-eslint catches |
| typescript-eslint 8.64.0 | real `tsc` | Correctness baseline; slowest |

> The "~75%" and "10–20x" figures are vendor self-reports and secondary sources respectively — not
> reproduced here. Treat them as direction, not measurement.

The defensible 2026 recommendation:

- **oxlint as the fast default** — pre-commit and CI first pass. It is what the template ships and it
  catches the large majority of authoring mistakes at a speed ESLint cannot touch.
- **typescript-eslint + ESLint 10 as the correctness baseline** if your codebase leans on
  type-aware rules (floating promises in a data-heavy app are worth catching precisely). Do not claim
  ESLint is obsolete — it remains the most accurate type-aware linter.
- **Biome as the formatter** — its formatter is a mature, Prettier-compatible drop-in. Splitting
  "Biome for format, ESLint for lint" is a legitimate config that sidesteps the type-inference gap.

> 🟢 **Best practice** — run *a* linter that enforces `react/rules-of-hooks` in CI. Which engine is a
> tuning decision; enforcing the rule at all is a correctness rule. The Vite template's oxlint default
> already does this out of the box.

> 🟡 **Optimization** — adding a *type-aware* second pass (typescript-eslint or `tsgolint`) has a real
> cost, so add it only when a measured class of bug justifies it.
>
> **Pros:** catches floating/misused promises and other whole-program mistakes a syntactic linter
> physically cannot see. **Cons:** needs the type checker to run, so it is 10–20× slower than plain
> oxlint (vendor-reported) and, on TS 7, collides with typescript-eslint's `<6.1.0` peer bound.
> **When NOT to use it:** a UI-heavy app with little async plumbing gets marginal value for the CI-time
> cost — ship the fast syntactic pass and skip it.

#### The typescript-eslint / TypeScript 7 collision

If you *do* add typescript-eslint, you hit a hard wall. `typescript-eslint@8.64.0` declares
`"typescript": ">=4.8.4 <6.1.0"`. Installing TS 7 with it fails at resolution, not with a warning:

```
npm error ERESOLVE unable to resolve dependency tree
npm error   peer typescript@">=4.8.4 <6.1.0" from typescript-eslint@8.64.0
```

TypeScript 7.0 is the Go-native rewrite and ships **without a programmatic compiler API** (per the
official GA announcement, July 8 2026: *"TypeScript 7.0 does not ship with an API"*). Every tool that
talks to the compiler API rather than the `tsc` binary — typescript-eslint, ts-jest, ts-morph, Volar
— is blocked until it migrates. The `tseslint` 8.x canary carries the same `<6.1.0` bound; no fix is
staged in the 8.x line.

This is exactly why the collision is avoidable on a fresh project: **the Vite template uses oxlint,
which needs no compiler API and consumes `tsgo` directly.** The irony is worth stating plainly — TS 7
breaks typescript-eslint but is precisely the engine oxlint's type-aware mode is built on. Your
options if you need typed lint today:

1. Pin TypeScript 6.0.2 and keep typescript-eslint. Boring, works.
2. Drop typescript-eslint, use oxlint's `tsgolint` type-aware mode on TS 7.
3. Run TS 7 for `tsc --noEmit` and the side-by-side `@typescript/typescript6` (npm alias
   `typescript@npm:@typescript/typescript6`, version 6.0.2) for lint. Two type-checkers, possible
   diagnostic divergence — a real cost.

Never reach for `--legacy-peer-deps` or `--force` here. The bound is a genuine API incompatibility,
not conservatism.

#### ESLint 10 removed eslintrc — silently

If you run ESLint, run 10 (`latest` 10.7.0, shipped 2026-07-10) knowing what changed. ESLint 10
**removed the legacy eslintrc system entirely**, and the removal is silent:

- `.eslintrc.*` and `.eslintignore` are **no longer honored** — and no error is printed. Your lint
  passes with *zero rules applied* and CI stays green. That is the production gotcha.
- CLI flags removed: `--no-eslintrc`, `--env`, `--resolve-plugins-relative-to`, `--rulesdir`,
  `--ignore-path`. The `LegacyESLint` compat layer is gone.
- Codemod: `@eslint/v9-to-v10`.

> The 9.x line is still maintained in parallel — `9.39.5` shipped the same day as `10.7.0`. "ESLint 10
> is current" is true, but 9.x is not abandoned. Slow-moving teams have a supported path.

---

### Testing

#### Vitest 4 — current, and the migration that bites

`vitest` `latest` 4.1.10; the 4.0.0 line released 2025-10-22 (some blogs say December — they are
wrong). What changed from 2/3:

- **Browser Mode is stable** — the experimental tag is gone. Breaking change: the provider is now a
  **separate package** you must install: `@vitest/browser-playwright`, `@vitest/browser-webdriverio`,
  or `@vitest/browser-preview` (all three exist on npm at 4.1.10). A v3 browser config will not work
  unchanged.
- **`workspace` config is replaced by `projects`.** This is the migration that bites monorepos.
- Built-in **visual regression** (screenshot + reference compare) and **Playwright trace support**
  (`browser.trace: on | on-first-retry | retain-on-failure | ...`) in Browser Mode.

The strategic consequence: Browser Mode going stable makes the **jsdom vs real browser** choice live
again. jsdom lies about layout, focus, and anything touching real CSS — exactly the things a11y tests
care about. Browser Mode is the honest option; jsdom is the fast one. Reach for Browser Mode when the
assertion depends on real rendering (focus, contrast, computed visibility); stay on jsdom for pure
logic and props.

#### RTL query priority is an accessibility lint in disguise

Query in this priority order, always:

**role → label → placeholder text → text → display value → alt text → title → test id**

`getByTestId` is the *last* resort, and reaching for it is a smell: if you cannot select an element by
role or label, **a screen reader cannot reach it either**. The priority list is an accessibility check
wearing a query API's clothes.

> 🟢 **Best practice** — query by role/label first. This is a correctness rule, not a style
> preference: a test that can only find an element by test id is silently documenting that the element
> is inaccessible.

```tsx
// BAD — testid tells you nothing about whether the element is reachable
const submit = screen.getByTestId('submit-btn')

// GOOD — asserts the accessible name a screen reader would announce
const submit = screen.getByRole('button', { name: /submit/i })
```

#### user-event over fireEvent, always

`fireEvent.click` dispatches one synthetic event. `userEvent.click` fires the full sequence —
pointerdown, mousedown, focus, pointerup, mouseup, click — and respects `pointer-events: none` and
`disabled`.

The bug it catches: a button that is visually disabled but still wired to its handler. `fireEvent.click`
fires the handler and your test passes green; a real user's click does nothing. `userEvent` reproduces
the real user, so the test fails where reality fails.

```tsx
// BAD — fires the handler even on a disabled button; test lies
fireEvent.click(screen.getByRole('button', { name: /delete/i }))

// GOOD — respects disabled/pointer-events, must be awaited, setup() once
const user = userEvent.setup()
await user.click(screen.getByRole('button', { name: /delete/i }))
```

`userEvent` must be `await`ed and set up via `userEvent.setup()` per test.

> 🟢 **Best practice** — reach for `userEvent` by default; it is a correctness rule. `fireEvent` is not
> wrong to *exist* (it is the right tool for dispatching a single low-level event you can't express as a
> user gesture), but as the default it lets false-green tests through.

#### What NOT to test

- **Implementation details** — `useState` internals, whether a `memo` hit, internal call counts.
- **Snapshot tests of whole component trees** — they get blindly `-u`'d on every failure and end up
  asserting nothing.
- **The library** — MUI's `Button` works; testing it tests Material UI's CI, not yours.
- **Types at runtime** — that is the type checker's job.

#### Hooks, network, and E2E

- **`renderHook`** from RTL exists, but reserve it for genuinely reusable hooks. A hook used by one
  component is better tested *through* that component.
- **MSW for the network** (`msw` 2.15.0) — intercept at the network layer, not by mocking `fetch` or
  axios. Mocking `fetch` tests your mock; MSW tests your serialization, URL building, and error paths.
  MSW handlers are shareable across Vitest, Browser Mode, and Playwright — one source of fixture truth.

> 🟢 **Best practice** — mock at the network boundary, not the client. A test that stubs your `fetch`
> wrapper passes even when your URL building or JSON shape is wrong; MSW exercises that real seam.
- **Playwright** (`@playwright/test` 1.61.1) is for critical *flows* — auth, checkout — not coverage.
  The pyramid holds; the anti-pattern is E2E-ing what an RTL test proves more cheaply.

---

### Accessibility

#### Semantic HTML first

Every `role=` you write is a small admission the element was wrong.
`<div role="button" tabIndex={0} onClick>` needs manual Enter *and* Space handling, a focus ring, and
disabled semantics — a `<button>` gives all four for free.

```tsx
// BAD — three bugs waiting: no Space key, no focus ring, no disabled state
<div role="button" tabIndex={0} onClick={save}>Save</div>

// GOOD
<button onClick={save}>Save</button>
```

> 🟢 **Best practice** — pick the native element before you reach for `role`. It is a correctness rule:
> the browser gives you keyboard behavior, focus, and disabled semantics that you would otherwise have
> to reimplement (and usually get wrong).

#### Focus management on route change is THE SPA a11y bug

Client-side navigation swaps the DOM but **does not move focus and announces nothing**. Screen-reader
users hear silence; keyboard users stay focused deep in the *old* page — or on `<body>`, which strands
Tab at the top of the document. Browsers do this correctly on full page loads; React Router does not do
it for you.

The fix, on each route change:

- Move focus to the new page's `<h1>` (or a top container) that carries `tabIndex={-1}`.
  `tabIndex={-1}` means *focusable programmatically but not in the tab order* — the correct value.
  `tabIndex={0}` wrongly injects the heading into the tab sequence.
- Optionally announce the new page title via a polite live region.
- Reset scroll — React Router restores neither focus nor scroll by default.

```tsx
function Page({ title, children }: { title: string; children: React.ReactNode }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
    window.scrollTo(0, 0)
  }, [])
  return (
    <>
      <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
      {children}
    </>
  )
}
```

> 🟢 **Best practice** — move focus on every route change. This is a correctness rule; the browser does
> it for free on a full page load and a client-side router breaks that guarantee. The empty
> [dependency array](fundamentals#dependency-arrays) here fires the effect once per mount — which is
> exactly one focus move per navigation when the router remounts the page.

#### Keyboard traps and focus return

Modals must trap focus *inside* while open and **return focus to the trigger** on close. MUI's
`Modal`/`Dialog` does this via `FocusTrap`. Hand-rolled modals almost never restore focus — the user
closes the dialog and lands back on `<body>`, re-tabbing the entire page. If you build a modal, storing
and restoring `document.activeElement` is not optional.

#### aria-live: mount the region empty, then write into it

Use `polite` for status, `assertive` only for genuine interruptions. The gotcha: the live region must
be **in the DOM before** its text changes. Mounting an already-filled region announces nothing in most
screen-reader/browser pairs. Render the empty container up front, then write into it.

```tsx
// BAD — region appears with text already in it; often silent
{error && <div role="alert">{error}</div>}

// GOOD — container is present from the start; the text change is announced
<div role="alert" aria-live="assertive">{error}</div>
```

> 🔴 **Gotcha** — the empty-then-write ordering is a real trap: both versions look correct in review and
> pass a snapshot test, but the first is silent for most screen-reader/browser pairs. There is no lint
> rule and no console warning for it — you only catch it by testing with an actual screen reader.

#### Contrast

WCAG 2.2 AA requires **4.5:1** for normal text, **3:1** for large text (≥18.66px bold or ≥24px) and
for UI components and meaningful graphics. MUI's default `text.secondary` and `disabled` states are a
classic AA miss once you apply a custom palette — theme overrides must be re-checked. The library
defaults are not a guarantee.

#### Tooling division of labor

- **`eslint-plugin-jsx-a11y`** (6.10.2) — static analysis, catches *authoring* mistakes (missing
  `alt`, invalid role, no label).
- **axe** (`@axe-core/react` 4.12.1, `@axe-core/playwright` 4.12.1) — runtime, catches computed
  contrast, ARIA-tree, and focus-order issues jsx-a11y can't see statically.

> In Browser Mode / E2E, prefer `@axe-core/playwright` over `vitest-axe` — the latter is `0.1.0`,
> pre-1.0 with low activity.

> Automated tooling catches roughly **30–40%** of real accessibility issues; the rest needs keyboard
> and screen-reader testing. Never let a green axe run read as "accessible." (The 30–40% figure is the
> widely cited Deque number — direction, not a measurement we reproduced.)

---

### Performance

#### INP replaced FID — and this is the React-relevant metric

FID was **retired on 2024-03-12**, when INP became a Core Web Vital. This is not "being replaced" —
it happened over two years ago. Any 2026 doc still listing FID as a Core Web Vital is stale. The
current trio is **LCP, INP, CLS**.

| Metric | Good | Needs improvement | Poor |
|---|---|---|---|
| INP | ≤ 200ms | 200–500ms | > 500ms |

Why INP matters for React specifically: FID measured only *input delay* — the gap before your handler
ran — and React apps scored well because that gap is short. INP measures **input → next paint**, which
includes your [render and commit](fundamentals#render-vs-commit). **React apps that looked fine under
FID regress visibly under INP.** That is the entire reason INP, not LCP, is the metric to watch for
interactive React UIs.

#### What actually causes slow React

Not "not enough `memo`." In rough order of real-world impact:

1. **Too much JS shipped** — parse, compile, execute before anything renders. Beats every render
   optimization.
2. **Render-blocking waterfalls** — component mounts, *then* fetches, then its child mounts and
   fetches.
3. **Huge un-virtualized lists** — 5,000 rows means 5,000 component instances and 5,000 DOM nodes.
4. **Context re-render storms** — one context holding `{ user, theme, cart }` re-renders every
   consumer of all three on any change. The fix is splitting contexts by change frequency, not `memo`.
5. **New object/array/function identities in props each render**, defeating memoization you already
   paid for. A fresh `{}` or `() => {}` fails the [reconciliation](fundamentals#reconciliation)
   identity check, so the memoized child re-renders anyway.
6. Only then: genuinely expensive renders.

> 🟢 **Best practice** — attack this list top-down, not bottom-up. The reflex to reach for `memo`
> targets item 6, the *smallest* lever. Shipping less JS and splitting contexts by change frequency are
> correctness-of-architecture decisions that beat any render optimization.

#### React Compiler changes the memo advice — but is not a performance strategy

`babel-plugin-react-compiler` is stable at **1.0.0** (shipped 2025-10-07; treat it as mature, not
brand-new). It auto-memoizes, so **hand-written `useMemo`/`useCallback`/`memo` are largely obsolete for
new code** — it produces the same skip-the-unchanged-child win a hand-written `React.memo` gives you,
with no source change. But the compiler does **not** fix problems #1–#4 above — shipping less JS,
splitting contexts, and virtualizing are still manual work. The compiler is not a performance strategy;
it is a render-cost eliminator.

> 🟡 **Optimization** — reach for a *manual* `useMemo`/`useCallback`/`memo` only when the compiler is
> off or has [bailed](fundamentals#purity) on that component, and a measured cost justifies it. Every
> manual memo adds a comparison on each render that only pays off for an expensive child or one that
> renders often with stable props.

> 🔴 **Advanced / gotcha** — do **not** mass-delete existing `useMemo`/`useCallback` when you turn the
> compiler on. react.dev states that removing existing memoization *can change compilation output*, and
> the plugin ships `react-hooks/preserve-manual-memoization` as an **error-level** rule — the compiler
> consumes manual memo as a semantic signal. The "delete all your memo" advice that dominates online is
> actively harmful. Compiler bailouts are also silent and per-function: a render-phase mutation can make
> it skip a component with no warning, and you're back to un-memoized renders believing you're covered.

#### Bundle budgets — enforce them or they don't exist

Vite's `build.rollupOptions.output.manualChunks` splits chunks and `chunkSizeWarningLimit` prints a
warning — but the warning **does not fail the build**. That is the gotcha: a budget that only warns is
not a budget. Real enforcement needs `size-limit` (12.1.0) or a CI check on the `dist` output.

> 🟢 **Best practice** — enforce the budget in CI, don't just warn. An advisory limit is one hurried PR
> away from silently doubling first-load JS; a failing check is the only version that actually holds.

> Vite 8 ships **Rolldown** as its bundler (confirmed by the build warning referencing
> `build.rolldownOptions.output.codeSplitting`) — no opt-in required. The `rollupOptions` names still
> work for compatibility.

#### Code splitting

Route-level splitting via `React.lazy` + `Suspense` is the highest-value split you can make. It
directly attacks problem #1 — too much JS shipped — which beats every render optimization.

```tsx
// GOOD — route-level split, default export required
const Dashboard = lazy(() => import('./features/dashboard/Dashboard'))

<Suspense fallback={<Spinner />}>
  <Dashboard />
</Suspense>
```

> 🟢 **Best practice** — route-split any multi-route SPA. Measured on this very site's own build,
> route-splitting the entry, the markdown renderer, and each doc page took first-load JS from
> **258 KB → 92 KB gzip** (measured on a real build; your numbers will differ). The markdown renderer
> (~101 KB gzip) now loads only when you open an article.
>
> **Pros:** the browser downloads, parses, and executes only the code the first screen needs.
> **Cons:** a lazy route shows a brief fallback on first navigation — a flash where there was none.
> **When NOT to use it:** don't split a component that is on the critical path of the *current* screen,
> and don't over-split into dozens of tiny chunks — each one is a request and a fallback. Mitigate the
> flash by prefetching on link hover for hot routes.

Two gotchas:

- `React.lazy` needs a **default export**. Named-export components need a re-export shim:
  `lazy(() => import('./X').then(m => ({ default: m.X })))`.
- A lazy boundary with no `Suspense` fallback above it **throws at runtime**, not at build time.

#### Images and CLS

- `loading="lazy"` for below-the-fold images, but **never on the LCP image** — you would delay the
  exact thing INP/LCP measure. Use `fetchpriority="high"` on the LCP image instead.
- Always set `width`/`height` (or `aspect-ratio`). Missing dimensions are the #1 cause of CLS.
- **Serve modern formats.** AVIF/WebP are a fraction of the bytes of the same JPEG/PNG; deliver them with
  a `<picture>` fallback so old browsers still get something:

```html
<picture>
  <source srcset="hero.avif" type="image/avif" />
  <source srcset="hero.webp" type="image/webp" />
  <img src="hero.jpg" width="1200" height="630" alt="…" fetchpriority="high" />
</picture>
```

- **Serve the right *size* per device** with `srcset` + `sizes`, so a phone doesn't download a 1600px
  image: `<img srcset="s.jpg 640w, m.jpg 1024w, l.jpg 1600w" sizes="(max-width: 700px) 100vw, 50vw" …>`.
  Images are usually the largest bytes on a page — this often beats any JS optimization on LCP.

> 🔴 **Gotcha** — `loading="lazy"` is a 🟢 default for below-the-fold images but a footgun on the LCP
> image: the one blanket "lazy-load all images" rule actively worsens the metric it looks like it
> should help. Know which image is your LCP element before you reach for it.

#### Measure before you memoize

Use the React Profiler's flamegraph with "record why each component rendered" enabled (Profiler
settings). The intuition about *what* is slow is wrong most of the time — measure first.

---

### Structure

#### Feature-based over layer-based

Layer-based layout (`/components`, `/hooks`, `/utils`, `/types`) scales badly: one feature change
touches five directories, and nothing tells you what's safe to delete. Feature-based layout keeps
change local and **makes deletion possible** — delete the folder, delete the feature.

```
src/
  features/
    checkout/
      components/  hooks/  api/  types.ts
      index.ts        # the ONLY public surface other features may import
  shared/            # cross-feature primitives, deliberately thin
```

The rule that keeps it honest: **features must not import each other's internals** — only a feature's
public entry (`features/checkout/index.ts`), or `/shared`. Enforce it with
`eslint-plugin-boundaries` (7.0.2) or `import/no-restricted-paths`. Unenforced, this convention decays
within a quarter. Colocate tests next to source.

> 🟢 **Best practice** — organize by feature and enforce the boundary in lint. The boundary is the
> whole value: unenforced, "don't import internals" is a comment nobody obeys, and the layout's one real
> benefit — being able to delete a feature by deleting its folder — quietly evaporates.

#### The barrel-file problem

A barrel is an `index.ts` that re-exports a whole folder (`export * from './Button'`). The real costs:

1. **Dev-server cold start and HMR (Vite)** — importing one symbol from a barrel makes Vite request and
   transform *every* module the barrel re-exports. A barrel over 50 components means 50 module requests
   to get one `Button`. This is the biggest *felt* cost and it hits on every save. Vite's own docs warn
   against barrel files for this reason.
2. **Test speed** — same mechanism; every test importing the barrel pulls the whole tree.
3. **Import cycles** — barrels create them almost by accident (`A → index → B → index → A`). The symptom
   is `undefined` at module init, far from the cause. This is the one that burns a production afternoon.

> **Production bundle:** modern Rollup/Rolldown tree-shaking *usually* handles `export *` fine for ESM.
> The bundle cost is real mainly when a re-exported module has side effects or its package isn't marked
> `"sideEffects": false`. Do **not** claim barrels bloat production bundles as a blanket rule — that is
> the folklore version. The defensible claim is dev-time cost plus import cycles. No specific slowdown
> multiplier is published here because none was benchmarked; the mechanism is documented, the magnitude
> is workload-dependent.

A small reproduction shows exactly where the line is. Importing **one** symbol out of 20:

| Import path | Bundle | Modules pulled into the graph |
|---|---|---|
| Direct (`./mods/m1`) | **143 bytes** | **2** |
| Via barrel, side-effectful modules | **1571 bytes** | **22** |

With *pure* modules the two are identical (99 bytes either way — tree-shaking drops the unused 19). Add
a side effect to each module (a registration, a style import, a `console`) and tree-shaking can no
longer drop them, so the whole barrel graph rides along. Measured on a small reproduction; the point is
the mechanism, not the byte count.

> 🟡 **Optimization / nuance** — a barrel is not automatically bad. **Pros:** one tidy import surface;
> harmless for pure, side-effect-free modules with `"sideEffects": false` set. **Cons:** dev cold-start
> and HMR crawl the whole re-exported graph on first import regardless of tree-shaking, and side-effectful
> modules defeat it in prod too (143 B/2 modules → 1571 B/22 above). **When NOT to use it:** don't put a
> barrel over a large folder of components you import individually in the dev-heavy hot path, and never
> over modules with import-time side effects.

#### MUI imports: named is fine for production, deep helps dev

MUI v9 supports named imports (`import { Button } from '@mui/material'`), and modern tree-shaking
handles them for production bundles. The old v4-era rule — "always deep-import `@mui/material/Button`"
— is stale for production. But deep imports still measurably help **dev cold-start** for the barrel
reasons above. Different problem, different fix: default to named imports; reach for deep imports only
if dev startup is a felt pain.

> 🟡 **Optimization** — deep imports (`@mui/material/Button`) trade readability for dev-server speed.
> **Pros:** the dev server transforms only the one module, not MUI's whole re-export graph on cold start.
> **Cons:** noisier import lines and a rule your team has to remember. **When NOT to use it:** for
> production bundle size it buys nothing on v9 — named imports tree-shake fine — so don't adopt it as a
> blanket rule; adopt it only when you have actually felt slow cold-starts.

---

### Sources

- TypeScript 7.0 GA announcement — https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- ESLint v10.0.0 release notes — https://eslint.org/blog/2026/02/eslint-v10.0.0-released/
- Vitest 4 release — https://vitest.dev/blog/vitest-4
- Testing Library query priority — https://testing-library.com/docs/queries/about/#priority
- user-event docs — https://testing-library.com/docs/user-event/intro
- INP is a Core Web Vital (FID retired 2024-03-12) — https://web.dev/blog/inp-cwv-march-12
- INP thresholds — https://web.dev/articles/inp
- React Compiler docs — https://react.dev/learn/react-compiler
- MSW — https://mswjs.io/
- eslint-plugin-jsx-a11y — https://github.com/jsx-eslint/eslint-plugin-jsx-a11y
- axe-core — https://github.com/dequelabs/axe-core
- WCAG 2.2 contrast (SC 1.4.3 / 1.4.11) — https://www.w3.org/WAI/WCAG22/quickref/
- Vite dependency pre-bundling / barrel-file guidance — https://vite.dev/guide/performance

---

## Front-End Security

The front end can't be *trusted* — anything it enforces, an attacker can bypass by talking to your API
directly with curl. So the first rule reframes the whole page: **client-side security is about protecting
the user in their browser, not about protecting your data.** Data protection lives on the server, always.
What the front end owns is real and specific: where the token lives, what the UI reveals, and what
untrusted content it renders.

> 🟢 **Best practice** — every authorization check in the UI is a *convenience and a UX affordance*, not
> a security boundary. The server must re-check every permission on every request. If the only thing
> stopping a user from deleting a record is a hidden button, it isn't stopped. Treat client checks as
> "don't show what won't work," and back all of them server-side.

---

### Where the auth token goes

This is the decision the front end genuinely owns, and it's mostly about surviving XSS.

| Storage | Survives refresh | Readable by JS (XSS-exposed) | Verdict |
|---|---|---|---|
| In-memory (a variable / state) | ❌ (lost on reload) | ❌ | Most secure; pair with a refresh flow |
| `HttpOnly` `Secure` cookie | ✅ | ❌ (JS can't read it) | **Recommended default** |
| `localStorage` / `sessionStorage` | ✅ | ✅ **any XSS steals it** | Avoid for tokens |

```ts
// 🔴 The convenient, common, wrong choice: one XSS anywhere = full account takeover.
localStorage.setItem('access_token', token)

// 🟢 The server sets an HttpOnly, Secure, SameSite cookie; JS never touches the token.
//    Set-Cookie: access_token=…; HttpOnly; Secure; SameSite=Lax; Path=/
//    The browser attaches it automatically; your fetch just needs credentials.
await fetch('/api/me', { credentials: 'include' })
```

> 🟢 **Best practice** — store the access token in an `HttpOnly` + `Secure` + `SameSite` cookie set by
> the server, or hold it in memory with a silent-refresh flow. **Never `localStorage`.** localStorage is
> readable by any script that runs on your page, so a single XSS — including one from a compromised npm
> dependency — exfiltrates every user's token. The "it's easier" of localStorage is paid for in the one
> breach that empties it.

> 🔴 **Advanced / gotcha** — the user object is fine as global state (see
> [state management](state-management)); the *token* is not the user object. Keep the token out of your
> Redux/Zustand store and out of anything that serializes to disk or a devtools snapshot. Model "who is
> logged in" as client state; let the credential itself live in the cookie.

---

### Authorization: role-based vs permission-based

Two models, and real apps need both. Encode them as a component so gating is declarative, not scattered
`if (user.role === 'ADMIN')` littered through the tree.

**Role-based (RBAC)** — coarse: a user *is* an ADMIN or a USER.

**Permission-based (PBAC / ABAC)** — fine and contextual: *can this user delete **this** comment?* —
which usually depends on ownership, not a static role.

```tsx
type Role = 'ADMIN' | 'USER'
type Policy = 'comment:delete' | 'post:publish'

// One authorization primitive that handles both roles and per-resource policies.
function Authorization({
  allowedRoles,
  policyCheck,
  children,
  fallback = null,
}: {
  allowedRoles?: Role[]
  policyCheck?: boolean          // caller computes it: e.g. comment.authorId === user.id
  children: ReactNode
  fallback?: ReactNode
}) {
  const { user } = useAuth()
  const roleOk = !allowedRoles || (user && allowedRoles.includes(user.role))
  const policyOk = policyCheck ?? true
  return roleOk && policyOk ? <>{children}</> : <>{fallback}</>
}

// role gate:
<Authorization allowedRoles={['ADMIN']}><AdminPanel /></Authorization>
// per-resource policy gate (the important one):
<Authorization policyCheck={comment.authorId === user.id}>
  <DeleteButton commentId={comment.id} />
</Authorization>
```

> 🟢 **Best practice** — express authorization as one declarative component (or a `useAuthorization`
> hook) taking allowed roles and/or a computed policy boolean. Centralizing it means the rules are
> auditable in one place and consistent everywhere — far safer than hand-rolled role checks sprinkled
> across components, where one forgotten check is a leak.

> 🔴 **Advanced / gotcha** — role checks (`role === 'ADMIN'`) are easy; **ownership** checks are where
> real apps leak. "Only the author can delete this comment" is a *policy*, evaluated against the specific
> resource, and it must be enforced on the server for that exact resource — the client policy just hides
> the button. An IDOR (changing the id in the request to act on someone else's resource) is the classic
> exploit when the server trusts the client's gating.

---

### Protecting routes

An unauthenticated user hitting a private URL should be redirected, not shown a broken page that fetches
401s. Gate at the route layer.

```tsx
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <Spinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <>{children}</>
}
```

> 🟢 **Best practice** — wrap private route trees in a `ProtectedRoute` that redirects to login and
> preserves the intended destination (`state.from`) so the user lands where they meant to after signing
> in. Remember [focus management on route change](quality) applies here too. And again: the route guard is
> UX — the API behind those routes must still reject the unauthenticated request on its own.

---

### XSS: the front end's biggest real exposure

Cross-site scripting is where the client genuinely can create a vulnerability. React escapes text by
default — `{userContent}` in JSX is safe — so the risk lives in the escape hatches.

```tsx
// 🔴 The one function name that should make you stop: renders raw HTML, executes any <script>.
<div dangerouslySetInnerHTML={{ __html: userSuppliedHtml }} />

// 🟢 If you must render user HTML (rich text, markdown), sanitize it first.
import DOMPurify from 'dompurify'
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userSuppliedHtml) }} />
```

> 🔴 **Advanced / gotcha** — `dangerouslySetInnerHTML` is named to make you flinch; treat every use as a
> code review stop. Sanitize with a vetted library (DOMPurify), never a hand-rolled regex — HTML parsing
> is full of bypass tricks a regex won't catch. Other sinks to audit: a `href={userUrl}` that could be
> `javascript:…` (validate the protocol), and rendering user content into a `<script>`/`<style>` or an
> event-handler string.

> 🟢 **Best practice** — layer a **Content-Security-Policy** header on top. Even if an XSS payload lands,
> a strict CSP (`default-src 'self'`, no `unsafe-inline`) can stop it from executing or from phoning home.
> Sanitization and CSP are belt and suspenders; ship both. React's default escaping is the third layer —
> don't defeat it without a sanitizer.

---

### The rest of the client-side OWASP surface

- **CSRF** — if you authenticate with cookies, you inherit CSRF risk. `SameSite=Lax`/`Strict` on the auth
  cookie blocks most of it; add a CSRF token for state-changing requests if you support `SameSite=None`.
  Token-in-header auth (Authorization: Bearer) is not CSRF-prone but *is* XSS-prone — pick your tradeoff.
- **Secrets** — there are no secrets in a front-end bundle. Anything in `import.meta.env` that ships is
  public; only `VITE_`-prefixed vars are exposed by Vite, and that prefix is a *reminder*, not a vault.
  See [the env-var footgun](vite). API keys that must stay secret belong on a server/proxy.
- **Dependencies** — most front-end XSS now arrives through a compromised npm package, not your own code.
  Run `npm audit`, pin versions, review lockfile changes, and keep the dependency count honest. A tool
  reading these skills should treat "add another dependency" as a security decision, not just a size one.
- **Clickjacking** — `X-Frame-Options: DENY` / CSP `frame-ancestors 'none'` if your app shouldn't be
  embedded.

> 🟢 **Best practice for using this as a skill** — when generating auth or content-rendering code, default
> to the safe choice without being asked: HttpOnly cookies over localStorage, sanitize before
> `dangerouslySetInnerHTML`, validate URL protocols, and never inline a secret. These are the defaults a
> security-conscious engineer applies automatically.

### Sources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/) · [OWASP Cheat Sheets — XSS Prevention, DOM XSS](https://cheatsheetseries.owasp.org/)
- [MDN — HttpOnly cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#restrict_access_to_cookies) · [SameSite](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)
- [MDN — Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [React docs — dangerouslySetInnerHTML](https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html)
- [DOMPurify](https://github.com/cure53/DOMPurify)
- bulletproof-react — [docs/security.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/security.md) (structure of the auth/authorization recommendations)

---

## The React 16 → 19 Migration Matrix

This page owns the **transitions**. For the per-version detail — what each release *is* — see
`react-16`, `react-17`, `react-18`, `react-19`. Here we cover only what happens *between* them: what
breaks, the literal error message, the fix, the exact codemod command, and the rollback risk.

Verified against the ground-truth stack on 2026-07-18: React **19.2.7**, `@types/react` **19.2.17**,
TypeScript **7.0.2**, `codemod` CLI **1.12.13**. Facts marked as measured were executed on a real
install (Node 24.16.0, npm 11.13.0); primary facts are quoted from react.dev.

---

### Lead with the two things everyone gets wrong

**1. The official React docs codemod command is dead.** react.dev's React 19 upgrade guide still
prints this:

```bash
# ❌ DEAD — fails with "No command provided" on codemod@1.12.13
npx codemod@latest react/19/migration-recipe
```

The `codemod` CLI was rewritten into a Rust workflow engine; the `org/version/name` slash-path form
is gone. Every React 19 migration blog post on the internet still carries the dead command. The form
that actually works:

```bash
# ✅ WORKS — verified end to end on codemod@1.12.13
npx codemod@latest run react-19-migration-recipe -t ./src --no-interactive
```

**2. You can go 16 → 18 directly — skipping the 17 *install* is fine; skipping 17's *breaking
changes* is not.** The folklore ("you must pass through 17") is wrong about the mechanism and right
about the danger. See the next section.

> These two are the highest-value facts on this page. If you read nothing else, run the correct
> codemod command and read React 17's release notes even when you skip the 17 install.

---

### Can you go 16 → 18 directly, skipping 17?

**Yes.** Not "probably" — React 18 *deliberately emulates* React 17. Its own console warning says so
verbatim (reproduced on `react-dom@18.3.1`):

```
Warning: ReactDOM.render is no longer supported in React 18. Use createRoot instead. Until you
switch to the new API, your app will behave as if it's running React 17. Learn more:
https://reactjs.org/link/switch-to-createroot
```

Note it *warns and renders*. React 18 ships a first-class React-17 compatibility path. You cannot
need to "pass through" a version your target emulates on purpose. Supporting facts:

- `react-dom@18.3.1`'s only peer constraint is `react ^18.3.1`. There is no `engines` field, no
  `preinstall` gate, and no runtime check that references a previously-installed React version. npm
  has no concept of "the version you had before" — there is nothing for a gate to gate on.
- A measured in-place `16.8.0 → 18.3.1` upgrade produced no warning, no error, no peer conflict.
- The React 18 upgrade guide's install step is literally `npm install react react-dom`, with **no
  minimum version stated and no mention of 17 as a prerequisite**.

#### The trap inside the right answer

Skipping the 17 *install* does **not** skip 17's *breaking changes*. React 18 contains every React 17
behavior change. Going 16 → 18 directly means you eat 17's breakage and 18's breakage in the same
deploy — and you never see a changelog that warns you, because:

> **The React 18 upgrade guide documents only the 17→18 delta. It never describes React 17's own
> breaking changes.** A team that goes 16→18 reading only the 18 guide ships the event-delegation
> change, the `onScroll` bubbling removal, the `onFocus`/`onBlur` native-event switch, and the async
> `useEffect` cleanup — completely undocumented, straight to production. That is the real failure
> mode, and it is why the "17 is mandatory" folklore exists: wrong about the mechanism, right about
> the danger.

**Correct framing:** React 17 is an *optional de-risking checkpoint*, not a required hop. You can
`npm install react@18 react-dom@18` from React 16 and it works. But you must still read the React 17
release notes and audit against them. Skipping 17 saves you a deploy, not a code review.

Do **not** write "mandatory" / "required" / "you must pass through 17." A reader disproves that in
thirty seconds with one `npm install`.

#### Which path by app size

| App | Path | Why |
|---|---|---|
| < ~200 components, good test coverage | **16 → 18 direct** (then 19) | The 17 delta is small; one PR, one QA cycle. |
| Large / legacy / many unowned 3rd-party deps | **16 → 17 → 18** | Not because it's required — because it isolates the event-delegation blast radius into its own deploy with its own rollback. Pure project management. |
| Must support IE11 | **stop at 17** | React 18 dropped IE. This is the one hard fork in the road. |

> 🔴 **Advanced / gotcha** — **16 → 18 direct** is the sharp tool here. It works mechanically (nothing
> gates on the version you skipped), but you eat React 17's *and* 18's breaking changes in a single
> deploy, and the 18 upgrade guide documents none of 17's. Reach for it knowingly, with the React 17
> release notes open beside you.

**Tradeoffs — direct `16 → 18` vs staged `16 → 17 → 18`**

- **Pros (direct):** one package bump, one QA cycle, one rollback unit; the 17→18 delta is genuinely
  small, so on a small well-tested app the extra hop is ceremony.
- **Cons (direct):** the event-delegation move, `onScroll` bubbling removal, the focus-event switch,
  and async effect cleanup all land silently *and simultaneously* — a regression in any of them looks
  like a fresh React 18 bug, with no changelog pointing at 17.
- **When NOT to use it:** large or legacy apps, or any tree with unowned third-party deps that attach
  listeners to `document`. Stage the hop so the event-delegation blast radius gets its own deploy and
  its own revert.

---

### First: detect what you are actually running

Teams are routinely wrong about this. Run these before planning anything.

```bash
# Runtime version, not what package.json claims:
node -p "require('react').version"
npm ls react react-dom          # look for DUPLICATES — the #1 cause of "Invalid hook call"

# Are you on a legacy root? This decides whether you get React 18 semantics AT ALL:
grep -rn "ReactDOM.render\|ReactDOM.hydrate\|react-dom/client" src/

# Modern JSX transform? (a hard requirement for 19)
grep -rn "\"jsx\"" tsconfig.json          # want "react-jsx", not "react"

# The 19 landmines, in order of how much they hurt:
grep -rn "defaultProps" src/ node_modules/*/dist 2>/dev/null   # yes, node_modules too
grep -rn 'ref="' src/                     # string refs
grep -rn "contextTypes\|getChildContext"  # legacy context
grep -rn "findDOMNode\|createFactory\|react-dom/test-utils"
```

> **The killer detail:** an app with `react@18` in `package.json` but `ReactDOM.render` in
> `index.js` is **not running React 18**. It runs React 17 semantics on the React 18 runtime — no
> automatic batching, no concurrency, no StrictMode double-invoke. Teams "upgrade to 18," see nothing
> break, declare victory, then get all of 18's breakage months later when someone finally switches to
> `createRoot`. **The version bump and the `createRoot` switch are two separate migrations wearing one
> trench coat.** Do them as two PRs, in that order.

> 🟢 **Best practice** — ship the package bump and the `createRoot` switch as two separate PRs, in
> that order. The bump is trivial and reverts with a package downgrade; the root swap is the real
> migration and the least reversible step in the matrix. One migration per PR keeps each a clean
> rollback unit.

---

### The `react-dom/client` split

The single most-hit mechanical change, and the least reversible. Measured behavior by version:

| React | `ReactDOM.render` | `react-dom/client` |
|---|---|---|
| 17.0.2 | works, silent | **`ERR_MODULE_NOT_FOUND`** — `Cannot find module '.../node_modules/react-dom/client'` |
| 18.3.1 | works + warns ("behave as if React 17") | resolves — exports `createRoot`, `hydrateRoot` |
| 19.2.7 | **`TypeError: ReactDOM.render is not a function`** | resolves — exports `createRoot`, `hydrateRoot`, `version` |

React 19's full `react-dom` export list (measured, 19.2.7):

```
createPortal, flushSync, preconnect, prefetchDNS, preinit, preinitModule, preload,
preloadModule, requestFormReset, unstable_batchedUpdates, useFormState, useFormStatus, version
```

`render`, `hydrate`, `findDOMNode`, `unmountComponentAtNode` — **all four absent** (`'render' in
require('react-dom') === false`). Two things not to over-claim:

- **`unstable_batchedUpdates` still ships in 19.2.7.** Pointless (batching is automatic) but not
  removed — a dependency calling it won't crash. Don't tell people it's gone.
- **`useFormState` still ships in 19.2.7**, deprecated in favor of `useActionState`. The
  `react-19-replace-use-form-state` codemod handles it.

> **Rollback risk on this one change:** `ReactDOM.render` → `createRoot` is the least reversible step
> in the whole matrix, and people treat it as the most trivial. Reverting the *package* to 17 while
> `react-dom/client` imports remain in the bundle gives a **build-time module-not-found**, not a
> graceful degradation. Land the version bump and the root swap as **separate commits** so you can
> revert exactly one of them.

---

### HOP 1: 16 → 17

**Effort: LOW. Risk: MEDIUM — concentrated in code you don't own.**

React's own number was *"fewer than twenty components out of 100,000+"* needed changes at Facebook.
That statistic is misleading for you: Facebook owns its entire dependency tree. Your risk lives in
third-party dropdowns, modals, and analytics SDKs that attach listeners to `document`.

| What breaks | Error you literally see | Fix |
|---|---|---|
| **Event delegation moved `document` → root container** | **Nothing. No error. No warning.** Your outside-click-to-close dropdown just stops closing, or closes twice. | Attach outside-click listeners to the root container, or use the capture phase. Audit every `document.addEventListener` that coexists with `e.stopPropagation()`. |
| `onScroll` no longer bubbles | Silent — ancestor handler stops firing | Move the handler to the scrolling element. |
| `onFocus`/`onBlur` now use native `focusin`/`focusout` | Silent ordering change | Re-test focus-trap / a11y widgets. |
| Event pooling removed | None — `e.persist()` becomes a harmless no-op | Delete `e.persist()` calls (cosmetic). |
| `useEffect` cleanup runs async | Silent — flicker on unmount-heavy screens | Capture mutable values in the effect body, not in cleanup. |
| `forwardRef`/`memo` returning `undefined` throws | **Hard runtime throw** | Add the missing `return`. This one is a *good* break. |

**Codemod:** none for the event changes — there cannot be, they're semantic. The only 17-era codemod
is for the (independent, optional) new JSX transform:

```bash
npx react-codemod@5.4.4 update-react-imports ./src
```

`react-codemod@5.4.4` last published 2024-05-19 — unmaintained but functional. The JSX transform is
**decoupled from React 17**: it was backported to **16.14.0** (2020-10-14), so you can adopt it
*before* upgrading. Do that — it de-risks HOP 3.

**Rollback: EASY.** Pure `npm i react@16 react-dom@16`. No API surface changed. This is the cheapest
hop to revert, which is exactly why it's a good checkpoint for a scared team.

> The React 17 release-notes URLs on react.dev returned 404 as of mid-2026 (a site restructure). The
> breaking-change list above is carried from the facebook/react CHANGELOG, not re-sourced first-hand.
> High confidence, but re-source the blog URL before quoting it verbatim.

---

### HOP 2: 17 → 18

**Effort: MEDIUM. Risk: HIGH — and the risk is all in the second half.**

Split this hop into **2a (bump)** and **2b (createRoot)**. 2a is nearly free; 2b is the entire hop.

#### 2a — bump the packages

Breaks: **IE11 support is dropped** (hard fork — if you need IE, stop at 17). Everything else keeps
working in React-17 mode (see the `react-dom/client` section). Rollback: easy.

#### 2b — switch to `createRoot`

This is where React 18 actually turns on.

```tsx
// ❌ before — warns on 18, throws on 19
import ReactDOM from 'react-dom';
ReactDOM.render(<App />, document.getElementById('root'));

// ✅ after
import { createRoot } from 'react-dom/client';
const container = document.getElementById('root');
const root = createRoot(container!);   // TS: the `!` or a null check — see the types section
root.render(<App />);
```

| What breaks | Error you literally see | Fix |
|---|---|---|
| `ReactDOM.render` | `Warning: ReactDOM.render is no longer supported in React 18. Use createRoot instead. Until you switch to the new API, your app will behave as if it's running React 17.` | `createRoot` |
| **Automatic batching** — updates in promises / `setTimeout` / native handlers now batch | **Silent.** Render counts drop; tests asserting render counts fail; code depending on an intermediate render breaks. | `flushSync` is the opt-out. Use it surgically, never globally. |
| **StrictMode double-invokes effects** in dev | **Silent, and it looks like a React bug.** Double fetches, duplicate analytics events, two websockets. | Every `useEffect` needs a real cleanup. This is not a React bug — it's your missing cleanup, finally visible. |
| Hydration mismatches became errors | Hard error instead of a silent patch-up | Fix the mismatch. |
| `@types/react@18` removed implicit `children` from `React.FC` | `error TS2339: Property 'children' does not exist on type '{ title: string; }'` | `npx types-react-codemod@latest preset-18 ./src` |

> 🔴 **Advanced / gotcha** — `flushSync` is the escape hatch from automatic batching, and it forces a
> synchronous [commit](fundamentals#render-vs-commit) mid-event — the exact cost batching just
> removed. Wrap it around the single update a third-party lib must observe immediately; never reach
> for it app-wide, or you turn every batched render back into a separate one.

> 🟢 **Best practice** — give every `useEffect` a real cleanup, and keep StrictMode on. Automatic
> batching now collapses several state updates into one [commit](fundamentals#render-vs-commit)
> rather than several, and StrictMode's dev-only double-invoke deliberately re-runs your effects to
> expose a missing cleanup before production does. The race it surfaces — the slower of two in-flight
> responses winning — is a [stale-closure](fundamentals#closures) hazard, not cosmetic noise.

> **The production gotcha nobody warns about:** StrictMode double-invoke is **dev-only**, so the
> double-fetch you "fixed" by deleting StrictMode is still a live race condition in production. The
> prod bug is not "it fetches twice" — it's that **the slower of two in-flight responses wins**, so a
> fast-typing user sees stale results. StrictMode is a *free prod-race detector*. Teams that delete it
> to make the noise stop have deleted the smoke alarm, not the fire.

**Codemod:** for the runtime, `react-19-replace-reactdom-render` does the `createRoot` rewrite and
works fine as an 18 step despite the "19" name — the transformation is identical. For types:
`npx types-react-codemod@latest preset-18 ./src`.

**Rollback: MEDIUM-HARD.** `react-dom/client` imports don't exist on 17 (see the split section).

---

### HOP 3: 18 → 19

**Effort: HIGH (mechanical volume). Risk: MEDIUM (mostly loud failures — plus one silent killer).**

Get to **18.3.x first** and clear every deprecation warning. 18.3 exists to be the warning-only
staging release for 19; using it is the single highest-leverage move in this hop.

The removals (all deprecated during the **16 era, 2017–2020** — the warnings *were* the notice):

| Removed | Deprecated since | Error you see | Fix |
|---|---|---|---|
| `ReactDOM.render` | 18.0 | `TypeError: ReactDOM.render is not a function` | `createRoot` |
| `ReactDOM.hydrate` | 18.0 | `TypeError: ... is not a function` | `hydrateRoot` |
| `ReactDOM.unmountComponentAtNode` | 18.0 | `TypeError: ... is not a function` | `root.unmount()` |
| `ReactDOM.findDOMNode` | 16.6 | `TypeError: ... is not a function` | refs |
| String refs `ref="x"` | 16.3 | runtime throw | codemod (below) |
| Legacy context (`contextTypes` / `getChildContext`) | 16.6 | runtime | `createContext` |
| Module pattern factories | 16.9 | runtime | plain functions |
| `React.createFactory` | 16.13 | `TypeError` | JSX |
| `propTypes` on fn components | 15.5 (2017) | silently ignored | TypeScript |
| **`defaultProps` on fn components** | 15.5 | **NOTHING — silent** | ES6 default params |
| `react-dom/test-utils` `act` | — | throws | `import { act } from 'react'` |
| Outdated JSX transform | — | `Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance` | `"jsx": "react-jsx"` |

`defaultProps` on **class** components still works in 19. Only function components are affected.

#### `defaultProps` — the silent one

```tsx
// ❌ React 19: no error, no warning. `size` is undefined → className="btn-undefined"
function Button({ size, children }) {
  return <button className={`btn-${size}`}>{children}</button>;
}
Button.defaultProps = { size: 'medium' };

// ✅
function Button({ size = 'medium', children }) {
  return <button className={`btn-${size}`}>{children}</button>;
}
```

Why it's nasty: **TypeScript cannot catch it** — the prop is still declared optional and typed — and
the symptom is a cosmetic wrong class or a `NaN` that surfaces in visual QA or not at all. Grep
`defaultProps` **including `node_modules`**; unmaintained component libraries are where it lives. And
yes, there is a codemod for it (see below) — the "no codemod exists" advice is out of date.

**Rollback: HARD.** By the time 19 is in, your source no longer contains the removed APIs. Reverting
the package does not revert the codemods. Rollback here means `git revert` of a large diff — land 19
behind a real staging soak, not a Friday deploy.

---

### The `@types/react` pain — with literal error codes

Measured: same source file, same `tsc` (TypeScript 7.0.2, `jsx: react-jsx`), only `@types/react`
changed.

```tsx
import * as React from 'react';
const Wrap: React.FC<{ title: string }> = ({ title, children }) => <div>{title}{children}</div>;
export function useThing() { const r = React.useRef<number>(); return r; }
export function Peek({ node }: { node: React.ReactElement }) { return <>{node.props.className}</>; }
```

| `@types/react` | tsc output |
|---|---|
| **17.0.83** | *(clean — zero errors)* |
| **18.3.27** | `src/a.tsx(3,53): error TS2339: Property 'children' does not exist on type '{ title: string; }'.` |
| **19.2.17** | the above, **plus** `error TS2554: Expected 1 arguments, but got 0.` (`useRef`) and `error TS18046: 'node.props' is of type 'unknown'.` |

Three error codes, memorize them: **TS2339** (children), **TS2554** (`useRef` needs an argument),
**TS18046** (`props` is `unknown`).

The errors are **cumulative** — the 18 break is still there at 19. If you jump 17→19 you hit both
walls at once, and `preset-19` **does not include** `implicit-children`. Run both:

```bash
npx types-react-codemod@latest implicit-children ./src   # the 18 break
npx types-react-codemod@latest preset-19 ./src           # the 19 breaks
```

#### Pin `@types/react` exactly

> 🟢 **Best practice** — pin `@types/react` to an exact version, not a `^` range. It ships on its own
> schedule, so a breaking types change (18 removing implicit `children`) arrives on a routine
> `npm update`, not when you bump React. This is the one dependency where a caret range is a
> liability rather than a convenience.

`@types/react` is versioned **independently of React** and does not track it. Two consequences:

1. **Types breaks arrive on `npm update`, not on a React upgrade.** `@types/react@18` removing
   implicit `children` was a *types-package* breaking change. A team on `"@types/react": "*"` or with
   a floating transitive dep eats it while still on React 17. **Pin `@types/react` exactly** — this is
   the one dep where `^` is a liability.
2. **Duplicate `@types/react` is NOT inherently an error.** Measured, with `skipLibCheck: false`:

   | nested copy | root copy | result |
   |---|---|---|
   | **18.3.27** | 19.2.17 | ✅ **clean — zero errors** |
   | **17.0.83** | 19.2.17 | ❌ errors |

   18 and 19's `ReactNode` are structurally compatible, and TypeScript is structural — two copies
   unify silently. The error only appears when the copies are structurally *incompatible* (a wide
   gap like 19-vs-17). So "you have duplicate @types/react" is not a diagnosis; on a modern tree it is
   usually harmless.

   The real error, verbatim, from the 17-vs-19 case:
   ```
   error TS2322: Type 'import("/…/fancy-lib/node_modules/@types/react/index").ReactNode'
     is not assignable to type 'React.ReactNode'.
     Type 'Iterable<ReactNode>' is not assignable to type 'ReactNode'.
   ```

   > **Do not teach the famous string.** The widely-quoted *"Two different types with this name exist,
   > but they are unrelated"* is **not** what you get. The code is **TS2322**, and the tell is the
   > **fully-qualified absolute `node_modules` path on one side** of the "not assignable" comparison
   > and the **bare `React.ReactNode` on the other**. That path-vs-bare-name asymmetry is the actual
   > signature of a duplicate-types problem. Teach readers to spot *that*.

   The fix — force a single copy:
   ```jsonc
   // package.json
   "overrides":   { "@types/react": "19.2.17", "@types/react-dom": "19.2.3" }  // npm
   "resolutions": { "@types/react": "19.2.17" }                               // yarn / pnpm
   ```
   Verify with `npm ls @types/react` — **exactly one** line, or you will chase ghosts.

`skipLibCheck: true` hides duplicate-types damage inside `node_modules` but **not** at your own call
sites. It is a mitigation, not a fix — and effectively mandatory on a mixed tree.

Other 19-types notes: `MutableRefObject` is deprecated (all refs are mutable now). The JSX namespace
moved from global to `React.JSX`, which breaks `declare global { namespace JSX { ... } }`
augmentations (custom elements, styled-components) — codemod: `scoped-jsx`.

Ground-truth pins for this stack:
```jsonc
"@types/react": "19.2.17",
"@types/react-dom": "19.2.3"
```

---

### Codemods — the registry the official guide hides

The working invocation (repeat, because the docs are wrong):

```bash
npx codemod@latest run react-19-migration-recipe -t ./src --no-interactive
```

Real output from a real run:

```
Bundled codemods
  Running react-prop-types-typescript
Run summary
  Modified     2
  Unmodified   6
Metrics:
  string-ref-replacements:      refs=myInput, file=src/Old.jsx: 1
  reactdom-render-replacements: pattern=ReactDOM.render, file=src/Old.jsx: 1
```

**The recipe bundles 5 codemods. The registry (`npx codemod@latest search react/19`) has 14** — and
the extras are the ones you actually need. Download counts tell the story: nobody knows the
standalone codemods exist, because the official guide names only the recipe.

| Package | In `migration-recipe`? | Downloads |
|---|---|---|
| `react-19-migration-recipe` | (the recipe) | 4.2K |
| `react-19-replace-reactdom-render` | ✅ | 4.3K |
| `react-19-replace-string-ref` | ✅ | 4.3K |
| `react-19-replace-act-import` | ✅ | 4.3K |
| `react-19-replace-use-form-state` | ✅ | 4.2K |
| `react-prop-types-typescript` | ✅ | — |
| **`react-19-replace-default-props`** | ❌ | **106** |
| **`react-19-remove-legacy-context`** | ❌ | 24 |
| **`react-19-replace-create-factory`** | ❌ | 18 |
| `react-19-remove-forward-ref` | ❌ | 372 |
| `react-19-use-context-hook` | ❌ | 66 |
| `react-19-remove-memoization` | ❌ | 40 |

#### The `defaultProps` codemod exists — and is correct

```bash
npx codemod@latest run react-19-replace-default-props -t ./src --no-interactive
```

Measured: it converts function-component `defaultProps` to default params **and correctly leaves
class `defaultProps` alone** (class `defaultProps` still works in 19).

```tsx
// input
function Button({ size, variant, children }) { /* ...btn-${size} btn-${variant}... */ }
Button.defaultProps = { size: 'medium', variant: 'primary' };
class Legacy extends React.Component { render() { return <div>{this.props.tone}</div>; } }
Legacy.defaultProps = { tone: 'quiet' };

// output
function Button({ size = 'medium', variant = 'primary', children }) { /* ... */ }  // ✅ converted
// Button.defaultProps removed
class Legacy extends React.Component { /* ... */ }
Legacy.defaultProps = { tone: 'quiet' };                                           // ✅ left alone
```

**Caveat, and it's why the "no codemod" folklore has legs:** the codemod fixes `defaultProps` only in
*your source*. Your real exposure is `defaultProps` in *unmaintained dependencies*, which no codemod
can touch. Run the codemod on `src`, *then* grep `node_modules`. Both. The codemod replaces the
manual work, not the audit.

#### Codemod gotchas that bite (all measured)

1. **`types-react-codemod@3.5.3` declares `node: "18.x || 20.x || 22.x"`.** On Node 24 you get
   `npm warn EBADENGINE Unsupported engine`. It *runs* anyway — but if CI has `engine-strict=true` it
   **hard-fails**.
2. **The recipe leaves dead imports.** After `replace-reactdom-render`, the file had *both* the new
   `import { createRoot } from "react-dom/client"` **and** the now-unused `import ReactDOM from
   'react-dom'`. Run `lint --fix` after.
3. **`replace-string-ref` output is not clean.** It rewrites `ref="myInput"` into a callback that
   writes back into `this.refs`:
   ```tsx
   <input ref={(ref) => { this.refs.myInput = ref; }} />
   ```
   It preserves behavior rather than modernizing; every read site still says `this.refs.myInput`.
   Budget a human pass.

   > **This output is SAFE — and reviewers wrongly reject it.** React **19 removed string *refs*, but
   > NOT the `this.refs` *object*** — React 19.2.7 still initializes `this.refs` to an object on class
   > instances (measured). The codemod exploits exactly that gap. State this plainly: "React 19
   > removed string refs" is widely misread as "`this.refs` is gone," and that misreading makes people
   > reject the official codemod's output in review.
4. **Two separate tools, two separate runs.** react.dev is explicit that the recipe *"does not include
   the TypeScript changes."* `codemod` handles runtime; `types-react-codemod` handles types. Forgetting
   the second is the most common miss.
5. **`codemod run` refuses a dirty git tree** unless you pass `--allow-dirty`. Commit first — which is
   correct behavior and exactly what you want for rollback.

---

### Migration blocker: TS 7 removed `moduleResolution: "node"`

This fires **before any React error** and stops the build before a single file is checked. It lands
on exactly the migration population — old React app, old tsconfig. On TypeScript **7.0.2** (measured):

```
tsconfig.json(1,90): error TS5108: Option 'moduleResolution=node10' has been removed.
Please remove it from your configuration.
```

`"moduleResolution": "node"` (aliased to `node10`) is **removed, not deprecated** — a hard config
error. Any legacy app carrying it **cannot run `tsc` at all on TS 7** until the line changes to:

- `"bundler"` — for Vite / esbuild / any bundler-driven build (the modern default);
- `"node16"` or `"nodenext"` — for Node-resolved projects.

> Some installs report this as **TS5109** rather than TS5108. Either way it's the same removal and the
> same fix. Do the tsconfig change *first* — before you touch any React code — or you'll be debugging
> React errors you can't even reach.

---

### Order of operations for a large legacy app

Each numbered step is **one PR, one deploy, one rollback unit**. Do not merge steps.

**Phase 0 — make the app upgradeable (all on React 16, all revertible)**
1. `eslint-plugin-react-hooks` at max strictness; fix every violation. This is what makes the later
   hops safe. Non-negotiable.
2. **Adopt the modern JSX transform on 16.14.0** (`npx react-codemod update-react-imports ./src`).
   Free work that HOP 3 *requires*.
3. **Kill the 19 landmines now, on 16, where they're warnings not removals:** string refs, legacy
   context, `findDOMNode`, `createFactory`, module-pattern factories, `defaultProps` on function
   components. **Every 19 removal is fixable on 16.** This is the biggest de-risking insight in the
   matrix — HOP 3 is only "HIGH effort" if you skipped this step.

> 🟢 **Best practice** — do this landmine sweep while you're still on React 16, where every one of
> these is a *warning* rather than a *removal*: it fails loudly, and it reverts with a pure package
> downgrade. Deferring it to HOP 3 turns loud warnings into silent runtime breakage during your most
> dangerous hop.
4. Pin `@types/react` **exactly**, add `overrides`, verify `npm ls @types/react` shows one copy.
5. Fix `moduleResolution: "node"` if you're on TS 7 (see the blocker section).

**Phase 1 — 16 → 17** *(optional; skip if small)*

6. Bump. Audit `document.addEventListener` + `onScroll` + focus handlers. Deploy. Soak.

**Phase 2 — 17/16 → 18** *(two PRs, always)*

7. Bump packages only. Ship. You are still running 17 semantics. Cheap, revertible, flushes out
   peer-dep fallout in isolation.
8. `@types/react@18` + `npx types-react-codemod@latest implicit-children ./src`. Type-only PR.
9. **`createRoot`.** The real 18 upgrade. Enable StrictMode in dev *in this PR* and fix every effect
   it screams about. Expect this to be the longest step in the whole project.
10. Go to **18.3.x**. Drive deprecation warnings to zero. Do not proceed until the console is clean —
    18.3's entire purpose is to be this gate.

**Phase 3 — 18.3 → 19**

11. `npx codemod@latest run react-19-migration-recipe -t ./src --no-interactive` (**not** the
    react.dev command). Then `lint --fix` for the dead imports.
12. `npx codemod@latest run react-19-replace-default-props -t ./src` + grep `node_modules`.
13. `npx types-react-codemod@latest preset-19 ./src`; set `@types/react@19.2.17`. Expect the
    TS2554 / TS18046 walls. Escape hatch if the `props: unknown` wall is too big:
    `npx types-react-codemod@latest react-element-default-any-props ./src`.
14. Bump to **19.2.7**.
15. `eslint-plugin-react-hooks@7`.
16. **React Compiler 1.0 last, pinned exactly** (`--save-exact`, `"1.0.0"` not `"^1.0.0"`). The
    compiler *magnifies* Rules-of-React violations rather than fixing them — adopting it before steps
    1–15 means debugging two things at once. See `react-compiler` for detail.

> 🔴 **Advanced / gotcha** — turn the compiler on *last*, and don't treat it as a licence to mass-delete
> your `useMemo`/`useCallback`. When it works, it auto-memoizes hard: the same unchanged child that
> renders 11 times without it rendered **once** with it (11 → 1, measured on a small reproduction —
> React 19, jsdom; production will differ). But bailouts are *silent and per-function* — a single
> render-phase mutation makes it skip a component with no error, no warning, no build failure, and the
> child quietly goes back to 11 renders. Removing existing manual memoization can also change what the
> compiler emits, which is why `react-hooks/preserve-manual-memoization` ships as an **error-level**
> rule. See `react-compiler`.

---

### Effort / risk per hop

Ratings below the table are engineering judgement, not measurements.

| Hop | Effort | Risk | Rollback | Dominant cost |
|---|---|---|---|---|
| 16 → 17 | Low | Medium | **Easy** — pure package revert | Silent event-delegation breaks in 3rd-party code you don't own |
| 17 → 18 (bump only) | Trivial | Low | Easy | IE11 drop (hard fork) |
| 17 → 18 (`createRoot`) | **High** | **High** | Medium-hard — `react-dom/client` doesn't exist on 17 | Making every effect idempotent. This is the project. |
| 18 → 18.3 | Low | Low | Easy | Reading warnings |
| 18.3 → 19 | Medium-high (volume) | Medium | **Hard** — codemods don't revert with the package | Types wall + silent `defaultProps` |
| 16 → 18 direct | = 17 + 18 combined | High | Medium-hard | **Undocumented 17 breakage** — the guide won't tell you |

> **Where the time actually goes, contrary to expectation:** not in 18→19 (mechanical, codemoddable,
> loud). It's in **17→18 step 9** — `createRoot` + StrictMode — because that step doesn't ask you to
> rename an API, it asks you to fix every effect you ever wrote wrong. That is unbounded work on a
> legacy codebase, and it is the step that gets estimated at "a day."

---

### Sources

- **React 18 upgrade guide** — install step ("no minimum version"), "behave as if it's running React
  17", IE recommendation, React-17 mode for `render`/`hydrate`:
  https://react.dev/blog/2022/03/08/react-18-upgrade-guide
- **React 19 upgrade guide** — migration-recipe contents, "This does not include the TypeScript
  changes": https://react.dev/blog/2024/04/25/react-19-upgrade-guide
- **`types-react-codemod`** presets (`preset-18`, `implicit-children`, `preset-19`, `scoped-jsx`):
  https://github.com/eps1lon/types-react-codemod
- **`codemod` CLI** (rewritten Rust workflow engine; registry `search react/19`):
  https://codemod.com
- React 17 release notes (react.dev blog URLs 404 as of mid-2026 — breaking-change list carried from
  the facebook/react CHANGELOG): https://github.com/facebook/react/blob/main/CHANGELOG.md
- Registry ground truth via `npm view` (react 19.2.7, `@types/react` 19.2.17, typescript 7.0.2,
  codemod 1.12.13), measured 2026-07-17.

---

## React 19

React 19 is the current stable line (**19.2.7**, published 2026-06-01; 19.2.0 shipped 2025-10-01). This page covers the features you actually reach for — Actions, `use()`, `ref`-as-prop, document metadata — and the removals that turn an 18→19 bump into a migration. It is written against the React 19 docs; where a claim is weaker than a primary source, it is hedged in prose. Do not upgrade those hedges into flat assertions.

> **Read this first: there is a version floor.** React 19.0.0 through 19.2.3 shipped a **CVSS 10.0 pre-auth remote-code-execution** vulnerability in React Server Components (CVE-2025-55182), plus DoS and Server-Function source-code-exposure CVEs. The practical floor is **19.2.4+**; recommend **19.2.7**. See [Security floor](#security-floor-the-version-fact-that-matters) below before pinning any React 19 version.

---

### Actions — the organizing idea

**Rule: an async function passed to `startTransition` (or to a `<form action>`) is an "Action". Let React own the pending / error / ordering state instead of hand-rolling it.**

> 🟢 **Best practice** — reach for `useActionState` before hand-rolling four `useState`s. This is a correctness rule, not an optimization: the ordering/error state it manages is exactly what people get wrong.

Why it exists: the hand-rolled version is four pieces of `useState` and almost everyone gets at least one wrong — usually the error path or the stale-response race. The failure it prevents is a slow first request landing *after* a fast second one and clobbering the newer result — a [stale-closure](fundamentals#closures)-adjacent bug where the older async continuation writes last.

**Bad** — realistic, and subtly broken:

```tsx
function EditName({ currentName, onSave }: Props) {
  const [name, setName] = useState(currentName);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    try {
      await onSave(name);
    } catch (err) {
      setError((err as Error).message); // stale-response race: a slow first
    } finally {                          // request can resolve after a fast
      setIsPending(false);               // second one and overwrite it
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={e => setName(e.target.value)} disabled={isPending} />
      <button type="submit" disabled={isPending}>Save</button>
      {error && <p>{error}</p>}
    </form>
  );
}
```

**Good** — `useActionState`:

```tsx
import { useActionState } from 'react';

function EditName({ currentName, onSave }: Props) {
  const [error, submitAction, isPending] = useActionState(
    async (_previousError: string | null, formData: FormData) => {
      const name = formData.get('name') as string;
      try {
        await onSave(name);
        return null;
      } catch (err) {
        return (err as Error).message; // returned value becomes the new state
      }
    },
    null,
  );

  return (
    <form action={submitAction}>
      <input name="name" defaultValue={currentName} disabled={isPending} />
      <button type="submit" disabled={isPending}>Save</button>
      {error && <p>{error}</p>}
    </form>
  );
}
```

React sequences queued dispatches (each receives the prior result), tracks `isPending` across the whole transition, and — for uncontrolled forms driven by `<form action>` — **resets the form on success**.

#### Gotchas that bite in production

1. **`useActionState`'s reducer takes `previousState` first.** The signature is `(previousState, payload)`. Every migration where someone renames `useFormState`→`useActionState` and forgets the payload is the *second* arg produces `formData.get is not a function` at runtime. The `replace-use-form-state` codemod does the rename but you still own the call sites.

2. **Full signature includes a third arg:** `useActionState(fn, initialState, permalink?)`. `permalink` is the progressive-enhancement escape hatch — if the form submits before JS hydrates, the browser navigates there. Per the docs, the destination page **must render the same form component with the same action and the same permalink**, or PE silently degrades to a broken navigation.

3. **Dispatching outside a transition errors in dev.** Calling the returned dispatch from a plain `onClick` logs an error. Wrap it: `startTransition(() => submitAction(payload))`. Passing it to `<form action>` is already inside a transition.

4. **Form auto-reset only helps uncontrolled inputs.** If you kept `value={name} onChange={...}`, React resets the DOM but your state still holds the old string. Migrating to Actions means migrating to `defaultValue` + `name`. This is the single most common half-migration.

> A `throw` from the action cancels queued actions and propagates to the nearest Error Boundary. If you want inline errors, **return** them as state (as above); do not throw. Throwing an expected validation error nukes the subtree.

---

### `useFormStatus`

```ts
const { pending, data, method, action } = useFormStatus();
```

`data` is `FormData | null`, `method` is `'get' | 'post'`, `action` is `fn | null` (`null` when the form's action is a URI string). Imported from **`react-dom`**, not `react`.

**Rule: `useFormStatus` reads the *parent* form only. It cannot see a form rendered by the same component.**

> 🟢 **Best practice** — put the hook in a child component (`<SubmitButton>`) inside the `<form>`, never in the component that renders the `<form>`. This is a correctness rule; getting it wrong fails silently.

This is the #1 `useFormStatus` bug and it fails *silently* — `pending` is just permanently `false`.

**Bad:**

```tsx
import { useFormStatus } from 'react-dom';

function Form({ submit }: { submit: (fd: FormData) => Promise<void> }) {
  const { pending } = useFormStatus(); // always false — this component
  return (                             // renders the form, it isn't inside one
    <form action={submit}>
      <button disabled={pending}>Submit</button>
    </form>
  );
}
```

**Good:**

```tsx
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending } = useFormStatus(); // reads the enclosing <form>
  return <button type="submit" disabled={pending}>Submit</button>;
}

function Form({ submit }: { submit: (fd: FormData) => Promise<void> }) {
  return (
    <form action={submit}>
      <input name="q" />
      <SubmitButton />
    </form>
  );
}
```

Mental model: the `<form>` behaves like a Context provider and the hook is a consumer — a provider can't consume itself. The payoff is a design-system `<SubmitButton>` that works with zero prop drilling, at the cost of one extra component boundary.

**Tradeoffs.** *Pros:* the submit button reads pending state with no prop drilling and works in any form. *Cons:* forces an extra component split you might not otherwise want. **When NOT to use it:** for a one-off form where the pending state is already local, `useActionState`'s own `isPending` is simpler — reach for `useFormStatus` only when the status consumer is decoupled from the form owner (a shared design-system button).

---

### `useOptimistic`

```ts
const [optimisticState, setOptimistic] = useOptimistic(value, reducer?);
```

The optional second arg is a **pure** reducer `(currentState, action) => nextOptimisticState` — it must be [pure](fundamentals#purity), because React re-runs it against a changing base value.

> 🟡 **Optimization** — `useOptimistic` is a *perceived-latency* win, not a correctness feature. It trades extra code and a reconciliation-on-revalidate contract for a UI that responds before the server does. Skip it when the write is fast enough that a plain pending spinner reads fine.

**Rule: `setOptimistic` must be called inside a transition/Action, and the optimistic value survives exactly as long as the transition does.**

Without the reducer you can only replace the value. With it you can express "append" — and, the actual reason it exists, **React re-runs the reducer against the fresh base `value` if the base changes mid-flight**. That is what makes concurrent optimistic updates correct.

**Bad** — hand-rolled optimism with a manual rollback:

```tsx
function MessageList({ messages, send }: Props) {
  const [local, setLocal] = useState(messages);

  async function onSend(formData: FormData) {
    const text = formData.get('text') as string;
    const optimistic = { id: 'temp', text, sending: true };
    setLocal(prev => [...prev, optimistic]);
    try {
      const saved = await send(text);
      setLocal(prev => prev.map(m => (m.id === 'temp' ? saved : m)));
    } catch {
      setLocal(prev => prev.filter(m => m.id !== 'temp')); // manual rollback
    }
    // two in-flight sends both use id 'temp' — they overwrite each other
    // `messages` updating from elsewhere is silently ignored forever
  }
  return <form action={onSend}>{/* ... */}</form>;
}
```

**Good:**

```tsx
import { useOptimistic } from 'react';

function MessageList({ messages, send }: Props) {
  const [optimisticMessages, addOptimistic] = useOptimistic(
    messages,
    (current, newText: string) => [
      ...current,
      { id: 'pending', text: newText, sending: true },
    ],
  );

  async function onSend(formData: FormData) {
    const text = formData.get('text') as string;
    addOptimistic(text); // inside a <form action> => already in a transition
    await send(text);     // parent revalidates `messages`
  }

  return (
    <>
      {optimisticMessages.map(m => (
        <p key={m.id} style={{ opacity: m.sending ? 0.5 : 1 }}>{m.text}</p>
      ))}
      <form action={onSend}>
        <input name="text" />
        <button type="submit">Send</button>
      </form>
    </>
  );
}
```

#### Gotchas

- **It reverts on completion, not just on error.** The optimistic state is discarded when the Action finishes and `optimisticState` converges to the new `value` in the *same* render — no intermediate cleared frame, no flicker. The consequence: **if the parent doesn't actually update `value`, the UI snaps back and looks like the write failed.** The most common complaint about `useOptimistic` ("my item disappears for a second") is really "my server data never revalidated." `useOptimistic` is not a store.
- **Rollback on error is automatic.** No `catch` + undo needed. Catch only to *surface* the error.
- Calling it outside a transition warns in dev; calling it during render is a hard error.

**Tradeoffs.** *Pros:* instant feedback, automatic rollback on error, correct under concurrent in-flight updates (the reducer re-runs against fresh base state). *Cons:* it is **not a store** — it depends on the parent revalidating `value`, so it couples your component to a real data-refresh path; get that wrong and the UI snaps back and looks like a failed write. **When NOT to use it:** for writes with no meaningful latency, or where you have no revalidation story yet — a plain optimistic `useState` is honest about being ad-hoc, whereas `useOptimistic` promises a convergence that never happens.

---

### `use()`

```ts
const value = use(promise);
const value = use(context);
```

**Rule: `use()` is not a hook and deliberately breaks the Rules of Hooks — it may be called in conditionals and loops. But it must still be called from a component or hook, and the promise must not be created during render.**

> 🟢 **Best practice** — always pass `use()` a *cached / stable* promise created outside the [render](fundamentals#render-vs-commit) pass. An uncached promise created inline suspends → re-renders → creates a new promise → suspends forever. This is a correctness rule; the failure mode is a permanent fallback (or a melted server), not a slowdown.

Why it can bend the rules: hook order matters because hook state is positional. `use()` reading a promise or context has no positional slot to preserve.

```tsx
// conditional — illegal for useContext, fine for use()
function Heading({ children }: { children?: React.ReactNode }) {
  if (children == null) return null;
  const theme = use(ThemeContext);
  return <h1 style={{ color: theme.color }}>{children}</h1>;
}
```

**Bad — the one that ships and then melts the server:**

```tsx
function Albums() {
  const albums = use(fetch('/api/albums').then(r => r.json()));
  // new promise every render -> suspends -> re-renders -> new promise -> forever
  return albums.map((a: Album) => <p key={a.id}>{a.title}</p>);
}
```

**Good — promise created outside render, passed in:**

```tsx
// Server Component (or a framework loader / cache() / a Suspense-aware lib)
async function Page() {
  const albumsPromise = fetchAlbums(); // NOT awaited here
  return (
    <ErrorBoundary fallback={<p>Failed to load</p>}>
      <Suspense fallback={<Spinner />}>
        <Albums albumsPromise={albumsPromise} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

```tsx
'use client';
import { use } from 'react';

function Albums({ albumsPromise }: { albumsPromise: Promise<Album[]> }) {
  const albums = use(albumsPromise);
  return albums.map(a => <p key={a.id}>{a.title}</p>);
}
```

Note the shape: the parent **starts** the fetch without awaiting, so the request is in flight during render and the child suspends on it. Awaiting in the parent would serialize it.

#### Rules and caveats

- Callable only inside a component or hook. **Not** at module top level, not in plain functions, not in event handlers.
- Promises **must be cached / stable across renders.** An uncached promise means a permanent fallback.
- **Cannot be wrapped in `try/catch`** — use an Error Boundary instead. `use()` signals suspension by throwing, and your `catch` would swallow the suspension. `eslint-plugin-react-hooks` (≥ 6.1.0) flags this statically.
- `use(context)` **does not see providers rendered by the same component** — it searches strictly upward, the same footgun class as `useFormStatus`.
- Reading context with `use` is **not supported in Server Components**.
- For a Server→Client promise, the resolved value **must be serializable**.

---

### `ref` as a prop — and the `forwardRef` truth

```tsx
// React 19: no wrapper
function MyInput({ placeholder, ref }: Props) {
  return <input placeholder={placeholder} ref={ref} />;
}

<MyInput ref={inputRef} />;
```

> **`forwardRef` is NOT deprecated in React 19.** The docs say `forwardRef` is *"no longer necessary"* and *"will be deprecated in a future release"* — future tense. There is **no runtime deprecation warning**, and existing `forwardRef` components keep working. Say "unnecessary, slated for deprecation," not "deprecated." **Do not block a 19 upgrade on a `forwardRef` sweep** — it's a cleanup, not a migration blocker. Same story for `<Context.Provider>`.

Caveat: **refs to class components are still not passed as props.** `ref`-as-prop is a function-component feature only; codebases with a mix will find the class case unchanged. It also requires the **modern JSX transform** (see [Migration](#migration-18--19)).

#### Ref cleanup functions

```tsx
<div
  ref={(node) => {
    const observer = new ResizeObserver(onResize);
    observer.observe(node);
    return () => observer.disconnect(); // cleanup, called on unmount
  }}
/>;
```

Previously React called the ref with `null` on unmount; now you can return a cleanup. Works for DOM refs, class refs, and `useImperativeHandle`.

**The gotcha, and it's a TS one:** because a returned function is now *meaningful*, **implicit returns from ref callbacks are rejected**.

```tsx
// TS error in React 19 types — the arrow implicitly returns `instance`,
// which React now tries to invoke as a cleanup function
<div ref={current => (instance = current)} />;

// explicit block, returns undefined
<div ref={current => { instance = current; }} />;
```

In plain JS this is a **silent runtime hazard** — no types to catch it — because the assignment's value gets returned and React invokes it as cleanup. Codemod: `no-implicit-ref-callback-return`, in the `types-react-codemod` `preset-19`.

---

### `<Context>` as provider

```tsx
const ThemeContext = createContext('');

// React 19
<ThemeContext value="dark">{children}</ThemeContext>;

// still works, slated for future deprecation — not deprecated today
<ThemeContext.Provider value="dark">{children}</ThemeContext.Provider>;
```

`<Context.Consumer>` is unchanged. A codemod ships in the 19 migration recipe.

---

### Document metadata, stylesheets, scripts, preloading

#### Metadata hoisting

`<title>`, `<meta>`, and `<link>` rendered anywhere in the tree are hoisted into `<head>`. Works in CSR, streaming SSR, and RSC.

```tsx
function BlogPost({ post }: { post: Post }) {
  return (
    <article>
      <h1>{post.title}</h1>
      <title>{post.title}</title>
      <meta name="author" content={post.author} />
      <link rel="canonical" href={post.url} />
      <p>{post.body}</p>
    </article>
  );
}
```

> 🔴 **Gotcha — React hoists, it does not deduplicate or arbitrate.** Two components rendering `<title>` yield two `<title>` tags in `<head>`. There is no "last one wins" merge and no `<meta>` key-collision handling. This is **not** a react-helmet replacement for apps with nested layouts each declaring metadata — that needs framework-level merging (Next's Metadata API, etc.). Teams that adopt this on the strength of the release-note headline hit duplicate/conflicting tags in prod and blame SEO.

#### Stylesheets

```tsx
<link rel="stylesheet" href="/foo.css" precedence="default" />
<link rel="stylesheet" href="/bar.css" precedence="high" />
```

- `precedence` controls insertion order in `<head>` (order your `precedence` values are first encountered, not alphabetical).
- **Deduplicated** across components (unlike metadata).
- React **blocks [commit/paint](fundamentals#render-vs-commit) until the stylesheet loads** — CSR waits before committing, SSR won't paint. This makes co-located CSS safe, but a slow/blocked CDN stylesheet now blocks *rendering*, converting a FOUC into a blank screen. Watch this on third-party CSS.

> 🔴 **Gotcha** — co-locating a `<link rel="stylesheet">` is convenient, but you have just put a network request on the critical path *between render and commit*. A third-party CSS host having a bad day turns into a blank screen, not a flash of unstyled content. Reach for co-located stylesheets knowingly; keep slow/untrusted CSS out of the commit path.

#### Async scripts

```tsx
<script async={true} src="https://example.com/widget.js" />
```

Deduplicated by `src`, can be co-located with the component that needs it. **Only `async` scripts** get this treatment.

#### Preload APIs (`react-dom`)

```ts
import { prefetchDNS, preconnect, preload, preinit } from 'react-dom';

prefetchDNS('https://cdn.example.com');                      // may not need it
preconnect('https://cdn.example.com');                       // will need something
preload('https://cdn.example.com/f.woff2', { as: 'font' });  // know the URL
preinit('https://cdn.example.com/a.js', { as: 'script' });   // fetch AND execute now
```

Escalating commitment. `preinit` **executes** — not just fetches. Ordering follows React's own heuristic, not your call order.

---

### Removals — the actual 18→19 blockers

| Removed | Deprecated since | Migration |
|---|---|---|
| `propTypes` (function components) | v15.5.0, Apr 2017 | TypeScript; codemod `prop-types-typescript` |
| `defaultProps` (function components) | v15.5.0 | **ES6 default params** (codemod `react-19-replace-default-props`) |
| Legacy context (`contextTypes`, `getChildContext`) | v16.6.0 | `createContext` |
| String refs (`ref="input"`) | v16.3.0 | codemod `replace-string-ref` |
| Module pattern factories | v16.9.0 | plain functions |
| `React.createFactory` | v16.13.0 | JSX |
| `react-test-renderer/shallow` | — | `npm i -D react-shallow-renderer` |
| `ReactDOM.render` | v18.0.0 | `createRoot` |
| `ReactDOM.hydrate` | v18.0.0 | `hydrateRoot` |
| `ReactDOM.unmountComponentAtNode` | v18.0.0 | `root.unmount()` |
| `ReactDOM.findDOMNode` | v16.6.0 | refs |
| `react-dom/test-utils` (`act`) | — | `import { act } from 'react'` |

Newly **deprecated** (not removed): `element.ref` (use `element.props.ref`), `react-test-renderer`.

#### `defaultProps` is the removal that actually hurts

`defaultProps` on function components is **silently gone** — the prop is just `undefined`.

```tsx
// React 19: no error, no warning, `size` is undefined
function Button({ size, children }: Props) {
  return <button className={`btn-${size}`}>{children}</button>;
}
Button.defaultProps = { size: 'medium' }; // ignored -> className="btn-undefined"

// fix: ES6 default parameter
function Button({ size = 'medium', children }: Props) {
  return <button className={`btn-${size}`}>{children}</button>;
}
```

Why it's nasty: TypeScript can't catch it (the prop is still optional and typed), and the failure is a cosmetic wrong-class or a `NaN`, not a crash — it surfaces in visual QA or not at all.

> **There IS a codemod: `react-19-replace-default-props`.** (Some write-ups claim none exists — that is wrong.) It rewrites function-component `defaultProps` to default parameters and **correctly leaves class `defaultProps` alone**, since those still work in React 19. What it *can't* reach is `defaultProps` buried in unmaintained `node_modules`, so still **grep `defaultProps` across your dependencies** before upgrading — that's where it usually lurks.

---

### Security floor: the version fact that matters

React 19.0.0 → 19.2.3 shipped a set of RSC vulnerabilities. If you write down one version fact, write this one.

| CVE | Severity | Impact |
|---|---|---|
| **CVE-2025-55182** | **CVSS 10.0** | Unauthenticated arbitrary code execution via Server Actions deserialization |
| CVE-2025-55184 | 7.5 | DoS (infinite loop) |
| CVE-2025-67779 | 7.5 | DoS (additional case) |
| CVE-2026-23864 | 7.5 | DoS (further cases, found Jan 2026) |
| CVE-2025-55183 | 5.3 | Server Function **source-code exposure** (leaks hardcoded literals + closure vars) |

Mechanism of the RCE: `requireModule` did not validate that the requested export name was a direct own-property of the module. An attacker requests the `constructor` prop of an exported function, obtains the global `Function` constructor, and gets arbitrary code execution — from one crafted HTTP request.

- RCE fixed in **19.0.1 / 19.1.2 / 19.2.1**.
- DoS + source-exposure fixed in **19.0.4 / 19.1.5 / 19.2.4**.
- **Practical floor: 19.2.4+. Recommend 19.2.7.**
- Affected downstream: `next`, `react-router`, `waku`, `@parcel/rsc`, `@vitejs/plugin-rsc`, `rwsdk`.

> CVE-2025-55183 leaks the *stringified source* of Server Functions — a hardcoded literal like `db.connect('SECRET_KEY')` is exposed, while `process.env.SECRET` read at runtime is **not**. That's a concrete argument for env-var secrets over inlined constants, on top of the usual hygiene one.

---

### React Compiler 1.0

```bash
npm install --save-dev --save-exact babel-plugin-react-compiler@latest
```

> 🟡 **Optimization** — the compiler auto-memoizes so you (mostly) don't hand-write `useMemo`/`useCallback`. Like all memoization it has a cost: build-time transform, a per-component `_c` cache at runtime, and the possibility of a silent bailout leaving you *believing* you're optimized. Adopt it deliberately, measure, and pin the version.
>
> **What "auto-memoize" buys, measured:** the same un-memoized child that renders **11 times** across 10 parent updates renders **1 time** once compiled (`babel-plugin-react-compiler@1`, `target: '19'`) — the compiler guards the child behind a `_c(n)` cache. That's the *same* 11→1 ratio you'd get from a hand-placed `React.memo`, without the wrapper. *Measured on a small reproduction (React 19, jsdom); your numbers will differ in production, and the ratio, not the absolute count, is the point.*
>
> **Tradeoffs.** *Pros:* removes most manual-memoization busywork; can [memoize after an early return](#react-compiler-10), which `useMemo` structurally cannot. *Cons:* bailouts are silent (below), it magnifies existing Rules-of-React violations, and behavior can shift between compiler versions. **When NOT to use it:** on a codebase with known purity/Rules-of-React violations and thin e2e coverage — fix those first. It is not a free win; see the pin-exactly note below.

- **Stable since 1.0.0, published 2025-10-07.** Versioning is deliberately decoupled from React's — it's `1.0.0`, not `19.x`. It is roughly nine months old; treat it as **mature**, not brand-new. (Do not reflexively pin `@rc` — the `rc` dist-tag points at an *older* `19.1.0-rc.3`, so `@rc` is a downgrade to a prerelease.)
- **Supports React 17+.** For **17 / 18** you must also install `react-compiler-runtime` and set the compiler `target`. React 19 needs neither.
- Meta-scale results: Quest Store reported initial load + cross-page nav up to **12%** better, some interactions **>2.5×** faster, memory neutral.

> 🔴 **Pin it exactly.** The docs state that memoization behavior *may change between compiler versions*, and code that breaks the Rules of React can then behave unexpectedly — specifically, **`useEffect` can over- or under-fire** when a memoized value is a dependency. If your e2e coverage is thin, pin `"babel-plugin-react-compiler": "1.0.0"`, not `^1.0.0` — hence `--save-exact` in the official install command. The compiler is not a free win on a codebase with Rules-of-React violations; it *magnifies* them.

> 🔴 **Do NOT mass-delete `useMemo`/`useCallback` when the compiler is on.** This is the dominant advice online and it is harmful. Removing existing memoization *can change* the compiler's output, and the plugin ships `react-hooks/preserve-manual-memoization` as an **error-level** rule in `recommended` — the compiler consumes your manual memo as a semantic signal.

> 🔴 **Bailouts are silent.** Compilation is per-function; a bailout produces no warning and no build failure, so you can ship believing you're memoized when you aren't. The bail set is strictly *larger* than "violates Rules of React" (it includes unimplemented-syntax bailouts), so you can't reason your way to compiled-ness from purity alone. Only the compiler's `logger.logEvent` gating hook reveals bailouts.

The one thing the compiler does that `useMemo` structurally cannot: **memoize after an early return** (the Rules of Hooks forbid a hook there). That's verifiable in the compiled output.

#### ESLint (v7 is current)

`eslint-plugin-react-hooks` is on **v7** (7.1.1). The old `eslint-plugin-react-compiler` package is a **dead end** — its rules folded into `eslint-plugin-react-hooks`. Do not install it.

```js
// eslint.config.js — flat config
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  reactHooks.configs.recommended, // v7: flat by default; compiler rules on
];
```

v7.0.0 removed `recommended-latest-legacy` and `flat/recommended`. Two configs remain:

- `recommended` — all recommended rules (both legacy and flat exports).
- `recommended-latest` — recommended plus bleeding-edge experimental compiler rules.

> 🟢 **Best practice — turn on `no-deriving-state-in-effects`.** The plugin grew from 2 rules to ~29 and now mechanically enforces "You Might Not Need an Effect" via this rule — but it is **off by default** (not in `recommended`, and `recommended` ≠ `recommended-latest`). Deriving state in an Effect that could be computed during render is the single most common source of extra render passes and [dependency-array](fundamentals#dependency-arrays) churn; this lint rule catches it mechanically. One of the most valuable React lint rules is one almost nobody has enabled. (Its on-by-default sibling `set-state-in-effect` — which *is* in `recommended` as verified against `eslint-plugin-react-hooks@7.1.1` — catches the related "synchronous `setState` inside an Effect" case, but not the broader derive-during-render one.)

Legacy eslintrc users: `extends: ['plugin:react-hooks/recommended-legacy']`. When citing the 6.x line, cite **6.1.0** — 6.0.0 was an accidental publish, deprecated immediately.

---

### Migration 18 → 19

> **The command every migration blog prints is dead.** react.dev's upgrade guide shows `npx codemod@latest react/19/migration-recipe` verbatim, and it fails with *"No command provided"* on the current `codemod` CLI (rewritten into a Rust workflow engine). **Working form:**
> ```bash
> npx codemod@latest run react-19-migration-recipe -t ./src --no-interactive
> ```

The recipe bundles `replace-reactdom-render`, `replace-string-ref`, `replace-act-import`, `replace-use-form-state`, and `prop-types-typescript`. It **does not include the TypeScript changes** — that's a separate tool and a separate run, and it is the step people skip:

```bash
npx types-react-codemod@latest preset-19 ./src
npx types-react-codemod@latest react-element-default-any-props ./src
```

`preset-19` includes `no-implicit-ref-callback-return`, `refobject-defaults`, and `scoped-jsx`.

**The modern JSX transform is now required.** Without it you get a console warning about an "outdated JSX transform," and `ref`-as-prop won't work.

#### TypeScript breaking changes

- **`useRef` now requires an argument** — `useRef<T>()` no longer compiles; use `useRef<T>(null)`. Mechanical, but it touches a lot of lines.
- All refs are mutable now; `MutableRefObject` is deprecated.
- **`ReactElement["props"]` defaults to `unknown` instead of `any`** — the change that generates a wall of new errors in code poking at `children.props.*`. The `react-element-default-any-props` codemod is the escape hatch.
- **The JSX namespace moved from global to `React.JSX`** — breaks `declare global { namespace JSX { ... } }` augmentations (custom elements, styled-components). Codemod: `scoped-jsx`.

> **String refs were removed, but `this.refs` was not.** React 19.2.7 still initializes `this.refs` to an object on class instances. "React 19 removed string refs" gets misread as "`this.refs` is gone" — and that misreading makes reviewers wrongly reject the official `replace-string-ref` codemod's output. The codemod converts `ref="input"` to a callback ref writing into a field; it does not, and need not, remove `this.refs`.

#### Suggested order

1. Get to React **18.3.x** first; fix every new deprecation warning.
2. Grep `defaultProps` — including in dependencies (`react-19-replace-default-props` covers your own function components, not `node_modules`).
3. Confirm the modern JSX transform is on.
4. `npx codemod@latest run react-19-migration-recipe -t ./src --no-interactive`
5. `npx types-react-codemod@latest preset-19 ./src`
6. Bump to **19.2.7** (never below 19.2.4 — see the security floor).
7. `eslint-plugin-react-hooks@7`, then adopt React Compiler 1.0 **last**, pinned exactly.

---

### Worth knowing, shipped after 19.0

- **19.1.0** (2025-03-28): **Owner Stacks** — `captureOwnerStack()`, dev-only. Shows which component *rendered* a component (vs. component stacks, which show the tree above an error). The underused debugging upgrade of the 19.x line.
- **19.2.0** (2025-10-01):
  - **`<Activity mode="visible" | "hidden">`** — replaces `{visible && <Page/>}`. `hidden` unmounts effects and defers updates until idle **but preserves state**. Pre-render next routes; keep state across back-nav.
  - **`useEffectEvent`** — the fix for "my Effect re-runs because a callback dep changed." It lets an Effect read the latest props/state without listing them in [the dependency array](fundamentals#dependency-arrays). Declare it in the same component/hook as its Effect; **never** put it in a dep array. Requires `eslint-plugin-react-hooks@latest`.
  - **`cacheSignal()`** (RSC only) — an abort signal tied to `cache()` lifetime.
  - **Performance Tracks** in Chrome DevTools (Scheduler + Components tracks).
  - **SSR Suspense reveals now batch** to align server with client behavior. This **changes existing SSR reveal timing** — a behavior change inside a minor. A heuristic backstop stops batching if LCP approaches 2.5s.
  - **`useId` prefix changed to `_r_`** (was `:r:` in 19.0, `«r»` in 19.1) so IDs are valid CSS selectors / XML names. It **breaks snapshot tests and any CSS/selector code keying on the prefix** — and it changed *twice* within 19.x, so never depend on it.
- **19.2.7** (2026-06-01): fixes missing `FormData` entries in Server Actions, regressed in 19.2.6 — a cheap argument for staying current on patches.

#### Other 19.0 items not to overlook

- **Consolidated hydration error diffs** — one error with a server-vs-client visual diff instead of a pile of messages.
- New root options: `onCaughtError`, `onUncaughtError`, `onRecoverableError`.
- Hydration now tolerates third-party scripts/extensions — unexpected tags in `<head>`/`<body>` are skipped; extension stylesheets survive re-render. Kills a large class of "works locally, errors for users with extensions" reports.
- **Custom Elements**: full support, passing all Custom Elements Everywhere tests.
- **`useDeferredValue(value, initialValue)`** — returns `initialValue` on first render, then schedules the real value in the background, avoiding the empty-state flash.
- **RSC is stable in 19** — but the docs state the underlying implementation APIs **do not follow semver and may break between 19.x minors**. Library authors targeting `react-server` should pin.

---

### Sources

Primary (react.dev / React repo):

- https://react.dev/blog/2024/12/05/react-19
- https://react.dev/blog/2024/04/25/react-19-upgrade-guide
- https://react.dev/blog/2025/10/01/react-19-2
- https://react.dev/blog/2025/10/07/react-compiler-1
- https://react.dev/reference/react/use
- https://react.dev/reference/react/useActionState
- https://react.dev/reference/react/useOptimistic
- https://react.dev/reference/react-dom/hooks/useFormStatus
- https://react.dev/reference/react/forwardRef
- https://react.dev/versions
- https://github.com/facebook/react/blob/main/packages/eslint-plugin-react-hooks/CHANGELOG.md

Security:

- https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components
- https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components
- https://github.com/facebook/react/security/advisories/GHSA-fv66-9v8q-g76r
- https://nvd.nist.gov/vuln/detail/CVE-2025-55182

---

## React 18 — Concurrent Rendering and the Traps

React 18.0 shipped 2022-03-29; React 19.0 shipped 2024-12-05; the latest React today is **19.2.7**.
So React 18 is **two majors old**, and everything here is one of two things: legacy-migration
material, or an explanation of the concurrent primitives that still exist unchanged in 19. The
honest one-line framing:

> React 18 introduced concurrency. React 19 removed the escape hatches that let you ignore it.

Do not write "React 18 is the latest" anywhere. Do not upgrade the hedges below into flat
assertions — several of these claims were flagged low-confidence in research and are marked as such.

> This page was **not** re-verified against a fresh install. Version literals (`19.2.7`, `18.3.1`,
> `use-sync-external-store@1.6.0`) were confirmed via `npm view` on 2026-07-17; behavioral claims
> trace to react.dev, the React blog, the RFCs, and the reactwg/react-18 working group. Where a
> claim could not be pinned to a primary source it is hedged in prose — keep it that way.

---

### Version reality: what 18 deprecated, 19 deleted

18.3 is a **migration tool, not a feature release**. Per the React 19 upgrade guide, 18.3.1 exists
solely to add deprecation warnings for APIs that 19 removes. The correct upgrade path is
`18.x → 18.3.1 → fix every warning → 19`. Skip 18.3.1 and you discover the removals as runtime
crashes instead of console warnings.

The last 18.x release is **18.3.1**. There is no 18.4.

| React 18 (warns) | React 19 (removed) |
|---|---|
| `ReactDOM.render` | gone → `createRoot` |
| `ReactDOM.hydrate` | gone → `hydrateRoot` |
| `ReactDOM.unmountComponentAtNode` | gone → `root.unmount()` |
| `ReactDOM.findDOMNode` | gone → refs |
| `renderToNodeStream` | gone → `renderToPipeableStream` |
| `defaultProps` on function components | gone → ES6 default params |
| `propTypes` | gone → TypeScript |
| String refs (`ref="input"`) | gone → callback refs |
| Legacy context (`contextTypes`) | gone → `createContext` |

`unstable_batchedUpdates` is the notable survivor — see the batching section.

---

### Roots: `createRoot` / `hydrateRoot`

#### Rule: `createRoot` is the concurrency opt-in switch, not a cosmetic rename.

React 18's `ReactDOM.render` doesn't just warn — it *changes semantics*. The upgrade guide's warning
text is explicit:

> ReactDOM.render is no longer supported in React 18. Use createRoot instead. Until you switch to
> the new API, your app will behave as if it's running React 17.

**The failure this prevents:** a team bumps `react` to 18 in `package.json`, sees no errors, ships,
and concludes "React 18 works fine." They are running React 17 semantics with React 18 installed —
no automatic batching, no concurrent features, no new StrictMode behavior. Six months later someone
flips `createRoot` in an unrelated PR, and *all* of the batching and StrictMode changes land at once
in a diff that looks trivial. This is the single most common React 18 migration disaster: **the
risky part of the migration is one line long and looks like a no-op.**

```js
// BAD — React 18 installed, React 17 behavior. Silently legacy.
import { render } from 'react-dom';
render(<App />, document.getElementById('root'));
```

```js
// GOOD — note the import path change: 'react-dom' -> 'react-dom/client'
import { createRoot } from 'react-dom/client';

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing');

const root = createRoot(container);
root.render(<App />);
```

> 🟢 **Best practice** — switch to `createRoot` as the *first* step of the 18 migration, not a later
> cleanup. It's a correctness rule, not an optimization: while you're on `ReactDOM.render`, React
> deliberately runs [React 17 semantics](fundamentals#render-vs-commit) — automatic batching,
> concurrent features, and the new StrictMode all stay dormant. Deferring the switch doesn't defer
> the risk, it *concentrates* it into one innocent-looking line landed later.

#### Gotchas

- **The `render` callback is gone.** `render(<App/>, container, callback)` — the third arg is not
  supported by `root.render`. There is no direct replacement. Move it into a `useEffect` at the top
  of the tree. Silent no-op risk if you used it to signal "app ready" to a splash screen or a perf mark.
- **Keep the root handle.** `createRoot` returns the only way to unmount. Calling `createRoot` twice
  on the same container is a bug (React warns). Micro-frontends and test helpers that used to call
  `render`/`unmountComponentAtNode` freely must now thread the root object through.
- **Hydration is one call, not two.** `hydrateRoot(container, <App/>)` takes the element as an
  argument; there is no `root.render()` follow-up.

```js
// BAD — this is a client render wearing a hydration costume.
// Wrong arity: it destroys and recreates the server HTML (huge CLS + perf regression no test catches).
import { hydrateRoot } from 'react-dom/client';
const root = hydrateRoot(document.getElementById('root'));
root.render(<App />);
```

```js
// GOOD
import { hydrateRoot } from 'react-dom/client';
hydrateRoot(document.getElementById('root'), <App />);
```

#### Hydration mismatches became errors

React 18 changed hydration mismatches from *warning + client-side patch* to *error + discard the
server HTML for that boundary*. React no longer patches up individual nodes.

**The production bite:** `{new Date().toLocaleTimeString()}`, `Math.random()`, or
`window.innerWidth < 768 ? <Mobile/> : <Desktop/>` rendered a warning in React 17 and mostly worked.
In 18 it throws a recoverable error, React re-renders that whole boundary on the client, and your
"SSR for performance" app quietly does full client renders under real traffic. You see it as a TTI
regression with a clean console in dev (where content usually matches) and errors only in prod.

The fix is the two-pass render, not suppression:

```js
// BAD — hydration mismatch: server has no window.
function Layout() {
  const isMobile = window.innerWidth < 768;
  return isMobile ? <MobileNav /> : <DesktopNav />;
}
```

```js
// GOOD — server and first client render agree; adjust after mount.
function Layout() {
  const [isMobile, setIsMobile] = useState(false); // MUST match server output

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isMobile ? <MobileNav /> : <DesktopNav />;
}
```

> 🟢 **Best practice** — for SSR, the first client render must produce byte-identical output to the
> server. That's a [purity](fundamentals#purity) constraint on your initial render: no `window`, no
> `Date.now()`, no `Math.random()` in the render path. The two-pass shape above satisfies it — render
> the server-safe value, then correct it in an effect after [commit](fundamentals#render-vs-commit).

`createRoot`/`hydrateRoot` accept `onRecoverableError` — wire it to your error reporter, because
these errors are *recovered from* and therefore invisible unless you look for them.

---

### Automatic batching

#### Rule: React 18 batches state updates from everywhere, not just React event handlers.

In React 17, batching was an artifact of *how the update was triggered* — inside React's synthetic
event system you got batching; outside it (setTimeout, promise `.then`, native listeners,
async/await) each `setState` caused its own synchronous re-render. That is incoherent, and it forces
extra renders on exactly the async paths that matter.

**The failure this prevents:** in React 17, a `.then()` with three `setState` calls rendered three
times, so your components could observe *intermediate, inconsistent* state combinations
(`loading === false` while `data === null`). Automatic batching makes that unrepresentable.

```js
// React 17: renders 3x, and one render happens where data is set but loading is still true.
async function load() {
  const data = await fetchThing();
  setData(data);        // render
  setError(null);       // render
  setLoading(false);    // render
}
// React 18: same code, renders once, after all three. No inconsistent intermediate state.
```

#### Gotcha: the migration bug is code that *depended* on not batching

The thing that breaks is reading the DOM immediately after `setState` outside an event handler.

```js
// BAD — worked in React 17, broken in React 18.
function handleAsyncThing() {
  fetchData().then(rows => {
    setRows(rows);
    // React 17: re-rendered synchronously right here, so the DOM had the rows.
    // React 18: batched — DOM is still the OLD content. scrollHeight is wrong.
    listRef.current.scrollTop = listRef.current.scrollHeight;
  });
}
```

```js
// GOOD (preferred) — express it as an effect of the state change.
useEffect(() => {
  const el = listRef.current;
  if (el) el.scrollTop = el.scrollHeight;
}, [rows]);
```

```js
// GOOD (escape hatch, use sparingly) — force a synchronous render + DOM commit.
import { flushSync } from 'react-dom';

function handleAsyncThing() {
  fetchData().then(rows => {
    flushSync(() => setRows(rows)); // DOM is updated when this returns
    listRef.current.scrollTop = listRef.current.scrollHeight;
  });
}
```

> 🔴 **Advanced / gotcha** — `flushSync` is a **performance footgun, not a bug fix.** It de-opts that
> update out of batching and concurrency entirely and forces a synchronous re-render of the affected
> tree. Reaching for it to "make React 18 behave like 17" across a codebase is how teams end up with a
> *slower* app after upgrading. Use it only where you must read layout between two state changes —
> measuring, focus management, imperative scroll into a just-rendered node.
>
> **When NOT to use it:** if the DOM read can be expressed as an effect keyed on the state (the
> preferred version above), do that instead — an effect runs after commit without opting out of
> batching or concurrency for every other update in the tree.

#### `unstable_batchedUpdates`: not removed, just pointless

Medium-high confidence — the 18 upgrade guide and reactwg #21 say React 18 keeps it and it *may* be
removed in a future major. Research could not find a changelog entry removing it in 19, and it is
still exported by `react-dom` 19.x. Verify against the installed `react-dom` before asserting the
exact 19.x status.

- In React 18+, `unstable_batchedUpdates` is **no-op-equivalent** — batching already happens.
- It was never removed in 19. Libraries (react-redux's `batch`, MobX, older RN code) still call it.
- **Don't add it to app code.** If you see it in your app, it's dead weight from a React 16/17 era.
- react-redux's `batch` export is literally this function; since React 18 you can delete those calls.

React kept it *because* popular libraries depended on its existence, not because it does anything —
a compatibility shim for a problem React already solved.

> 🟢 **Best practice** — delete `unstable_batchedUpdates` and react-redux `batch()` calls from *app*
> code once you're on `createRoot`. Automatic batching already collapses those updates; keeping the
> wrapper is dead weight that reads as if it's doing something. (Leave it alone inside libraries you
> don't own — they call it defensively for consumers still on 17.)

---

### StrictMode double-invoked effects — the real migration pain

#### Rule: in dev, StrictMode runs `setup → cleanup → setup` for every effect on mount.

The exact sequence, from the React 18 release notes:

```text
* React mounts the component.
  * Layout effects are created.
  * Effects are created.
* React simulates unmounting.
  * Layout effects are destroyed.
  * Effects are destroyed.
* React simulates remounting with previous state.
  * Layout effects are created.
  * Effects are created.
```

**Why React does this — the real reason, not "to find bugs":** React wants to ship features that
*preserve and restore component state across unmount/remount* — the `<Offscreen>` component, which
shipped as `<Activity>` in React 19.2. The 18 blog says the checks prepare for "future state
preservation features" where React "can remove UI sections and add them back later while preserving
state." For that to be safe, **every effect must be idempotent under remount.** Double-invoking is
React pre-testing your app against a feature that didn't exist yet. As of 19.2 `<Activity>` exists —
so this is no longer hypothetical, and the effects you suppressed in 2022 are the ones that break
when you adopt it.

The single most useful sentence in the whole migration, from react.dev:

> The right question isn't "how to run an Effect once", but "how to fix my Effect so that it works
> after remounting".

#### The anti-pattern that ate 2022

```js
// BAD — the #1 React 18 migration "fix", and it fixes nothing.
// react.dev flags this exact shape as "🚩 This won't fix the bug!!!"
const didInit = useRef(false);

useEffect(() => {
  if (didInit.current) return;
  didInit.current = true;

  const connection = createConnection(roomId);
  connection.connect();
}, [roomId]);
```

This silences the dev symptom and preserves the production bug: there is still no cleanup, so the
connection leaks on unmount, and it never reconnects when `roomId` changes. The developer "fixed"
React 18 by deleting the evidence. In production (no StrictMode) this leaks a socket per navigation.

```js
// GOOD — cleanup makes remount a non-event, in dev and prod.
useEffect(() => {
  const connection = createConnection(roomId);
  connection.connect();
  return () => connection.disconnect();
}, [roomId]);
```

In dev this connects → disconnects → connects. Net: exactly one live connection, the same invariant
as production. That's the point — the invariant, not the call count.

> 🟢 **Best practice** — every effect that acquires something (a subscription, connection, timer,
> observer) returns a cleanup that releases it. This is a [correctness rule tied to the dependency
> array](fundamentals#dependency-arrays), not a StrictMode workaround: the cleanup runs on unmount
> *and* between re-runs when a dep changes, so a missing cleanup leaks in production regardless of
> StrictMode. StrictMode's double-invoke just surfaces the leak in dev where you can see it.

> 🔴 **Advanced / gotcha** — the `didInit` ref above is the trap, not the fix. It makes the dev
> symptom disappear while *preserving* the production leak and defeating re-subscription on dep change.
> If you find yourself reaching for a "run once" guard, the real question (per react.dev) is "how do I
> make this effect safe to re-run", which cleanup answers.

#### The taxonomy that actually resolves the migration (from react.dev)

| Effect does | Fix |
|---|---|
| Controls a non-React widget (`setZoomLevel`) | Idempotent call, no cleanup needed |
| Widget throws on double-call (`dialog.showModal()`) | `return () => dialog.close()` |
| Subscribes to events | `return () => removeEventListener(...)` |
| Triggers an animation | Reset to initial value in cleanup |
| Fetches data | `ignore` flag or `AbortController` |
| Sends analytics | Let it double-fire in dev; it's dev noise. Verify in staging |
| Initializes the app once | **Move it out of the component entirely** |
| POSTs on a user action (`/api/buy`) | **Move it to an event handler — it was always a bug** |

The last two are where the double-effect earns its keep.

```js
// BAD — fires twice in dev, and that is a REAL bug, not a dev artifact:
// it also fires on every remount in prod (back/forward nav, Activity, Suspense retry).
useEffect(() => {
  fetch('/api/buy', { method: 'POST', body: JSON.stringify({ sku }) });
}, []);
```

```js
// GOOD — buying is an event, not a synchronization.
function handleBuyClick() {
  fetch('/api/buy', { method: 'POST', body: JSON.stringify({ sku }) });
}
```

```js
// GOOD — one-time app init belongs at module scope, not in an effect.
if (typeof window !== 'undefined') {
  checkAuthToken();
  loadDataFromLocalStorage();
}

function App() { /* ... */ }
```

#### The data-fetching race — a prod bug StrictMode surfaces for free

```js
// BAD — race condition. Fast userId change => slow first response overwrites the new data.
useEffect(() => {
  fetchTodos(userId).then(setTodos);
}, [userId]);
```

```js
// GOOD — the ignore flag. In dev you'll see 2 network calls; the first result is discarded.
useEffect(() => {
  let ignore = false;

  (async () => {
    const json = await fetchTodos(userId);
    if (!ignore) setTodos(json);
  })();

  return () => { ignore = true; };
}, [userId]);
```

```ts
// GOOD — AbortController variant, also cancels the in-flight request.
useEffect(() => {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`/api/user/${userId}/todos`, { signal: controller.signal });
      setTodos(await res.json());
    } catch (e) {
      if ((e as Error).name !== 'AbortError') throw e; // don't swallow real errors
    }
  })();

  return () => controller.abort();
}, [userId]);
```

> The double network request in dev is **not** a bug and does not need fixing. Teams routinely burn
> a sprint "fixing" it — usually by adding the `didInit` ref above — thereby reintroducing the race.
> With the `AbortController` cleanup your error handler **must** ignore `AbortError`, or the "fix"
> produces spurious error toasts in dev.

> 🟡 **Optimization** — while you're in a fetching effect, fire *independent* requests together with
> `Promise.all` instead of awaiting each in turn. Three independent requests took **604 ms** awaited
> sequentially vs **221 ms** with `Promise.all` (measured on a small reproduction — simulated
> 200/180/220 ms latencies; production will differ). Parallel time ≈ the single slowest request;
> sequential ≈ their sum.
>
> **When NOT to use it:** only when the requests are genuinely independent. If request B needs A's
> result, they *must* stay sequential — `Promise.all` there just races a request against data it
> doesn't have yet. The win is also latency-bound, not CPU-bound: it does nothing for requests that
> were already parallel or for a single request.

#### StrictMode also double-*renders* (a different thing, often conflated)

Double render (of the component function body) catches impurity; double effects catch missing
cleanup. Both are on in StrictMode, and people blur them.

```js
// BAD — mutates a prop during render. Under double-render, "Create Story" appears twice.
function StoryTray({ stories }) {
  const items = stories;
  items.push({ id: 'create', label: 'Create Story' });  // mutation
  return <ul>{items.map(s => <li key={s.id}>{s.label}</li>)}</ul>;
}
```

```js
// GOOD — copy before mutating.
function StoryTray({ stories }) {
  const items = stories.slice();
  items.push({ id: 'create', label: 'Create Story' });
  return <ul>{items.map(s => <li key={s.id}>{s.label}</li>)}</ul>;
}
```

> 🟢 **Best practice** — render must be [pure](fundamentals#purity): given the same props and state it
> returns the same JSX and mutates nothing it didn't create this render. `stories.push(...)` mutates a
> prop, so StrictMode's double-render makes the duplicate visible. Copy-then-mutate (`.slice()`) keeps
> the function pure. This is a correctness rule — the double-render only *reveals* the impurity that
> was already a latent bug under [reconciliation](fundamentals#reconciliation).

- **React 18 stopped suppressing console logs** on the second render (they're greyed out in DevTools
  instead). Two `console.log`s per render in dev is expected, not a bug.
- **React 19 refined this:** `useMemo`/`useCallback` results are *reused* between the two StrictMode
  renders rather than recomputed, and ref callbacks are double-invoked on mount too. So a component
  that "works in 18 StrictMode" can still surface new ref-cleanup warnings in 19.
- **Partial StrictMode is weaker than root StrictMode.** Wrap only a subtree and React enables only
  behaviors *possible in production* — notably it won't re-run effects on initial mount if the parent
  isn't also wrapped. Teams that adopt StrictMode "incrementally" on a subtree often think they've
  validated their effects when they haven't.

---

### Tearing and `useSyncExternalStore`

#### The precise definition (reactwg/react-18 #69, "What is tearing?")

> a UI has shown multiple values for the same state

Why it couldn't happen before, in their words: React 17 rendering was a single synchronous
transaction — JS is single-threaded, so nothing could change mid-render. React 18:

> React can pause to let other work happen. Between these pauses, updates can sneak in that change
> the data being used to render.

And the framing that matters:

> this isn't specific to React, it's a necessary consequence of concurrency

#### Why external stores specifically

React's own state is versioned: it can hold a "current" and a "work-in-progress" version
simultaneously. An external store has exactly one version — there is no `getBackgroundState()` to sit
alongside `getState()` (RFC 0214's phrasing). So if React yields mid-render and the store mutates,
components rendered *before* the yield hold the old value and components rendered *after* hold the
new one — both get committed. One UI, two prices for the same item.

**Concrete failure:** a dashboard where the header shows `$100` and the table below shows `$102`, in
the same committed frame, for the same product. Not a flicker — a committed, screenshot-able,
inconsistent DOM. It's insidious because it's rare, non-deterministic, load-dependent, and survives
a refresh maybe 1 time in 50. It reproduces on slow devices and under `startTransition`.

#### The de-fusing detail almost everyone misses

From RFC 0214:

> Updates triggered by a store change will always be synchronous, even when wrapped in
> startTransition.

Two consequences, and people get them wrong in opposite directions:

1. **You are probably not tearing today.** Existing store implementations keep working as they did in
   React 17 *until a store update is wrapped in `startTransition`*, at which point concurrency bugs
   surface. Tearing is not something React 18 sprays across your app on upgrade — it's latent, and
   **you arm it yourself** by adopting concurrent features. This is why "we upgraded to 18 and nothing
   broke" is simultaneously true and not reassuring.
2. **`useSyncExternalStore` is a de-opt, not an optimization.** It buys correctness by making store
   updates synchronous — i.e. by giving up time-slicing for those updates. The working group's three
   levels are explicit that this is "make it right", *not* "make it fast":
   - **Level 1 (make it work):** tolerate temporary tearing, then sync re-render to fix (old `useSubscription`).
   - **Level 2 (make it right):** `useSyncExternalStore` — no tearing, perf may suffer.
   - **Level 3 (make it fast):** full concurrent benefits with no de-opt. React state is here;
     external stores generally are not.

   So wrapping everything in `useSyncExternalStore` and expecting `startTransition` to keep your
   heavy list interruptible is a category error — the transition is forced sync.

#### The API and its one lethal rule

```js
const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?);
```

**Rule: `getSnapshot` must return a cached/immutable value — a new object every call is an infinite
loop.** React compares snapshots with `Object.is`. A fresh object is never `Object.is`-equal to the
last one, so React concludes the store changed → re-renders → calls `getSnapshot` → new object →
forever. React 18 detects it:
`The result of getSnapshot should be cached to avoid an infinite loop`.

```js
// BAD — new object identity every call. Infinite render loop.
function getSnapshot() {
  return { todos: myStore.todos };
}
```

```js
// BAD (same bug, sneakier) — selector/derive inside getSnapshot.
function getSnapshot() {
  return myStore.items.filter(i => !i.done);   // new array every call
}
```

```js
// GOOD — return a stable reference straight out of the store.
function getSnapshot() {
  return myStore.todos;
}
```

```js
// GOOD — must derive? cache the derivation, recompute only when the source changes.
let lastSource = null;
let lastResult = [];

function getSnapshot() {
  const source = myStore.items;
  if (source !== lastSource) {
    lastSource = source;
    lastResult = source.filter(i => !i.done);
  }
  return lastResult;
}
```

> 🟢 **Best practice** — the "`getSnapshot` must be cached" rule is pure correctness, not tuning:
> React compares snapshots with `Object.is`, and a fresh object every call is never equal, so it's an
> infinite render loop, not merely a slow one. The reason traces back to [render vs
> commit](fundamentals#render-vs-commit) — React reads the snapshot during render and re-runs when it
> changes; if it "changes" every read, render never settles.

For real selector support use `useSyncExternalStoreWithSelector` from
`use-sync-external-store/with-selector` (`use-sync-external-store@1.6.0` current), which takes an
`isEqual` argument. This is what react-redux and SWR migrated to.

> 🔴 **Advanced / gotcha** — a *selector* store (`useSyncExternalStoreWithSelector`, react-redux's
> `useSelector`) is the tool to reach for when many components read *different slices* of one store,
> because plain Context can't do it. A single un-split context re-renders **every** consumer on any
> value change: a context holding `{ a, b }` updated only on `a` (five times) still re-rendered a
> consumer that reads only `b` **6 times, all wasted** (measured on a small reproduction; production
> will differ). A selector store lets each consumer subscribe to just its slice via `isEqual`.
>
> **Pros:** consumers re-render only when their selected slice changes; scales to high-frequency state.
> **Cons:** you own an external store and its subscription lifecycle, and every selector must return a
> stable reference or you get the same infinite-loop / over-render failure as `getSnapshot`.
> **When NOT to use it:** low-frequency or naturally-grouped state — split it into separate contexts
> instead (cheaper, no external store). Selector stores earn their keep for hot, widely-read state.

A full realistic store + hook:

```js
// store.js — external, framework-agnostic, mutable internals with immutable snapshots.
let todos = [];
const listeners = new Set();

export const todosStore = {
  subscribe(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);   // MUST return an unsubscribe
  },
  getSnapshot() {
    return todos;                        // stable identity until addTodo replaces it
  },
  getServerSnapshot() {
    return [];                           // must match what the server rendered
  },
  addTodo(text) {
    todos = [...todos, { id: crypto.randomUUID(), text }];  // new array only on change
    listeners.forEach(l => l());
  },
};
```

```js
// useTodos.js
import { useSyncExternalStore } from 'react';
import { todosStore } from './store';

export function useTodos() {
  return useSyncExternalStore(
    todosStore.subscribe,
    todosStore.getSnapshot,
    todosStore.getServerSnapshot,   // omit => client-only render, hydration mismatch risk
  );
}
```

#### Gotchas

- **`subscribe` must be stable.** Defining it inline in the component body creates a new function
  each render → React resubscribes on every render. Hoist it to module scope or `useCallback` it.
  Silent perf bug, not an error — a very common one.
- **Omitting `getServerSnapshot` in an SSR app** forces client-only rendering for that subtree, or
  throws during hydration. And `getServerSnapshot` must return the *same value the server actually
  rendered* — `() => navigator.onLine` there is both a crash (no `navigator`) and a mismatch.
- **App code usually shouldn't call this directly.** React 18 release notes call
  `useSyncExternalStore` and `useInsertionEffect` "intended for libraries, not application code." If
  you're reaching for it in a component, you probably want `useState`/`useContext`. Legitimate
  app-level uses are genuinely-external browser APIs: `navigator.onLine`, `matchMedia`,
  `localStorage`, scroll position.
- **Version-safe libraries use the shim**, which prefers the built-in when present:
  `import { useSyncExternalStore } from 'use-sync-external-store/shim'`.
- **History:** this API was `useMutableSource` first; the old contract proved unimplementable for
  library authors under the concurrent model and was redesigned and renamed to reflect that store
  updates are now *synchronous*. If a blog post says `useMutableSource`, the post is stale.

---

### Concurrent features

#### `startTransition` / `useTransition`

Mental model: React 18 has two update lanes. **Urgent** (typing, clicking — must feel instant) and
**transition** (the expensive consequence — filtered results, route content). Transitions are
interruptible and abandonable.

```js
// BAD — one state, one lane. Every keystroke re-renders 10k rows synchronously.
// The input itself lags because rendering blocks the main thread.
function Search() {
  const [query, setQuery] = useState('');
  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <SlowResults query={query} />
    </>
  );
}
```

```js
// GOOD — two states, two lanes. Input is urgent; results are a transition.
import { useState, useTransition, memo } from 'react';

function Search() {
  const [query, setQuery] = useState('');            // urgent: drives the input
  const [searchQuery, setSearchQuery] = useState(''); // transition: drives results
  const [isPending, startTransition] = useTransition();

  function handleChange(e) {
    setQuery(e.target.value);                              // urgent — never inside the transition
    startTransition(() => setSearchQuery(e.target.value)); // interruptible
  }

  return (
    <>
      <input value={query} onChange={handleChange} />
      <div style={{ opacity: isPending ? 0.6 : 1 }}>
        <SlowResults query={searchQuery} />
      </div>
    </>
  );
}

const SlowResults = memo(function SlowResults({ query }) { /* ... */ });
```

> 🟡 **Optimization** — `useTransition` buys *input responsiveness*, not throughput, and only when a
> measured render is janking the main thread. **Pros:** urgent updates (the input) stay instant while
> the expensive tree renders at lower priority and is interruptible. **Cons:** total work is the same
> or greater — an interrupted transition is thrown away and restarted from scratch, so an
> un-`memo`ized `SlowResults` re-renders fully on every keystroke and you've added overhead, not
> removed it. **When NOT to use it:** if the consuming tree is cheap, or if you can't/​won't `memo` it,
> or if the real cost is network rather than rendering (debounce the request instead).

##### Caveats (all from react.dev's useTransition caveat list)

- **You cannot put a controlled text input's own state in a transition.** The #1 mistake.
  ```js
  // BAD — the input becomes laggy/unresponsive; React docs: "DOES NOT WORK"
  <input value={text} onChange={e => startTransition(() => setText(e.target.value))} />
  ```
  The input's value must be urgent, or the DOM input and React state desync. Fix: two state
  variables (above) or `useDeferredValue`.
- **The function passed to `startTransition` must be synchronous.** React marks updates as
  transitions only during the synchronous execution of that callback.
  ```js
  // BAD — setPage is NOT marked as a transition; the callback already returned.
  startTransition(() => {
    setTimeout(() => setPage('/about'), 1000);
  });
  ```
  Same trap with `await`. In React 19's async transitions/Actions, state updates *after* an `await`
  still need re-wrapping in an inner `startTransition` (a documented known limitation). In React 18,
  async callbacks to `startTransition` don't work at all for post-await updates.
- **`startTransition` only affects updates you can wrap.** For a value arriving as a prop or from a
  custom hook you don't control, use `useDeferredValue`.
- **It does nothing for external store updates** — store-triggered updates are forced synchronous
  regardless (see the tearing section).
- **Transitions batch together** and are interrupted/restarted by urgent updates. "Restarted" is the
  operative word — a transition rendering a heavy tree while the user types is *thrown away and
  redone* per keystroke. If the tree isn't `memo`ized, you've added overhead, not removed it.
- **`startTransition` has a stable identity** — safe to omit from effect deps.

#### `useDeferredValue`

```js
const deferredValue = useDeferredValue(value, initialValue?);
```

> `initialValue` is **React 19.0** (changelog: "useDeferredValue initial value argument"). It is
> **not** available in React 18 — flagged because it's exactly the kind of thing that gets copied
> from current docs into React 18 code and fails.

Use it when you don't own the setter (props, custom hooks). It's `useTransition`'s counterpart, not
a competitor.

> 🟡 **Optimization** — reach for `useDeferredValue` only when a real, measured render is lagging and
> you *can't* wrap the setter in a transition (the value arrives as a prop or from a hook you don't
> control). **Pros:** no extra state, adapts to device speed rather than a guessed delay. **Cons:** it
> only pays off with a `memo`ized consumer (above), and it renders the tree *twice* per change (once
> stale, once fresh), so on a cheap tree it's pure overhead. **When NOT to use it:** to throttle
> network calls — that's debounce's job (see below), and swapping one for the other DDoSes your own API.

```js
// GOOD — canonical shape. memo is REQUIRED for any benefit.
const SlowList = memo(function SlowList({ text }) { /* expensive */ });

function App() {
  const [text, setText] = useState('');
  const deferredText = useDeferredValue(text);
  return (
    <>
      <input value={text} onChange={e => setText(e.target.value)} />
      <SlowList text={deferredText} />
    </>
  );
}
```

##### Gotchas

- **Without `memo`/`useMemo` on the consumer, `useDeferredValue` does nothing.** The parent
  re-renders on every keystroke; the child re-renders with it regardless of whether its prop is
  deferred. This is the most common "useDeferredValue didn't help" report, and it's not a React bug.
  `memo` is what lets the child *bail out* of a parent render when its props are unchanged — in a
  small reproduction, a child under 10 parent updates rendered **11 times** plain vs **1 time** wrapped
  in `memo` (measured on React 19 / jsdom; production will differ). Deferring a value only helps if the
  child can skip the renders where the value hasn't caught up yet, and `memo` is the skip mechanism.
- **Pass primitives or objects created outside render.** `useDeferredValue({ query })` creates a new
  object every render → an unnecessary background re-render every time → strictly worse than not
  using it.
- **It is not a debounce.** No fixed delay; React starts the background render immediately and lets
  it be interrupted, adapting to device speed rather than to a number you guessed. But **it does not
  reduce network requests.** Teams swap `useDebounce` → `useDeferredValue` in a search box and DDoS
  their own API. Debounce is still correct for *non-rendering* work; `useDeferredValue` is for
  *rendering* work. Frequently they belong together.
- **Inside a Transition, `useDeferredValue` returns the new value immediately** and doesn't spawn a
  deferred render — stacking both on one path is a no-op, not double protection.
- Background renders that suspend show the old value rather than a fallback; their effects don't fire
  until commit.

---

### `useId`

Purpose: stable IDs that match across server render and client hydration, primarily for a11y
attribute wiring (`aria-describedby`, `htmlFor`).

**Why counters break:** a module-scoped `let id = 0; const next = () => ++id` produces IDs dependent
on *render order*. Server order and client hydration order differ (streaming, selective hydration,
Suspense boundaries resolving out of order). IDs mismatch → hydration error. `useId` derives from the
component's position in the tree, so it's order-independent.

```js
// BAD — hydration mismatch under SSR; also collides across two React roots on one page.
let nextId = 0;
function Field({ label }) {
  const id = `field-${nextId++}`;
  return <><label htmlFor={id}>{label}</label><input id={id} /></>;
}
```

```js
// GOOD
import { useId } from 'react';

function Field({ label, hint }) {
  const id = useId();
  const hintId = `${id}-hint`;   // derive siblings from one useId, don't call it per element
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-describedby={hintId} />
      <p id={hintId}>{hint}</p>
    </>
  );
}
```

> 🟢 **Best practice** — use `useId` for any SSR-rendered `id` that wires up accessibility
> (`htmlFor`, `aria-describedby`). It's a correctness rule: a render-order counter produces different
> IDs on server vs client (streaming and Suspense resolve out of order), which is a hydration mismatch,
> not a style preference. `useId` derives from tree position, so both passes agree.

#### The gotcha that bites in production: the ID is not a valid CSS selector in React 18

React 18's `useId` returns IDs containing **colons** (`:r0:`) — deliberately, so they'd never collide
with hand-written IDs. Colons are meaningful in CSS selector syntax, so:

```js
// BAD — throws SyntaxError in React 18. ':' is a pseudo-class in selector syntax.
const id = useId();
document.querySelector(`#${id}`);       // SyntaxError: not a valid selector
element.closest(`#${id}`);              // same
// also breaks: view-transition-name, XML names, any DSL that parses ':'
```

```js
// GOOD — escape it, or don't use selectors at all.
document.querySelector(`#${CSS.escape(id)}`);
// Better: use a ref. You're in React; you don't need a selector.
```

The format changed across three React versions — a genuine cross-version landmine, and each change
silently broke someone's `querySelector`/snapshot tests:

| React | `useId` format | Source |
|---|---|---|
| 18.x – 19.0 | `:r0:` | original design |
| 19.1 | `«r0»` | changelog: "Updated `useId` to use valid CSS selectors, changing format from `:r123:` to `«r123»`" |
| **19.2+** | `_r_0_` | react.dev 19.2 blog: updating the default `useId` prefix from `:r:` / `«r»` to `_r_` |

> The exact 19.2 rendered shape is **medium confidence.** The 19.2 blog states the *prefix* changes
> to `_r_`; research did not verify the complete trailing string (`_r_0_` vs `_r_1_`, etc.). The
> prefix claim is high confidence; the full literal is not. 19.2's stated reason: `«»` are valid CSS
> selectors but **not** valid for `view-transition-name` or XML 1.0 names. Real-world casualties of
> the 19.1 `«»` format included happy-dom breaking on the unicode IDs and Next.js server/client
> `useId` mismatches.

**Never treat `useId` output as parseable or stable across versions.** Snapshot tests that inline
these IDs break on every React upgrade — an argument for `identifierPrefix`, or for not snapshotting
IDs at all.

Other caveats:

- **Never use `useId` for list keys** — react.dev is explicit: "Keys should be generated from your
  data." A `useId` key is positional, so it defeats reconciliation on reorder.
- **Multiple roots on one page collide.** Use `identifierPrefix` on `createRoot`/`hydrateRoot` *and*
  the matching server renderer — both sides must agree, or you get hydration mismatches.
- Don't call `useId` once per element in a group — call once, derive suffixes.

---

### Suspense in React 18: the expectation gap

#### Rule: React 18 shipped Suspense for SSR streaming. It did **not** ship Suspense for ad-hoc data fetching.

This is the largest single misconception of the React 18 era. `<Suspense>` only activates for
**Suspense-enabled data sources**. react.dev is blunt:

> Suspense does not detect when data is fetched inside an Effect or event handler.

```js
// BAD — the fallback NEVER shows. The list just renders empty, then fills in.
// <Suspense> around this component is decoration.
function Albums({ artistId }) {
  const [albums, setAlbums] = useState([]);
  useEffect(() => {
    fetchData(`/${artistId}/albums`).then(setAlbums);
  }, [artistId]);
  return <ul>{albums.map(a => <li key={a.id}>{a.title}</li>)}</ul>;
}
```

What actually activates a boundary:

- **React 18:** `lazy()` code splitting, and Suspense-enabled frameworks (Relay, Next.js, Remix)
  that maintain a promise cache internally. That's essentially it for app authors.
- **React 19:** adds `use()` — the first *general-purpose*, non-framework way to suspend on a promise
  in app code. Also stylesheets with `precedence`, and fonts/images during `<ViewTransition>`.

```js
// GOOD (React 19 only — `use` does not exist in React 18)
import { use, Suspense } from 'react';

function Albums({ albumsPromise }) {
  const albums = use(albumsPromise);   // suspends the nearest boundary
  return <ul>{albums.map(a => <li key={a.id}>{a.title}</li>)}</ul>;
}

<Suspense fallback={<Spinner />}>
  <Albums albumsPromise={fetchAlbums(artistId)} />
</Suspense>
```

> 🔴 **Advanced / gotcha** — do not hand-roll a throw-a-promise cache to "use Suspense for data" on
> React 18. `<Suspense>` only activates for Suspense-enabled sources; wrapping an effect-fetching
> component in it renders decoration, and homegrown caches hit the "state destroyed if it suspends
> before first mount" trap (next section) in ways that are miserable to debug. **When NOT to reach for
> Suspense at all on 18:** ordinary in-app data fetching — use TanStack Query / SWR, which own the
> promise cache correctly. `use()` (React 19) is the first supported general-purpose way to suspend on
> a promise in app code, and it does not exist in 18.

**So: on React 18 without a framework, use TanStack Query / SWR / RSC-less loaders.** The 2022–2024
pattern of hand-rolling a promise-throwing cache to "use Suspense for data" was always explicitly
unsupported — the release notes recommend Suspense "works best when deeply integrated" with
opinionated frameworks "rather than ad hoc data fetching." Homegrown throw-a-promise caches break in
specific, hard-to-debug ways (next section).

#### Suspense gotchas that bite in production

- **State is destroyed if a component suspends before its first mount.** react.dev: "React does not
  preserve any state for renders that got suspended before they were able to mount for the first
  time." The retry renders the tree *from scratch* — any state initialized during that first attempt
  is gone. Homegrown suspense caches that suspend on every render until resolved hit this and produce
  infinite loops or silently reset state.
- **React 18 changed Suspense semantics for incomplete trees.** Incomplete trees are not committed,
  **effects don't fire** for a suspended subtree, and React retries from scratch. React 17's "legacy
  Suspense" *did* commit the tree (hidden with `display:none`) and *did* fire effects. Code relying
  on a suspended component's effect running (analytics, subscriptions) silently stops working after
  upgrade — a genuinely nasty silent regression with no warning.
- **Layout effects are cleaned up and recreated** when content is shown after suspending.
- **`renderToString` / `renderToStaticMarkup` do not support streaming Suspense** — they emit the
  *fallback* HTML for any `<Suspense>` boundary and defer to a client retry. If you kept
  `renderToString` in React 18 and added Suspense boundaries, you shipped spinners to Googlebot and
  lost the SSR content for those subtrees. Streaming requires `renderToPipeableStream` (Node) or
  `renderToReadableStream` (edge/Deno/Workers). `renderToStaticNodeStream` survives (emails).
- **Transitions suppress fallbacks.** If already-visible content re-suspends, React shows the
  fallback *unless* the update came from `startTransition`/`useDeferredValue`, in which case it keeps
  the stale content. This is the intended way to avoid navigation flashes — and the reason "my
  spinner stopped appearing after I added startTransition" is correct behavior, not a bug.
- **React 19 commits fallbacks faster:** on suspend, the fallback commits immediately without waiting
  for sibling rendering, and siblings are then pre-warmed. Suspense timing observed on 18 does not
  transfer to 19.

---

### "Cannot update a component while rendering a different component"

Not new in 18 — introduced in **React 16.13.0** (the exact minor is medium confidence, from
secondary sources; directionally certain it predates 18) — but React 18 made it far more visible,
because StrictMode double-rendering and concurrent rendering both amplify render-phase side effects.

**Rule: rendering must be pure. Calling another component's `setState` during your render is a bug.**

React is in the middle of computing a tree. Scheduling an update to a *different*, already-rendered
component means React must either discard work or commit an inconsistent tree. Under concurrency,
where renders are interruptible and restartable, a render-phase `setState` against another component
may run an unpredictable number of times.

```js
// BAD — setState on the parent during the child's render.
function Child({ onReady }) {
  onReady(true);                      // ← parent setState during child render
  return <div>...</div>;
}

function Parent() {
  const [ready, setReady] = useState(false);
  return <Child onReady={setReady} />;
}
```

```js
// GOOD (a) — move the update into an effect.
function Child({ onReady }) {
  useEffect(() => { onReady(true); }, [onReady]);
  return <div>...</div>;
}
```

```js
// GOOD (b) — better: don't sync state at all. Lift/derive it.
// If the parent can compute `ready` itself, the whole handshake disappears.
```

> 🟢 **Best practice** — never call another component's `setState` during your render; move it to an
> effect or, better, derive/lift the value so no cross-component handshake exists. This is the
> [purity](fundamentals#purity) rule again: under concurrency renders are interruptible and
> restartable, so a render-phase update against another component can run an unpredictable number of
> times or force React to commit an inconsistent tree.

Note the legal-looking exception: `setState` on **your own** component during render is a supported
pattern (the "adjust state when props change" derived-state escape hatch) — React re-runs your
component immediately without committing. The warning is specifically about updating *a different*
component.

**Where it actually comes from in real codebases** (all real, well-documented occurrences):
react-hook-form's DevTool, react-redux `useSelector` (older versions), react-navigation, Recoil,
Tamagui. In practice it's frequently a *library* bug or a version mismatch, not your code — which is
why "we're on React 18 and this warning is unfixable" is common. Check the library's React 18
compatibility before rewriting your own components.

---

### Migration pain: third-party libraries and tooling

- **The library ecosystem, not your app, is the long pole.** React 18's rendering changes only
  activate in parts of the app using new features — but a library that subscribes to an external
  store, mutates during render, or assumes single-mount effects is a hazard the moment you flip
  `createRoot`.
- **Ask "does it use `useSyncExternalStore` (or the shim)?"** react-redux v8+, SWR, Zustand, Jotai
  migrated. A store library still hand-rolling `useState` + `useEffect` subscriptions is Level 1
  ("make it work" / may tear) at best.
- **`@types/react` is a separate migration.** React 18's types removed the implicit `children` from
  `React.FC`. Every component that relied on it breaks *at the type level*, often in the hundreds.
  `types-react-codemod` (eps1lon) is the sanctioned automated fix. Current `@types/react` is
  **19.2.17** — installing `@types/react@latest` alongside `react@18` is a subtle, real mismatch that
  produces confusing errors (types for hooks that don't exist in your runtime). Note that a *narrow*
  duplicate gap (root 19.x + a nested 18.3.x) can compile clean — their `ReactNode` is structurally
  compatible; only a wide gap (19 vs 17) errors, and it surfaces as **TS2322**, not the famous
  "two different types with this name exist" string.
- **Test setup changed.** `globalThis.IS_REACT_ACT_ENVIRONMENT = true` in unit test setup; `false`
  (or unset) for e2e. React 18 made `act` warnings opt-in via this flag. Skipping it means either
  spurious act warnings or, worse, silently missing them.
- **React 18 dropped IE11 support** (requires `Promise`, `Symbol`, `Object.assign`). React 17 is the
  end of the line for IE.
- **Components may return `undefined` without warning** in React 18. This removed a guardrail; a
  function component with a missing `return` now renders nothing silently instead of erroring.
- **The "setState on unmounted component" warning was removed** in React 18 — it was famously a
  false-positive generator. The `isMounted` refs everyone added to silence it are now pure cargo
  cult; delete them.

---

### What people got wrong about concurrent rendering

The highest-signal part of the topic.

1. **"Concurrent mode" isn't a mode.** React 18 shipped **concurrent features**, opt-in per update.
   The React 18 blog calls Concurrent React "a behind-the-scenes mechanism" and "an implementation
   detail" — explicitly *not* a feature. There is no flag that turns it on. The old experimental
   "Concurrent Mode" (all-or-nothing) was abandoned before 18 shipped; blog posts about
   `ReactDOM.createRoot(...).render()` "enabling concurrent mode" describe an API that never shipped
   that way.
2. **Upgrading to 18 does not make your app concurrent.** The blog:
   > When you first upgrade to React 18, before adding any concurrent features, updates are rendered
   > the same as in previous versions of React — in a single, uninterrupted, synchronous transaction.

   And: "The new rendering behavior in React 18 is **only enabled in the parts of your app that use
   new features.**" Corollary: **React 18 is not a performance upgrade.** Teams that upgraded
   expecting free speed got nothing (correctly) and concluded React 18 was overhyped. The speed is
   opt-in and requires you to identify which updates are non-urgent — a design decision, not a config.
3. **`startTransition` doesn't make anything faster.** It makes work *interruptible and lower
   priority*. Total work is the same or greater (interrupted renders get restarted from scratch). You
   trade throughput for input responsiveness. Sprinkling it on a slow component that isn't `memo`ized
   makes things measurably worse.
4. **StrictMode double-effects are not a React bug to work around.** They're a conformance test for
   the remount-safety React needs for `<Activity>`/`<Offscreen>`. Now that `<Activity>` is real
   (19.2), the codebases that suppressed the warnings with `didInit` refs are exactly the ones that
   can't adopt it.
5. **Tearing is armed by you, not by the upgrade.** Existing stores behave as in 17 until a store
   update is wrapped in `startTransition`. "We upgraded and nothing broke" is compatible with "we
   have latent tearing bugs the day someone adds a transition."
6. **`useSyncExternalStore` is a correctness de-opt, not a perf win.** It forces synchronous updates.
   Level 2 of 3, by React's own framing.

---

### Sources

Primary — react.dev / React blog:

- https://react.dev/blog/2022/03/08/react-18-upgrade-guide
- https://react.dev/blog/2022/03/29/react-v18
- https://react.dev/blog/2024/04/25/react-19-upgrade-guide
- https://react.dev/blog/2025/10/01/react-19-2
- https://react.dev/reference/react/StrictMode
- https://react.dev/reference/react/useSyncExternalStore
- https://react.dev/reference/react/useTransition
- https://react.dev/reference/react/useDeferredValue
- https://react.dev/reference/react/useId
- https://react.dev/reference/react/Suspense
- https://react.dev/learn/synchronizing-with-effects

Primary — RFCs / working group / changelog:

- https://github.com/reactjs/rfcs/blob/main/text/0214-use-sync-external-store.md
- https://github.com/reactwg/react-18/discussions/69 ("What is tearing?")
- https://github.com/reactwg/react-18/discussions/70 ("Concurrent React for Library Maintainers")
- https://github.com/reactwg/react-18/discussions/86 (useMutableSource → useSyncExternalStore)
- https://github.com/reactwg/react-18/discussions/21 (Automatic batching)
- https://github.com/facebook/react/blob/main/CHANGELOG.md
- https://github.com/facebook/react/releases/tag/v18.0.0
- https://github.com/facebook/react/pull/32001 (valid CSS selectors in useId format)

Supporting — issue threads for real-world impact color, not version facts:

- https://github.com/facebook/react/issues/25486 (useId invalid as selector in `closest()`)
- https://github.com/facebook/react/issues/26839 (useId special chars conflict with CSS)
- https://github.com/capricorn86/happy-dom/issues/1785 (19.1 `«»` broke selectors)
- https://github.com/vercel/next.js/issues/78691 (useId server/client format mismatch, 19.1)
- https://github.com/reduxjs/react-redux/issues/1640 ("Cannot update a component" via useSelector)
- https://github.com/eps1lon/types-react-codemod (TS children codemod)

---

## React 17 — the stepping stone

React 17 is a historical artifact. It has been frozen at **17.0.2 since March 2021**, and `react@latest` is **19.2.7** (npm, 2026-07). Nobody starts a project on 17. These notes exist for one audience: people maintaining or escaping a legacy React tree, and people planning a 16→18/19 upgrade who need to understand what 17 actually changed — because **17's breaking changes bite you whether or not you ever install 17.**

> The React blog posts that originally documented 17 (`react.dev/blog/2020/...`) now 404. The canonical URLs survive only on `legacy.reactjs.org`, and the authoritative record of what shipped is `facebook/react`'s `CHANGELOG.md`. This page cites the CHANGELOG by PR number so the claims stay traceable even as blog URLs rot. These notes were **not** re-verified first-hand against the (now-dead) blog posts; treat version facts as inherited from the CHANGELOG, and hedges as deliberate.

**Timeline (npm registry `time` field):**

| Version | Date | What it is |
|---|---|---|
| 17.0.0-rc.0 | 2020-08-10 | Release candidate |
| 16.14.0 | 2020-10-14 | Backport of the new JSX transform to 16 |
| 17.0.0 | 2020-10-20 | GA |
| 17.0.1 | 2020-10-22 | Patch |
| 17.0.2 | 2021-03-22 | Final 17 release — frozen since |

---

### Do you even need this hop? (No.)

The folklore says "React 17 is the mandatory hop for 16→18." **That premise is false**, and repeating it will get the page disproven in thirty seconds by anyone who runs an npm install.

- The React 18 upgrade guide specifies **no minimum version** and never instructs you to pass through 17. Its install step is literally `npm install react react-dom`.
- `npm install react@18 react-dom@18` from a React 16 app works. No version gate, no runtime check, no codemod requires 17 as an intermediate.
- Positive evidence, not just absence: **React 18 deliberately emulates React 17.** Its own console warning says *"your app will behave as if it's running React 17."* You cannot need to stop at a version your target emulates.
- The only version-steering advice in the guide points the *other* way: *"If you need to support Internet Explorer we recommend you stay with React 17."* That's a reason to **stop at** 17, not to **pass through** it.

So why does the folklore persist? Because it's **wrong about the mechanism but right about the danger**:

> Skipping the 17 *install* does not skip 17's *breaking changes.* Event delegation moving to the root container, the new JSX transform, and the removal of event pooling all land in your app the moment you go past 16 — and the React 18 upgrade guide never documents them. Going 16→18 in one jump means debugging the root-container event change **and** automatic batching **and** `createRoot` **and** StrictMode double-mount in a single PR.

**Correct framing: React 17 is an optional de-risking checkpoint, not a required hop.** Splitting 16→17→18 is a *project-management* decision that isolates the event-delegation breakage into its own PR, shrinking each blast radius. React still recommends upgrading the whole app at once when you can — "For most apps, upgrading all at once is still the best solution." The staged path is for large apps where you want each class of breakage bisectable, not for a technical requirement that does not exist.

> 🟡 **Optimization (process, not code)** — staging as 16→17→18 buys a smaller blast radius per PR at the cost of doing the migration twice.
>
> **Pros:** each class of breakage (event delegation, then automatic batching / `createRoot` / StrictMode double-mount) is bisectable in isolation; a regression points at one PR, not five.
> **Cons:** more total churn, a longer migration calendar, and time spent parked on 17 — a version with no future.
> **When NOT to use it:** small-to-medium apps, or any app with disciplined event handling and no third-party widget zoo — jump straight to 18/19 and skip the detour, exactly as React's own "upgrade all at once" advice suggests.

Everything below is the set of breaking changes you must handle when crossing the 16→17 line — whether you land on 17 or blow past it to 18/19.

---

### Rule 1: React 17 shipped infrastructure, not features

**The rule:** Treat React 17 as a *release-engineering* release. It has, in React's own words, "no developer-facing features." Everything in it exists to make future upgrades survivable.

**Why:** Before 17, React upgrades were all-or-nothing. A 100k-component monolith with one unmaintained corner could not move, so the whole app stayed pinned. React 17 changes the calculus by making it safe to embed a tree managed by one React version inside a tree managed by another — the "gradual upgrade" story.

**The failure it prevents:** an app permanently stranded on an old React because one legacy subtree can't be migrated and there's no way to move the other 95% independently.

**The honest caveat — the gradual-upgrade escape hatch is genuinely nasty, and React says so.** From `reactjs/react-gradual-upgrade-demo`:

- *"This approach is inherently more complex, and should be used as a last resort when you can't upgrade."*
- *"Loading two Reacts on the same page is bad for the user experience"* — the demo lazy-loads the legacy bundle behind `<Suspense>` so it never enters the initial payload.
- **Context does not cross the boundary.** Inner trees can't read outer-tree context; you hand-bridge every provider through props. Theming, routing, i18n, react-query clients — all of it. This is usually what kills the idea in practice.
- Two Reacts means **two copies of every context-based library**: your design system, your router, your store — duplicated, each with its own independent internal state.

Rank of options for a real team: (1) upgrade the whole app; (2) upgrade the whole app but stage it 16→17→18; (3) two Reacts on one page. Option 3 is for when a business unit refuses to fund migrating a subtree — not for when it's merely tedious.

> 🔴 **Advanced / last resort** — running two React versions on one page is a genuinely nasty escape hatch, and React frames it that way: *"a last resort when you can't upgrade."*
>
> **Pros:** unblocks an app that literally cannot move a legacy subtree; the other 95% ships on a current React.
> **Cons:** two copies of every context-based library (router, design system, store), each with independent state; **context does not cross the boundary**, so you hand-bridge every provider through props; a heavier payload, mitigated only by lazy-loading the legacy bundle behind `<Suspense>`.
> **When NOT to use it:** when migrating the subtree is merely *tedious* rather than *funded-refused*. Tedious-but-possible always beats two Reacts.

---

### Rule 2: Event delegation moved from `document` to the root container — this is the whole release

**The rule:** In React 17, React attaches its delegated event listeners to the **root DOM container** you rendered into, not to `document`.

```js
const rootNode = document.getElementById('root');
ReactDOM.render(<App />, rootNode);
// React 16: document.addEventListener(...)
// React 17: rootNode.addEventListener(...)
```

**Why:** with `document`-level delegation, two React trees on one page fight over the same delegation point and there's no coherent way to order a React 16 handler against a React 17 handler. Moving delegation to the root container makes each tree's event system self-contained and nestable — which is what unlocks Rule 1. It also fixes a long tail of React ↔ non-React interop bugs (jQuery plugins, Stripe Elements, third-party widgets, anything listening on `document`).

**The failure it prevents:** nested React trees with unpredictable event ordering, and non-React code that can't reliably observe or intercept React events.

#### The bad pattern

```js
// BAD — silently stops working when you cross the 16→17 line
document.addEventListener('click', function () {
  // React 16: fires for every click, INCLUDING ones where a React
  //   component called e.stopPropagation() (React was already at document).
  // React 17: never fires for those clicks — the native event now stops
  //   at the root container, which sits BELOW document.
  closeAllDropdowns();
});
```

Why it breaks: React 16 called `e.stopPropagation()` on a *synthetic* event, which never touched the native event's propagation up to `document`. In React 17, React's listener sits on `#root`, so stopping propagation inside the React tree genuinely stops the native event before it reaches `document`.

#### The good pattern

```js
// GOOD — capture phase runs top-down, so document sees the click
// BEFORE React's root-container listener can stop it.
document.addEventListener(
  'click',
  function () {
    closeAllDropdowns();
  },
  { capture: true }
);
```

This is the fix React itself recommends. Note the **semantic shift**: you now fire *before* React handles the event, not after. If your handler assumed React state had already updated, it hasn't. This is reordering, not just re-registering.

**Better still:** listen on the root container directly, or handle it inside React with an `onClickCapture` at the top of the tree. The `document` + `{ capture: true }` combo is the minimal-diff fix, not the clean one.

> 🔴 **Gotcha — `{ capture: true }` reorders; it does not just re-register.** Your handler now runs *before* React processes the event, so any code that read state or DOM expecting React to have already committed is now one interaction behind — a [stale-closure](fundamentals#closures)-adjacent trap. Prefer `onClickCapture` at the top of the React tree, or a listener on the root container itself; reach for the `document` + capture combo only when a minimal diff matters more than a clean one.

> 🟢 **Best practice — grep before you upgrade.** The click-outside dismissal bug is the canonical casualty. Every hand-rolled dropdown / modal / popover that does `document.addEventListener('click', closeIfOutside)` and coexists with a component calling `e.stopPropagation()` breaks *in one direction only*: the menu stops closing. It doesn't throw. It doesn't warn. It ships. `grep -rn "document.addEventListener" src/` before you upgrade — that grep is the single highest-value action in a 16→17 migration.

#### More production gotchas

- **Third-party libraries pinned to old versions are landmines.** Anything that reached into React's event system — the `stopPropagation`-based portal escape hatches in older component libraries — quietly no-ops on 17+. Blueprint's `Portal stopPropagationEvents` is a documented real-world instance (palantir/blueprint#6580). The library doesn't crash; the prop just does nothing.
- **`e.stopPropagation()` inside a portal now actually stops native propagation** at the portal container.
- **Rendering into a container that isn't a `document.body` descendant** (shadow DOM, iframes) changes meaningfully. React 17 shipped a fix for rendering into a shadow root (#15894) precisely because delegation moved.

#### Portals: listeners attach eagerly to portal containers

React 17's changelog entry *"Attach all known event listeners when the root mounts"* (#19659, "Attach Listeners Eagerly to Roots and Portal Containers") exists because root-container delegation broke portals: if a portal's subtree has no `onClick` but an ancestor in the **React tree** does, the native event never reaches a node React listens on, so the synthetic event never bubbles to that ancestor. The fix is to eagerly attach the full listener set to every portal container at mount.

Consequences:

- React 17 attaches its whole supported-event listener set to **every root and every portal container** at mount time, not lazily per-handler as React 16 did. Many portals = many listener sets. (There's a guard so multiple portals into the same node don't double-attach.)
- Portal event semantics still follow the **React tree, not the DOM tree** — always true, still true in React 19. Per current docs: *"Events from portals propagate according to the React tree rather than the DOM tree... if you click inside a portal, and the portal is wrapped in `<div onClick>`, that `onClick` handler will fire. If this causes issues, either stop the event propagation from inside the portal, or move the portal itself up in the React tree."*
- **Don't claim React 17 "fixed portal events."** It *changed* them and traded one class of bug for another. Follow-on issues were never fully closed in 17 — facebook/react#21989 ("createPortal anywhere in the tree makes native events be run too late") and #23074 (`document.addEventListener` + portal bubbling).

> **Confidence hedge:** the eager-listener *rationale* above (portal subtree lacking a listener its ancestor has) is reconstructed from the PR title, the `enableEagerRootListeners` flag, and the changelog line — not from reading the PR diff. The *mechanism* is medium-confidence; the *fact that listeners now attach eagerly per portal container* is confirmed in the changelog.

---

### Rule 3: The other event-system changes ride along with delegation

All from the 17.0.0 changelog. These are separate breakages people misattribute to the delegation change and then debug in the wrong place.

**`onScroll` no longer bubbles** (#19464). React 16 *emulated* bubbling for `onScroll`, which the DOM does not do. React 17 stops emulating.

```jsx
// BAD — worked in React 16 by accident, dead in 17+
<div onScroll={handleScroll}>
  <div className="overflow-auto">{items}</div>  {/* the actual scroller */}
</div>

// GOOD — put the handler on the element that actually scrolls
<div>
  <div className="overflow-auto" onScroll={handleScroll}>{items}</div>
</div>
```

Failure mode: infinite-scroll and scroll-spy silently stop firing. This is *correct* behavior now — native `scroll` doesn't bubble — but it looks like a regression.

> 🟢 **Best practice** — put `onScroll` on the element that actually scrolls, not on an ancestor. This was always the correct wiring; React 16 just papered over the mistake by emulating bubbling. Getting it right is free and portable across every React version.

**`onFocus`/`onBlur` now use native `focusin`/`focusout`** (#19186). These *do* bubble natively, which is why React can use them. Mostly transparent, but the underlying native `event.type` differs, so code inspecting `e.nativeEvent.type` breaks. Also fixed alongside: `relatedTarget` reported as `undefined` in Firefox (#19607).

**All `Capture` events use the real browser capture phase** (#19221). React 16 simulated capture ordering inside its own synthetic system; React 17 uses `addEventListener(..., true)`. Ordering between React capture handlers and *native* capture handlers changes.

**`onSubmit`/`onReset` are now delegated** (#19333) — they weren't before.

**`onTouchStart`, `onTouchMove`, `onWheel` are passive** (#19654).

```jsx
// BAD on React 17+ — preventDefault is ignored; browser logs an error
<div onTouchMove={(e) => e.preventDefault()}>…</div>

// GOOD — attach a non-passive native listener yourself
function NoScroll({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const onTouchMove = (e) => e.preventDefault();
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);
  return <div ref={ref}>{children}</div>;
}
```

> **Confidence hedge on the touch change:** the changelog wording is *"Keep* `onTouchStart`, `onTouchMove`, and `onWheel` passive" (#19654) — the word "Keep" suggests this may already have been true for some of these in React 16, i.e. possibly *not* a 17 change at all. The *DOM consequence* (`preventDefault` in a passive listener is ignored and warns) is unambiguous from the spec; whether it's a *17 migration item* is worth a direct test before you treat it as one. There is no React-level opt-out either way — you must attach a non-passive native listener yourself.

---

### Rule 4: Event pooling is gone — delete your `e.persist()` calls

**The rule:** React 17 removed the event-pooling optimization (#18969). Synthetic event objects are no longer recycled and nulled-out after the handler returns.

**Why:** pooling was a 2013-era optimization for browsers that no longer exist. It cost every React developer a confusing crash at least once.

**The failure it prevents:** the classic `Cannot read property 'value' of null` / *"This synthetic event is reused for performance reasons"* warning when you touch an event asynchronously.

```jsx
// BAD in React 16 — crashes, because `e` is recycled before the updater runs
function handleChange(e) {
  setData((data) => ({
    ...data,
    text: e.target.value, // e.target is null by the time this executes
  }));
}

// The React 16 workaround, now dead weight:
function handleChange(e) {
  e.persist();
  setData((data) => ({ ...data, text: e.target.value }));
}

// GOOD in React 17+ — just works, no persist needed
function handleChange(e) {
  setData((data) => ({ ...data, text: e.target.value }));
}
```

> 🔴 **Gotcha — `e.persist()` still exists on React 17+; it just does nothing.** So it's not a migration blocker and a codemod isn't urgent. But it's a **one-way door**: once you delete `persist()` calls or write new async-event code, you cannot roll back to React 16 without reintroducing the crash. If you're doing a staged rollout with a revert plan, leave the `persist()` calls in place until 17 is locked in. This is the sort of thing that makes a "safe" revert produce a broken app.

---

### Rule 5: `useEffect` cleanup timing changed — capture mutable values

Two distinct changes, both in the 17.0.0 changelog:

1. **`useEffect` cleanup functions run asynchronously** (#17925). Previously cleanup ran synchronously at unmount, like `componentWillUnmount`, blocking the screen update. Now, *"if the component is unmounting, the cleanup runs after the screen has been updated."*
2. **All effect cleanups (tree-wide) run before any new effects** (#17947). Previously ordering was only guaranteed within a single component; now it's guaranteed across the whole tree.

**Why:** synchronous cleanup on unmount put arbitrary user code on the critical path of a screen update — a jank source, and an obstacle to concurrent rendering. Tree-wide cleanup ordering removes a class of ordering bug where component A's new effect ran before component B's old cleanup.

**The failure it prevents:** dropped frames when unmounting large trees; effects observing a half-torn-down tree.

**The gotcha it introduces** — this is the one that actually bites:

```jsx
// BAD — someRef.current may already be null when cleanup runs, because
// cleanup is now deferred past the screen update (and React nulls refs
// during commit).
useEffect(() => {
  someRef.current.someSetupMethod();
  return () => {
    someRef.current.someCleanupMethod(); // 💥 TypeError: null
  };
});

// GOOD — capture the mutable value into the effect's closure
useEffect(() => {
  const instance = someRef.current;
  instance.someSetupMethod();
  return () => {
    instance.someCleanupMethod();
  };
});
```

The general rule: **anything mutable you read in setup, capture into a local before the cleanup closure.** This is a good habit independently of React 17 — React 18's StrictMode double-mount and concurrent features punish the same mistake harder.

> 🟢 **Best practice — capture mutable values into the effect closure.** React nulls refs during [commit](fundamentals#render-vs-commit), and 17's deferred cleanup runs *after* the screen update, so a `ref.current` read inside a cleanup can already be `null`. Reading it once into a local at setup time closes over the value you actually want — the same discipline that keeps you out of [stale-closure](fundamentals#closures) bugs. This is a correctness rule, not an optimization: it costs nothing and it is the right default on every React version.

**Nice surprise:** React 17 *specifically* suppresses the "Can't perform a React state update on an unmounted component" warning in the gap between unmount and deferred cleanup. Per the RC post, React *"does not fire setState warnings in the short gap between unmounting and the cleanup,"* so abort/`clearInterval` cleanups need no changes.

---

### Rule 6: The new JSX transform — adopt it, but know it's decoupled from React 17

**The rule:** Turn on the automatic JSX runtime. Stop writing `import React from 'react'` for JSX.

**Why:** the classic transform compiles JSX to `React.createElement()`, so `React` had to be in lexical scope in every JSX file — pure boilerplate, and a footgun (a bundler that tree-shakes an "unused" React import breaks the file). The new transform imports `react/jsx-runtime` automatically, produces slightly better output, and lets non-React libraries own JSX via `jsxImportSource`. (What `createElement` and `_jsx` return — the element description React later reconciles and commits — is [render vs commit](fundamentals#render-vs-commit) territory; the transform only changes *who writes the call*, not what it produces.)

> 🟢 **Best practice — adopt the automatic JSX runtime.** It removes per-file boilerplate and a real footgun, and it's decoupled from React 17 so you can adopt it on 16.14 without upgrading the runtime.
>
> **Pros:** no `import React` for JSX; slightly smaller/faster output; non-React libraries can own JSX via `jsxImportSource`.
> **Cons:** you must ship `react-jsx` (not `react-jsxdev`) to production or you leak `__source`/`__self` file-line-column data into the bundle and pay a runtime cost; adoption is a whole-codebase diff.
> **When NOT to fold it in:** never bundle it into the event-system migration — do it as its own PR, or the upgrade becomes unbisectable (see the checklist).

**Compilation, exactly:**

```js
// OLD (classic) — you must import React yourself
import React from 'react';
function App() {
  return React.createElement('h1', null, 'Hello world');
}

// NEW (automatic) — compiler inserts the import
import { jsx as _jsx } from 'react/jsx-runtime'; // inserted by the compiler; don't import it yourself
function App() {
  return _jsx('h1', { children: 'Hello world' });
}
```

> **Critical decoupling most write-ups get wrong:** the new JSX transform is **not a React 17 feature.** React added the `react/jsx-runtime` and `react/jsx-dev-runtime` entry points in 17.0.0, but **backported them to 16.14.0, 15.7.0, and 0.14.10.** You can adopt the new transform on React 16.14 and never touch 17; you can run React 17 with the classic transform forever. "Upgrade to 17 to drop your React imports" is a factual error.

**Adoption matrix** (from the primary announcement + TS release notes):

| Tool | Minimum version | Config |
|---|---|---|
| React runtime | 17.0.0, or backports 16.14.0 / 15.7.0 / 0.14.10 | — |
| Babel | v7.9.0+ | `["@babel/preset-react", { "runtime": "automatic" }]` |
| TypeScript | **4.1+** | `"jsx": "react-jsx"` (prod) / `"react-jsxdev"` (dev) |
| Flow | v0.126.0+ | `react.runtime=automatic` |
| Create React App | 4.0.0+ | automatic |
| Next.js | v9.5.3+ | automatic |
| Gatsby | v2.24.5+ | automatic |

```json
// babel.config.json
{ "presets": [["@babel/preset-react", { "runtime": "automatic" }]] }
```

```jsonc
// tsconfig.json — production
{
  "compilerOptions": {
    "module": "esnext",
    "target": "es2015",
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["./**/*"]
}
```

```jsonc
// tsconfig.dev.json — dev build, adds source location to elements
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "jsx": "react-jsxdev" }
}
```

`jsxImportSource` (TS 4.1, and Babel) defaults to `"react"` and redirects the auto-import — this is how Preact (`"jsxImportSource": "preact"`) and Emotion (`"@emotion/react"`) hook in.

**Codemod:** `npx react-codemod update-react-imports` — removes unused React imports and rewrites default imports to named imports.

**ESLint:** turn off the now-wrong rules, or you'll be told to add back the import you just removed:

```json
{ "rules": { "react/jsx-uses-react": "off", "react/react-in-jsx-scope": "off" } }
```

#### Gotchas that bite in production

- **`import React from 'react'` is still required for everything that isn't JSX.** `useState`, `useEffect`, `createContext`, `memo`, `forwardRef` all still need a real import. The transform only removes the *implicit JSX* dependency. Prefer named imports: `import { useState } from 'react'`.
- **`react-jsxdev` vs `react-jsx` is not cosmetic.** `jsxDEV` carries `__source`/`__self` (file, line, column) into every element. Ship `react-jsxdev` to production and you leak source paths into your bundle and pay the runtime cost. Use two tsconfigs, or drive it from an env var. Easy to get wrong when one `tsconfig.json` serves both builds.
- **Mixed transforms across a monorepo interoperate fine** — a classic-built package and an automatic-built one produce identical elements. Debugging is where it hurts: half your stack shows `React.createElement`, half shows `_jsx`.
- **The classic transform is not deprecated.** React said it "will keep working" with no removal timeline. It still works in React 19. Don't tell readers it's going away.

---

### Rule 7: Two smaller 17 breakages that produce confusing failures

**`forwardRef`/`memo` returning `undefined` now throws** (#19550). Previously only class and function components were checked. Return `null` for "render nothing."

```jsx
// BAD — throws in React 17+; silently rendered nothing in 16
const Thing = memo(function Thing({ show }) {
  if (!show) return;          // implicit undefined
  return <div>hi</div>;
});

// GOOD
const Thing = memo(function Thing({ show }) {
  if (!show) return null;
  return <div>hi</div>;
});
```

This is a *good* change that turns a silent bug into a loud one — but it surfaces on upgrade day as "React 17 broke my app." It didn't; it found the bug.

**Component stacks are built from native error frames** (#18561). Stacks become clickable in the console and symbolicate correctly in production via sourcemaps. Mechanism: React throws and catches a temporary error inside each component above the failure to reconstruct the frame — a small perf penalty *on crashes only*, once per component type. Side effect: **error-reporting middleware that parses React's old synthetic stack format won't recognize the new one** — check your Sentry/Bugsnag grouping after upgrade.

**Private exports removed** (#18483) — internals that React Native Web reached into. `ReactTestUtils.SimulateNative` deprecated (#13407); React points you at React Testing Library.

---

### Migration checklist (16 → 17)

Ordered by expected yield:

1. `grep -rn "document.addEventListener" src/` — every hit is a delegation-change candidate. Fix with `{ capture: true }` or move the listener to the root container.
2. `grep -rn "stopPropagation" src/` — cross-reference with #1. The intersection is where the click-outside bugs live.
3. `grep -rn "onScroll" src/` — is the handler on the element that actually scrolls?
4. `grep -rn "onTouchMove\|onTouchStart\|onWheel" src/` — any `preventDefault()` inside may now be a no-op (verify per Rule 3's hedge).
5. Audit portal-heavy components and any third-party library with portal `stopPropagation` escape hatches.
6. Effect cleanups reading `ref.current` — capture into a local.
7. `react` and `react-dom` **must be the same version.** `react@17` + `react-dom@16` is not a supported configuration.
8. Leave `e.persist()` calls in place until you're sure you won't revert.
9. Adopt the new JSX transform as a **separate PR** — it's a whole-codebase diff, and mixing it with the event changes makes the upgrade unbisectable.

> **Facebook's own data point:** fewer than 20 components needed changes out of 100,000+. Useful for calming stakeholders — but note the selection bias: that's a codebase with unusually disciplined event handling and no third-party widget zoo. Your click-outside handlers and your pinned component libraries are where your number will come from, not React's.

---

### Sources

Primary. Note that the React 17 blog posts have been removed from `react.dev` (they 404) and survive only on `legacy.reactjs.org`; the authoritative, still-maintained record is the CHANGELOG.

- facebook/react `CHANGELOG.md`, 17.0.0 / 17.0.1 / 17.0.2 sections — https://github.com/facebook/react/blob/main/CHANGELOG.md (raw: https://raw.githubusercontent.com/facebook/react/main/CHANGELOG.md) — every PR number cited above
- React 17 RC announcement (delegation rationale, `capture: true` fix, event pooling, effect-cleanup gotcha, setState-warning suppression, native stacks) — https://legacy.reactjs.org/blog/2020/08/10/react-v17-rc.html
- React v17.0 release — https://legacy.reactjs.org/blog/2020/10/20/react-v17.html
- Introducing the New JSX Transform (backport versions, Babel/TS/Flow/CRA/Next/Gatsby minimums, codemod, eslint rules) — https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html
- React 18 upgrade guide (used to disprove the "mandatory hop" premise; IE11 quote; "behave as if it's running React 17") — https://react.dev/blog/2022/03/08/react-18-upgrade-guide
- Announcing TypeScript 4.1 ("React 17 JSX Factories": `react-jsx`, `react-jsxdev`) — https://devblogs.microsoft.com/typescript/announcing-typescript-4-1/
- TSConfig `jsx` / `jsxImportSource` reference — https://www.typescriptlang.org/tsconfig/#jsx
- `createPortal` reference (React-tree propagation caveat) — https://react.dev/reference/react-dom/createPortal
- reactjs/react-gradual-upgrade-demo (lazy-loading legacy React, context-bridging caveat, "escape hatch, not the norm") — https://github.com/reactjs/react-gradual-upgrade-demo
- npm registry — https://registry.npmjs.org/react and https://registry.npmjs.org/-/package/react/dist-tags

Supporting (issue tracker — used only for "known rough edge", not version facts):

- facebook/react#19659 "Attach Listeners Eagerly to Roots and Portal Containers" — https://github.com/facebook/react/pull/19659
- facebook/react#21989 — https://github.com/facebook/react/issues/21989
- facebook/react#23074 — https://github.com/facebook/react/issues/23074
- palantir/blueprint#6580 "Portal `stopPropagationEvents` is a no-op on React 17+" — https://github.com/palantir/blueprint/issues/6580

---

## React 16 Era (16.0 – 16.14)

React 16 is not "old React." It is the era in which React acquired *every* mental model it still
uses today — Fiber scheduling, error boundaries, the modern context API, and hooks — and
simultaneously accumulated a set of patterns that are now actively harmful. A codebase stuck on 16
is rarely broken. It is *stuck*, and the cost is paid at upgrade time, not today. This page is about
recognizing the 16-era patterns that will bite you, and knowing which ones are fine to leave alone.

> This page carries the original author's inline confidence hedges deliberately. Where a claim is
> inferred rather than directly sourced, it says so. Do not read a hedge as an assertion.

### Timeline (all dates from primary sources)

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

### Fiber: what it bought, and what it cost

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

### Error boundaries: still the only mechanism, still misunderstood

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

### The legacy lifecycles, and why they became unsafe

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

#### The correction most references get wrong

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

### `getDerivedStateFromProps` — the 16.4 trap

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

### Context: three APIs, one of which is now deleted

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

### React 16.14 and the new JSX transform

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

### Hooks (16.8) — the inflection point

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

#### `eslint-plugin-react-hooks` is non-optional

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

#### The class→hooks mapping is not 1:1 (this is the real migration cost)

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

### `React.memo` / `lazy` / `Suspense` (16.6)

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

#### Suspense/lazy in the 16 era — the production gotchas

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

### What breaks moving off 16

#### 16 → 17 (the "no new features" release that still breaks things)

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

#### 17 → 18

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

#### 18 → 19

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

### Patterns from this era that are now actively harmful

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

### What a codebase stuck on 16 looks like

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

### Sources

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
