---
name: vite-react
description: "Use when configuring a Vite + React single-page app or deploying one to GitHub Pages: the base path, env vars and the VITE_ secret-leak trap, code splitting, and the GitHub Actions deploy workflow. Targets Vite 8 (Rolldown)."
metadata:
  source: https://baluraut.github.io/react-best-practices/vite
---

# Vite 8 + React SPA + GitHub Pages

Everything on this page was built, typechecked, and tested against the verified stack on a real
install: **Vite 8.1.5, React 19.2.7, `@vitejs/plugin-react` 6.0.3, TypeScript 7.0.2, Vitest 4.1.10,
`babel-plugin-react-compiler` 1.0.0.** Where a claim is empirical it is marked. Where the research
was low-confidence it is hedged, not upgraded.

The deploy section (§7) is load-bearing: this reference site itself is built and published from it.

---

## Vite 8 ships Rolldown as the bundler

Vite 8's bundler is **Rolldown** (Rust), and it is the default — no opt-in, no flag.

This is verifiable from the install tree, not just the blog. `rolldown` is a **runtime dependency**
of `vite@8.1.5`; `rollup` does not appear in a fresh `react-ts` install at all. The build banner
reads `vite v8.1.5 building client environment for production...`, and passing an unsupported option
surfaces a warning referencing `build.rolldownOptions.output.codeSplitting`.

What changes for you as a config author:

- **`rolldown-vite` (the preview package) is obsolete.** Do not install it. Vite 8 core *is* Rolldown.
- **Dev and prod now share one bundler.** Vite 7 used esbuild for dev and Rollup for build; that
  split is gone. This kills the classic "works in `vite dev`, breaks in `vite build`" bug class.
- **esbuild is still a peer dependency** (`^0.27 || ^0.28`), used for some transform paths — not for
  bundling.
- Some Rollup-era options changed shape. The one that bites is `manualChunks` (see §6).

> Vite 8 did **not** raise the Node floor. `engines` is `^20.19.0 || >=22.12.0`, identical to Vite 7.
> Node 18 will not run Vite 8. Use Node 20.19+ or 22.12+.

### The React plugin is Oxc-based now, not Babel-based

`@vitejs/plugin-react@6` transforms JSX and drives Fast Refresh through **Oxc**, not Babel. Verified
from the installed source: the internal plugin still carries the legacy name `vite:react-babel`, but
it configures `oxc`, and its dependency list contains **no `@babel/core`**. Babel is now an opt-in
escape hatch you pull in only for the React Compiler or custom Babel plugins.

| plugin | latest | verdict |
|---|---|---|
| `@vitejs/plugin-react` | **6.0.3** | **Use this.** Oxc-based, first-party, React Compiler supported via preset. |
| `@vitejs/plugin-react-oxc` | 0.4.3 | Existed as the "fast path" while plugin-react was Babel. Now redundant. Still 0.x. |
| `@vitejs/plugin-react-swc` | 4.3.1 | Only if you have an existing SWC investment. No longer a speed win over Oxc. |

The reason `-swc` and `-oxc` existed — escaping Babel's slowness — evaporated in v6. Default to
`@vitejs/plugin-react`.

> The research inferred `@vitejs/plugin-react-oxc` is *redundant*, not *deprecated* — its README says
> nothing. Treat it as "no longer needed for this stack," not "removed."

---

## A known-good baseline config

This exact `vite.config.ts` was built, typechecked, and tested green. It is the starting point the
rest of the page elaborates.

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // Load-bearing for GitHub Pages project sites — see §7.
  base: '/react-best-practices/',
  plugins: [react()],
  // Declare the alias explicitly; do not rely on the built-in tsconfig-paths — see §3.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

The `/// <reference types="vitest/config" />` line is what makes the `test` key typecheck inside
`defineConfig`. Without it, `tsc -b` rejects the config.

---

## What the official template ships (and what it doesn't)

`npm create vite@latest -- --template react-ts` today is **not** what most people remember. Measured
on a real scaffold:

```jsonc
{
  "scripts": { "dev": "vite", "build": "tsc -b && vite build", "lint": "oxlint", "preview": "vite preview" },
  "dependencies":  { "react": "^19.2.7", "react-dom": "^19.2.7" },
  "devDependencies": {
    "@types/node": "^24.13.2",
    "@types/react": "^19.2.17", "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.3",
    "oxlint": "^1.71.0",          // ESLint is GONE from the template
    "typescript": "~6.0.2",      // NOT 7.x, even though 7.0.2 is latest
    "vite": "^8.1.1"
  }
}
```

