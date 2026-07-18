# React 18 — Concurrent Rendering and the Traps

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

## Version reality: what 18 deprecated, 19 deleted

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

## Roots: `createRoot` / `hydrateRoot`

### Rule: `createRoot` is the concurrency opt-in switch, not a cosmetic rename.

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

### Gotchas

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

### Hydration mismatches became errors

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

`createRoot`/`hydrateRoot` accept `onRecoverableError` — wire it to your error reporter, because
these errors are *recovered from* and therefore invisible unless you look for them.

---

## Automatic batching

### Rule: React 18 batches state updates from everywhere, not just React event handlers.

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

### Gotcha: the migration bug is code that *depended* on not batching

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

> `flushSync` is a **performance footgun, not a bug fix.** It de-opts that update out of batching and
> concurrency entirely and forces a synchronous re-render of the affected tree. Reaching for it to
> "make React 18 behave like 17" across a codebase is how teams end up with a *slower* app after
> upgrading. Use it only where you must read layout between two state changes — measuring, focus
> management, imperative scroll into a just-rendered node.

### `unstable_batchedUpdates`: not removed, just pointless

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

---

## StrictMode double-invoked effects — the real migration pain

### Rule: in dev, StrictMode runs `setup → cleanup → setup` for every effect on mount.

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

### The anti-pattern that ate 2022

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

### The taxonomy that actually resolves the migration (from react.dev)

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

### The data-fetching race — a prod bug StrictMode surfaces for free

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

### StrictMode also double-*renders* (a different thing, often conflated)

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

## Tearing and `useSyncExternalStore`

### The precise definition (reactwg/react-18 #69, "What is tearing?")

> a UI has shown multiple values for the same state

Why it couldn't happen before, in their words: React 17 rendering was a single synchronous
transaction — JS is single-threaded, so nothing could change mid-render. React 18:

> React can pause to let other work happen. Between these pauses, updates can sneak in that change
> the data being used to render.

And the framing that matters:

> this isn't specific to React, it's a necessary consequence of concurrency

### Why external stores specifically

React's own state is versioned: it can hold a "current" and a "work-in-progress" version
simultaneously. An external store has exactly one version — there is no `getBackgroundState()` to sit
alongside `getState()` (RFC 0214's phrasing). So if React yields mid-render and the store mutates,
components rendered *before* the yield hold the old value and components rendered *after* hold the
new one — both get committed. One UI, two prices for the same item.

**Concrete failure:** a dashboard where the header shows `$100` and the table below shows `$102`, in
the same committed frame, for the same product. Not a flicker — a committed, screenshot-able,
inconsistent DOM. It's insidious because it's rare, non-deterministic, load-dependent, and survives
a refresh maybe 1 time in 50. It reproduces on slow devices and under `startTransition`.

### The de-fusing detail almost everyone misses

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

### The API and its one lethal rule

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

For real selector support use `useSyncExternalStoreWithSelector` from
`use-sync-external-store/with-selector` (`use-sync-external-store@1.6.0` current), which takes an
`isEqual` argument. This is what react-redux and SWR migrated to.

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

### Gotchas

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

## Concurrent features

### `startTransition` / `useTransition`

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

#### Caveats (all from react.dev's useTransition caveat list)

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

### `useDeferredValue`

```js
const deferredValue = useDeferredValue(value, initialValue?);
```

> `initialValue` is **React 19.0** (changelog: "useDeferredValue initial value argument"). It is
> **not** available in React 18 — flagged because it's exactly the kind of thing that gets copied
> from current docs into React 18 code and fails.

Use it when you don't own the setter (props, custom hooks). It's `useTransition`'s counterpart, not
a competitor.

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

#### Gotchas

- **Without `memo`/`useMemo` on the consumer, `useDeferredValue` does nothing.** The parent
  re-renders on every keystroke; the child re-renders with it regardless of whether its prop is
  deferred. This is the most common "useDeferredValue didn't help" report, and it's not a React bug.
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

## `useId`

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

### The gotcha that bites in production: the ID is not a valid CSS selector in React 18

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

## Suspense in React 18: the expectation gap

### Rule: React 18 shipped Suspense for SSR streaming. It did **not** ship Suspense for ad-hoc data fetching.

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

**So: on React 18 without a framework, use TanStack Query / SWR / RSC-less loaders.** The 2022–2024
pattern of hand-rolling a promise-throwing cache to "use Suspense for data" was always explicitly
unsupported — the release notes recommend Suspense "works best when deeply integrated" with
opinionated frameworks "rather than ad hoc data fetching." Homegrown throw-a-promise caches break in
specific, hard-to-debug ways (next section).

### Suspense gotchas that bite in production

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

## "Cannot update a component while rendering a different component"

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

## Migration pain: third-party libraries and tooling

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

## What people got wrong about concurrent rendering

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

## Sources

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
