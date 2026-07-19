---
name: code-conventions
description: "Use when naming things or choosing code style in JavaScript/TypeScript: identifier casing (camelCase/PascalCase/CONSTANT_CASE), abbreviations as words, named vs default exports, import ordering, and daily calls like no parameter mutation, no nested ternaries, and Map over object-as-dictionary. Based on the Google and Airbnb style guides."
metadata:
  source: https://baluraut.github.io/frontend-best-practices/conventions
---

# Naming & Code Conventions

Formatting — semicolons, quote style, indent width — is a solved problem: a formatter (Prettier, Biome)
decides it, and arguing about it is wasted time. This page is the part a formatter *can't* decide: what
you name things, how you shape exports, and the daily judgment calls where two readable options exist and
consistency is the whole point. These are the rules the Google and Airbnb style guides independently
agree on, filtered to what matters in a modern React/TS codebase.

> 🟢 **Best practice** — settle these once, encode what's lintable, and stop relitigating. A convention's
> value is almost entirely in its *consistency*, not its correctness — the second-best naming scheme
> applied everywhere beats the best one applied half the time.

---

## Identifier casing

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

## Named vs default exports

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

## Import ordering

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

## The daily judgment calls

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

## Commit messages

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

## Sources

- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) · [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html)
- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- [eslint-plugin-import — import/order](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/order.md)
- [Conventional Commits](https://www.conventionalcommits.org/) · [commitlint](https://commitlint.js.org/)
- Formatting itself: [Prettier](https://prettier.io/) / [Biome](https://biomejs.dev/) — let the tool decide, don't debate it.
