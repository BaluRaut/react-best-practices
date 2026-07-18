---
name: react-migration
description: "Use when upgrading a React codebase across major versions (16, 17, 18, or 19), when you hit a React upgrade error, or when choosing a codemod for a React migration. Covers the hop-by-hop breaking changes, the literal error messages, the exact codemod commands, and rollback risk."
metadata:
  source: https://baluraut.github.io/react-best-practices/migration-matrix
---

# The React 16 → 19 Migration Matrix

This page owns the **transitions**. For the per-version detail — what each release *is* — see
`react-16`, `react-17`, `react-18`, `react-19`. Here we cover only what happens *between* them: what
breaks, the literal error message, the fix, the exact codemod command, and the rollback risk.

Verified against the ground-truth stack on 2026-07-18: React **19.2.7**, `@types/react` **19.2.17**,
TypeScript **7.0.2**, `codemod` CLI **1.12.13**. Facts marked as measured were executed on a real
install (Node 24.16.0, npm 11.13.0); primary facts are quoted from react.dev.

---

## Lead with the two things everyone gets wrong

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

## Can you go 16 → 18 directly, skipping 17?

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

### The trap inside the right answer

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

### Which path by app size

| App | Path | Why |
|---|---|---|
| < ~200 components, good test coverage | **16 → 18 direct** (then 19) | The 17 delta is small; one PR, one QA cycle. |
| Large / legacy / many unowned 3rd-party deps | **16 → 17 → 18** | Not because it's required — because it isolates the event-delegation blast radius into its own deploy with its own rollback. Pure project management. |
| Must support IE11 | **stop at 17** | React 18 dropped IE. This is the one hard fork in the road. |

---

## First: detect what you are actually running

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

---

## The `react-dom/client` split

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

## HOP 1: 16 → 17

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

## HOP 2: 17 → 18

**Effort: MEDIUM. Risk: HIGH — and the risk is all in the second half.**

Split this hop into **2a (bump)** and **2b (createRoot)**. 2a is nearly free; 2b is the entire hop.

### 2a — bump the packages

Breaks: **IE11 support is dropped** (hard fork — if you need IE, stop at 17). Everything else keeps
working in React-17 mode (see the `react-dom/client` section). Rollback: easy.

### 2b — switch to `createRoot`

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

## HOP 3: 18 → 19

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

### `defaultProps` — the silent one

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

## The `@types/react` pain — with literal error codes

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

### Pin `@types/react` exactly

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

## Codemods — the registry the official guide hides

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

### The `defaultProps` codemod exists — and is correct

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

### Codemod gotchas that bite (all measured)

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

## Migration blocker: TS 7 removed `moduleResolution: "node"`

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

## Order of operations for a large legacy app

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

---

## Effort / risk per hop

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

## Sources

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
