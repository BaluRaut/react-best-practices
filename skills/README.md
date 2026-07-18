# React Best Practices — Claude Skills

Generated from the reference site by `scripts/build-skills.mjs`. Do not edit by hand —
edit `src/content/*.md` and re-run the build.

## Install

```bash
# personal skills (available in every project)
cp -r skills/* ~/.claude/skills/

# or, project-scoped (checked in with a repo)
cp -r skills/* .claude/skills/
```

Claude loads a skill when your request matches its `description`. Nothing to import.

## Skills

- **react-migration** — Use when upgrading a React codebase across major versions (16, 17, 18, or 19), when you hit a React upgrade error, or when choosing a codemod for a React migration. Covers the hop-by-hop breaking changes, the literal error messages, the exact codemod commands, and rollback risk.
- **react-practices** — Use when writing or reviewing React components and hooks: deciding whether a useEffect is needed, placing state, using keys, composing components, or configuring the React Compiler and manual memoization. Encodes react.dev guidance and the current (mature) React Compiler behaviour.
- **typing-react** — Use when typing React with TypeScript: props, children, events, hooks, generic or polymorphic components, or when fixing @types/react 19 type errors after an upgrade. Reflects the React 19 typings and their breaking changes.
- **typescript-practices** — Use when writing TypeScript or configuring tsconfig in the TypeScript 6/7 era: strictness flags, satisfies vs as, unions over enums, module resolution. Corrects advice that predates the flipped TS 6/7 defaults and the Go port.
- **modern-javascript** — Use when writing modern JavaScript: immutable array methods, structuredClone, AbortSignal cancellation, Object.groupBy, promise combinators, and error handling. Flags the nullish-coalescing vs OR bug and what is actually Baseline-available.
- **material-ui** — Use when building UI with Material UI (MUI) v9, or migrating MUI from v5/v6/v7: theming, sx vs styled, dark mode with CSS variables and color schemes, and the migration codemods. Notes why MUI skipped v8 and why to build on Emotion, not Pigment CSS.
- **vite-react** — Use when configuring a Vite + React single-page app or deploying one to GitHub Pages: the base path, env vars and the VITE_ secret-leak trap, code splitting, and the GitHub Actions deploy workflow. Targets Vite 8 (Rolldown).
- **react-quality** — Use when testing React (Vitest + React Testing Library), fixing accessibility (focus management on route change, roles, labels), improving performance (INP, bundle size, code splitting), or choosing linters and project structure for a React SPA.
