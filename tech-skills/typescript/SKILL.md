---
name: typescript
description: "Apply modern TypeScript best practices when writing, reviewing, or configuring TypeScript — tsconfig strictness, satisfies vs as, unknown over any, discriminated unions, generics, branded types, and typing React with @types/react 19. Version-verified for the TypeScript 6/7 era (flipped strict defaults, the Go port). Read the referenced files for detail."
metadata:
  source: https://baluraut.github.io/frontend-best-practices
---

# TypeScript Best Practices

Apply these when writing, reviewing, refactoring, or optimizing TypeScript code. Each rule on the reference pages is labelled 🟢 best practice / 🟡 optimization / 🔴 advanced-gotcha, with a bad-vs-good example and a "when not to". Verified against the current stack; sourced from [baluraut.github.io/frontend-best-practices](https://baluraut.github.io/frontend-best-practices/).

## Core principles

- Prefer readability over cleverness, correctness over micro-optimization, maintainability over brevity.
- Use modern language/runtime features when they are supported — and note the support floor when it matters.
- **These are guidelines and trade-offs, not laws.** Every optimization here says when *not* to apply it.
- Never apply an optimization without a measurable or practical benefit; avoid premature optimization.
- Explain the trade-off when a recommendation depends on context.

## Reference files

Read the file for the topic you're working on — each is a focused, self-contained guide:

- **[TypeScript in the TS 6/7 Era](references/ts-general.md)** — Verified stack for this page: **TypeScript 7.0.2** (GA 2026-07-08), the Go native port ("Project Corsa"). React 19.2.7, Vite 8.1.5, Material UI 9.2.0.
- **[TypeScript with React 19](references/ts-react.md)** — Typing props, children, events, refs, hooks, and generic/polymorphic components against

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

1. type-check / editor speed (skipLibCheck, project references, isolatedModules; TS 7 is the Go port)
2. not letting the type system push you toward runtime cost (types are erased; validate at the boundary, trust inside)

Do not introduce complexity without a measurable benefit.

## Output expectations

Generated code should follow these practices, compile/typecheck cleanly, be idiomatic and production-ready,
and include comments only where they state a constraint the code can't show — not narration.
