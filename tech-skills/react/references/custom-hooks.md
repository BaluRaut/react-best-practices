# Custom Hooks

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

## A custom hook is a function, not a component

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

## When to extract — and when not to

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

### When NOT to extract

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

## Return a stable shape: tuple vs object

The single most common design decision in a custom hook is what to return. Two shapes, two different
jobs.

### Tuple — for two values the caller renames

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

### Object — for three or more values, or optional consumption

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

### Type the tuple with `as const`

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

## Referential stability of the return value

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

### A hook over context re-renders on *any* context change

If your hook reads context (`const auth = useContext(AuthCtx)`), every consumer re-renders whenever
*any* field of that context value changes — not just the field it reads.

> 🔴 **Advanced / gotcha** — measured on a small reproduction: a context holding `{ a, b }` updated only
> in `a`, five times; a consumer reading **only `b`** still re-rendered on all 6 renders — every one
> wasted (React 19 + jsdom; production will differ). A convenient `useAuth()` hook hides this fan-out.
> If the context updates frequently, split it by update frequency or back the hook with a selector store
> (`useSyncExternalStore`, Zustand, Redux `useSelector`) so consumers subscribe to slices. See
> [state management](state-management).

---

## Compose small hooks

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

## Advanced: stale closures in effects and subscriptions

This is the class of problem the reviewer specifically flagged, and the reason the ref/`useEffectEvent`
patterns exist. Everything below is 🔴 — reach for it knowingly.

### The problem

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

### Fix 1 (preferred on React 19.2+): `useEffectEvent`

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

### Fix 2 (pre-19.2, or non-effect cases): the latest-ref / `useLatest` pattern

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

## Checklist

- Name hooks `use*`; only hooks call hooks. A hook that returns JSX should be a component.
- Extract to reuse logic or name a concept — not to shorten a component.
- Tuple return for two renamed values (`as const`); object return for three-plus named values.
- Stabilize returned callbacks/objects only when they feed an effect dep or a memo boundary.
- Effects inside hooks must clean up their subscriptions.
- For stale closures in long-lived effects: `useEffectEvent` (React 19.2+) first; latest-ref/`useLatest`
  as the version-agnostic fallback. Update the ref in an effect, not during render.
- Never use a ref or effect event to silence a dependency that genuinely should re-run the effect.

## Sources

- Reusing logic with custom Hooks — https://react.dev/learn/reusing-logic-with-custom-hooks
- Separating events from Effects (`useEffectEvent`) — https://react.dev/learn/separating-events-from-effects
- `useEffectEvent` reference — https://react.dev/reference/react/useEffectEvent
- React 19.2 release notes — https://react.dev/blog/2025/10/01/react-19-2
- Referencing values with refs — https://react.dev/learn/referencing-values-with-refs
- Empirical, run locally 2026-07-18: `React@19.2.7`, `eslint-plugin-react-hooks@7.1.1`; render-count and
  context-fan-out reproductions under `measure/`.
