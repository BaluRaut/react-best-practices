---
name: javascript
description: "Use for any modern JavaScript work — language features, async, immutability, error handling, performance, or naming/code conventions. A consolidated best-practices reference: ES2020–2024 features, promise combinators, AbortSignal, throw-vs-Result error handling, measured performance (loops, hot paths, benchmarking), and the Google/Airbnb conventions."
metadata:
  source: https://baluraut.github.io/frontend-best-practices
---

# JavaScript — Best Practices (consolidated)

A single-file, version-verified JavaScript reference, consolidated from [baluraut.github.io/frontend-best-practices](https://baluraut.github.io/frontend-best-practices/). Every rule is labelled 🟢 best practice / 🟡 optimization / 🔴 advanced-gotcha, with bad-vs-good examples and a "when not to". These are guidelines and trade-offs, not laws.

## Contents

- [Modern JavaScript for React Apps (ES2020 → mid-2026)](#modern-javascript-for-react-apps-es2020-mid-2026)
- [Error Handling (JS/TS)](#error-handling-jsts)
- [Performance Craft (JavaScript & TypeScript)](#performance-craft-javascript-typescript)
- [Naming & Code Conventions](#naming-code-conventions)

---

## Modern JavaScript for React Apps (ES2020 → mid-2026)

The language moved a lot between the last time most codebases were written and today. This page covers the modern JS worth reaching for in a React app, the traps each feature hides, and — critically — the gap between *"it's in the spec"* and *"you can actually ship it."* Every YES/no below was executed on **Node v24.16.0 / V8 13.6**, not recalled from memory.

The recurring theme: **the spec-edition year is not the ship year, and "Stage 4" is not "available."** Feature-probe; don't trust the edition label.

### `??` vs `||` — the falsy-fallback bug

This is the single highest-frequency production bug in this whole page, so it goes first.

- `||` falls back on **every falsy value**: `0`, `''`, `false`, `NaN`, `null`, `undefined`.
- `??` falls back **only on `null` / `undefined`**.

The rule: **default to `??`. Reach for `||` deliberately, and comment it when you do.** The failure `||` causes is that a caller who explicitly passed `0`, `''`, or `false` gets silently overridden — the config they set is ignored, and nothing errors.

> 🟢 **Best practice** — default to `??` for fallbacks. This is a correctness rule, not a style preference: `||` conflates "absent" with "falsy," and the bug is silent. It costs nothing to prefer `??`.

```js
// ❌ BAD — realistic and wrong
function createClient(opts = {}) {
  return {
    retries:   opts.retries   || 3,      // 0  -> 3     "never retry" becomes retry 3x
    timeoutMs: opts.timeoutMs || 5000,   // 0  -> 5000  "no timeout" becomes 5s
    prefix:    opts.prefix    || 'api',  // '' -> 'api' "no prefix" ignored
    debug:     opts.debug     || true,   // false -> true  debug can NEVER be turned off
  };
}
```

`debug: false || true` evaluates to `true`. The flag is physically unturnoffable — no amount of passing `false` will disable it.

```js
// ✅ GOOD
function createClient(opts = {}) {
  return {
    retries:   opts.retries   ?? 3,
    timeoutMs: opts.timeoutMs ?? 5000,
    prefix:    opts.prefix    ?? 'api',
    debug:     opts.debug     ?? true,
  };
}
```

`||` is still correct when an empty string or `0` genuinely *should* mean "absent":

```js
const name = input.trim() || 'Anonymous';   // '' really does mean "no name given"
```

> **Syntax gotcha.** `a ?? b || c` is a **SyntaxError**. Mixing `??` with `||` or `&&` requires explicit parentheses — `(a ?? b) || c` — because the precedence is genuinely ambiguous and the spec refuses to guess. This is a feature: it forces you to say what you meant.

#### The React `&&` render trap

Same falsy family, different symptom. `&&` returns its left operand when that operand is falsy, and **React renders `0` as visible text** (it only skips `false`, `null`, and `undefined`).

```jsx
{items.length && <List items={items} />}    // ❌ renders a literal "0" when the list is empty
{items.length > 0 && <List items={items} />} // ✅ the condition is a real boolean
```

The rule: **the left side of `&&` in JSX must be a boolean.** Never gate JSX on `.length` or any number directly.

> 🟢 **Best practice** — coerce the left operand of `&&` to a real boolean. The reason is what React actually [commits](fundamentals#render-vs-commit): it skips `false`/`null`/`undefined` but renders `0` as a text node, so a bare number leaks a stray "0" into the DOM.

### Immutable array methods (ES2023, universally Baseline)

`toSorted`, `toReversed`, `toSpliced`, `with`, and `at` are the copying counterparts of the mutating array methods. All Baseline, all present in Node 24. In React they matter because `.sort()` and `.reverse()` **mutate in place** — they reorder your state array, leave the reference unchanged, and the component never re-renders.

```js
// ❌ BAD — .sort() mutates state; same reference in, no re-render, and now state is reordered too
const sorted = users.sort((a, b) => a.age - b.age);

// ✅ GOOD — new array, new reference, React re-renders
const sorted = users.toSorted((a, b) => a.age - b.age);
```

> 🟢 **Best practice** — use the copying methods (`toSorted`, `toReversed`, `toSpliced`, `with`) on React state. This is a correctness rule tied to [reconciliation](fundamentals#reconciliation): React bails out when a state value is the same reference, so an in-place `.sort()` both fails to re-render *and* silently reorders the array you already committed.

> **`toSorted` did NOT fix the 1990s default comparator.** With no comparator it is *still* a string sort, exactly like `sort()`. People assume the shiny new method fixed both problems. It only fixed mutation.
>
> ```js
> [10, 9, 1].toSorted()                // => [1, 10, 9]   ❌ lexicographic
> [10, 9, 1].toSorted((a, b) => a - b) // => [1, 9, 10]   ✅
> ```
> Always pass a comparator.

`with(i, v)` replaces one index immutably, retiring the `[...arr.slice(0, i), v, ...arr.slice(i + 1)]` dance:

```js
const next = row.with(2, 'updated');   // row unchanged; next is a new array
```

`at(-1)` reads from the end: `[1, 2, 3].at(-1) === 3`.

### Cloning: `structuredClone` vs JSON round-trip vs spread

`structuredClone` is a global (browser + Node) that deep-clones by the structured clone algorithm. It is genuinely better than `JSON.parse(JSON.stringify(x))` for plain data — but it is **not** a general-purpose deep-copy.

| | spread `{...o}` | `JSON.parse(JSON.stringify(o))` | `structuredClone(o)` |
|---|---|---|---|
| Depth | shallow only | deep | deep |
| Cycles | n/a | **throws TypeError** | OK |
| `Date` | shared ref | → string | **Date preserved** |
| `Map` / `Set` / `RegExp` | shared ref | → `{}` / lost | **preserved** |
| `undefined` / functions | kept / kept | **dropped** | `undefined` kept; **function → DataCloneError** |
| Class prototype | kept | lost | **lost** |
| `BigInt` | kept | **throws TypeError** | preserved |

> **`structuredClone` is not a drop-in deep clone. Three ways it bites in production:**
> 1. **It silently strips class prototypes.** You get a plain object with the right *data* and no *methods*. The failure surfaces far from the clone site, as `x.greet is not a function`.
> 2. **It throws `DataCloneError` on functions** — and therefore on anything holding a callback, a `Proxy`, a class instance with a method-valued own property, or a React element / fiber. Cloning props or state that contain an `onClick` handler is a hard throw.
> 3. **Getters are evaluated** and turned into plain data values during the clone.

```js
class User { constructor(n) { this.name = n; } greet() { return 'hi'; } }
const u = structuredClone(new User('a'));
u.constructor.name // 'Object'    <- prototype gone
u.greet            // undefined   <- method gone; TypeError at the call site
```

#### The React shallow-spread trap

Spread copies **one level**. A nested object is shared, so mutating it mutates the original and React sees no reference change:

```js
// ❌ nested object is SHARED
const next = { ...state };
next.filters.tag = 'new';   // also mutated state.filters -> no re-render

// ✅ spread at every level you touch
const next = { ...state, filters: { ...state.filters, tag: 'new' } };
```

**Recommendation:** prefer immutable updates (spread at each level, or a helper like Immer) over deep cloning in React state. Use `structuredClone` for *plain data only* — cache snapshots, worker messages, IndexedDB values. It is not a serializer and not an object copier.

> 🔴 **Advanced / gotcha** — `structuredClone` is a sharp tool, not a general deep-copy. It strips prototypes, throws `DataCloneError` on anything holding a function (props with an `onClick`, a class instance, a React element), and evaluates getters into plain values. Reach for it knowingly, only on plain data.
>
> **Tradeoffs.** Pros: true deep clone of cyclic data, preserves `Date`/`Map`/`Set`/`RegExp`/`BigInt` that JSON destroys. Cons: silently drops methods and prototypes; hard-throws on callbacks; no way to customize what transfers. **When NOT to use it:** anything that will later be called as a method, any React state/props tree, any value carrying behavior — use per-level spread or Immer instead.

### `Object.groupBy` / `Map.groupBy`

Partition a collection by a key function. Use `Object.groupBy` for string keys; `Map.groupBy` when the key is an object or number and you need identity.

```js
const byStatus = Object.groupBy(orders, o => o.status);   // { pending: [...], shipped: [...] }
const byUser   = Map.groupBy(orders, o => o.user);        // Map keyed by the actual user objects
```

> **`Object.groupBy` returns a null-prototype object.** This is deliberate — it stops user-controlled keys from injecting via `__proto__` — but it breaks the methods you inherit from `Object.prototype`:
> ```js
> const g = Object.groupBy([{ t: 'a' }], x => x.t);
> Object.getPrototypeOf(g)  // null
> g.hasOwnProperty          // undefined  -> TypeError if you call g.hasOwnProperty(k)
> ```
> Use `Object.hasOwn(g, k)` or `k in g`. Some deep-equal and serialization helpers also choke on null-proto objects.

Keys are coerced to strings in `Object.groupBy`; switch to `Map.groupBy` when the key's identity matters.

### Promise combinators and the real unhandled-rejection trap

#### The claim that is FALSE

Widely repeated: *"`Promise.all` rejects on the first error, so the later rejections become unhandled rejections and crash Node."* **This is wrong**, and it was verified wrong. `Promise.all` attaches handlers to **every** input promise immediately. When a later one rejects, the rejection is *handled* — and silently swallowed. No `unhandledRejection` fires.

The real problem with `Promise.all` is therefore **observability, not a crash**: an error happened, and you will never see it in your logs. Use `Promise.allSettled` when every outcome matters.

#### The trap that is REAL

An unhandled rejection fires when a promise is **created eagerly** but nothing is attached to it *at the time it rejects*:

```js
// ❌ REAL TRAP — sequential await of eagerly-created promises
const p1 = fetchUser(), p2 = fetchOrders();   // both start NOW
await p1;   // if p1 throws, we leave this block...
await p2;   // ...and never reach here. p2 rejects with NO handler attached.
// -> genuine unhandled rejection
```

In Node ≥ 15 an unhandled rejection **exits the process by default**. This pattern is a real crash. The fix is to hand both promises to a combinator immediately, which attaches handlers to both:

```js
// ✅ Promise.all attaches a handler to p2 right away
const [user, orders] = await Promise.all([fetchUser(), fetchOrders()]);
```

> 🟢 **Best practice** — never sequentially `await` two eagerly-created promises. This is a correctness rule: it removes the genuine unhandled-rejection crash above by attaching a handler to every promise the moment it exists.

Handing independent requests to `Promise.all` is also just faster, because they run concurrently instead of end-to-end. Three independent requests, awaited in turn vs. together, **measured on a small reproduction (React 19, jsdom); your numbers will differ in production**:

| Strategy | Wall time |
|---|---|
| `await` each in turn | 604 ms |
| `await Promise.all([...])` | 221 ms |

The parallel time is roughly the single slowest request; the sequential time is the sum.

> 🟡 **Optimization** — parallelize *independent* requests. **Tradeoffs.** Pros: wall time collapses to the slowest request, not the sum. Cons: all requests fire at once (more peak load), and `Promise.all` rejects on the first failure. **When NOT to use it:** when request B needs A's result — then they *must* stay sequential — or when you want every outcome regardless of failures, where `allSettled` is the right combinator.

#### Choosing a combinator

| | resolves when | rejects when | use for |
|---|---|---|---|
| `all` | all fulfil | **first** rejection (loser errors swallowed) | all-or-nothing; fail fast |
| `allSettled` | **always** | never | independent tasks; you want every outcome |
| `any` | **first** fulfil | all reject → `AggregateError` | racing redundant sources |
| `race` | first settle (either) | first settle if it's a rejection | timeouts |

`Promise.any` rejects with an `AggregateError` whose `.message` is `'All promises were rejected'` and whose individual errors live on **`.errors`** (an array) — *not* `.cause`. People log the useless generic message and miss `.errors`.

`Promise.allSettled` — the result shape people get wrong is `.value` vs `.reason`:

```js
const results = await Promise.allSettled(tasks);
const ok   = results.filter(r => r.status === 'fulfilled').map(r => r.value);
const errs = results.filter(r => r.status === 'rejected').map(r => r.reason);
```

`Promise.try` (ES2025, in Node 24) runs a possibly-synchronous, possibly-throwing function inside a promise chain, so a **synchronous** throw becomes a rejection instead of escaping your `.catch`:

```js
Promise.try(() => mayThrowSynchronously()).catch(handle);
```

`Promise.withResolvers` (ES2024, in Node 24) retires the `let resolve;` closure dance for bridging event-based APIs into a promise:

```js
const { promise, resolve, reject } = Promise.withResolvers();
socket.on('message', resolve);
socket.on('error', reject);
await promise;
```

### `Error` cause and `Error.isError`

When you catch and re-throw, **preserve the chain** with the `cause` option. Do *not* interpolate the original message into a new string — that destroys the stack, the cause, `err.code`, and any custom fields.

```js
// ❌ BAD — throws away everything but a substring
try { await db.query(sql); }
catch (err) { throw new Error('failed: ' + err.message); }

// ✅ GOOD — the original error survives as err.cause
try { await db.query(sql); }
catch (err) { throw new Error(`failed to load user ${id}`, { cause: err }); }
```

Node's `console.error` and `util.inspect` print the full `[cause]` chain automatically.

> 🟢 **Best practice** — re-throw with `{ cause }`. Interpolating `err.message` into a new string is lossy: it discards the stack, the original `cause`, `err.code`, and any custom fields, leaving you a substring where you needed the whole error.

`Error.isError(x)` (ES2026, verified in Node 24) exists for one real reason: `x instanceof Error` **returns `false`** for an Error thrown across a realm boundary — an iframe, a `vm` context, a worker. `Error.isError` gets it right across realms, and is also not fooled by a `{ name: 'Error', message: 'x' }` duck-type.

### `AbortController` / `AbortSignal` — cancellation

`AbortSignal.timeout(ms)` and `AbortSignal.any([...])` are both in Node 24. Combine a user-cancel with a deadline in one signal:

```js
const controller = new AbortController();
const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
const res = await fetch(url, { signal });
```

The canonical React effect uses it for cleanup:

```jsx
useEffect(() => {
  const c = new AbortController();
  fetch(url, { signal: c.signal })
    .then(r => r.json()).then(setData)
    .catch(e => { if (e.name !== 'AbortError') setError(e); });
  return () => c.abort();
}, [url]);
```

The real reason to abort on cleanup is not the (React 18+ non-existent) "setState on unmounted component" warning — it's the **race**: without it, a slow earlier response can land *after* a fast later one and overwrite the correct data.

> 🟢 **Best practice** — abort in-flight fetches from the effect's cleanup. The effect re-runs whenever [the dependency array](fundamentals#dependency-arrays) changes (here `[url]`), so each run must cancel the previous request or a stale response can win the race and clobber current state.

> **Four abort gotchas:**
> 1. **A timeout and a user-cancel reject differently.** `AbortSignal.timeout()` rejects with a `TimeoutError` `DOMException`; `controller.abort()` gives an `AbortError`. Distinguish them — a timeout is retryable, a user cancel is not.
> 2. **Never report an abort as an error.** `if (err.name === 'AbortError') return;` — otherwise every navigation-away spams your error tracker.
> 3. **`AbortSignal.any` retains its sources.** The composite signal holds references to every source signal. A long-lived source plus many short-lived composites built in a loop leaks listeners. Fine at request scope; don't build them in a hot loop against a page-lifetime signal.
> 4. Feature-detect on old targets — but on a React 19 stack, `AbortSignal.timeout` / `any` are safe.

### Iterator helpers (ES2025, in Node 24)

Lazy `map` / `filter` / `take` / `drop` / `flatMap` on iterators. They stream — no intermediate arrays — and can stop early:

```js
// stops reading after 10 matches; never materializes the whole set
const firstTen = users.values()
  .filter(u => u.active)
  .map(u => u.email)
  .take(10)
  .toArray();
```

versus `users.filter(...).map(...).slice(0, 10)`, which builds two full intermediate arrays before slicing.

> 🟡 **Optimization** — iterator helpers over chained array methods. **Tradeoffs.** Pros: no intermediate arrays, and `take`/early-return can stop before consuming the whole source — a real win over a large or expensive-to-produce collection. Cons: the chain is single-use (see gotchas), less familiar than array methods, and requires a `.values()` hop off a bare array. **When NOT to use it:** small collections or when you need the result more than once — a plain array chain is clearer and re-iterable, and the allocation it saves is noise at that size.

> **Iterator gotchas:**
> 1. **Iterators are single-use.** Reusing a helper chain silently yields `[]` the second time — no error. Arrays are re-iterable; iterators are not.
> 2. The helpers live on `Iterator.prototype`, so they work on generators, `Map#entries()`, `Set#values()`, and `NodeList` — but **not on a bare array**. Call `.values()` first.
> 3. `Iterator.range` is **not** finished (probe: absent). Don't reach for it.

### Logical assignment operators (ES2021)

```js
opts.retries ??= 3;          // assign only if null/undefined  ✅
cache[key]   ??= expensive();// RHS short-circuits — expensive() runs only on a cache miss
opts.debug   ||= true;       // ❌ same falsy bug as || — sets debug when it was false
```

> **These short-circuit the *assignment*, not just the value.** `obj.x ||= v` performs no write at all when `obj.x` is already truthy — distinct from `obj.x = obj.x || v`, which always writes. That difference matters for setters and for `Proxy` / reactivity traps: no write means no reactive trigger fires.

### Top-level `await`

Works in ESM (verified). It has two real costs:

1. **It makes your module async**, which makes it `require()`-incompatible *forever* — see the ESM/CJS section below.
2. **It blocks the importer graph.** A top-level `await` in a leaf module delays every module that imports it. In a Vite SPA that is shipped-but-stalled JavaScript sitting in front of first paint.

Top-level `await` is fine in app entrypoints and build scripts. **Avoid it in shared libraries.**

> 🔴 **Advanced / gotcha** — top-level `await` is a one-way door for a published module: it makes the module async, which makes it `require()`-incompatible *graph-wide* (see below), and it blocks every importer's first paint in a Vite SPA. Use it knowingly in an entrypoint; keep it out of anything others import.

### ESM vs CommonJS in 2026 — `require(esm)` landed unflagged

You can now `require()` an ES module from CommonJS with no flag. Verified on Node v24.16.0:

```js
process.features.require_module   // => true  (no flag)
```

```js
// package.json: { "type": "commonjs" }
// m.mjs -> export const hello = 'from-esm'; export default 42;
const m = require('./m.mjs');   // WORKS, no flag, no warning
m.hello    // 'from-esm'
m.default  // 42   <- note: the default export is NOT unwrapped
```

History: `--experimental-require-module` was unflagged by default in **Node 22.12.0** (medium-confidence — sourced from the Node release blog; the 24.x end-state is what was verified first-hand). Node 24 has it on by default.

This is an **interop bridge**, not a blessing to stay on CJS. Node's stance is that ESM is the go-forward format; `require(esm)` exists so library authors can ship ESM without stranding CJS consumers.

> **The gotcha that breaks builds: top-level await is a hard wall.**
> ```js
> // tla.mjs
> await new Promise(r => setTimeout(r, 1));
> export const v = 'x';
> ```
> ```js
> require('./tla.mjs')
> // throws: ERR_REQUIRE_ASYNC_MODULE
> // "require() cannot be used on an ESM graph with top-level await. Use import() instead."
> ```
> This is **graph-wide.** One transitive dependency adding top-level await breaks *every* CJS consumer of your package — a semver-*minor* bump in a dep can break your build. Debug with `--experimental-print-required-tla`. If you publish a library, keep top-level await out of your public module graph, and prefer the `"module-sync"` exports condition to serve one graph to both `require` and `import`.

### The spec-year trap: what actually shipped

The recurring failure across all of this is trusting the spec-edition label. **The year in the TC39 table is the spec-*edition* year, not the ship year.** Engines ship Stage 3/4 features years before the edition is published; and conversely, being "in ES2026" does *not* mean it's in your runtime.

**ES2025 — all shipped, all in Node 24 (probed YES):** `RegExp.escape`, `Float16Array` + `Math.f16round`, `Promise.try`, sync iterator helpers, JSON modules, import attributes, RegExp modifiers, the new Set methods (`union` / `intersection` / …), duplicate named capture groups.

**ES2026 — Stage 4, but ship state is uneven. This is the trap:**

| Feature | Node 24.16.0 |
|---|---|
| `Array.fromAsync` | **YES** |
| `Error.isError` | **YES** |
| `Uint8Array.fromBase64` / `toBase64` | **no** |
| `Math.sumPrecise` | **no** |
| `Map.prototype.getOrInsert` (upsert) | **no** |

> **"Stage 4" and "in ES2026" do NOT mean you can use it.** Three of the ES2026 features above are absent from the current Node LTS-line runtime. Always feature-probe; never trust the edition year.

**ES2027 — Stage 4, publication year 2027, but availability is all over the map:**

- **Explicit Resource Management** (`Symbol.dispose`, `using`, `DisposableStack`) — **already in Node 24**, despite the "2027" label.
- **`Atomics.pause`** — already in Node 24.
- **Temporal** — **absent** from Node 24 (see below).

So "ES2027" tells you nothing about availability in either direction. Probe.

**Not yet finished — do NOT assert as available:** `Iterator.range`, `AsyncContext` (both probed absent).

### Temporal — do not use it unpolyfilled in mid-2026

Temporal is the most-misreported item in this space, so pin it down precisely:

| Question | Answer | Evidence |
|---|---|---|
| Stage? | **Stage 4 (finished)** | TC39 `finished-proposals.md` |
| Spec edition? | **ES2027** — *not* ES2026 | TC39 table, publication-year column = 2027 |
| Baseline? | **No — "Limited availability"** | MDN, verbatim: *"This feature is not Baseline because it does not work in some of the most widely-used browsers."* |
| In Node 24.16.0? | **No.** `typeof Temporal === 'undefined'`, and no flag enables it | probe |

Browser reality (medium confidence — caniuse and secondary sources): Firefox 139+ shipped first (~May 2025), Chrome 144+ / Edge 144+ (~Jan 2026). **Safari has not shipped it** — which is precisely why Temporal is not Baseline. caniuse coverage ≈ 69%.

> **Correction to a widely-repeated claim.** Multiple 2026 blog posts assert *"Temporal reached Stage 4 and is part of ES2026."* The primary TC39 table says publication year **2027**. Those posts conflate *Stage 4* with *shipped in the next edition*. Do not repeat the ES2026 claim.

**Practical guidance:** Temporal is **not** usable unpolyfilled in a browser SPA in mid-2026 — Safari users get a hard `ReferenceError`. If you need it, use a polyfill (`temporal-polyfill`, ~20 KB gz, or `@js-temporal/polyfill`, ~56 KB gz). The "date-fns / Moment are now unnecessary" genre of post is **premature by at least one Safari cycle**. We do not assert any "Node 26 ships Temporal unflagged" claim — that came from a single low-quality source and is unverified.

### Checklist

- Default to `??` and `?.`; treat `||` as a deliberate, commented choice.
- Gate JSX with a real boolean (`items.length > 0 &&`), never a bare number.
- Use immutable array methods (`toSorted`, `with`, …) for React state — and always pass `toSorted` a comparator.
- Never `structuredClone` anything holding methods, callbacks, or class instances.
- Spread every nested level you mutate; shallow spread shares references.
- Never sequentially `await` two eagerly-created promises — hand them to `Promise.all`.
- `Promise.all` swallows loser errors; use `allSettled` when every outcome matters. Read `AggregateError.errors`, not `.cause`.
- Always re-throw with `{ cause }`.
- Ignore `AbortError`; distinguish `TimeoutError`.
- Keep top-level `await` out of shared libraries — it makes them `require()`-incompatible graph-wide.
- Feature-probe ES2026/ES2027 items; the edition year is not the ship year. Temporal is not Baseline — polyfill or skip it.

### Sources

- TC39 finished proposals (Stage 4, publication years): https://github.com/tc39/proposals/blob/main/finished-proposals.md
- MDN, Temporal (Baseline status, verbatim "Limited availability"): https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal
- MDN, `structuredClone`: https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone
- MDN, Nullish coalescing operator (`??`): https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing
- MDN, `Object.groupBy`: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/groupBy
- MDN, `AbortSignal` (`.timeout`, `.any`): https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
- MDN, Iterator helpers: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Iterator
- MDN, `Promise.withResolvers` / `Promise.try`: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
- Node.js, `require(esm)` / `process.features.require_module`: https://nodejs.org/api/modules.html#loading-ecmascript-modules-using-require

---

## Error Handling (JS/TS)

The feature pages tell you what the language *has*; this one is about the discipline no single feature
teaches — deciding what to throw, what to return, what to type, and where a failure is allowed to stop.
Most "flaky" front ends are not flaky; they're unhandled error paths that only run in production.

The one rule under all the others: **an error is data about a failure, and it deserves the same care as
your success data.** A caught error you don't inspect, a rejection you don't await, a `catch (e)` that
swallows — each is a decision to ship a bug you can't see.

---

### `throw` vs return a `Result`

Two honest strategies, and the mistake is mixing them without deciding.

**Throw** for the *exceptional* — the programmer error, the truly-unexpected, the thing no caller can
sensibly recover from at this layer. It unwinds the stack to whoever can handle it.

**Return a `Result`** for the *expected* — validation failures, "not found", a payment declined. These
aren't exceptional; they're outcomes. Encoding them in the return type makes the caller handle them,
and TypeScript enforces it.

```ts
// A minimal typed Result — no library needed.
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }

async function findUser(id: string): Promise<Result<User, 'not-found' | 'network'>> {
  const res = await fetch(`/api/users/${id}`).catch(() => null)
  if (!res) return { ok: false, error: 'network' }
  if (res.status === 404) return { ok: false, error: 'not-found' }
  return { ok: true, value: await res.json() }
}

const r = await findUser(id)
if (!r.ok) return renderError(r.error)   // TS forces you to handle it before .value exists
use(r.value)
```

> 🟢 **Best practice** — model *expected* failures as values (a `Result` or a discriminated union), and
> reserve `throw` for the genuinely exceptional. The test: would a reasonable caller want to branch on
> this? If yes, it's a return value, not an exception. This is the single biggest lever on front-end
> resilience — it turns "forgot to catch" into a compile error.

> 🟡 **Optimization** — a `Result` type adds ceremony at every call site. **When NOT to:** for deep call
> chains where the error only matters at the top, threading `Result` through ten layers is noise — throw
> and catch once at the boundary. Use `Result` where the *immediate* caller decides; use `throw` where a
> *distant* caller decides. Don't dogmatically pick one for the whole codebase.

---

### Type your errors; stop throwing strings

`throw 'failed'` throws a string with no stack trace. Throw `Error` subclasses so `instanceof` narrows
and the failure carries structured data.

```ts
// 🔴 A string error: no stack, no type, no data. catch (e) sees `unknown`.
throw 'Payment failed'

// 🟢 A typed error hierarchy: narrows with instanceof, carries context.
class AppError extends Error {
  constructor(message: string, readonly code: string, options?: ErrorOptions) {
    super(message, options)
    this.name = new.target.name   // so the name is the subclass, not "Error"
  }
}
class PaymentError extends AppError {
  constructor(readonly declineCode: string, options?: ErrorOptions) {
    super('Payment failed', 'payment_failed', options)
  }
}

try { await charge(card) }
catch (e) {
  if (e instanceof PaymentError) showDecline(e.declineCode)   // narrowed, typed
  else throw e                                                // not ours — rethrow
}
```

> 🟢 **Best practice** — subclass `Error`, set `this.name = new.target.name`, and attach the structured
> fields the handler needs (a `code`, an HTTP status, the offending input). `instanceof` then gives you
> exhaustive, typed handling instead of string-matching `e.message` — which breaks the moment someone
> rewords the message.

> 🔴 **Advanced / gotcha** — in TypeScript, `catch (e)` types `e` as **`unknown`** (with
> `useUnknownInCatchVariables`, the default under `strict`). You must narrow before using it —
> `e instanceof Error ? e.message : String(e)`. Runtime reality is worse: **anything** can be thrown
> (a string, `undefined`, a rejected non-Error). Never assume `e` is an `Error`; the narrowing isn't
> pedantry, it's the only safe read.

---

### `Error.isError` and the `cause` chain

Two modern primitives worth adopting (both verified in Node 24 — see [Modern JavaScript](js-general)):

**`error.cause`** preserves the original when you wrap. Re-throwing without it discards the stack that
actually explains the failure.

```ts
// 🟢 Wrap with context, keep the original cause for the logs.
try { await db.query(sql) }
catch (e) {
  throw new AppError('Loading the dashboard failed', 'dashboard_load', { cause: e })
}
// downstream: error.cause is the original DB error, with its stack.
```

**`Error.isError(x)`** is the cross-realm-safe replacement for `x instanceof Error` — it still
identifies errors that crossed an iframe/worker/vm boundary, where `instanceof` silently returns false.

> 🟢 **Best practice** — always pass `{ cause }` when you re-throw a wrapped error, and prefer
> `Error.isError(e)` over `e instanceof Error` at trust boundaries (worker messages, deserialized data).
> The `instanceof` failure across realms is a genuinely baffling bug to debug; `Error.isError` sidesteps
> it.

---

### Exhaustive handling with `never`

When you branch on an error's discriminant, make the compiler prove you covered every case. An
unhandled variant should fail the build, not slip to production.

```ts
type ApiError = { kind: 'network' } | { kind: 'not-found' } | { kind: 'forbidden' }

function messageFor(e: ApiError): string {
  switch (e.kind) {
    case 'network':   return 'Check your connection.'
    case 'not-found': return "That doesn't exist."
    case 'forbidden': return 'You do not have access.'
    default:
      // 🟢 If a new kind is added to ApiError, this line stops compiling.
      return assertNever(e)
  }
}
function assertNever(x: never): never {
  throw new AppError(`Unhandled error kind: ${JSON.stringify(x)}`, 'unhandled')
}
```

> 🟢 **Best practice** — pair a discriminated error union with an `assertNever` default. Adding a new
> failure mode then forces every handler to acknowledge it at compile time. This is
> [Open/Closed](design-principles#openclosed-extend-without-editing) applied to error handling: new
> cases can't silently fall through.

---

### The async traps

**A floating promise is a swallowed error.** An un-awaited async call whose promise you drop will reject
into the void — `unhandledrejection`, no stack pointing at your code.

```ts
// 🔴 The error from save() vanishes; the UI thinks it succeeded.
function onClick() { save() }
// 🟢 Await it, or explicitly handle the rejection.
async function onClick() {
  try { await save() } catch (e) { toast.error(errorMessage(e)) }
}
```

**`Promise.all` rejects on the first failure and abandons the rest.** If you need every result
regardless, use `Promise.allSettled` (see [the combinators](js-general#promise-combinators-and-the-real-unhandled-rejection-trap)).

> 🔴 **Advanced / gotcha** — the most common real-world version of this: `array.forEach(async …)`.
> `forEach` ignores the returned promises, so every rejection floats and the loop "finishes" before any
> async work does. Use a `for…of` with `await`, or `await Promise.all(array.map(async …))`. Enable
> `@typescript-eslint/no-floating-promises` — it catches these mechanically.

**Retries and timeouts belong on the network edge, not sprinkled everywhere.**

```ts
// 🟢 One resilient fetch wrapper: timeout via AbortSignal, bounded retry with backoff.
async function fetchJson<T>(url: string, { retries = 2, timeoutMs = 8000 } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (!res.ok) throw new AppError(`HTTP ${res.status}`, 'http_error')
      return (await res.json()) as T
    } catch (e) {
      if (attempt >= retries || !isRetriable(e)) throw e
      await delay(2 ** attempt * 200)   // exponential backoff
    }
  }
}
```

> 🟡 **Optimization** — retries help only for *transient* failures (network blips, 503s). **When NOT to
> retry:** a 400, a 403, a validation error — retrying a deterministic failure just multiplies the load
> and delays the inevitable error. Gate retries on `isRetriable(e)`, and never retry a non-idempotent
> request (a POST that charges a card) without an idempotency key.

---

### Where errors belong in a React app

- **Rendering errors** → an [Error Boundary](react-19) at each meaningful UI region, so one broken widget
  doesn't blank the page. Boundaries catch render/lifecycle errors only — **not** event handlers or async.
- **Event-handler and async errors** → caught where they happen, surfaced as UI (a toast, an inline
  message). A boundary will never see these.
- **Data-fetching errors** → the [data layer](data-layer) returns them (React Query's `error`, or a
  `Result`); the component renders an error state. Loading and error are first-class UI states, not
  afterthoughts.

> 🟢 **Best practice** — every async UI has **three** states, not one: success, loading, and error. The
> error state is the one that only shows up in production if you skip it. Design it at the same time as
> the happy path, not after a bug report.

### Sources

- [MDN — Error, Error.cause](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)
- [TC39 — Error.isError](https://github.com/tc39/proposal-is-error) (shipped; Node 24 / current browsers)
- [TypeScript — useUnknownInCatchVariables](https://www.typescriptlang.org/tsconfig/#useUnknownInCatchVariables)
- [react.dev — Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [typescript-eslint — no-floating-promises](https://typescript-eslint.io/rules/no-floating-promises/)
- [MDN — AbortSignal.timeout](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)

---

## Performance Craft (JavaScript & TypeScript)

What a staff engineer actually does about performance — which is mostly *not* what the folklore says.
Every number on this page was measured on a real V8 (Node 24, macOS arm64) with a warmed-up JIT and a
dead-code-elimination guard; the harness is in the repo under `measure/bench/`, and several results
below directly contradict advice you have read a hundred times. Single-machine medians: trust the
**ratio and the direction**, not the absolute milliseconds.

The whole discipline reduces to five rules. The rest of the page is evidence for them.

> 🟢 **Best practice** — the five rules of performance craft:
> 1. **Measure, don't guess.** V8 is smarter than your intuition, and half the "well-known" rules are
>    now false. 2. **Optimize hot paths only** — code that runs a million times, not once. 3.
>    **Algorithmic complexity dwarfs micro-tuning** — an O(n²) lookup beats every loop-construct
>    choice by orders of magnitude. 4. **Allocation is the hidden cost** — most "slow JS" is GC
>    pressure, not the loop. 5. **TypeScript types are erased** — there is no runtime TS performance,
>    only JS performance.

---

### Rule 0: How to micro-benchmark without lying to yourself

Most JavaScript benchmarks are wrong, and a wrong benchmark is worse than none because it *feels*
authoritative. Three things make a micro-benchmark lie:

1. **No JIT warmup.** V8 runs your code in a cheap interpreter first, then optimizes hot functions.
   Measure the first run and you're timing the interpreter, not the code you'll ship. Fix: call the
   function several times before timing.
2. **Dead-code elimination.** If a benchmark's result is never used, V8 is free to delete the entire
   computation — you measure an empty loop. Fix: accumulate every result into a `sink` and print it.
3. **One sample.** A single `performance.now()` pair catches whatever GC pause or CPU migration
   happened to land in that window. Fix: take many samples and report the **median** (not the mean —
   the mean is dragged by GC outliers).

```js
import { performance } from 'node:perf_hooks'

function bench(name, fn, { iters = 30 } = {}) {
  for (let i = 0; i < 5; i++) fn()          // 1. warm up the JIT
  const samples = []
  for (let i = 0; i < iters; i++) {
    const t = performance.now()
    fn()
    samples.push(performance.now() - t)      // 3. many samples
  }
  samples.sort((a, b) => a - b)
  return { name, median: samples[samples.length >> 1] }
}

let sink = 0                                 // 2. defeat dead-code elimination
// ...accumulate into sink inside every fn, then: console.log(sink)
```

> 🟡 **Optimization** — for anything beyond a quick check, use a real library:
> [tinybench](https://github.com/tinylibs/tinybench) or `mitata` handle warmup, statistics, and
> outlier rejection for you. Hand-rolled timing is fine for a sanity check, not for a claim you'll
> put in a PR description.

> 🔴 **Advanced / gotcha** — even a correct micro-benchmark measures a function *in isolation*, where
> V8 can over-optimize it (perfect monomorphism, everything inlined, data in L1 cache). Real code is
> messier and slower. A micro-benchmark tells you the *ceiling* and the *relative ordering*, never the
> production number. For that, profile the real app (`--cpu-prof`, Chrome DevTools, `perf`).

---

### Loops: `for` vs `while` vs `for...of` vs `forEach`

The question you asked. Here is the measured answer — sum over 1,000,000 integers:

| Construct | median ms | vs fastest |
|---|---|---|
| `for (let i = 0; i < arr.length; i++)` | 0.55 | 1.0× |
| `for` with `length` cached in a local | 0.54 | 1.0× |
| `while` | 0.54 | 1.0× |
| `for...of` | 3.75 | **6.9×** |
| `reduce` | 3.83 | **7.0×** |
| `forEach` | 5.49 | **10.1×** |

Two conclusions, and they pull in opposite directions.

**`for`, `while`, and cached-`length` are identical.** Pick whichever reads best.

> 🟢 **Best practice** — write the loop that expresses intent. `for...of` for "do a thing with each
> item", index `for` when you need the index, `while` when the termination isn't a simple count.
> Caching `arr.length` into a local (`for (let i = 0, n = arr.length; …)`) buys **nothing** — V8 hoists
> it already. That advice was true in 2010 and has been dead for a decade. Don't uglify code for it.

**The array methods are 7–10× slower — and that almost never matters.** Read the scale: 5ms over a
*million* elements is **~5 nanoseconds per element**. On a 100-item array the difference is 500
nanoseconds, which no user will ever perceive. `forEach`/`map`/`reduce` pay for a function call and
(for `map`) a new array allocation per element; `for...of` pays for the iterator protocol.

> 🟡 **Optimization** — the index `for` loop is a *hot-path* tool, not a style rule. Reach for it only
> when you've measured a genuine bottleneck iterating over large data (tens of thousands of elements,
> many times per frame). **Pros:** 7–10× faster on hot numeric loops; zero allocation. **Cons:** less
> readable; loses the "no off-by-one, no mutation" safety of `map`/`filter`. **When NOT to use it:**
> everywhere else — which is 99% of code. Defaulting to raw `for` loops "for speed" is the premature
> optimization this whole page warns against.

> 🔴 **Advanced / gotcha** — `.map()` allocates a new array; chaining `arr.filter(...).map(...).reduce(...)`
> allocates an intermediate array *per stage* and walks the data multiple times. On large data in a hot
> path, that allocation (and the GC that follows) usually costs more than the loop bodies. One `for`
> loop, or a single `reduce`, does it in one pass with no intermediates. Again: only worth it when
> measured.

---

### Hot-path idioms that are actually real

When you're genuinely in a hot path, these are the things V8 cares about — and understanding *why*
means knowing the machine underneath, the same way [purity](fundamentals#purity) means knowing React's.

#### Keep object shapes stable (monomorphism)

V8 assigns every object a hidden class ("shape") and builds inline caches keyed on it. Measured:
reading `.x` over a million same-shape objects took 0.61ms; over four mixed shapes, 0.74ms.

> 🟢 **Best practice** — give objects a consistent shape: initialize **all** fields in the constructor
> (even to `null`), always in the same order, and never `delete` a property (set it to `null`/`undefined`
> instead). This is a correctness-and-predictability habit, not a heroic optimization — the measured
> penalty here was only **1.2×**, so treat the old "megamorphic access is catastrophic" warning as
> overstated for property *reads*. The habit is cheap; the payoff is a codebase V8 can reason about.

#### Never make arrays holey

Measured: a packed array summed in 0.51ms; the same array with one `delete`d index and one `undefined`
hole took 1.09ms — **2.1× slower**, and it stays slow forever after.

> 🟢 **Best practice** — this one is worth real vigilance. A "holey" array falls out of V8's fast
> packed-elements representation and *every* access on it pays a penalty. Never `delete arr[i]` (use
> `splice`, or set a sentinel). Never `new Array(n)` and fill it sparsely. Never assign past the end
> (`arr[arr.length + 5] = x`). Build arrays densely, front to back.

#### Stop hoisting `try/catch` out of loops

The historical rule "try/catch prevents optimization, keep it out of hot loops" is **obsolete**.
Measured: try/catch around the whole loop vs inside every iteration showed **no meaningful difference**
(the "inside" version was, if anything, marginally faster — the gap is measurement noise). Modern V8's
TurboFan optimizes through try/catch.

> 🟢 **Best practice** — put `try/catch` where correctness wants it and stop contorting code to hoist
> it out. If you learned the old rule, unlearn it. (The *one* caveat: don't use exceptions as control
> flow in a hot loop — throwing and unwinding is genuinely expensive. Catching that never fires is
> free.)

#### Build strings with `+=`, not `array.join`

Measured: building a 100,000-part string with `+=` took 0.89ms; pushing to an array and `join('')`
took 1.61ms. **`+=` is ~1.8× faster** — the opposite of the classic advice.

> 🟢 **Best practice** — just use `+=` for straightforward string building. V8 represents the growing
> string as a cons-string/rope and flattens lazily, so the quadratic-copy disaster the old advice
> feared doesn't happen. `array.join` is still fine when you already *have* the array, but don't build
> an array solely to join it.

---

### The wins that dwarf all of the above

Everything so far is nanoseconds. These are the optimizations that actually move a profiler.

#### Algorithmic complexity

```js
// 🔴 O(n²) — .includes scans the whole array on every iteration
const dupes = items.filter((x) => seen.includes(x))
// 🟢 O(n) — Set membership is ~O(1)
const seenSet = new Set(seen)
const dupes = items.filter((x) => seenSet.has(x))
```

> 🟢 **Best practice** — before touching a single loop construct, check the complexity. A `Set`/`Map`
> instead of a `.includes`/`.find` in a loop turns O(n²) into O(n) and wins by *orders of magnitude* on
> real data — the kind of change that takes a page from 4 seconds to 40 milliseconds. This is where the
> real performance work is. Loop-construct choice is rounding error next to it.

#### Allocation and GC pressure

> 🟡 **Optimization** — the most common *real* cause of a slow hot path is allocating inside it: a new
> object, array, or closure per iteration that the garbage collector then has to reclaim. **Pros of
> reducing it:** fewer GC pauses, steadier frame times. **Cons:** hoisting allocations out of loops or
> reusing buffers is less readable and can introduce aliasing bugs. **When NOT to:** outside hot paths,
> allocate freely — it's what makes JS pleasant. Only pool/reuse when a profiler shows GC in your flame
> graph.

#### Async: parallelize independent work

```js
// 🔴 serial — each awaits the previous; total = sum of all
for (const id of ids) results.push(await fetchUser(id))
// 🟢 parallel — total ≈ the single slowest
const results = await Promise.all(ids.map(fetchUser))
```

Measured (3 independent requests): serial 604ms vs `Promise.all` 221ms — **2.7× faster**, and the gap
grows with the number of requests.

> 🟡 **Optimization** — parallelize with `Promise.all` **only when the requests are independent**.
> **When NOT to:** if request B needs A's result, they *must* stay sequential — parallelizing them is a
> correctness bug, not a speedup. Also mind the server: firing 10,000 requests at once with
> `Promise.all` will melt it; batch with a concurrency limit (`p-limit`, or chunk the array).

> 🔴 **Advanced / gotcha** — `await` inside a `for` loop over independent work is the single most common
> real-world JavaScript performance bug. It reads innocently and silently serializes work that could run
> concurrently. When you see `await` in a loop, ask: does each iteration truly depend on the last? If
> not, it's a `Promise.all`.

---

### Beyond JS: browser rendering wins

Some of the biggest perceived-performance wins aren't in your JavaScript at all — they're telling the
browser what to prioritize. These are cheap and high-leverage.

**Resource hints** start critical work earlier. `preconnect` opens the TCP+TLS handshake to an origin
before you need it; `preload` fetches a resource the current page will definitely use; `dns-prefetch` is
the cheap fallback for origins you *might* hit.

```html
<!-- 🟢 warm the connection to your API/font/CDN origin during idle head-parse time -->
<link rel="preconnect" href="https://api.example.com" crossorigin />
<!-- 🟢 fetch the LCP hero image / critical font now, not when the CSS finally references it -->
<link rel="preload" as="image" href="/hero.avif" fetchpriority="high" />
```

> 🟡 **Optimization** — `preconnect` the 2–4 origins on your critical path (API, fonts, image CDN) and
> `preload` the LCP resource. **When NOT to:** preconnecting to a dozen origins wastes connections and can
> *slow* the page — the browser has a limited connection budget. Hint the few that are on the critical
> path, not everything.

**Passive event listeners** unblock scrolling. By default the browser must wait to see whether a
`touchstart`/`wheel` handler calls `preventDefault` before it can scroll — janking the scroll. Marking the
listener `passive` promises you won't, so the browser scrolls immediately.

```ts
// 🟢 a scroll/touch handler that never preventDefaults should say so — smoother scrolling
el.addEventListener('touchstart', onTouch, { passive: true })
```

**`content-visibility: auto`** skips rendering (layout + paint) for off-screen subtrees until they scroll
near the viewport — a large win for long pages with many heavy sections. Pair it with
`contain-intrinsic-size` so the scrollbar doesn't jump.

**`requestIdleCallback`** defers genuinely non-urgent work (analytics beacons, prefetching, warming a
cache) to the browser's idle time, so it never competes with a user interaction for the main thread.

> 🔴 **Advanced / gotcha** — `requestIdleCallback` is for work that can wait *indefinitely* — it may not
> fire for seconds under load, and isn't for anything the user is waiting on. Also don't reach for
> `content-visibility` on above-the-fold content (you'd delay the paint you want) or on tiny elements (the
> containment bookkeeping isn't worth it). Each of these is a scalpel, not a default — measure the page
> first, the same as everything else here.

---

### TypeScript's performance story

TypeScript types are **erased at compile time** — they emit zero JavaScript and have **zero runtime
cost**. There is no such thing as runtime TypeScript performance; there is only the JavaScript it
compiles to, and everything above applies unchanged.

"TypeScript performance" means two real but different things:

- **Compile / editor speed.** This is where TS 7 (the Go port) matters — measured ~2.7× faster type
  checking than TS 6 on a small project (see [TypeScript in the TS 7 Era](ts-general)). On a large
  codebase the practical wins are `skipLibCheck`, `incremental`/project references, and `isolatedModules`
  so bundlers can transpile per-file without type-checking.
- **Not letting types push you toward bad runtime shapes.** A type is free; the *code you write to
  satisfy it* is not.

> 🔴 **Advanced / gotcha** — the type system can *tempt* runtime cost. A giant discriminated union
> "validated" by re-parsing on every access, an `as const` deep-frozen structure rebuilt each render, a
> Zod `.parse()` in a hot loop — these are runtime costs the *types* made feel necessary. The type
> annotation is erased; the validation code is not. Keep the two ledgers separate: type-check at the
> boundary, then trust the type inside the hot path.

---

### Sources

- Measured in this repo: `measure/bench/loops.mjs`, `measure/bench/hotpath.mjs`, `measure/bench/strings.mjs`
  (Node 24 / V8, warmed JIT, median of 25–30 samples).
- [V8 blog — elements kinds & fast/slow arrays](https://v8.dev/blog/elements-kinds)
- [V8 blog — hidden classes / inline caches](https://mathiasbynens.be/notes/shapes-ics)
- [tinybench](https://github.com/tinylibs/tinybench) · [mitata](https://github.com/evanwashere/mitata)
- [MDN — `Promise.all`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all)
- [Node.js `perf_hooks`](https://nodejs.org/api/perf_hooks.html) · profiling with `node --cpu-prof`

---

## Naming & Code Conventions

Formatting — semicolons, quote style, indent width — is a solved problem: a formatter (Prettier, Biome)
decides it, and arguing about it is wasted time. This page is the part a formatter *can't* decide: what
you name things, how you shape exports, and the daily judgment calls where two readable options exist and
consistency is the whole point. These are the rules the Google and Airbnb style guides independently
agree on, filtered to what matters in a modern React/TS codebase.

> 🟢 **Best practice** — settle these once, encode what's lintable, and stop relitigating. A convention's
> value is almost entirely in its *consistency*, not its correctness — the second-best naming scheme
> applied everywhere beats the best one applied half the time.

---

### Identifier casing

| Case | Used for | Example |
|---|---|---|
| `camelCase` | variables, functions, methods, properties, hooks | `userCount`, `useAuth`, `fetchOrders` |
| `PascalCase` | components, classes, types, interfaces, enums | `UserCard`, `OrderStatus`, `ApiError` |
| `CONSTANT_CASE` | true module-level constants (fixed at author time) | `MAX_RETRIES`, `API_BASE_URL` |
| `kebab-case` | file and folder names | `user-card.tsx`, `use-auth.ts` |

```ts
// 🔴 mixed conventions — the reader can't infer what a name is from its shape
const User_count = 10
function GetData() {}
const apiURL = '...'

// 🟢 shape encodes kind: PascalCase is a type/component, camelCase is a value, CONSTANT_CASE is fixed
const userCount = 10
function getData() {}
const API_URL = '...'
```

> 🟢 **Best practice** — treat **abbreviations as whole words**: `loadHttpUrl`, `parseJsonResponse`,
> `userId` — not `loadHTTPURL`, `parseJSONResponse`, `userID`. Consistent casing across an acronym keeps
> names readable and, more importantly, *predictable* — you never have to remember whether it was `Id`,
> `ID`, or `iD`. React components and their file: `UserCard` lives in `user-card.tsx`.

> 🔴 **Advanced / gotcha** — no **leading or trailing underscores** on identifiers (`_private`,
> `value_`). In JavaScript they don't create privacy — they're a *comment* pretending to be a language
> feature, and readers stop trusting them. For real privacy use a closure, a `#private` class field, or
> module scope (see [TypeScript practices](ts-general)). `CONSTANT_CASE` is only for values fixed when you
> write the code; a `const` holding a computed or fetched value is still `camelCase`.

---

### Named vs default exports

The style guides say **named exports, avoid default exports** — and they're mostly right, for reasons
that matter day to day:

```ts
// 🔴 default export: the import name is unenforced, so the same thing gets 3 names across the app
export default function Button() {}
import Button from './button'    // or Btn, or MyButton — nothing stops it
// rename the file and every import silently keeps working with a stale mental model

// 🟢 named export: one canonical name, enforced by the compiler, greppable, refactor-safe
export function Button() {}
import { Button } from './button'
```

Named exports win on: **refactoring** (rename propagates; IDEs rename all uses), **consistency** (one
name everywhere, greppable), **tree-shaking** (bundlers reason about named exports more reliably), and
**re-export ergonomics** (`export { Button } from './button'`).

> 🟢 **Best practice** — default to **named exports** for components, hooks, and utilities. It's the
> single highest-leverage convention here: it makes the codebase greppable and refactors safe.

> 🔴 **Advanced / gotcha** — two places in a React app genuinely *want* a default export, and fighting
> them is counterproductive: **`React.lazy`** requires one (`lazy(() => import('./Page'))`), and some
> frameworks' file-based routing conventions expect a default per route/page file. For a named-export
> component you lazy-load, use the re-export shim: `lazy(() => import('./Page').then(m => ({ default: m.Page })))`.
> So: named by default, default export only where a tool demands it. Never mix both in one module.

---

### Import ordering

Group imports so the dependency shape of a file is legible at a glance: **external packages first, then
internal absolute imports, then relative** — a blank line between groups.

```ts
// 🟢 external → internal(@/) → relative, each group alphabetized
import { useState } from 'react'
import { z } from 'zod'

import { Button } from '@/components/button'
import { useAuth } from '@/features/auth'

import { formatDate } from './utils'
import type { Order } from './types'
```

> 🟡 **Optimization** — don't sort imports by hand; it's a losing battle. `eslint-plugin-import`'s
> `import/order` (or Biome's organizer) does it on save and in CI. **When NOT to worry about it:** if your
> formatter already organizes imports, this is fully automated — spend zero human attention on it.

---

### The daily judgment calls

The rules that come up in almost every code review, where both style guides agree:

**Never reassign or mutate a parameter.** It hides the source of a value and breaks under the caller's
assumptions.

```ts
// 🔴 mutates the caller's object; the bug shows up three call sites away
function addTax(order) { order.total *= 1.2; return order }
// 🟢 return a new value; the input is untouched
function addTax(order: Order): Order { return { ...order, total: order.total * 1.2 } }
```

> 🟢 **Best practice** — default parameters go **last** (`f(a, b = 2)` not `f(a = 1, b)`), so callers can
> omit them positionally. And prefer default parameters over mutating a missing argument inside the body.

**No nested ternaries.** One ternary is fine; a ternary inside a ternary is a puzzle. Decompose it.

```tsx
// 🔴 unreadable, and a reviewer can't verify the branches
const label = a ? (b ? 'x' : 'y') : c ? 'z' : 'w'
// 🟢 a lookup table (see design-principles#data-driven-over-conditional) or early returns
const label = STATUS_LABELS[status] ?? 'Unknown'
```

**`Map`/`Set` over an object-as-dictionary** when keys are dynamic. A plain object inherits prototype keys
(`__proto__`, `constructor`), has string-only keys, and gives you no honest `.size`. `Map` avoids all of
it and signals intent.

> 🟢 **Best practice** — reach for `Map` when you're keying by user-supplied or dynamic values, iterating
> entries, or counting. Use a plain object for fixed, known-at-author-time shapes. A `Set` is the right
> answer to "have I seen this?" and to de-duplication — and it turns an O(n²) `.includes`-in-a-loop into
> O(n) (see [performance](performance-craft)).

**`for...of`, not `for...in`, on arrays.** `for...in` iterates *keys* (as strings, including inherited
ones); on an array that's indices, not values, and it's a classic bug. Use `for...of` for values,
`Object.entries()` for object pairs.

> 🟡 **Optimization** — most of these are enforceable: `no-param-reassign`, `no-nested-ternary`,
> `guard-for-in`, `no-restricted-syntax` for `for...in`. Turn them on and they stop being review comments.
> **When NOT to obsess:** a formatter + a good ESLint/Biome config handles ~90% of this automatically —
> your review attention belongs on naming and export shape (which tools can't judge), not on catching
> a stray nested ternary a linter would flag anyway.

### Commit messages

Code conventions don't stop at the code — the git history is documentation too, and **Conventional
Commits** is the widely-adopted format that makes it machine-readable: `type(scope): summary`.

```bash
# 🟢 conventional commits — a parseable type, an optional scope, an imperative summary
feat(auth): add password-reset flow
fix(cart): stop total from going negative on coupon stacking
refactor(api): extract the retry logic into a shared client
docs: correct the install command in the readme

# 🔴 the history nobody can read or automate against
git commit -m "stuff"
git commit -m "fixes"
git commit -m "WIP asdf"
```

The common `type`s: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`, `ci`. A `feat`
or `fix` is what shows up in a changelog; a `!` after the type (or a `BREAKING CHANGE:` footer) marks a
breaking change.

> 🟢 **Best practice** — write the summary in the **imperative mood** ("add", "fix", not "added" /
> "fixes"), lowercase, no trailing period, and keep it under ~72 characters — it should complete the
> sentence "this commit will _______". The payoff is concrete: automated changelogs and semver bumps
> (`semantic-release`), a `git log` you can actually scan, and reviewers who know a commit's intent
> before opening the diff.

> 🟡 **Optimization** — enforce it mechanically with **commitlint** + a Husky `commit-msg` hook, so a
> malformed message is rejected at commit time rather than caught in review. **When NOT to bother:** a
> solo throwaway prototype doesn't need the ceremony; adopt it once more than one person reads the
> history or you want automated releases. And never let the *format* become a reason to bundle unrelated
> changes into one commit — small, focused commits matter more than perfect prefixes.

### Sources

- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) · [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html)
- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- [eslint-plugin-import — import/order](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/order.md)
- [Conventional Commits](https://www.conventionalcommits.org/) · [commitlint](https://commitlint.js.org/)
- Formatting itself: [Prettier](https://prettier.io/) / [Biome](https://biomejs.dev/) — let the tool decide, don't debate it.
