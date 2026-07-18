---
name: react-architecture
description: "Use when structuring a React codebase: feature-based vs layer-based folders, colocation, and the measured cost of barrel files. For laying out a project so it survives growth."
metadata:
  source: https://baluraut.github.io/react-best-practices/architecture
---

# Architecture: folders, colocation, and barrels

How you lay files out decides how a codebase ages. The wrong layout doesn't crash — it slowly makes
every change touch five directories and makes nothing safe to delete. This page covers the two
folder strategies (layer-based vs feature-based), colocation, and the barrel-file question, which is
more nuanced than the folklore claims.

Verified stack as of 2026-07-18: React 19.2.7, TypeScript 7.0.2, Vite 8.1.5 (ships Rolldown as its
bundler), MUI 9.2.0. Barrel numbers below were measured on a small reproduction — see the Sources.

---

## Layer-based vs feature-based folders

### The problem with layer-based

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

### Feature-based: change stays local

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

### The rule that keeps it honest: no cross-feature internals

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

## Colocation: keep related files adjacent

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

## Barrel files: the nuance folklore gets wrong

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

### What we measured

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

### Why React/bundlers behave this way

Tree-shaking can only remove a module if it can prove removing it changes nothing observable. A pure
module that just exports a function is provably safe to drop. A module with a top-level side effect —
`registerComponent(Foo)`, `import './global.css'`, anything that runs at import time — is *not*
provably safe, so `export *` through a barrel keeps it. The barrel didn't create the cost; the side
effect did. The barrel just made it easy to pull in 19 modules you never named. This is the module
version of the same [purity](fundamentals#purity) idea that governs React components: no side effects
means the optimizer is free to skip you.

### The cost that actually bites: dev cold-start and HMR

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

### The MUI corollary

The old v4-era advice was "always deep-import `@mui/material/Button`, never
`import { Button } from '@mui/material'`, or you'll bundle all of MUI." For **production**, that's
stale — MUI v9 supports named imports and modern Rollup/Rolldown tree-shakes them. But `@mui/material`
is a giant barrel, so named imports still measurably slow **dev cold-start**, the same mechanism as
above.

> 🟡 **Optimization** — default to named MUI imports (`import { Button } from '@mui/material'`) for
> readability; reach for deep imports (`@mui/material/Button`) only if dev startup is a felt pain.
> Different problem (dev-time crawl), different fix — not a production-bundle rule in v9.

---

## Putting it together

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

## Sources

- Vite performance guide (dependency pre-bundling, barrel-file guidance) — https://vite.dev/guide/performance
- Vite 8 / Rolldown bundler — https://vite.dev/guide/rolldown
- `eslint-plugin-boundaries` (feature-isolation enforcement) — https://github.com/javierbrea/eslint-plugin-boundaries
- ESLint `import/no-restricted-paths` — https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md
- Webpack `"sideEffects"` field / tree-shaking — https://webpack.js.org/guides/tree-shaking/
- MUI named vs deep imports (minimizing bundle size) — https://mui.com/material-ui/guides/minimizing-bundle-size/
