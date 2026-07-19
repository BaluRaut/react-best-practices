---
name: typescript
description: "Use for any TypeScript work — configuring tsconfig, strictness, typing, or fixing type errors. A consolidated best-practices reference for the TypeScript 6/7 era (flipped strict defaults, the Go port): satisfies vs as, unknown over any, discriminated unions, generics, branded types, and typing React with @types/react 19."
metadata:
  source: https://baluraut.github.io/frontend-best-practices
---

# TypeScript — Best Practices (consolidated)

A single-file, version-verified TypeScript reference, consolidated from [baluraut.github.io/frontend-best-practices](https://baluraut.github.io/frontend-best-practices/). Every rule is labelled 🟢 best practice / 🟡 optimization / 🔴 advanced-gotcha, with bad-vs-good examples and a "when not to". These are guidelines and trade-offs, not laws.

## Contents

- [TypeScript in the TS 6/7 Era](#typescript-in-the-ts-67-era)
- [TypeScript with React 19](#typescript-with-react-19)

---

## TypeScript in the TS 6/7 Era

> **Read this first.** Nearly every TypeScript best-practices article online — and most model
> training data — predates TypeScript 6.0 (March 2026) and 7.0 (July 2026). The defaults flipped.
> Advice that says "always turn on `strict`" or "install `@typescript/native-preview` and run
> `tsgo`" is now stale. This page is written against `typescript@7.0.2`, with the important claims
> verified by running the compiler, not read from prose.

Verified stack for this page: **TypeScript 7.0.2** (GA 2026-07-08), the Go native port ("Project
Corsa"). React 19.2.7, Vite 8.1.5, Material UI 9.2.0.

---

### Version reality check

| Fact | Value | Note |
|---|---|---|
| Latest stable | **7.0.2** | GA 2026-07-08 |
| Last 6.x | **6.0.3** (2026-04-16) | 6.0 GA 2026-03-23 |
| Compiler implementation | **Go native port** ("Project Corsa") | rewritten from the TypeScript-in-TypeScript compiler |
| Binary name | **`tsc`** — NOT `tsgo` | verified: a fresh install's `.bin/` has `tsc` and no `tsgo` |
| Distribution | native binary via `optionalDependencies` | `tsc.js` is a thin shim that `execve`s into `@typescript/typescript-<platform>` |

**`tsgo` is a trap.** `tsgo` was the binary name only during the `@typescript/native-preview` phase.
As of 7.0 GA the Go compiler ships as the ordinary `tsc` in the ordinary `typescript` package. A
fresh `npm i -D typescript@latest` yields `tsc --version` → `Version 7.0.2` and no `tsgo` anywhere.
The `native-preview` package still exists (currently a `7.0.0-dev.*` build) and still exposes
`tsgo`, but that is for nightlies only. Any guide telling you to install `@typescript/native-preview`
and run `tsgo` is describing a state of the world that ended at 7.0 GA.

> **The official Vite template still pins `typescript: ~6.0.2`, not 7.** `npm create vite@latest --
> --template react-ts` deliberately stays one major behind. Readers on TS 6 are not wrong — but TS 7
> typechecks the React 19 + MUI 9 stack clean and is measurably faster (see below). Staying on 6.x
> side-by-side is possible via `@typescript/typescript6`, which ships a `tsc6` binary *(medium
> confidence — from the 7.0 announcement, not independently installed here)*.

#### Is it actually faster?

Measured on a five-file project, same code, same machine, `tsc --noEmit`, warm best-of-3:
`typescript@6.0.3` → 0.51s, `typescript@7.0.2` → **0.19s**, roughly **2.7x** (measured on a small
reproduction; your numbers will differ in production). A five-file project is startup-dominated, so
2.7x is a *floor*, not a headline. Microsoft's larger "8–12x" claims concern big codebases and are
not reproduced here. Do not quote a 10x number from small-project data.

> 🟡 **Optimization** — upgrade to TS 7 for the speed win and the cleaner defaults.
>
> **Pros:** measurably faster typecheck (2.7x floor above), strict-by-default, and a clean pass on
> the React 19 + MUI 9 stack.
> **Cons:** the programmatic compiler API moved (a hard blocker, below); removed flags —
> `moduleResolution: node`, `target: es5` — fail *before any file is checked*, so a legacy config
> can't even start `tsc`.
> **When NOT to upgrade:** if any dependency reaches for the compiler API (`vue-tsc`, `ts-jest`,
> `ts-loader`, custom transformers, `@typescript-eslint` type-aware rules) and hasn't shipped TS 7
> support — pin `6.0.3` and stay side-by-side. Speed is not worth a build you can't run.

---

### The single biggest upgrade blocker: the compiler API moved

This bites hardest and is described badly in secondary coverage. Secondary sources say "TypeScript
7.0 has no programmatic API." That is imprecise in a way that costs hours.

`require('typescript')` **still succeeds** on TS 7 — it does not throw. It resolves to a tiny module
and returns almost nothing:

```js
const ts = require('typescript');
Object.keys(ts);            // [ 'version', 'versionMajorMinor' ]  ← that's ALL
ts.version;                 // '7.0.2'
typeof ts.createProgram;    // 'undefined'   ← NOT a function
typeof ts.transpileModule;  // 'undefined'
```

The import silently succeeds, so failure surfaces later as `TypeError: ts.createProgram is not a
function` — or worse, never surfaces, because ecosystem code is full of capability probes:

```ts
// BAD — silently takes the wrong branch on TS 7, no error thrown
if (typeof ts.transpileModule === 'function') {
  return ts.transpileModule(src, opts);     // never runs on TS 7
}
return fallbackThatSilentlyDropsTypes(src); // ← you ship this and don't notice
```

There **is** an API — it moved to `unstable/` subpaths and has a completely different, object/class
oriented shape (`new API(...)`, `Program`, `Checker`, `Emitter`) rather than the old free-function
`ts.createProgram` style. The root `"."` export now maps only to a version module; the real surface
is under paths like `typescript/unstable/sync`. It is named **`unstable`** — treat it as such; the
7.0 announcement commits to a stable API in 7.1. The Go port re-implemented the checker, so the old
API (which exposed JS object internals that don't exist in Go) could not be ported verbatim.

> **Practical rule: if your project depends on the compiler API, verify the tool supports TS 7
> *before* upgrading, and pin to `6.0.3` if not.** The consumers to audit: `vue-tsc`, Svelte/Astro
> type tooling, Angular template checking, `ts-jest`, webpack `ts-loader`, custom transformers, and
> `@typescript-eslint`'s type-aware rules. This is a hard blocker, not a footnote.

---

### Strict is on by default now

The most-repeated TypeScript tip of the last decade — "always turn on `strict`" — is now **redundant
boilerplate for new projects**. TS 6.0 flipped the default.

Empirical proof: with `compilerOptions: {}` (nothing set) on TS 7.0.2, both of these error:

```ts
function g(y) { return y; }                        // TS7006: Parameter 'y' implicitly has an 'any' type.
function f(x: string | null) { return x.length; }  // TS18047: 'x' is possibly 'null'.
```

Setting `"strict": false` silences both. The whole strict family reports `default: true, unless
strict is false`: `noImplicitAny`, `noImplicitThis`, `strictNullChecks`, `strictFunctionTypes`,
`strictBindCallApply`, `strictPropertyInitialization`, `strictBuiltinIteratorReturn`, `alwaysStrict`,
plus `useUnknownInCatchVariables`.

> 🟢 **Best practice** — the rule is no longer "enable strict." The rule is: **never write
> `"strict": false`.** In a 2026 tsconfig that line is an act of *disabling* safety, not declining to
> add it. It is a correctness default, not an optimization: strict catches implicit `any` and null
> access at compile time instead of in production. Put it on the review checklist.

Note the subtlety: a generated `tsconfig.app.json` may contain no `"strict": true` at all, and
`tsc --showConfig` prints the strict flags as `<unset>` — yet strict behaviour fires. The default
lives in the compiler, not the config.

---

### The strictness flags that still earn their keep

These are **not** implied by `strict` (each reports `default: false`). They are where the real
opt-in value now lives.

| Flag | Catches |
|---|---|
| `noUncheckedIndexedAccess` | index access lying about `undefined` |
| `exactOptionalPropertyTypes` | `{ x: undefined }` vs an absent `x` |
| `noImplicitOverride` | silent base-method drift |
| `noImplicitReturns` | code paths that fall off the end |
| `verbatimModuleSyntax` | import-elision surprises |
| `erasableSyntaxOnly` | syntax a type-stripper can't erase |
| `isolatedDeclarations` | `.d.ts` emit needing the full type graph (libraries only) |
| `isolatedModules` | single-file-transpile hazards |

#### `noUncheckedIndexedAccess` — the highest-value flag not in `strict`

> 🟢 **Best practice** — turn it on. It closes a correctness hole `strict` leaves open, not a
> speculative optimization.

**Rule:** turn it on. **Why:** `arr[i]` and `record[key]` are the most common source of production
`undefined` crashes, and `strict` does not cover them. This compiles clean under default TS 7
(strict on) and is a runtime bug:

```ts
// BAD — passes typecheck. Ships. Crashes.
function firstUpper(names: string[]): string {
  return names[0].toUpperCase();  // no error by default — TypeError at runtime on []
}
const cfg: Record<string, number> = {};
const n: number = cfg.missing;    // no error by default — n is undefined at runtime
```

With the flag on, both error (verified under `tsc@7.0.2`): the array access errors `TS2532: Object is
possibly 'undefined'`, and the record access errors `TS2322: Type 'number | undefined' is not assignable
to type 'number'`. Either way you're forced to handle the `undefined`:

```ts
// GOOD — the undefined is in the type, so you must handle it
function firstUpper(names: string[]): string {
  const first = names[0];          // string | undefined
  if (first === undefined) return "";
  return first.toUpperCase();
}
```

> 🔴 **Gotcha that kills adoption:** the flag does **not** narrow across a length check.
> `if (arr.length > 0) arr[0].foo()` still errors — TS does not correlate `.length` with index
> validity. Teams that don't know this rip the flag back out after a day. The idiomatic escapes:
> destructure (`const [first] = arr`), use `.at(0)`, or iterate with `for...of` (the element type
> there is not `| undefined`).

**Tradeoffs.** *Pros:* the single highest-value undefined-crash catcher not already in `strict`.
*Cons:* every existing `arr[i]`/`record[key]` becomes a type error, so retrofitting a large codebase
is noisy, and the length-check blind spot above surprises people. **When NOT to turn it on:**
essentially never for new code; on a large legacy codebase, gate it behind a scheduled sweep rather
than flipping it and drowning in errors mid-sprint.

#### `exactOptionalPropertyTypes` — subtle, real, a migration tax

**Rule:** on for new code; expect friction retrofitting. **Why:** `timeout?: number` without it means
`number | undefined`, so "explicitly set to `undefined`" and "absent" become indistinguishable — but
they are *not* the same to `Object.keys`, spread, `in`, or JSON.

```ts
interface Opts { timeout?: number }
const o: Opts = { timeout: undefined };
// TS2375: Type '{ timeout: undefined; }' is not assignable to type 'Opts'
//   with 'exactOptionalPropertyTypes: true'.
```

The failure it prevents is a real merge-defaults bug:

```ts
// BAD: caller passes { timeout: undefined } meaning "don't care";
// spread OVERWRITES the default with undefined → fetch gets timeout: undefined
const merged = { ...defaults, ...userOpts };
```

If you genuinely need "present but holding `undefined`", write it explicitly:
`timeout?: number | undefined`. Note this interacts badly with older `@types` packages authored
before the flag existed — expect errors sourced from `node_modules`, not your own code.

> 🟡 **Optimization** — on for new code; it has a genuine cost retrofitting.
>
> **Pros:** distinguishes "absent" from "explicitly `undefined`", killing the merge-defaults bug
> above. **Cons:** older `@types` were written without it, so you inherit errors from `node_modules`
> you can't fix; it also pairs badly with `Partial`. **When NOT to turn it on:** a codebase that
> spreads a lot of partial option bags through untyped third-party helpers — the friction can
> outweigh the bug it prevents until those types are updated.

#### `noImplicitOverride`

**Rule:** on for any codebase with class inheritance.

```ts
class Base { greet() {} }
class Sub extends Base { greet() {} }
// TS4114: This member must have an 'override' modifier because it
//   overrides a member in the base class 'Base'.
```

**Failure prevented:** someone renames or deletes `Base.greet()`. Without the flag, `Sub.greet()`
silently stops overriding anything and becomes dead code that still typechecks. With `override` on
the member, deleting the base method errors instead.

#### `verbatimModuleSyntax`

> 🟢 **Best practice** — on, especially with bundlers and `isolatedModules`. It removes a class of
> silent, bundle-only bugs (import-elision dropping side effects), which makes it a correctness rule,
> not a preference.

**Rule:** on, especially with bundlers and `isolatedModules`. It enforces one simple law: **imports
without `type` are always emitted; imports with `type` are always erased.** No inference, no elision
guesswork.

```ts
// input
import { type Foo, bar } from "./dep.js";
export const z = bar;
export type Q = Foo;
```
```js
// emit — the type-only import is gone, the value import stays verbatim
import { bar } from "./dep.js";
export const z = bar;
```

> **Failure it prevents:** classic import elision. Pre-`verbatimModuleSyntax`, if you imported a
> symbol and used it only in type position, TS silently deleted the import — which also deleted its
> **side effects** (`reflect-metadata`, decorator registration, polyfills, CSS imports). The bug
> appears only in the bundle, never in tests.

#### `erasableSyntaxOnly`

**Rule:** on if anything strips your types *without type-checking* them — Node's `--strip-types` /
`--experimental-strip-types`, esbuild, swc, Bun, or Vite. **Why:** `enum`, `namespace` with runtime
members, parameter properties (`constructor(private x: number)`), and `import =` all *emit
JavaScript*. A type-stripper cannot erase them.

```ts
enum E { A }
// TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
```

This is the flag that makes "avoid enums" mechanical rather than stylistic. The official Vite React
template ships with `erasableSyntaxOnly: true` already set.

---

### Config changes that silently break builds

#### `types` now defaults to `[]`

`@types` packages **no longer auto-load** from `node_modules/@types`.

- with no `types` option → a global like `describe`/`process`/`__dirname` errors `Cannot find name '…'`.
  The exact code is helpfully specific (verified under `tsc@7.0.2`): `__dirname` is a bare `TS2304`,
  but `process` is `TS2591` ("Do you need to install `@types/node`?") and `describe` is `TS2593`
  ("Do you need `@types/jest` or `@types/mocha`?") — the compiler tells you which package is missing.
- with `"types": ["node", "vitest/globals"]` → clean.

**Failure mode:** you upgrade and get a wall of `Cannot find name 'describe' / 'expect' / 'process'`.
It looks like your test setup exploded; it's just the new default. The change is *good* — implicit
global-scope pollution was always a bug factory — but it is a hard migration cliff. Fix by listing
the ambient type packages you actually depend on.

#### `moduleResolution: "node"` / `"node10"` removed

```
error TS5108: Option 'moduleResolution=node10' has been removed. Please remove it from your configuration.
```

Passing `"node"` produces the **`node10`** error message — `node` is an alias and the diagnostic
names the canonical form, which is confusing when you grep for the string you actually wrote. Legacy
React apps — precisely the migration audience — cannot run `tsc` at all on TS 7 until the tsconfig
moves off `node`; this fires before any file is checked, so it bites before any React error does.

Replace with:

| Use | When |
|---|---|
| `"bundler"` | Vite / webpack / esbuild / Rollup consume your output |
| `"nodenext"` | Node runs your output directly |

`bundler` models what bundlers do: it honors `exports`/`imports` in package.json, allows
extensionless relative imports, and has no `require`-vs-`import` condition split. **Do not use it if
Node executes your output** — Node needs real extensions and real ESM/CJS resolution, and `bundler`
will happily let you write imports that Node then fails on at runtime.

#### `target` defaults to `es2025`; ES5 is gone

The compiler default `--target` is `es2025`, and the accepted list runs `es2015 … es2025, esnext` —
**`es5` is not in it**, and `downlevelIteration` (ES5-only) went with it. Native `#private` fields
are no longer downleveled to WeakMaps.

> **Gotcha:** because `#priv` is now genuinely private at runtime, test or mocking code that used to
> reach into privates via downleveled internals breaks. The privacy is real now.

*(The official Vite template overrides this to `target/lib: ES2023` in `tsconfig.app.json` — a
deliberate choice, not a requirement.)*

#### `module`: `amd`, `umd`, `system`, `none` removed

The accepted `module` list is `commonjs, es2015/es6, es2020, es2022, esnext, node16, node18, node20,
nodenext, preserve`. `outFile` was removed alongside the module-concatenation formats *(medium
confidence — from the announcement, not separately probed)*. If you ship AMD/UMD bundles you need a
bundler now.

> **Verifying which flags were removed:** a present `tsconfig.json` masks flag validation on TS 7
> (it emits `TS5112` and stops), and bare `npx tsc` can resolve to a decoy package that prints a
> plausible `Version 7.0.2` and fabricates errors. Probe removed flags with
> `./node_modules/.bin/tsc --ignoreConfig`, never bare `npx tsc`, and confirm `node_modules` exists
> first.

---

### `satisfies` vs `as` vs annotation

> 🟢 **Best practice** — reach for `satisfies` to validate a literal without losing its narrow type;
> keep `as` for the three legitimate uses below. Preferring `satisfies` over `as` is a
> correctness rule: `as` silences the checker, `satisfies` runs it.

**The rule:** annotation to *constrain* a value; `satisfies` to *check without widening*; `as` almost
never.

```ts
type Route = { path: string; method: "GET" | "POST" };

// BAD — 'as' launders a typo straight into production
export const bad = { path: "/x", method: "GTE" } as unknown as Route;
// → NO ERROR. Ships. Router silently never matches.

// GOOD — satisfies validates and keeps the narrow type
export const good = { path: "/x", method: "GTE" } satisfies Route;
// TS2322: Type '"GTE"' is not assignable to type '"GET" | "POST"'.
```

Why not the annotation here? Because annotation **widens**:

```ts
const routes: Record<string, Route> = { home: { path: "/", method: "GET" } };
routes.hmoe;   // no error — key set widened to string, typo undetected

const routes2 = { home: { path: "/", method: "GET" } } satisfies Record<string, Route>;
routes2.home.method;   // narrow literal "GET" preserved
// routes2.hmoe;       // error — keys stay exact
```

`satisfies` = "check this against the contract but keep the specific inferred type." That is the
whole feature: validation without loss of information.

#### Why `as` is a code smell — and the three legitimate uses

`as` doesn't convert anything. It only silences the checker: a **runtime no-op** and a **compile-time
lie**. The bug it creates always surfaces far from where it was written. Legitimate uses:

1. **Narrowing external data, immediately after real validation.** `JSON.parse(raw) as User` is the
   classic mistake — it asserts a claim nothing checked. Validate at runtime instead
   (`UserSchema.parse(parsed)`), which needs no `as`.
2. **`as const`** — a different operator despite the keyword. It *narrows* (prevents widening); it
   doesn't override. Always fine.
3. **Escaping a known compiler limitation**, narrowly scoped and commented — e.g. `Object.keys`
   returning `string[]` for a local literal you just built:
   ```ts
   // Object.keys is intentionally string[] (objects may have extra keys at runtime).
   // Safe here: `config` is a local literal we just built and never widened.
   (Object.keys(config) as (keyof typeof config)[]).forEach(/* … */);
   ```

> 🔴 **Gotcha — `as unknown as X` is a double assertion.** It exists solely to defeat TS's own
> "these types don't sufficiently overlap" guard — TypeScript telling you you're wrong and you
> overruling it twice. Reach for it knowingly and rarely; in review, treat it as requiring a written
> justification.

#### The non-null assertion `!` is `as` in disguise

`value!` tells the compiler "trust me, this isn't null/undefined" and erases the check. It's the same
override as `as`, just shorter — and just as capable of shipping a `Cannot read properties of undefined`
to production, because it removes the type-level warning without adding a runtime guard.

```ts
// 🔴 the ! silences the compiler; if the element isn't there, this throws at runtime
const root = document.getElementById('root')!
createRoot(root).render(<App />)

// 🟢 handle the null — the failure becomes an explicit, debuggable error instead of a stack trace
const root = document.getElementById('root')
if (!root) throw new Error('#root missing from index.html')
createRoot(root).render(<App />)
```

> 🔴 **Advanced / gotcha** — every `!` is a place you promised the compiler something it couldn't verify.
> A few are genuinely justified (a value you set one line earlier, a test fixture), but a `!` on anything
> that crosses an I/O boundary — DOM queries, API responses, `Map.get()` — is a latent crash. Prefer a
> guard, `??`, or optional chaining. Turn on `@typescript-eslint/no-non-null-assertion` so each one has to
> be a deliberate, commented exception rather than a reflex.

#### `#private` vs the `private` keyword

TypeScript's `private` is a **compile-time** fiction — it's erased, and the field is fully readable at
runtime (`obj['secret']` works). ECMAScript's `#private` is **real runtime privacy** — genuinely
inaccessible from outside the class.

> 🟡 **Optimization** — use `#private` when you need actual encapsulation (hiding a field from consumers
> of a shipped library, or from code that might poke at internals). Use the `private` keyword when you
> only want type-level discouragement within your own codebase and value the slightly cleaner syntax.
> **When it doesn't matter:** in React you rarely write classes at all, so this is mostly a library-author
> concern. (Older style guides that predate broad `#` support say "always use `private`"; that advice is
> now a tradeoff, not a rule.)

---

### `unknown` over `any` at every boundary

> 🟢 **Best practice** — `unknown` at every trust boundary (`JSON.parse`, `res.json()`, `catch`).
> This is a correctness rule: it forces you to prove a shape before you use it.

**Rule:** `unknown` at every trust boundary. **Why:** `any` is not "a type" — it's a
*checker-disable switch* that propagates silently through every downstream expression.

```ts
function h(a: any, u: unknown) {
  a.whatever.deeply.nested();  // NO ERROR — any disables all checking, crashes at runtime
  return u.length;             // TS18046: 'u' is of type 'unknown'.
}
```

The asymmetry is the lesson: `any` **spreads** (anything touching it becomes unchecked), `unknown`
**contains** (nothing escapes until you prove what it is). Highest-value applications: `JSON.parse`
(returns `any`), `catch (e: unknown)` (already the default under `useUnknownInCatchVariables`, part
of `strict`), and any `res.json()`.

```ts
// BAD
const data = await res.json();          // any
renderUser(data.user.name);             // typechecks; explodes if the API changed

// GOOD
const data: unknown = await res.json();
const user = UserSchema.safeParse(data);
if (!user.success) return handleBadPayload(user.error);
renderUser(user.data.name);             // provably shaped
```

---

### Discriminated unions over optional-bag types

> 🟢 **Best practice** — model *states*, not *fields*. Making illegal states unrepresentable is a
> correctness rule; the exhaustive `switch` turns "did I handle every case?" into a compile error.

**Rule:** model *states*, not *fields*. **Why:** optional bags can represent states that cannot exist
and force defensive `!` everywhere.

```ts
// BAD — 2^4 = 16 representable combinations, ~3 are legal
interface Req {
  loading?: boolean;
  data?: User;
  error?: Error;
  retryCount?: number;
}
if (req.data) { /* stale data from before an error? who knows */ }
req.data!.name   // the '!' is the tell: the model is lying
```

```ts
// GOOD — exactly 3 representable states, each carrying precisely its own data
type Req =
  | { status: "loading" }
  | { status: "success"; data: User }
  | { status: "error"; error: Error; retryCount: number };

function render(r: Req) {
  switch (r.status) {
    case "loading": return spinner();
    case "success": return view(r.data);        // .data exists, no '!'
    case "error":   return retry(r.retryCount); // retryCount ONLY here
  }
}
```

The payoff is **exhaustiveness**. Add `{ status: "cancelled" }` and every `switch` missing a case
errors at compile time:

```ts
default: {
  const _exhaustive: never = r;   // errors when a new state is unhandled
  throw new Error(`unhandled: ${JSON.stringify(_exhaustive)}`);
}
```

This converts "did I update every consumer?" from a code-review question into a compiler error.

> **Gotcha:** discriminants must be **literal types**. `status: string` destroys narrowing. This is
> exactly why the `satisfies`-vs-annotation distinction matters — an annotation that widens
> `"loading"` to `string` silently disables the whole mechanism.

---

### Enums vs union literals vs `as const` objects

> 🟢 **Best practice** — prefer union literals; use `as const` objects when you need a runtime value;
> avoid `enum`. This is a rule with mechanical backing (`erasableSyntaxOnly` rejects `enum`), not a
> style preference.

**The answer: prefer union literals; use `as const` objects when you need a runtime value; avoid
`enum`.** Three concrete, non-stylistic reasons to avoid `enum`:

1. **It emits runtime JS.** Every other type construct erases; `enum` generates an IIFE object, so it
   errors under `erasableSyntaxOnly` (TS1294) — meaning it is incompatible with Node's native
   type-stripping, esbuild, swc, and Bun in the general case.
2. **Numeric enums are not type-safe:**
   ```ts
   enum Status { Active, Inactive }
   const s: Status = 47;   // NO ERROR — numeric enums accept arbitrary numbers
   ```
3. **They're nominal.** Two structurally identical enums are incompatible, and a plain `"Active"`
   string isn't assignable to a string-enum member — so enums leak across every JSON / DB / query
   boundary where you only hold the raw value.

```ts
// GOOD — union literal: zero runtime cost, exhaustive, JSON-native
type Status = "active" | "inactive";

// GOOD — as const object, when you need iteration / a runtime value
const Status = { Active: "active", Inactive: "inactive" } as const;
type Status = typeof Status[keyof typeof Status];   // "active" | "inactive"
Object.values(Status);                              // runtime enumeration
```

The `as const` pattern gives you everything `enum` promised (namespacing, a runtime value,
autocomplete) with none of the costs, and the type derives from the value so they cannot drift.
`const enum` is worse still: it relies on cross-file inlining, which is fundamentally incompatible
with single-file transpilation (`isolatedModules`).

---

### `type` vs `interface`

> 🟢 **Best practice** — pick one and be consistent; default to `type`. The tie-breaker is
> correctness, not taste: `interface` silently *merges* two same-named declarations, while `type`
> errors — so `type` fails loudly where `interface` fuses unrelated shapes.

**It barely matters — pick one and be consistent. `type` is the better default.** The genuinely
load-bearing differences (everything else is folklore):

1. **Declaration merging.** `interface` merges across declarations; `type` errors on redeclare.
   Merging is a *feature* for augmenting third-party/global types (`declare module`) and a **hazard**
   in app code — two unrelated `interface User` in one scope silently fuse instead of erroring. That
   asymmetry is the actual argument for `type` as the default: it fails loudly.
2. **`type` expresses things `interface` cannot:** unions (the single biggest reason), conditionals,
   mapped types, tuples, template literals.
3. **Index-signature assignability** — the one that actually bites:
   ```ts
   interface Opts { a: string }
   type OptsT = { a: string };
   declare function send(x: Record<string, unknown>): void;
   send({ a: "x" } as OptsT);  // OK
   const i: Opts = { a: "x" };
   send(i);   // ERROR: Index signature for type 'string' is missing in type 'Opts'
   ```
   An `interface` is open (mergeable), so TS can't prove it has no extra non-`unknown` props; a
   `type` alias is closed, so it can. This produces baffling errors when passing values to
   JSON/logging helpers, and "change `interface` to `type`" is the fix.

Performance folklore ("interfaces cache better / are faster") is **low confidence**, historically
cited for large unions of object types, not verified here, and the Go port likely changes the
calculus entirely. **Do not assert it.**

---

### `const` type parameters preserve literals

**Rule:** use `const T` when a generic must preserve literal/tuple types **without forcing callers to
write `as const`**.

```ts
// BAD — caller must remember `as const`, and forgetting it silently widens
function pick<T extends readonly string[]>(t: T): T { return t; }
const a = pick(["a", "b"]);            // string[]  ← literals lost

// GOOD — the API guarantees it; callers can't get it wrong
export function pick<const T extends readonly string[]>(t: T): T { return t; }
export const got = pick(["a", "b"]);   // readonly ["a", "b"]  — verified in emitted .d.ts
```

Without it, every route table / column def / state-machine config API forces `as const` at every
call site, and one omission silently degrades types to `string[]` with no error. `const T` moves
correctness from convention into the signature.

> 🔴 **Gotcha:** `const T` affects **inference at the call site only**. It does nothing if the caller
> passes an already-widened variable — `const arr = ["a","b"]; pick(arr)` is still `string[]`,
> because the widening happened before the call.

---

### `isolatedDeclarations` conflicts with `satisfies` on exports

Both are widely recommended and they collide:

```ts
export const cfg = { a: { url: "x" } } satisfies Cfg;
// TS9010: Variable must have an explicit type annotation with --isolatedDeclarations.
export const got = pick(["a", "b"]);
// TS9010: Variable must have an explicit type annotation with --isolatedDeclarations.
```

`isolatedDeclarations` requires every export's `.d.ts` to be derivable from that file alone,
syntactically — which is what lets tools emit declarations in parallel without a type checker. Both
`satisfies` and inferred generic returns require *inference*, so they're rejected at exported
positions.

> 🟡 **Optimization (libraries only)** — `isolatedDeclarations` speeds up `.d.ts` emit and forces a
> stable API surface.
>
> **Pros:** parallel, checker-free declaration emit; every exported type is spelled out, so the
> public API can't silently drift. **Cons:** you lose `satisfies` and inferred generic returns at
> every exported position (TS9010), forcing explicit annotations everywhere. **When NOT to use it:**
> application code — the emit speed is irrelevant and the lost inference is pure friction.

**Practical:** `isolatedDeclarations` is a **library** feature (fast `.d.ts` emit, forced API
stability). If you adopt it you lose ergonomic inference on exported consts. Apps generally shouldn't
bother.

---

### Branded / nominal types at boundaries

> 🟡 **Optimization** — brand identifiers and units only where structural sameness actually causes
> bugs. It buys real safety but adds a validating constructor and a re-entry point at every boundary.
>
> **Pros:** turns invisible `getUser(orderId)` mix-ups into compile errors, at zero runtime cost.
> **Cons:** every value must pass through a constructor; brands don't survive `JSON.parse`, so every
> boundary needs re-validation; the `Brand<T,B>` machinery is unfamiliar to readers.
> **When NOT to use it:** a codebase where the ID types rarely cross, or where a schema validator
> already owns the boundary — don't brand every `string` reflexively.

**Rule:** brand identifiers and units that are structurally identical but semantically distinct.
**Why:** TS is structural — `UserId`, `OrderId`, and `string` are the *same type*, so every
`getUser(orderId)` bug is invisible.

```ts
// BAD — compiles, wrong, reaches production constantly
type UserId = string;
type OrderId = string;
declare function getUser(id: UserId): User;
declare const orderId: OrderId;
getUser(orderId);   // no error — aliases are nicknames, not types
```

```ts
// GOOD
declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

type UserId  = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;

// The ONLY way in is a validating constructor — the brand is unforgeable outside it.
function toUserId(s: string): UserId {
  if (!/^u_[0-9a-f]{8}$/.test(s)) throw new Error(`bad UserId: ${s}`);
  return s as UserId;   // legit `as`: the runtime check just proved it
}
getUser(orderId);       // error: 'OrderId' is not assignable to 'UserId'
```

The brand is **type-only** — zero runtime cost; `UserId` is still a real `string` (works as an object
key, in JSON, in URLs). Use `unique symbol` rather than a string key like `__brand` so the property
is genuinely unforgeable.

> **Gotcha:** brands do not survive `JSON.parse` — re-entry must go through the validator. That's the
> point, but it means brands only pay off if you brand *at the boundary*.

---

### Template literal types — where they earn their keep

**Rule:** use them for real string grammars you already have; don't invent grammars to show off.

```ts
type Method = "GET" | "POST";
type Route  = `/${string}`;
type Endpoint = `${Method} ${Route}`;         // "GET /users" | …

// Deriving handler names from a single source of truth
type Events = "click" | "focus";
type Handlers = { [K in Events as `on${Capitalize<K>}`]: () => void };
// → { onClick: () => void; onFocus: () => void }
```

The genuine win is one source of truth: add `"blur"` to `Events` and `onBlur` becomes required
everywhere automatically.

> 🔴 **Gotcha — where it bites:** template literal types over unions are **combinatorial**. `${A}-${B}-${C}` with
> 100 members each = 1,000,000 union members. TS caps union size (widely documented at ~100,000
> members — *medium confidence on the exact figure*) and errors with "Expression produces a union
> type that is too complex to represent." The failure hits in CI, not on your laptop, when someone
> adds the Nth member to an enum-ish union. Don't parse a DSL in the type system.

---

### Type guards & assertion functions

> 🔴 **Advanced / trap** — a hand-written type predicate (`x is User`) is a claim TS believes
> unconditionally; a wrong one is a silent lie that crashes downstream. Prefer a schema validator
> that *derives* the type; reach for a hand-written guard knowingly, as a last resort.

**Rule:** a hand-written type predicate is an **unchecked promise** — TS believes it unconditionally.
Prefer inference/validators; when you must write one, treat it as security-critical.

```ts
// BAD — a predicate that lies
function isUser(x: unknown): x is User {
  return typeof x === "object" && x !== null;   // claims far more than it checks
}
if (isUser(data)) data.email.toLowerCase();     // typechecks; crashes

// GOOD — checks match the claim exactly
function isUser(x: unknown): x is User {
  return typeof x === "object" && x !== null &&
    "email" in x && typeof (x as { email: unknown }).email === "string";
}
```

> 🔴 **Gotcha that bites:** assertion functions **require an explicit type annotation on the
> declaration**. This fails with the famously opaque `TS2775: Assertions require every name in the
> call target to be declared with an explicit type annotation`:
> ```ts
> const assertUser = (x: unknown): asserts x is User => { /* … */ };  // breaks
> ```
> Fix: use a `function` declaration, or annotate the const explicitly
> (`const assertUser: (x: unknown) => asserts x is User = …`). Assertion control-flow effects must be
> knowable without inference.

Prefer, in order: (1) narrowing TS already understands (`typeof`, `in`, `instanceof`, discriminants),
(2) a schema validator that *derives* the type (`z.infer`), (3) a hand-written predicate as last
resort. Option (2) inverts the trust — the type comes from the validator, so they cannot disagree.

---

### Generics that earn their keep

> 🟢 **Best practice** — a type parameter must appear **at least twice** (relating input to output);
> a `T` used only in the return position is an `as` in disguise, not real generic safety.

**Rule:** a type parameter must appear **at least twice** — otherwise it's doing nothing.

```ts
// BAD — T appears once. This is `any` with extra steps and a false sense of rigor.
function parse<T>(json: string): T { return JSON.parse(json); }
const u = parse<User>(raw);   // unvalidated assertion in a generic costume
```

`T` only in the return position means the caller *chooses* `T` and nothing verifies it — an `as` in
disguise.

```ts
// GOOD — T relates input to output; that relationship is the whole value
function pluck<T, K extends keyof T>(items: readonly T[], key: K): T[K][] {
  return items.map(i => i[key]);
}
```

**Generic-soup smell:** 4+ params, constraints referencing each other, conditional types resolving to
conditional types. The cost is real — type-check time, unreadable 40-line errors, broken IntelliSense.
Write the concrete version first; generalize only on the third duplication.

---

### Utility types with sharp edges

> 🔴 **Gotchas** — most utility types are fine and boring, but a few fail *open* (they accept typos
> or silently change your type). Know these before you lean on them.

Fine and boring: `Partial`, `Required`, `Readonly`, `Pick`, `Omit`, `Record`, `ReturnType`,
`Awaited`, `NoInfer`. The traps worth teaching:

- **`Omit` is not key-checked.** `Omit<User, "emial">` — typo — compiles silently and omits nothing;
  it fails *open*. (`Pick`/`Exclude` *do* constrain.) Guard it:
  ```ts
  type StrictOmit<T, K extends keyof T> = Omit<T, K>;   // now typos error
  ```
- **`Omit` destroys unions.** `Omit<A | B, "k">` collapses to one object type, obliterating a
  discriminated union. Use a distributive variant:
  ```ts
  type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
  ```
- **`Partial` is not "safe defaults."** It makes *every* field optional, including ones your code
  requires, pushing failures to runtime; it pairs badly with `exactOptionalPropertyTypes`.
- **`Readonly` is shallow and type-only.** It does not freeze; nested objects stay mutable. Don't
  confuse it with `Object.freeze`.
- **`Function` / `object` / `Object` as types.** `Function` accepts any signature and returns `any`
  when called. Use `(...args: never[]) => unknown` or a real signature.

---

### Recommended baseline tsconfig (TS 7.0)

```jsonc
{
  "compilerOptions": {
    // strict: true is the DEFAULT in TS 6+ — do NOT write "strict": false.
    // target defaults to es2025; module/moduleResolution per environment.

    // NOT implied by strict — all default false. The real opt-in value.
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "verbatimModuleSyntax": true,

    // Pick per environment:
    "moduleResolution": "bundler",   // or "nodenext" if Node runs the output
    "module": "esnext",

    // Required now that @types no longer auto-load.
    "types": ["node"],

    // If a non-tsc tool strips your types (esbuild / swc / Bun / node --strip-types):
    // "erasableSyntaxOnly": true,
    // "isolatedModules": true,

    // Libraries shipping .d.ts only — conflicts with `satisfies` on exports:
    // "isolatedDeclarations": true
  }
}
```

---

### Migration checklist (6.x → 7.0)

1. **Audit compiler-API consumers first** — `vue-tsc`, Angular, `ts-jest`, `ts-loader`, custom
   transformers, `@typescript-eslint` type-aware rules. The root export now exposes only
   `{ version, versionMajorMinor }`; this is a hard blocker. Do this before anything else.
2. Replace `moduleResolution: node|node10` → `bundler`/`nodenext` (TS5108 fires before any file is
   checked).
3. Add an explicit `types: [...]` — expect a wave of missing-global errors.
4. Remove `target: es5`, `downlevelIteration`, `outFile`, and `module: amd|umd|system`.
5. Any `"strict": false` is now load-bearing — deleting it *enables* strict.
6. Consider running 6.0 with `--stableTypeOrdering` first to surface `.d.ts` diffs *(medium
   confidence)*; use `@typescript/typescript6` (`tsc6`) for side-by-side if blocked *(medium
   confidence)*.

---

### Sources

Primary:
- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ — 7.0 GA, 2026-07-08
- https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/ — 6.0 defaults & deprecations
- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/ — RC, 2026-06-18
- https://github.com/microsoft/typescript-go — Go port; `tsgo` vs `tsc` naming; API status
- https://github.com/microsoft/TypeScript/releases — release tags
- https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html
- https://www.typescriptlang.org/tsconfig/ — option reference

Empirical (strongest evidence here):
- `npm view typescript dist-tags/time --json` → `latest: 7.0.2`, published 2026-07-08
- Local `typescript@7.0.2` install: `tsc --version`, `tsc --all`, `tsc --noEmit` probes, emitted
  `.js`/`.d.ts`, `require('typescript')` inspection, `package.json` `exports`/`bin`
- `npm create vite@latest -- --template react-ts` generated `package.json` and `tsconfig.app.json`

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
