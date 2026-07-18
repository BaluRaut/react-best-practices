# React Fundamentals

This is the primer every other page assumes. It is not a first React tutorial — it takes JSX,
props, `useState`, and `useEffect` as known — and instead explains the five internal ideas that make
the rest of the site's advice follow from *reasons* rather than recipes: how a render becomes a DOM
change, how React decides what to keep versus rebuild, why a function you wrote three renders ago is
still holding old data, what a dependency array is actually comparing, and why "render must be pure"
is now a performance feature and not just an ideal.

Verified against React 19.2.7. The mechanisms here are stable across React 17–19; where a version
matters, it is called out.

Every recommendation is tagged so you can tell a **rule** from an **optimization**:

> 🟢 **Best practice** — do this by default; it's a correctness/maintainability rule.

> 🟡 **Optimization** — apply only when a measured problem calls for it; it has a cost.

> 🔴 **Advanced / gotcha** — a sharp tool or a trap; reach for it knowingly.

Most of this page is 🟢, because fundamentals are rules, not options.

---

## Render vs commit

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

### Why it matters

The cost of a re-render is real even when the commit is empty: React still calls your function, runs
your `useMemo`/`useState` hooks, allocates a new element tree, and diffs it. On a cheap component
that's negligible; multiplied across a large subtree that re-renders on every keystroke, it's the
single most common cause of a janky React app. Performance work in React is overwhelmingly about
**cutting re-renders that produce no commit**, not about making the DOM faster.

### A concrete measurement

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

### The trap this explains: Context re-renders everyone

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

## Reconciliation

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

### Why it matters

The thing React preserves or destroys during reconciliation is not just the DOM node — it's
everything attached to that node's position in the tree: `useState` values inside the component,
uncontrolled input contents, focus, scroll position, a running CSS transition, a video's playback
time. Get identity wrong and React silently reuses the wrong instance, carrying that hidden state
onto the wrong data.

### A concrete bug: swapping types resets state

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

### A concrete bug: index-as-key

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

## Closures

Every render is a **snapshot**. When React calls your component, the props and state for that call are
fixed values, and every function you define during that call — event handlers, effect callbacks,
`setTimeout` bodies — closes over *those* values. It does not see a "current" value that updates
later; it sees the value from the render that created it. This is ordinary JavaScript closure
behavior, but React's re-render-on-every-update model makes it constant and surprising.

### Why it matters

A closure created in render 1 keeps render 1's state forever. If that closure outlives the render —
because you stored it in a ref, registered it with `setInterval`, or gave stale
[dependencies](fundamentals#dependency-arrays) to an effect — it will read and act on data that is now
several renders out of date. That's the **stale closure**.

### A concrete bug: the frozen interval

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

### Two correct fixes

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

## Dependency arrays

`useEffect`, `useMemo`, `useCallback`, and `useImperativeHandle` all take a dependency array. It
answers one question: **since the last render, did any input this code depends on change?** React
compares each entry to its previous value with `Object.is` (reference equality for objects and
functions, value equality for primitives). If every entry is unchanged, React skips the work — reuses
the memoized value, or does not re-run the effect. If any entry changed, it re-runs.

A dependency array is therefore the bridge between the two failure modes of the previous section:
**too few deps** freezes your closure (stale data — the interval bug); **unstable deps** re-runs the
work on every render (the effect that never stops firing).

### Why it matters — and why `Object.is` is the whole story

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

### The fix is usually to depend on primitives, not objects

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

## Purity

A React component's render must be **pure**: given the same props, state, and context, it returns the
same JSX and causes **no observable side effects** while doing so. No mutating props or existing
state, no writing to module-level variables, no network calls, no DOM writes, no reading/writing a
ref for logic. Side effects belong in event handlers (in response to a user action) or in effects (to
synchronize with an external system) — never in the render body.

### Why it matters — React *assumes* purity and acts on it

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

### A concrete bug: mutation during render

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

### The other common form: setState during render

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

## How the five fit together

These aren't five topics; they're one chain. **Purity** lets React re-run **render** freely and lets
**reconciliation** trust that same-input means same-output. Reconciliation's identity rules (**keys**)
decide what survives a render. Each render is a **closure** snapshot, and the **dependency array** is
how you tell React which snapshots are still valid. Get one wrong and the symptom usually shows up in
another: an unstable dependency (deps) re-runs an effect that reconnects a subscription (render vs
commit); a missing dependency (deps) freezes a callback on old state (closures); an index key
(reconciliation) carries old component state (purity of the tree) onto new data. When a later page
says "this is a correctness rule," this is the machinery it's protecting.

---

## Sources

- https://react.dev/learn/render-and-commit
- https://react.dev/learn/preserving-and-resetting-state
- https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key
- https://react.dev/learn/removing-effect-dependencies
- https://react.dev/reference/rules/components-and-hooks-must-be-pure
- https://react.dev/reference/react/useState#storing-information-from-previous-renders
- Empirical, run locally 2026-07-18: render-count and Context fan-out reproductions on
  React 19.2.7 + `@testing-library/react` 16.3.2 (jsdom).
