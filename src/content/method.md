# How This Stays Honest

Every other page on this site is a *conclusion*. This page is the *method* that produced them — and it
is the most transferable thing here, because the conclusions go stale but the method doesn't. If you
read one page as a Claude skill, read this one: it's the difference between repeating 2023's advice with
confidence and knowing which parts of it died.

The whole method is four habits.

---

## 1. Verify versions against the registry, not memory

A model's training data has a cutoff; the ecosystem doesn't. The single most common way authoritative-
sounding advice goes wrong is a **version claim that was true once**. So no version fact ships here
without a registry check.

```bash
npm view react version                 # 19.2.7
npm view @mui/material dist-tags       # latest 9.2.0, latest-v7 7.3.11 …
npm view antd time --json              # exact ship dates per version
```

> 🟢 **Best practice** — before asserting "X is on version N" or "Y was added in Z", run `npm view`.
> It's two seconds and it's ground truth. When your memory and the registry disagree, **the registry
> wins** — every time, without exception. This one habit prevents most confidently-wrong output.

**What it caught here:** Material UI is on **v9** and *skipped v8 entirely* (v7 → v9, no v8 ever
published). TypeScript is on **7.0.2** — the Go port ("Project Corsa"), binary still named `tsc`, not
`tsgo`. Vite is on **8** (ships Rolldown). antd is on **v6**, which dropped React 17. None of that was
in training data; all of it was one `npm view` away.

---

## 2. Run it; don't recall it

When a claim can be *executed* in a couple of minutes, executing beats every secondary source — and
often beats the primary docs, which describe intent, not your machine.

> 🟢 **Best practice** — if a claim is testable with `npm view`, `tsc`, a tiny script, or a jsdom
> render, test it. Attach the number or the output. "Measured on a small reproduction (state the setup)"
> is a stronger citation than any blog, and it's honest about its own scope.

**What it caught here:**

- **TypeScript `strict` is on by default in TS 6/7.** `tsc --showConfig` reports it `<unset>`, yet
  `TS7006`/`TS18047` fire. The most-repeated TS advice — "always set `strict: true`" — is now redundant.
- **The React Compiler's silent bailout.** A test harness that stashed a setter with `App.bump = setN`
  — a render-phase mutation — silently disabled the compiler (`_c` cache absent), and renders went from
  1 back to 11 with *no warning*. Discovered by accident, exactly because the work was run, not recalled.
- **antd v6 renders with React 19**, `App.useApp()` returns the message API in context, and v6 emits
  **CSS variables by default** (638 `--ant*` declarations on one button). Verified by rendering it, not
  by trusting the changelog.
- **Loop folklore is dead.** Measured: `for`/`while`/cached-`length` are identical; `+=` beats
  `array.join`; try/catch no longer deopts. See [Performance Craft](performance-craft).

> 🔴 **Advanced / gotcha** — even running it can lie. `npx tsc` once resolved to a **decoy package** that
> printed a plausible version and *fabricated* type errors for files that didn't exist. Rule: run the
> local binary (`./node_modules/.bin/tsc`), confirm `node_modules` exists, and be suspicious of output
> that too-perfectly matches what you expected.

---

## 3. Announced ≠ shipped. Deprecated ≠ removed. RC ≠ stable.

The vocabulary of change is full of words that sound like completion but aren't. Collapsing them is how
a roadmap becomes a false statement of fact.

> 🟢 **Best practice** — keep these distinct, always: **announced/planned** (may never land),
> **RC/beta/canary** (not stable), **deprecated** (still works, warns), **removed** (gone). A blog says
> "v9 introduces NumberField"; the registry says `@mui/material@9.2.0` doesn't export it. Both are true —
> one is the roadmap, one is the release. Cite the release.

**What it caught here:** MUI v9's blog advertised `NumberField` and `Menubar` — **neither ships** in
9.2.0. Pigment CSS is a *peer dependency* of MUI v9 (looks alive) but its repo reads "⚠️ Alpha phase,
currently on hold" (**dormant** — build on Emotion). A peerDep version moving in a monorepo lockstep is
*evidence of a version bump, not of active development* — a true fact from which the wrong conclusion is
easy to draw.

> 🔴 **Advanced / gotcha** — distinguish **evidence** from **inference**. "Pigment is a peerDep of MUI 9"
> is evidence. "Therefore Pigment is actively developed" is an inference — and it was wrong. Only the
> primary source (the repo status) settled it. Metadata can be true and still mislead.

---

## 4. Verify adversarially, then verify the verifier

One reviewer who tries to *confirm* a claim will confirm it. A reviewer told to *refute* it, defaulting
to "refuted unless proven", catches what confirmation misses. But a skeptic can also be wrong — so a
refutation that would change a published claim gets checked itself before it's applied.

> 🟢 **Best practice** — for load-bearing claims, review with intent to refute (assume wrong until
> primary-sourced). Then, before *acting* on a correction, verify the correction. Both directions matter.

**What it caught here:** an adversarial pass over the React-version pages flagged an eslint rule as
"invented." Checking the *installed* `eslint-plugin-react-hooks@7.1.1` showed the rule was real and the
page was right — **the correction was the error.** The same pass found two genuine TypeScript error-code
mistakes (an array access is `TS2532`, not `TS2322`; a missing `process` global is `TS2591`, not
`TS2304`), each confirmed by running real `tsc@7.0.2`. Verifying the verifier kept a good claim and still
caught the real bugs.

---

## The digest — folklore this method corrected

A one-line index of claims that "everyone knows" and that turned out to be false or stale in mid-2026.
Each is documented on its page.

| Common belief | What's actually true (verified) |
|---|---|
| MUI is on v6/v7 | **v9.2.0**; v8 never existed ([mui](mui)) |
| Always set `strict: true` | On by default in TS 6/7 ([ts-general](ts-general)) |
| The TS Go binary is `tsgo` | It's `tsc`; `tsgo` was only the preview ([ts-general](ts-general)) |
| Compiler's on → delete all `useMemo` | Harmful; `preserve-manual-memoization` is error-level ([react-practices](react-practices)) |
| Cache `arr.length` in loops | No effect in modern V8 ([performance-craft](performance-craft)) |
| `array.join` beats `+=` | `+=` is faster now ([performance-craft](performance-craft)) |
| try/catch deopts hot loops | Not in modern V8 ([performance-craft](performance-craft)) |
| Pigment CSS is the future of MUI | Dormant/alpha; use Emotion ([mui](mui)) |
| antd v6 supports React 17 | Dropped; needs React ≥18 ([antd-v6](antd-v6)) |
| You must upgrade React 16→17→18 in order | 18 emulates 17; you can skip the 17 install ([migration-matrix](migration-matrix)) |

> 🟢 **Best practice for using these skills** — when one of these pages disagrees with your prior, trust
> the page's *evidence* (the `npm view`, the `tsc` run, the measured number) over the prior — but if the
> page names a version, file, or flag, re-run the check, because the fact may have moved again since it
> was written. The method outlives the table.

## Sources

- The verification artifacts for this site live in its repo: `measure/` (benchmarks + render tests) and
  the research notes under the project's scratchpad. Every number cited across the site is reproducible.
- [npm registry](https://docs.npmjs.com/cli/v10/commands/npm-view) — `npm view <pkg> version|dist-tags|time`
- [react.dev](https://react.dev/), [typescriptlang.org](https://www.typescriptlang.org/), [mui.com](https://mui.com/), [ant.design](https://ant.design/), [vite.dev](https://vite.dev/) — primary sources, checked over memory.
