# The Data Layer

Most "React is slow" and "my data is stale" bugs are not React problems. They are the result of one
category error: **treating server data as component state.** This page is about the layer between
your components and the network — where it lives, how it cancels, how it parallelizes, and why the
default answer for server state in 2026 is a query library, not a hand-rolled `useEffect`.

Verified against React 19.2.7 and the measured reproductions in this repo (2026-07-18).

---

## Server data is a cache, not state

This is the reframe the whole page hangs on. `useState` holds values **your UI owns and is
authoritative for**: a form draft, whether a modal is open, the selected tab. Server data is none of
those things. It is owned by the server, shared across every other client, and **stale the instant
you read it**. Your copy is a *cache* of someone else's source of truth.

### The problem

The moment server data lands in `useState`, you have silently signed a contract to hand-write, by
yourself, every feature a cache provides:

- race-condition handling (a slow early response overwriting a fast late one — see [stale closures](fundamentals#closures))
- deduplication (two components asking for the same user at once → two requests)
- revalidation (refetch when the data goes stale, on window focus, on reconnect)
- invalidation (after a mutation, everything showing that data is now wrong)
- retry/backoff, garbage collection, request-waterfall avoidance

Each of these is a genuine distributed-systems problem. Reinventing them per-component, badly, is the
tax you pay for putting a cache in `useState`.

### Why React behaves this way

`useState` was built for values that change *because the user did something in this component*. It
has no concept of "this value has an owner elsewhere and might already be out of date." There is no
built-in freshness, no built-in sharing. react.dev is direct about it:

> "Modern frameworks provide more efficient built-in data fetching mechanisms than writing Effects
> directly in your components."

### Draw the line by ownership

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

## A typed service layer, separate from components

Whatever caches your server data, the raw transport — URLs, headers, auth, JSON parsing, error
shaping — does **not** belong inline in components. Put it behind a typed module.

### The problem

`fetch('/api/...')` scattered across twenty components means twenty places that each independently
get the base URL, auth header, error handling, and response typing slightly wrong. A backend route
rename becomes a twenty-file change, and every call site returns `any`.

### A typed fetch wrapper

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

### A service module per resource

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

## Cancellation with AbortController

Every request you start should be cancellable, and an in-flight request should be aborted when its
consumer goes away or its inputs change. The wrapper above already accepts a `signal`; wire it up.

This section assumes the `AbortController` / `AbortSignal` mechanics covered in
[Modern JavaScript](js-general#abortcontroller-abortsignal-cancellation) — timeouts vs user-cancel
rejecting differently, `AbortSignal.any`, `AbortSignal.timeout`. Here we focus on the React shape.

### The problem it prevents is the race, not a warning

The real reason to abort on cleanup is **not** the (long-since-removed) "setState on an unmounted
component" warning. It is the race: type `a`, then `ab`, quickly. Two requests fly. If the response
for `a` is slower and lands *after* `ab`, it overwrites the correct results with stale ones — a
classic [stale-closure](fundamentals#closures)-adjacent bug that survives refresh roughly one time in
fifty and is miserable to reproduce.

### The shape in an Effect

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

## Sequential vs parallel fetching

When one screen needs several independent pieces of data, how you `await` them decides your load
time. This is measurable, and the difference is large.

### The problem

The natural way to write it — `await` each request in turn — makes each request wait for the previous
one to finish, even when they have nothing to do with each other.

```ts
// 🚩 Sequential: total time ≈ the SUM of all three requests.
const user   = await usersApi.get(id, signal);     // wait 200ms
const orders = await ordersApi.list(id, signal);   // then wait 180ms
const cart   = await cartApi.get(id, signal);      // then wait 220ms
```

### The better version

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

---

## Raw `useEffect` fetching is fragile

You *can* fetch with a bare `useEffect` + `fetch` + `useState`. For anything beyond a single
throwaway request, you shouldn't — and understanding exactly why is what justifies reaching for a
library.

### What you are actually signing up for

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

## TanStack Query as the default for server state

For a client-rendered React SPA (the stack this site targets), a query library is the default home
for server state. TanStack Query is the reference choice; SWR is a lighter equivalent with the same
core model.

### What it gives you that `useEffect` cannot

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

### The three options, compared

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

## Where fetching belongs: loaders vs components

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

## Sources

- https://react.dev/learn/you-might-not-need-an-effect
- https://react.dev/reference/react/useEffect#fetching-data-with-effects
- https://react.dev/learn/synchronizing-with-effects#fetching-data
- https://tanstack.com/query/latest/docs/framework/react/overview
- https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
- https://developer.mozilla.org/en-US/docs/Web/API/AbortController
- https://reactrouter.com/start/framework/data-loading
- Empirical, measured locally on a small reproduction (React 19.2.7, jsdom, 2026-07-18):
  sequential 604 ms vs parallel 221 ms fetch timing.
