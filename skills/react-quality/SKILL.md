---
name: react-quality
description: "Use when testing React (Vitest + React Testing Library), fixing accessibility (focus management on route change, roles, labels), improving performance (INP, bundle size, code splitting), or choosing linters and project structure for a React SPA."
metadata:
  source: https://baluraut.github.io/react-best-practices/quality
---

# Quality: Testing, Accessibility, Performance, Tooling, Structure

The four disciplines that keep a React codebase honest after the demo. Verified stack as of
2026-07-18: React 19.2.7, TypeScript 7.0.2, Vite 8.1.5, Vitest 4.1.10, MUI 9.2.0. Every version
claim below was checked against npm or measured on a real install; hedges are kept where the
evidence was second-hand.

---

## Tooling

### The Vite template ships oxlint, not ESLint

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

### Is oxlint enough? An honest answer

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

### The typescript-eslint / TypeScript 7 collision

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

### ESLint 10 removed eslintrc — silently

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

## Testing

### Vitest 4 — current, and the migration that bites

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

### RTL query priority is an accessibility lint in disguise

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

### user-event over fireEvent, always

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

### What NOT to test

- **Implementation details** — `useState` internals, whether a `memo` hit, internal call counts.
- **Snapshot tests of whole component trees** — they get blindly `-u`'d on every failure and end up
  asserting nothing.
- **The library** — MUI's `Button` works; testing it tests Material UI's CI, not yours.
- **Types at runtime** — that is the type checker's job.

### Hooks, network, and E2E

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

## Accessibility

### Semantic HTML first

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

### Focus management on route change is THE SPA a11y bug

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

### Keyboard traps and focus return

Modals must trap focus *inside* while open and **return focus to the trigger** on close. MUI's
`Modal`/`Dialog` does this via `FocusTrap`. Hand-rolled modals almost never restore focus — the user
closes the dialog and lands back on `<body>`, re-tabbing the entire page. If you build a modal, storing
and restoring `document.activeElement` is not optional.

### aria-live: mount the region empty, then write into it

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

### Contrast

WCAG 2.2 AA requires **4.5:1** for normal text, **3:1** for large text (≥18.66px bold or ≥24px) and
for UI components and meaningful graphics. MUI's default `text.secondary` and `disabled` states are a
classic AA miss once you apply a custom palette — theme overrides must be re-checked. The library
defaults are not a guarantee.

### Tooling division of labor

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

## Performance

### INP replaced FID — and this is the React-relevant metric

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

### What actually causes slow React

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

### React Compiler changes the memo advice — but is not a performance strategy

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

### Bundle budgets — enforce them or they don't exist

Vite's `build.rollupOptions.output.manualChunks` splits chunks and `chunkSizeWarningLimit` prints a
warning — but the warning **does not fail the build**. That is the gotcha: a budget that only warns is
not a budget. Real enforcement needs `size-limit` (12.1.0) or a CI check on the `dist` output.

> 🟢 **Best practice** — enforce the budget in CI, don't just warn. An advisory limit is one hurried PR
> away from silently doubling first-load JS; a failing check is the only version that actually holds.

> Vite 8 ships **Rolldown** as its bundler (confirmed by the build warning referencing
> `build.rolldownOptions.output.codeSplitting`) — no opt-in required. The `rollupOptions` names still
> work for compatibility.

### Code splitting

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

### Images and CLS

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

### Measure before you memoize

Use the React Profiler's flamegraph with "record why each component rendered" enabled (Profiler
settings). The intuition about *what* is slow is wrong most of the time — measure first.

---

## Structure

### Feature-based over layer-based

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

### The barrel-file problem

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

### MUI imports: named is fine for production, deep helps dev

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

## Sources

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