Two surprises worth internalizing:

1. **The template ships `oxlint`, not ESLint.** No `eslint.config.js`, no `eslint-plugin-react-hooks`.
   If you choose ESLint 10, that is now a *deliberate deviation from the template*, not the default.
2. **The template pins `typescript: ~6.0.2`, one major behind latest** (7.0.2, released 2026-07-08).
   The `~` range means `npm install` will not give you TS 7. This is lag, not a compatibility signal
   — TS 7.0.2 typechecks and builds this stack clean (verified). The likely reason the template stays
   on 6 is that the stock template has no path aliases, so it never trips TS 7's `baseUrl` removal
   (§3). Real apps do.

### The tsconfig app/node split

The root `tsconfig.json` is a **solution file only** — no `compilerOptions`, just project references:

```jsonc
{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }
```

- `tsconfig.app.json` → `include: ["src"]`, DOM libs, `noEmit`. Your browser code.
- `tsconfig.node.json` → `vite.config.ts` and friends. Node types, **no DOM globals** — config runs
  in Node and must not see `window`; `src` must not see Node globals.
- `tsc -b` (build mode) is required. Plain `tsc` on the root does nothing because `files: []`.

A few `tsconfig.app.json` options bite in practice:

- **`erasableSyntaxOnly: true`** makes `enum`, `namespace`, and constructor parameter properties
  **compile errors**. Oxc/esbuild strip types rather than compile them, so non-erasable syntax is
  banned. Use `const` objects + union types instead of enums.
- **`verbatimModuleSyntax: true`** means a plain `import { SomeType }` used only as a type is an
  error — you must write `import type { SomeType }`.

---

## Path aliases: use `resolve.alias`, and never write `baseUrl`

> ### TypeScript 7 REMOVED `baseUrl`. Do not write it.
> Every "path aliases in Vite" tutorial starts with `"baseUrl": "."`. On TS 7 that is a hard,
> non-silenceable error:
>
> | TS version | `"baseUrl": "."` |
> |---|---|
> | **7.0.2** | `error TS5102: Option 'baseUrl' has been removed.` — not silenceable |
> | **6.0.2** | `error TS5101: Option 'baseUrl' is deprecated...` — silence with `"ignoreDeprecations": "6.0"` |
> | 5.x | accepted silently |
>
> `ignoreDeprecations: "6.0"` is a **bridge, not a fix** — code that silences it on TS 6 hits a wall
> on TS 7. The fix is to **delete `baseUrl`**: `paths` values resolve relative to the tsconfig file
> itself.

Vite 8 has genuine built-in support for tsconfig `paths` — with zero alias config in
`vite.config.ts`, `vite build` resolves `@/lib/greet` and builds fine (verified). But there is a trap.

### The gotcha that bites: the build passes, the tests don't

The same project, same file, under Vitest 4:

```
Error: Failed to resolve import "@/lib/greet" from "src/App.tsx". Does the file exist?
  Plugin: vite:import-analysis
```

**`vite build` resolves the alias. Vitest 4 does not.** You ship a green build and a red test suite,
and the error ("Does the file exist?") sends you hunting for a typo that isn't there.

**Recommendation: declare the alias explicitly in `resolve.alias` and keep the tsconfig `paths` too.**
You need both:

```ts
// vite.config.ts — for the bundler AND Vitest
import { fileURLToPath, URL } from 'node:url'
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
```

```jsonc
// tsconfig.app.json — for the editor and tsc. NO baseUrl.
"paths": { "@/*": ["./src/*"] }
```

`resolve.alias` handles the runtime/bundler and Vitest; `paths` handles the type layer.
`vite-tsconfig-paths` is a single-source alternative, but it's a third-party dep to patch a
first-party gap — the six-line `resolve.alias` is more honest.

---

## Env vars: `VITE_` is a "this is public" declaration, not a secret

Mechanics, all verified by grepping the built `dist/`:

`.env`:
```
VITE_API_URL=https://api.example.com
VITE_TOKEN=leakme456
API_SECRET=supersecret123
```

