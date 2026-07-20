# React 19

React 19 is the current stable line (**19.2.7**, published 2026-06-01; 19.2.0 shipped 2025-10-01). This page covers the features you actually reach for — Actions, `use()`, `ref`-as-prop, document metadata — and the removals that turn an 18→19 bump into a migration. It is written against the React 19 docs; where a claim is weaker than a primary source, it is hedged in prose. Do not upgrade those hedges into flat assertions.

> **Read this first: there is a version floor.** React 19.0.0 through 19.2.3 shipped a **CVSS 10.0 pre-auth remote-code-execution** vulnerability in React Server Components (CVE-2025-55182), plus DoS and Server-Function source-code-exposure CVEs. The practical floor is **19.2.4+**; recommend **19.2.7**. See [Security floor](#security-floor-the-version-fact-that-matters) below before pinning any React 19 version.

---

## Actions — the organizing idea

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

### Gotchas that bite in production

1. **`useActionState`'s reducer takes `previousState` first.** The signature is `(previousState, payload)`. Every migration where someone renames `useFormState`→`useActionState` and forgets the payload is the *second* arg produces `formData.get is not a function` at runtime. The `replace-use-form-state` codemod does the rename but you still own the call sites.

2. **Full signature includes a third arg:** `useActionState(fn, initialState, permalink?)`. `permalink` is the progressive-enhancement escape hatch — if the form submits before JS hydrates, the browser navigates there. Per the docs, the destination page **must render the same form component with the same action and the same permalink**, or PE silently degrades to a broken navigation.

3. **Dispatching outside a transition errors in dev.** Calling the returned dispatch from a plain `onClick` logs an error. Wrap it: `startTransition(() => submitAction(payload))`. Passing it to `<form action>` is already inside a transition.

4. **Form auto-reset only helps uncontrolled inputs.** If you kept `value={name} onChange={...}`, React resets the DOM but your state still holds the old string. Migrating to Actions means migrating to `defaultValue` + `name`. This is the single most common half-migration.

> A `throw` from the action cancels queued actions and propagates to the nearest Error Boundary. If you want inline errors, **return** them as state (as above); do not throw. Throwing an expected validation error nukes the subtree.

---

## `useFormStatus`

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

## `useOptimistic`

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

### Gotchas

- **It reverts on completion, not just on error.** The optimistic state is discarded when the Action finishes and `optimisticState` converges to the new `value` in the *same* render — no intermediate cleared frame, no flicker. The consequence: **if the parent doesn't actually update `value`, the UI snaps back and looks like the write failed.** The most common complaint about `useOptimistic` ("my item disappears for a second") is really "my server data never revalidated." `useOptimistic` is not a store.
- **Rollback on error is automatic.** No `catch` + undo needed. Catch only to *surface* the error.
- Calling it outside a transition warns in dev; calling it during render is a hard error.

**Tradeoffs.** *Pros:* instant feedback, automatic rollback on error, correct under concurrent in-flight updates (the reducer re-runs against fresh base state). *Cons:* it is **not a store** — it depends on the parent revalidating `value`, so it couples your component to a real data-refresh path; get that wrong and the UI snaps back and looks like a failed write. **When NOT to use it:** for writes with no meaningful latency, or where you have no revalidation story yet — a plain optimistic `useState` is honest about being ad-hoc, whereas `useOptimistic` promises a convergence that never happens.

---

## `use()`

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

### Rules and caveats

- Callable only inside a component or hook. **Not** at module top level, not in plain functions, not in event handlers.
- Promises **must be cached / stable across renders.** An uncached promise means a permanent fallback.
- **Cannot be wrapped in `try/catch`** — use an Error Boundary instead. `use()` signals suspension by throwing, and your `catch` would swallow the suspension. `eslint-plugin-react-hooks` (≥ 6.1.0) flags this statically.
- `use(context)` **does not see providers rendered by the same component** — it searches strictly upward, the same footgun class as `useFormStatus`.
- Reading context with `use` is **not supported in Server Components**.
- For a Server→Client promise, the resolved value **must be serializable**.

---

## `ref` as a prop — and the `forwardRef` truth

```tsx
// React 19: no wrapper
function MyInput({ placeholder, ref }: Props) {
  return <input placeholder={placeholder} ref={ref} />;
}

<MyInput ref={inputRef} />;
```

> **`forwardRef` is NOT deprecated in React 19.** The docs say `forwardRef` is *"no longer necessary"* and *"will be deprecated in a future release"* — future tense. There is **no runtime deprecation warning**, and existing `forwardRef` components keep working. Say "unnecessary, slated for deprecation," not "deprecated." **Do not block a 19 upgrade on a `forwardRef` sweep** — it's a cleanup, not a migration blocker. Same story for `<Context.Provider>`.

Caveat: **refs to class components are still not passed as props.** `ref`-as-prop is a function-component feature only; codebases with a mix will find the class case unchanged. It also requires the **modern JSX transform** (see [Migration](#migration-18--19)).

### Ref cleanup functions

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

## `<Context>` as provider

```tsx
const ThemeContext = createContext('');

// React 19
<ThemeContext value="dark">{children}</ThemeContext>;

// still works, slated for future deprecation — not deprecated today
<ThemeContext.Provider value="dark">{children}</ThemeContext.Provider>;
```

`<Context.Consumer>` is unchanged. A codemod ships in the 19 migration recipe.

---

## Document metadata, stylesheets, scripts, preloading

### Metadata hoisting

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

### Stylesheets

```tsx
<link rel="stylesheet" href="/foo.css" precedence="default" />
<link rel="stylesheet" href="/bar.css" precedence="high" />
```

- `precedence` controls insertion order in `<head>` (order your `precedence` values are first encountered, not alphabetical).
- **Deduplicated** across components (unlike metadata).
- React **blocks [commit/paint](fundamentals#render-vs-commit) until the stylesheet loads** — CSR waits before committing, SSR won't paint. This makes co-located CSS safe, but a slow/blocked CDN stylesheet now blocks *rendering*, converting a FOUC into a blank screen. Watch this on third-party CSS.

> 🔴 **Gotcha** — co-locating a `<link rel="stylesheet">` is convenient, but you have just put a network request on the critical path *between render and commit*. A third-party CSS host having a bad day turns into a blank screen, not a flash of unstyled content. Reach for co-located stylesheets knowingly; keep slow/untrusted CSS out of the commit path.

### Async scripts

```tsx
<script async={true} src="https://example.com/widget.js" />
```

Deduplicated by `src`, can be co-located with the component that needs it. **Only `async` scripts** get this treatment.

### Preload APIs (`react-dom`)

```ts
import { prefetchDNS, preconnect, preload, preinit } from 'react-dom';

prefetchDNS('https://cdn.example.com');                      // may not need it
preconnect('https://cdn.example.com');                       // will need something
preload('https://cdn.example.com/f.woff2', { as: 'font' });  // know the URL
preinit('https://cdn.example.com/a.js', { as: 'script' });   // fetch AND execute now
```

Escalating commitment. `preinit` **executes** — not just fetches. Ordering follows React's own heuristic, not your call order.

---

## Removals — the actual 18→19 blockers

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

### `defaultProps` is the removal that actually hurts

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

## Security floor: the version fact that matters

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

## React Compiler 1.0

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

### ESLint (v7 is current)

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

## Migration 18 → 19

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

### TypeScript breaking changes

- **`useRef` now requires an argument** — `useRef<T>()` no longer compiles; use `useRef<T>(null)`. Mechanical, but it touches a lot of lines.
- All refs are mutable now; `MutableRefObject` is deprecated.
- **`ReactElement["props"]` defaults to `unknown` instead of `any`** — the change that generates a wall of new errors in code poking at `children.props.*`. The `react-element-default-any-props` codemod is the escape hatch.
- **The JSX namespace moved from global to `React.JSX`** — breaks `declare global { namespace JSX { ... } }` augmentations (custom elements, styled-components). Codemod: `scoped-jsx`.

> **String refs were removed, but `this.refs` was not.** React 19.2.7 still initializes `this.refs` to an object on class instances. "React 19 removed string refs" gets misread as "`this.refs` is gone" — and that misreading makes reviewers wrongly reject the official `replace-string-ref` codemod's output. The codemod converts `ref="input"` to a callback ref writing into a field; it does not, and need not, remove `this.refs`.

### Suggested order

1. Get to React **18.3.x** first; fix every new deprecation warning.
2. Grep `defaultProps` — including in dependencies (`react-19-replace-default-props` covers your own function components, not `node_modules`).
3. Confirm the modern JSX transform is on.
4. `npx codemod@latest run react-19-migration-recipe -t ./src --no-interactive`
5. `npx types-react-codemod@latest preset-19 ./src`
6. Bump to **19.2.7** (never below 19.2.4 — see the security floor).
7. `eslint-plugin-react-hooks@7`, then adopt React Compiler 1.0 **last**, pinned exactly.

---

## Worth knowing, shipped after 19.0

- **19.1.0** (2025-03-28): **Owner Stacks** — `captureOwnerStack()`, dev-only. Shows which component *rendered* a component (vs. component stacks, which show the tree above an error). The underused debugging upgrade of the 19.x line.
- **19.2.0** (2025-10-01):
  - **`<Activity mode="visible" | "hidden">`** — replaces `{visible && <Page/>}`. `hidden` unmounts effects and defers updates until idle **but preserves state**. Pre-render next routes; keep state across back-nav.
  - **`useEffectEvent`** — the fix for "my Effect re-runs because a callback dep changed." It lets an Effect read the latest props/state without listing them in [the dependency array](fundamentals#dependency-arrays). Declare it in the same component/hook as its Effect; **never** put it in a dep array. Requires `eslint-plugin-react-hooks@latest`.
  - **`cacheSignal()`** (RSC only) — an abort signal tied to `cache()` lifetime.
  - **Performance Tracks** in Chrome DevTools (Scheduler + Components tracks).
  - **SSR Suspense reveals now batch** to align server with client behavior. This **changes existing SSR reveal timing** — a behavior change inside a minor. A heuristic backstop stops batching if LCP approaches 2.5s.
  - **`useId` prefix changed to `_r_`** (was `:r:` in 19.0, `«r»` in 19.1) so IDs are valid CSS selectors / XML names. It **breaks snapshot tests and any CSS/selector code keying on the prefix** — and it changed *twice* within 19.x, so never depend on it.
- **19.2.7** (2026-06-01): fixes missing `FormData` entries in Server Actions, regressed in 19.2.6 — a cheap argument for staying current on patches.

### Other 19.0 items not to overlook

- **Consolidated hydration error diffs** — one error with a server-vs-client visual diff instead of a pile of messages.
- New root options: `onCaughtError`, `onUncaughtError`, `onRecoverableError`.
- Hydration now tolerates third-party scripts/extensions — unexpected tags in `<head>`/`<body>` are skipped; extension stylesheets survive re-render. Kills a large class of "works locally, errors for users with extensions" reports.
- **Custom Elements**: full support, passing all Custom Elements Everywhere tests.
- **`useDeferredValue(value, initialValue)`** — returns `initialValue` on first render, then schedules the real value in the background, avoiding the empty-state flash.
- **RSC is stable in 19** — but the docs state the underlying implementation APIs **do not follow semver and may break between 19.x minors**. Library authors targeting `react-server` should pin.

---

## Sources

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
