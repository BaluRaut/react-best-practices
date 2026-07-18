---
name: react-state-management
description: "Use when deciding where React state should live: local, lifted, Context, or an external store (Zustand, Redux, Jotai). A decision guide with the measured cost of un-split Context re-renders."
metadata:
  source: https://baluraut.github.io/react-best-practices/state-management
---

# Where State Should Live

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
- **Client state** — data owned by *this UI* and authoritative here (form drafts, which modal is
  open, selected filters, a wizard's current step). This is what the ladder below is for.

> 🟢 **Best practice** — classify every piece of state as *server* or *client* before deciding where
> it lives. Server state on this ladder is the root cause of most "React is slow / my data is stale"
> complaints.

---

## The ladder at a glance

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

## Rung 1 — Local `useState`, colocated

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

## Rung 2 — Lifted state

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

## Rung 3 — `useReducer`

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

## Rung 4 — Context

**What it's for.** A value that is needed *deep* in the tree, by *many* components, that you don't
want to drill through every intermediate layer: the current theme, the logged-in user, a locale, a
`dispatch` from a reducer. Context solves **distribution**, not storage — it's a way to make a value
available without prop drilling.

**Why the mechanism matters.** A Context provider broadcasts *one value*. When that value changes by
`Object.is`, **every consumer re-renders** — regardless of which part of the value it actually reads.
Context has no built-in selectivity. This is the fact that decides whether Context is the right rung.

### The measured trap: one big Context fans out to everyone

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

## Rung 5 — External store (Zustand / Redux Toolkit / Jotai)

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

### Zustand vs Redux Toolkit vs Jotai — an honest comparison

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

## Putting it together — a worked decision

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

## Does the React Compiler change any of this?

No. The [React Compiler](react-practices#2-react-compiler-1-0-what-actually-changes) auto-memoizes to
cut wasted re-renders (measured 11 → 1 on an unchanged child in a small reproduction), but it
memoizes *values* — it does **not** restructure your tree or change *where state lives*. A giant
Context still fans out to every consumer; the compiler can't fix a placement problem. State placement
is an architecture decision the compiler is downstream of.

> 🟢 **Best practice** — decide state placement first (this ladder), then let the compiler handle
> memoization. Good placement makes the compiler's job smaller; the compiler never substitutes for it.

---

## Sources

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