| what | result |
|---|---|
| `import.meta.env.VITE_TOKEN` used in code | `leakme456` appears **verbatim** in `dist/assets/index-*.js` |
| `API_SECRET` (unprefixed) | **never** reaches the bundle |
| `JSON.stringify(import.meta.env)` (spread the whole object) | still does **not** leak `API_SECRET` — the prefix filter is a define-time transform, not a runtime object |

Spreading `import.meta.env` is safe; the prefix boundary is load-bearing.

### The footgun that leaks keys in production

**`envPrefix: ''` inlines your entire `.env` — including secrets — into a public bundle.** People set
this to skip renaming vars during a CRA→Vite migration (`REACT_APP_*` → `VITE_*`). Verified:

```ts
export default defineConfig({ envPrefix: '' })   // DO NOT
```
```
$ grep -ro "supersecret123" dist/assets/*.js
dist/assets/index-xxxx.js:supersecret123      ← LEAKED
```

The correct migration move is an explicit allowlist:

```ts
export default defineConfig({ envPrefix: ['VITE_', 'REACT_APP_'] })
```

> On GitHub Pages there is **no server**, so there is no such thing as a private env var in this
> project. Anything prefixed `VITE_` is baked as plaintext into a static asset served to every
> visitor. A GitHub Actions `secrets.FOO` piped into a `VITE_FOO` build arg is **published**, not
> secret — this is the #1 way teams leak keys on Pages. Real API keys must live behind a proxy/edge
> function, or be public-by-design keys with origin restrictions + scoped permissions.

---

## Code splitting: the `manualChunks` object form is broken under Rolldown

### The reproduced bug

```ts
build: { rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom'] } } } }
```
```
Build failed with 1 error:
TypeError: manualChunks is not a function
    at .../node_modules/rolldown/dist/shared/rolldown-build-*.mjs:3059:10
```

This is the **single most likely thing to break** on a Vite 7→8 upgrade, because the object form is
the copy-paste snippet in nearly every "split your vendor bundle" post from 2022–2025. Rolldown only
implements the **function** form of `manualChunks`.

Both of these work (verified — chunks actually emitted):

```ts
// A. function form — minimal diff from Rollup, portable
build: {
  rollupOptions: {
    output: {
      manualChunks(id: string) {
        if (id.includes('node_modules/react')) return 'react'
      },
    },
  },
}
```
```ts
// B. advancedChunks — Rolldown-native, declarative. PREFER on Vite 8.
build: {
  rollupOptions: {
    output: {
      advancedChunks: {
        groups: [{ name: 'react', test: /node_modules[\\/]react(-dom)?[\\/]/ }],
      },
    },
  },
}
```

Both split a ~190 kB `react-*.js` chunk out of the index chunk; they produced identical hashes in the
probe. `advancedChunks` is the supported-going-forward API and adds `minSize`/`maxSize`/priority.

> Do not hand-split vendor chunks by default. Rolldown's automatic chunking is usually better, and a
> manual `react` chunk mostly helps when React is genuinely stable across deploys. Reach for this only
> after measuring.

### Lazy routes

Standard dynamic `import()` is the real win and works unchanged:

```tsx
const Docs = lazy(() => import('./routes/Docs'))
// <Suspense fallback={<Spinner/>}><Docs/></Suspense>
```

> **Pages gotcha:** lazy chunks are fetched relative to `base`. If `base` is wrong, lazy routes 404
> *only after* the initial page loads fine — the "app works, clicking a link explodes" report.

### Build analysis

`vite build` already prints per-chunk gzip sizes, which covers most needs. Vite 8's integrated
devtools (`@vitejs/devtools`, peer dep `^0.3.0`) is the first-party option.
`rollup-plugin-visualizer` was the Rollup-era standard but is **untested against Rolldown** — verify
before relying on it.

---

## GitHub Pages deploy

This is the deliverable. Everything here was run end-to-end.

### `base` — non-negotiable for a project page

Deploying to `https://baluraut.github.io/react-best-practices/` (a **project** page, not a user page)
means assets live under `/react-best-practices/`. The default `base: '/'` produces `/assets/index.js`,
which 404s → **blank white page, nothing in the console, only the network tab shows it.**

```ts
export default defineConfig({ base: '/react-best-practices/' })
```

Leading **and** trailing slash are both required. Verified — `dist/index.html` after build:

```html
<link rel="icon" href="/react-best-practices/favicon.svg" />
<script type="module" src="/react-best-practices/assets/index-BG_o4Ml2.js"></script>
<link rel="stylesheet" href="/react-best-practices/assets/index-D64VDMd1.css">
```

