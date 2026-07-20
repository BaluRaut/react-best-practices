---
name: javascript
description: "Apply modern JavaScript best practices when writing, reviewing, refactoring, or optimizing JavaScript — language features, async, immutability, error handling, performance, and naming/code conventions. Covers ES2020–2024, promise combinators, AbortSignal, throw-vs-Result errors, and measured performance. Read the referenced files for detail."
metadata:
  source: https://baluraut.github.io/frontend-best-practices
---

# JavaScript Best Practices

Apply these when writing, reviewing, refactoring, or optimizing JavaScript code. Each rule on the reference pages is labelled 🟢 best practice / 🟡 optimization / 🔴 advanced-gotcha, with a bad-vs-good example and a "when not to". Verified against the current stack; sourced from [baluraut.github.io/frontend-best-practices](https://baluraut.github.io/frontend-best-practices/).

## Core principles

- Prefer readability over cleverness, correctness over micro-optimization, maintainability over brevity.
- Use modern language/runtime features when they are supported — and note the support floor when it matters.
- **These are guidelines and trade-offs, not laws.** Every optimization here says when *not* to apply it.
- Never apply an optimization without a measurable or practical benefit; avoid premature optimization.
- Explain the trade-off when a recommendation depends on context.

## Reference files

Read the file for the topic you're working on — each is a focused, self-contained guide:

- **[Modern JavaScript for React Apps (ES2020 → mid-2026)](references/js-general.md)** — The language moved a lot between the last time most codebases were written and today. This page covers the modern JS worth reaching for in a React app, the traps each feature hides
- **[Error Handling (JS/TS)](references/error-handling.md)** — The feature pages tell you what the language *has*; this one is about the discipline no single feature teaches — deciding what to throw, what to return, what to type, and where a f
- **[Performance Craft (JavaScript & TypeScript)](references/performance-craft.md)** — What a staff engineer actually does about performance — which is mostly *not* what the folklore says. Every number on this page was measured on a real V8 (Node 24, macOS arm64) wit
- **[Naming & Code Conventions](references/conventions.md)** — Formatting — semicolons, quote style, indent width — is a solved problem: a formatter (Prettier, Biome) decides it, and arguing about it is wasted time. This page is the part a for

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

1. algorithmic complexity (a Set/Map beats an O(n²) .includes-in-a-loop by orders of magnitude)
2. allocation / GC pressure in hot loops (the usual real cause of "slow JS")
3. sequential awaits over independent work (parallelize with Promise.all)
4. loop construct only in a measured hot path over large data — never as a style rule

Do not introduce complexity without a measurable benefit.

## Output expectations

Generated code should follow these practices, compile/typecheck cleanly, be idiomatic and production-ready,
and include comments only where they state a constraint the code can't show — not narration.
