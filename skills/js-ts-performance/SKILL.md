---
name: js-ts-performance
description: "Use when optimizing JavaScript or TypeScript performance, choosing a loop, or benchmarking: how to micro-benchmark without lying to yourself, the measured truth about for/while/forEach/map, hot-path idioms (object shapes, array holes, allocation), and which classic perf rules are now obsolete. Measure, do not guess."
metadata:
  source: https://baluraut.github.io/frontend-best-practices/performance-craft
---

# Performance Craft (JavaScript & TypeScript)

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

## Rule 0: How to micro-benchmark without lying to yourself

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

## Loops: `for` vs `while` vs `for...of` vs `forEach`

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

## Hot-path idioms that are actually real

When you're genuinely in a hot path, these are the things V8 cares about — and understanding *why*
means knowing the machine underneath, the same way [purity](fundamentals#purity) means knowing React's.

### Keep object shapes stable (monomorphism)

V8 assigns every object a hidden class ("shape") and builds inline caches keyed on it. Measured:
reading `.x` over a million same-shape objects took 0.61ms; over four mixed shapes, 0.74ms.

> 🟢 **Best practice** — give objects a consistent shape: initialize **all** fields in the constructor
> (even to `null`), always in the same order, and never `delete` a property (set it to `null`/`undefined`
> instead). This is a correctness-and-predictability habit, not a heroic optimization — the measured
> penalty here was only **1.2×**, so treat the old "megamorphic access is catastrophic" warning as
> overstated for property *reads*. The habit is cheap; the payoff is a codebase V8 can reason about.

### Never make arrays holey

Measured: a packed array summed in 0.51ms; the same array with one `delete`d index and one `undefined`
hole took 1.09ms — **2.1× slower**, and it stays slow forever after.

> 🟢 **Best practice** — this one is worth real vigilance. A "holey" array falls out of V8's fast
> packed-elements representation and *every* access on it pays a penalty. Never `delete arr[i]` (use
> `splice`, or set a sentinel). Never `new Array(n)` and fill it sparsely. Never assign past the end
> (`arr[arr.length + 5] = x`). Build arrays densely, front to back.

### Stop hoisting `try/catch` out of loops

The historical rule "try/catch prevents optimization, keep it out of hot loops" is **obsolete**.
Measured: try/catch around the whole loop vs inside every iteration showed **no meaningful difference**
(the "inside" version was, if anything, marginally faster — the gap is measurement noise). Modern V8's
TurboFan optimizes through try/catch.

> 🟢 **Best practice** — put `try/catch` where correctness wants it and stop contorting code to hoist
> it out. If you learned the old rule, unlearn it. (The *one* caveat: don't use exceptions as control
> flow in a hot loop — throwing and unwinding is genuinely expensive. Catching that never fires is
> free.)

### Build strings with `+=`, not `array.join`

Measured: building a 100,000-part string with `+=` took 0.89ms; pushing to an array and `join('')`
took 1.61ms. **`+=` is ~1.8× faster** — the opposite of the classic advice.

> 🟢 **Best practice** — just use `+=` for straightforward string building. V8 represents the growing
> string as a cons-string/rope and flattens lazily, so the quadratic-copy disaster the old advice
> feared doesn't happen. `array.join` is still fine when you already *have* the array, but don't build
> an array solely to join it.

---

## The wins that dwarf all of the above

Everything so far is nanoseconds. These are the optimizations that actually move a profiler.

### Algorithmic complexity

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

### Allocation and GC pressure

> 🟡 **Optimization** — the most common *real* cause of a slow hot path is allocating inside it: a new
> object, array, or closure per iteration that the garbage collector then has to reclaim. **Pros of
> reducing it:** fewer GC pauses, steadier frame times. **Cons:** hoisting allocations out of loops or
> reusing buffers is less readable and can introduce aliasing bugs. **When NOT to:** outside hot paths,
> allocate freely — it's what makes JS pleasant. Only pool/reuse when a profiler shows GC in your flame
> graph.

### Async: parallelize independent work

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

## Beyond JS: browser rendering wins

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

## TypeScript's performance story

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

## Sources

- Measured in this repo: `measure/bench/loops.mjs`, `measure/bench/hotpath.mjs`, `measure/bench/strings.mjs`
  (Node 24 / V8, warmed JIT, median of 25–30 samples).
- [V8 blog — elements kinds & fast/slow arrays](https://v8.dev/blog/elements-kinds)
- [V8 blog — hidden classes / inline caches](https://mathiasbynens.be/notes/shapes-ics)
- [tinybench](https://github.com/tinylibs/tinybench) · [mitata](https://github.com/evanwashere/mitata)
- [MDN — `Promise.all`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all)
- [Node.js `perf_hooks`](https://nodejs.org/api/perf_hooks.html) · profiling with `node --cpu-prof`