Wire the router to it, or client-side routing fights the base:

```tsx
<BrowserRouter basename={import.meta.env.BASE_URL}>
```

`import.meta.env.BASE_URL` is populated from `base` automatically. Use it rather than re-typing the
literal, so dev (`/`) and prod (`/react-best-practices/`) both work.

### The SPA-404 problem

GitHub Pages is a **static file server with no rewrite rules.** `BrowserRouter` shows
`/react-best-practices/docs`. On a soft (in-app) navigation that's fine — React Router handles it
client-side. But on a **hard load** — refresh, or someone opening a deep link you shared — the browser
asks GitHub for the file `/react-best-practices/docs`. It doesn't exist. **404.**

So the app works perfectly until a user refreshes or shares a link. That's the bug that reaches prod.

| fix | how | cost |
|---|---|---|
| **`404.html` copy** | Ship `dist/404.html` byte-identical to `index.html`. Pages serves it for any unmatched path, the SPA boots, React Router reads `location.pathname` and renders the right route. | Clean URLs. Response status is **404** — non-ideal for SEO/crawlers, some monitors flag it. |
| **`HashRouter`** | URLs become `/react-best-practices/#/docs`. The fragment never hits the server, so every path resolves to `index.html`. | Ugly URLs, worse SEO, breaks anchor links, 200 status. Zero config, cannot break. |
| **`spa-github-pages` redirect hack** | `404.html` encodes the path into a querystring and redirects to `index.html`, which decodes it. | Clean URLs, but adds a redirect flash + real complexity. Legacy of the pre-`404.html` era. |

**Recommendation: the `404.html` copy.** For a public reference site, clean shareable URLs matter for
credibility and SEO-via-links, and the trick is one line in CI. The 404 *status code* is the real
tradeoff — Google generally indexes these fine in practice, but it is genuinely non-ideal; frame it as
a tradeoff you're accepting, not a solved problem. If you ever need guaranteed-correct status codes,
that's the signal to move to a host with real rewrites (Cloudflare Pages/Netlify) — **not** to switch
to HashRouter. Choose HashRouter only if you cannot control the build output.

Do it in the build, not by hand:

```json
{ "scripts": { "build": "tsc -b && vite build && cp dist/index.html dist/404.html" } }
```

(Windows-safe alternative: a tiny `postbuild` Node script, or `vite-plugin-static-copy`.)

### `public/` vs `src/assets/`

- **`src/assets/`** → imported (`import logo from './assets/logo.svg'`). Goes through the bundler:
  content-hashed, `base`-rewritten, tree-shaken, inlined if tiny. **Default choice.**
- **`public/`** → copied verbatim to `dist/` root. No hash, no processing. For `robots.txt`,
  `favicon.svg`, `CNAME`, OG images — things needing a stable, predictable URL.

> **The `public/` + `base` footgun:** a hardcoded `/logo.png` in your JSX/CSS **breaks on Pages** — it
> resolves to `baluraut.github.io/logo.png`, not `/react-best-practices/logo.png`. Vite rewrites `/foo`
> public refs in `index.html` and in CSS `url()`, but **not** strings you construct in JS. Always:
> `` `${import.meta.env.BASE_URL}logo.png` `` — `BASE_URL` already ends in a slash, don't add a second.

### `.nojekyll` — needed only for the legacy deploy

GitHub Pages historically ran Jekyll, which ignores files/folders starting with `_`. With the
**Actions-based** deploy (`upload-pages-artifact` + `deploy-pages`) that this project uses, the
artifact is served as-is — **Jekyll never runs**, so `.nojekyll` is not required. It is free and
harmless, though, and makes the build robust if anyone ever switches the Pages source back to a
branch. Ship it as cheap insurance (`touch public/.nojekyll`), but don't cargo-cult it as "required."

### The Actions workflow — action majors verified 2026-07-17

**Do not write these versions from memory. They have all moved.** Verified against the GitHub API:

| action | current major | commonly-remembered-but-STALE |
|---|---|---|
| `actions/checkout` | **v7.0.0** | v4 |
| `actions/setup-node` | **v7.0.0** | v4 |
| `actions/configure-pages` | **v6.0.0** | v5 |
| `actions/upload-pages-artifact` | **v5.0.0** | v3 |
| `actions/deploy-pages` | **v5.0.0** | v4 |

