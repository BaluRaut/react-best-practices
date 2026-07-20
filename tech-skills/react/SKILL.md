---
name: react
description: "Apply modern React best practices when writing, reviewing, refactoring, or optimizing React — components, hooks, state, effects, forms, data fetching, performance, architecture, typing, or upgrading across versions. Version-verified for React 19 and the React Compiler. Read the referenced files for the detail on a given topic."
metadata:
  source: https://baluraut.github.io/frontend-best-practices
---

# React Best Practices

Apply these when writing, reviewing, refactoring, or optimizing React code. Each rule on the reference pages is labelled 🟢 best practice / 🟡 optimization / 🔴 advanced-gotcha, with a bad-vs-good example and a "when not to". Verified against the current stack; sourced from [baluraut.github.io/frontend-best-practices](https://baluraut.github.io/frontend-best-practices/).

## Core principles

- Prefer readability over cleverness, correctness over micro-optimization, maintainability over brevity.
- Use modern language/runtime features when they are supported — and note the support floor when it matters.
- **These are guidelines and trade-offs, not laws.** Every optimization here says when *not* to apply it.
- Never apply an optimization without a measurable or practical benefit; avoid premature optimization.
- Explain the trade-off when a recommendation depends on context.

## Reference files

Read the file for the topic you're working on — each is a focused, self-contained guide:

- **[React Fundamentals](references/fundamentals.md)** — This is the primer every other page assumes. It is not a first React tutorial — it takes JSX, props, `useState`, and `useEffect` as known — and instead explains the five internal i
- **[React Practices](references/react-practices.md)** — Version-agnostic rules that hold across React 17–19, verified against React 19.2.7,
- **[Design Principles for React](references/design-principles.md)** — SOLID and its cousins were written for classes, but the *ideas* are about change: where it lands, how far it spreads, and whether you can absorb it without editing working code. Re
- **[TypeScript with React 19](references/ts-react.md)** — Typing props, children, events, refs, hooks, and generic/polymorphic components against
- **[Where State Should Live](references/state-management.md)** — Most React state problems are *placement* problems. State that lives too low can't be shared; state that lives too high re-renders half the app on every keystroke. This page is a *
- **[Custom Hooks](references/custom-hooks.md)** — A custom hook is the unit of reuse for **stateful logic** — not markup. It is an ordinary function whose name starts with `use` and which calls other hooks. That is the entire mech
- **[Forms](references/forms.md)** — Forms are where three hard things collide: local UI state, async submission, and validation you can't trust. React 19 changed the default answer to the second one — `<form action>`
- **[The Data Layer](references/data-layer.md)** — Most "React is slow" and "my data is stale" bugs are not React problems. They are the result of one category error: **treating server data as component state.** This page is about 
- **[Architecture: folders, colocation, and barrels](references/architecture.md)** — How you lay files out decides how a codebase ages. The wrong layout doesn't crash — it slowly makes every change touch five directories and makes nothing safe to delete. This page 
- **[Quality: Testing, Accessibility, Performance, Tooling, Structure](references/quality.md)** — The four disciplines that keep a React codebase honest after the demo. Verified stack as of 2026-07-18: React 19.2.7, TypeScript 7.0.2, Vite 8.1.5, Vitest 4.1.10, MUI 9.2.0. Every 
- **[Front-End Security](references/security.md)** — The front end can't be *trusted* — anything it enforces, an attacker can bypass by talking to your API directly with curl. So the first rule reframes the whole page: **client-side 
- **[The React 16 → 19 Migration Matrix](references/migration-matrix.md)** — This page owns the **transitions**. For the per-version detail — what each release *is* — see
- **[React 19](references/react-19.md)** — React 19 is the current stable line (**19.2.7**, published 2026-06-01; 19.2.0 shipped 2025-10-01). This page covers the features you actually reach for — Actions, `use()`, `ref`-as
- **[React 18 — Concurrent Rendering and the Traps](references/react-18.md)** — React 18.0 shipped 2022-03-29; React 19.0 shipped 2024-12-05; the latest React today is **19.2.7**. So React 18 is **two majors old**, and everything here is one of two things: leg
- **[React 17 — the stepping stone](references/react-17.md)** — React 17 is a historical artifact. It has been frozen at **17.0.2 since March 2021**, and `react@latest` is **19.2.7** (npm, 2026-07). Nobody starts a project on 17. These notes ex
- **[React 16 Era (16.0 – 16.14)](references/react-16.md)** — React 16 is not "old React." It is the era in which React acquired *every* mental model it still uses today — Fiber scheduling, error boundaries, the modern context API, and hooks 

## When reviewing code

1. Detect the anti-pattern and name it (e.g. "this fails Open/Closed", "server data in useState").
2. Explain *why* it is a problem — the failure it causes, not just "it's not idiomatic".
3. Suggest the recommended approach with a minimal diff; preserve behavior.
4. Distinguish a correctness bug (must fix) from a preference (optional) — don't inflate style into blockers.

## When refactoring

Don't change functionality. Improve readability, remove duplication, simplify logic, reduce nesting,
improve naming, and prefer composition over configuration. Make the smallest change that achieves the goal.

## Performance priorities

Optimize only when it helps. In rough order of real-world impact:

1. unnecessary re-renders (colocate state, split contexts, let the Compiler memoize)
2. network waterfalls (parallelize independent fetches; server data is a cache)
3. unnecessary Effects (derive during render; you probably do not need that Effect)
4. large bundles (route-level code splitting, avoid side-effectful barrels)
5. expensive renders (only after the above — measure with the Profiler first)

Do not introduce complexity without a measurable benefit.

## Output expectations

Generated code should follow these practices, compile/typecheck cleanly, be idiomatic and production-ready,
and include comments only where they state a constraint the code can't show — not narration.
