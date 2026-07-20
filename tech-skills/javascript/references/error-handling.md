# Error Handling (JS/TS)

The feature pages tell you what the language *has*; this one is about the discipline no single feature
teaches — deciding what to throw, what to return, what to type, and where a failure is allowed to stop.
Most "flaky" front ends are not flaky; they're unhandled error paths that only run in production.

The one rule under all the others: **an error is data about a failure, and it deserves the same care as
your success data.** A caught error you don't inspect, a rejection you don't await, a `catch (e)` that
swallows — each is a decision to ship a bug you can't see.

---

## `throw` vs return a `Result`

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

## Type your errors; stop throwing strings

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

## `Error.isError` and the `cause` chain

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

## Exhaustive handling with `never`

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

## The async traps

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

## Where errors belong in a React app

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

## Sources

- [MDN — Error, Error.cause](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)
- [TC39 — Error.isError](https://github.com/tc39/proposal-is-error) (shipped; Node 24 / current browsers)
- [TypeScript — useUnknownInCatchVariables](https://www.typescriptlang.org/tsconfig/#useUnknownInCatchVariables)
- [react.dev — Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [typescript-eslint — no-floating-promises](https://typescript-eslint.io/rules/no-floating-promises/)
- [MDN — AbortSignal.timeout](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)