> `setup-node@v7` released 2026-07-14 — very new. If CI misbehaves on it, pinning `@v6` is the first
> thing to try.

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

# GITHUB_TOKEN permissions required by deploy-pages
permissions:
  contents: read
  pages: write
  id-token: write

# Never cancel an in-flight deploy; queue instead.
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 22          # Vite 8 needs ^20.19 || >=22.12
          cache: npm

      - run: npm ci

      - run: npx tsc -b
      - run: npx vitest run

      # base is set in vite.config.ts; the 404.html copy makes deep links work
      - run: npm run build

      - uses: actions/configure-pages@v6

      - uses: actions/upload-pages-artifact@v5
        with:
          path: ./dist          # Vite's output dir

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

**The one manual step you cannot do from YAML:** Repo → Settings → Pages → **Source: "GitHub
Actions"** (not "Deploy from a branch"). If this stays on branch-deploy, the workflow goes green and
*nothing happens* — the most common "it works but doesn't deploy" report.

The build/deploy split is deliberate: `deploy-pages` requires the `github-pages` environment and
`id-token: write` for OIDC. Keeping deploy in its own minimal job limits what runs with those creds.

Other first-try failure modes:

- **Missing `permissions:` block** → `deploy-pages` fails with a 403 on the OIDC token.
- **Wrong `path:`** (e.g. `./build`) → artifact uploads empty, deploy "succeeds," site is blank.
- **`node-version: 18`** → Vite 8 will not run. `20` resolves to latest 20.x (≥20.19), which is fine.
- **`npm ci`** requires a committed `package-lock.json`.
- **`cancel-in-progress: true`** → two quick pushes can cancel a deploy mid-upload and leave Pages
  half-published. Keep it `false`.

---

## The end-to-end verified baseline

This exact combination was built, typechecked, and tested green on 2026-07-17:
`vite@8.1.5` + `react@19.2.7` + `@vitejs/plugin-react@6.0.3` + `typescript@7.0.2` + `vitest@4.1.10` +
`@testing-library/react@16.3.2` + `babel-plugin-react-compiler@1.0.0`.

- `tsc -b` → exit 0
- `vitest run` → passing
- `vite build` → `dist/` with `base` correctly rewritten
- `cp dist/index.html dist/404.html` → byte-identical (`diff -q` → IDENTICAL)
- `public/.nojekyll` → lands at `dist/.nojekyll`

The three `tsconfig.app.json` deltas from the stock template — the only ones you need:

```jsonc
"types": ["vite/client", "vitest/globals"],   // vitest globals; "types" is an allowlist
"paths": { "@/*": ["./src/*"] }               // NO baseUrl — removed in TS 7
```
```json
{ "scripts": { "build": "tsc -b && vite build && cp dist/index.html dist/404.html" },
  "devDependencies": { "typescript": "~7.0.2" } }
```

> Vitest's `globals: true` lets you use bare `test`/`expect` at runtime, but `tsc -b` still fails with
> `TS2593: Cannot find name 'test'` until you add `vitest/globals` to `types`. This surfaces only in
> CI. **Ignore the error's advice to `npm i --save-dev @types/jest`** — that's TS's generic hint and
> it pulls in a conflicting global `expect`. Because the template sets `"types"` explicitly, it is an
> allowlist: adding vitest means listing it, you cannot rely on ambient auto-discovery.

---

## Sources

- Vite 8 release / Rolldown as default bundler — https://vite.dev/blog/ and https://vite.dev/guide/
- Vite env variables and modes — https://vite.dev/guide/env-and-mode.html
- Vite `build.rollupOptions` / chunking — https://vite.dev/config/build-options.html
- Rolldown `advancedChunks` — https://rolldown.rs/
- `@vitejs/plugin-react` — https://github.com/vitejs/vite-plugin-react
- React Compiler installation — https://react.dev/learn/react-compiler
- TypeScript 7 (`baseUrl` removal, native port) — https://devblogs.microsoft.com/typescript/
- Vitest config / globals — https://vitest.dev/config/
- GitHub Pages with a custom GitHub Actions workflow — https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- Pages Actions: `configure-pages`, `upload-pages-artifact`, `deploy-pages` — https://github.com/actions/deploy-pages
- SPA 404 handling on Pages (`404.html` copy) — https://github.com/rafgraph/spa-github-pages
