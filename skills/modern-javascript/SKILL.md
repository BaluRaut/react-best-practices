---
name: modern-javascript
description: "Use when writing modern JavaScript: immutable array methods, structuredClone, AbortSignal cancellation, Object.groupBy, promise combinators, and error handling. Flags the nullish-coalescing vs OR bug and what is actually Baseline-available."
metadata:
  source: https://baluraut.github.io/frontend-best-practices/js-general
---

# Modern JavaScript for React Apps (ES2020 → mid-2026)

The language moved a lot between the last time most codebases were written and today. This page covers the modern JS worth reaching for in a React app, the traps each feature hides, and — critically — the gap between *"it's in the spec"* and *"you can actually ship it."* Every YES/no below was executed on **Node v24.16.0 / V8 13.6**, not recalled from memory.

The recurring theme: **the spec-edition year is not the ship year, and "Stage 4" is not "available."** Feature-probe; don't trust the edition label.

## `??` vs `||` — the falsy-fallback bug

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

### The React `&&` render trap

Same falsy family, different symptom. `&&` returns its left operand when that operand is falsy, and **React renders `0` as visible text** (it only skips `false`, `null`, and `undefined`).

```jsx
{items.length && <List items={items} />}    // ❌ renders a literal "0" when the list is empty
{items.length > 0 && <List items={items} />} // ✅ the condition is a real boolean
```

The rule: **the left side of `&&` in JSX must be a boolean.** Never gate JSX on `.length` or any number directly.

> 🟢 **Best practice** — coerce the left operand of `&&` to a real boolean. The reason is what React actually [commits](fundamentals#render-vs-commit): it skips `false`/`null`/`undefined` but renders `0` as a text node, so a bare number leaks a stray "0" into the DOM.

## Immutable array methods (ES2023, universally Baseline)

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

## Cloning: `structuredClone` vs JSON round-trip vs spread

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

### The React shallow-spread trap

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

## `Object.groupBy` / `Map.groupBy`

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

## Promise combinators and the real unhandled-rejection trap

### The claim that is FALSE

Widely repeated: *"`Promise.all` rejects on the first error, so the later rejections become unhandled rejections and crash Node."* **This is wrong**, and it was verified wrong. `Promise.all` attaches handlers to **every** input promise immediately. When a later one rejects, the rejection is *handled* — and silently swallowed. No `unhandledRejection` fires.

The real problem with `Promise.all` is therefore **observability, not a crash**: an error happened, and you will never see it in your logs. Use `Promise.allSettled` when every outcome matters.

### The trap that is REAL

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

### Choosing a combinator

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

## `Error` cause and `Error.isError`

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

## `AbortController` / `AbortSignal` — cancellation

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

## Iterator helpers (ES2025, in Node 24)

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

## Logical assignment operators (ES2021)

```js
opts.retries ??= 3;          // assign only if null/undefined  ✅
cache[key]   ??= expensive();// RHS short-circuits — expensive() runs only on a cache miss
opts.debug   ||= true;       // ❌ same falsy bug as || — sets debug when it was false
```

> **These short-circuit the *assignment*, not just the value.** `obj.x ||= v` performs no write at all when `obj.x` is already truthy — distinct from `obj.x = obj.x || v`, which always writes. That difference matters for setters and for `Proxy` / reactivity traps: no write means no reactive trigger fires.

## Top-level `await`

Works in ESM (verified). It has two real costs:

1. **It makes your module async**, which makes it `require()`-incompatible *forever* — see the ESM/CJS section below.
2. **It blocks the importer graph.** A top-level `await` in a leaf module delays every module that imports it. In a Vite SPA that is shipped-but-stalled JavaScript sitting in front of first paint.

Top-level `await` is fine in app entrypoints and build scripts. **Avoid it in shared libraries.**

> 🔴 **Advanced / gotcha** — top-level `await` is a one-way door for a published module: it makes the module async, which makes it `require()`-incompatible *graph-wide* (see below), and it blocks every importer's first paint in a Vite SPA. Use it knowingly in an entrypoint; keep it out of anything others import.

## ESM vs CommonJS in 2026 — `require(esm)` landed unflagged

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

## The spec-year trap: what actually shipped

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

## Temporal — do not use it unpolyfilled in mid-2026

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

## Checklist

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

## Sources

- TC39 finished proposals (Stage 4, publication years): https://github.com/tc39/proposals/blob/main/finished-proposals.md
- MDN, Temporal (Baseline status, verbatim "Limited availability"): https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal
- MDN, `structuredClone`: https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone
- MDN, Nullish coalescing operator (`??`): https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing
- MDN, `Object.groupBy`: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/groupBy
- MDN, `AbortSignal` (`.timeout`, `.any`): https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
- MDN, Iterator helpers: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Iterator
- MDN, `Promise.withResolvers` / `Promise.try`: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
- Node.js, `require(esm)` / `process.features.require_module`: https://nodejs.org/api/modules.html#loading-ecmascript-modules-using-require
