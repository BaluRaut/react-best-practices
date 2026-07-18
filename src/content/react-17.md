# React 17 — the stepping stone

React 17 is a historical artifact. It has been frozen at **17.0.2 since March 2021**, and `react@latest` is **19.2.7** (npm, 2026-07). Nobody starts a project on 17. These notes exist for one audience: people maintaining or escaping a legacy React tree, and people planning a 16→18/19 upgrade who need to understand what 17 actually changed — because **17's breaking changes bite you whether or not you ever install 17.**

> The React blog posts that originally documented 17 (`react.dev/blog/2020/...`) now 404. The canonical URLs survive only on `legacy.reactjs.org`, and the authoritative record of what shipped is `facebook/react`'s `CHANGELOG.md`. This page cites the CHANGELOG by PR number so the claims stay traceable even as blog URLs rot. These notes were **not** re-verified first-hand against the (now-dead) blog posts; treat version facts as inherited from the CHANGELOG, and hedges as deliberate.

**Timeline (npm registry `time` field):**

| Version | Date | What it is |
|---|---|---|
| 17.0.0-rc.0 | 2020-08-10 | Release candidate |
| 16.14.0 | 2020-10-14 | Backport of the new JSX transform to 16 |
| 17.0.0 | 2020-10-20 | GA |
| 17.0.1 | 2020-10-22 | Patch |
| 17.0.2 | 2021-03-22 | Final 17 release — frozen since |

---

## Do you even need this hop? (No.)

The folklore says "React 17 is the mandatory hop for 16→18." **That premise is false**, and repeating it will get the page disproven in thirty seconds by anyone who runs an npm install.

- The React 18 upgrade guide specifies **no minimum version** and never instructs you to pass through 17. Its install step is literally `npm install react react-dom`.
- `npm install react@18 react-dom@18` from a React 16 app works. No version gate, no runtime check, no codemod requires 17 as an intermediate.
- Positive evidence, not just absence: **React 18 deliberately emulates React 17.** Its own console warning says *"your app will behave as if it's running React 17."* You cannot need to stop at a version your target emulates.
- The only version-steering advice in the guide points the *other* way: *"If you need to support Internet Explorer we recommend you stay with React 17."* That's a reason to **stop at** 17, not to **pass through** it.

So why does the folklore persist? Because it's **wrong about the mechanism but right about the danger**:

> Skipping the 17 *install* does not skip 17's *breaking changes.* Event delegation moving to the root container, the new JSX transform, and the removal of event pooling all land in your app the moment you go past 16 — and the React 18 upgrade guide never documents them. Going 16→18 in one jump means debugging the root-container event change **and** automatic batching **and** `createRoot` **and** StrictMode double-mount in a single PR.

**Correct framing: React 17 is an optional de-risking checkpoint, not a required hop.** Splitting 16→17→18 is a *project-management* decision that isolates the event-delegation breakage into its own PR, shrinking each blast radius. React still recommends upgrading the whole app at once when you can — "For most apps, upgrading all at once is still the best solution." The staged path is for large apps where you want each class of breakage bisectable, not for a technical requirement that does not exist.

Everything below is the set of breaking changes you must handle when crossing the 16→17 line — whether you land on 17 or blow past it to 18/19.

---

## Rule 1: React 17 shipped infrastructure, not features

**The rule:** Treat React 17 as a *release-engineering* release. It has, in React's own words, "no developer-facing features." Everything in it exists to make future upgrades survivable.

**Why:** Before 17, React upgrades were all-or-nothing. A 100k-component monolith with one unmaintained corner could not move, so the whole app stayed pinned. React 17 changes the calculus by making it safe to embed a tree managed by one React version inside a tree managed by another — the "gradual upgrade" story.

**The failure it prevents:** an app permanently stranded on an old React because one legacy subtree can't be migrated and there's no way to move the other 95% independently.

**The honest caveat — the gradual-upgrade escape hatch is genuinely nasty, and React says so.** From `reactjs/react-gradual-upgrade-demo`:

- *"This approach is inherently more complex, and should be used as a last resort when you can't upgrade."*
- *"Loading two Reacts on the same page is bad for the user experience"* — the demo lazy-loads the legacy bundle behind `<Suspense>` so it never enters the initial payload.
- **Context does not cross the boundary.** Inner trees can't read outer-tree context; you hand-bridge every provider through props. Theming, routing, i18n, react-query clients — all of it. This is usually what kills the idea in practice.
- Two Reacts means **two copies of every context-based library**: your design system, your router, your store — duplicated, each with its own independent internal state.

Rank of options for a real team: (1) upgrade the whole app; (2) upgrade the whole app but stage it 16→17→18; (3) two Reacts on one page. Option 3 is for when a business unit refuses to fund migrating a subtree — not for when it's merely tedious.

---

## Rule 2: Event delegation moved from `document` to the root container — this is the whole release

**The rule:** In React 17, React attaches its delegated event listeners to the **root DOM container** you rendered into, not to `document`.

```js
const rootNode = document.getElementById('root');
ReactDOM.render(<App />, rootNode);
// React 16: document.addEventListener(...)
// React 17: rootNode.addEventListener(...)
```

**Why:** with `document`-level delegation, two React trees on one page fight over the same delegation point and there's no coherent way to order a React 16 handler against a React 17 handler. Moving delegation to the root container makes each tree's event system self-contained and nestable — which is what unlocks Rule 1. It also fixes a long tail of React ↔ non-React interop bugs (jQuery plugins, Stripe Elements, third-party widgets, anything listening on `document`).

**The failure it prevents:** nested React trees with unpredictable event ordering, and non-React code that can't reliably observe or intercept React events.

### The bad pattern

```js
// BAD — silently stops working when you cross the 16→17 line
document.addEventListener('click', function () {
  // React 16: fires for every click, INCLUDING ones where a React
  //   component called e.stopPropagation() (React was already at document).
  // React 17: never fires for those clicks — the native event now stops
  //   at the root container, which sits BELOW document.
  closeAllDropdowns();
});
```

Why it breaks: React 16 called `e.stopPropagation()` on a *synthetic* event, which never touched the native event's propagation up to `document`. In React 17, React's listener sits on `#root`, so stopping propagation inside the React tree genuinely stops the native event before it reaches `document`.

### The good pattern

```js
// GOOD — capture phase runs top-down, so document sees the click
// BEFORE React's root-container listener can stop it.
document.addEventListener(
  'click',
  function () {
    closeAllDropdowns();
  },
  { capture: true }
);
```

This is the fix React itself recommends. Note the **semantic shift**: you now fire *before* React handles the event, not after. If your handler assumed React state had already updated, it hasn't. This is reordering, not just re-registering.

**Better still:** listen on the root container directly, or handle it inside React with an `onClickCapture` at the top of the tree. The `document` + `{ capture: true }` combo is the minimal-diff fix, not the clean one.

> **The click-outside dismissal bug is the canonical casualty.** Every hand-rolled dropdown / modal / popover that does `document.addEventListener('click', closeIfOutside)` and coexists with a component calling `e.stopPropagation()` breaks *in one direction only*: the menu stops closing. It doesn't throw. It doesn't warn. It ships. `grep -rn "document.addEventListener" src/` before you upgrade — that grep is the single highest-value action in a 16→17 migration.

### More production gotchas

- **Third-party libraries pinned to old versions are landmines.** Anything that reached into React's event system — the `stopPropagation`-based portal escape hatches in older component libraries — quietly no-ops on 17+. Blueprint's `Portal stopPropagationEvents` is a documented real-world instance (palantir/blueprint#6580). The library doesn't crash; the prop just does nothing.
- **`e.stopPropagation()` inside a portal now actually stops native propagation** at the portal container.
- **Rendering into a container that isn't a `document.body` descendant** (shadow DOM, iframes) changes meaningfully. React 17 shipped a fix for rendering into a shadow root (#15894) precisely because delegation moved.

### Portals: listeners attach eagerly to portal containers

React 17's changelog entry *"Attach all known event listeners when the root mounts"* (#19659, "Attach Listeners Eagerly to Roots and Portal Containers") exists because root-container delegation broke portals: if a portal's subtree has no `onClick` but an ancestor in the **React tree** does, the native event never reaches a node React listens on, so the synthetic event never bubbles to that ancestor. The fix is to eagerly attach the full listener set to every portal container at mount.

Consequences:

- React 17 attaches its whole supported-event listener set to **every root and every portal container** at mount time, not lazily per-handler as React 16 did. Many portals = many listener sets. (There's a guard so multiple portals into the same node don't double-attach.)
- Portal event semantics still follow the **React tree, not the DOM tree** — always true, still true in React 19. Per current docs: *"Events from portals propagate according to the React tree rather than the DOM tree... if you click inside a portal, and the portal is wrapped in `<div onClick>`, that `onClick` handler will fire. If this causes issues, either stop the event propagation from inside the portal, or move the portal itself up in the React tree."*
- **Don't claim React 17 "fixed portal events."** It *changed* them and traded one class of bug for another. Follow-on issues were never fully closed in 17 — facebook/react#21989 ("createPortal anywhere in the tree makes native events be run too late") and #23074 (`document.addEventListener` + portal bubbling).

> **Confidence hedge:** the eager-listener *rationale* above (portal subtree lacking a listener its ancestor has) is reconstructed from the PR title, the `enableEagerRootListeners` flag, and the changelog line — not from reading the PR diff. The *mechanism* is medium-confidence; the *fact that listeners now attach eagerly per portal container* is confirmed in the changelog.

---

## Rule 3: The other event-system changes ride along with delegation

All from the 17.0.0 changelog. These are separate breakages people misattribute to the delegation change and then debug in the wrong place.

**`onScroll` no longer bubbles** (#19464). React 16 *emulated* bubbling for `onScroll`, which the DOM does not do. React 17 stops emulating.

```jsx
// BAD — worked in React 16 by accident, dead in 17+
<div onScroll={handleScroll}>
  <div className="overflow-auto">{items}</div>  {/* the actual scroller */}
</div>

// GOOD — put the handler on the element that actually scrolls
<div>
  <div className="overflow-auto" onScroll={handleScroll}>{items}</div>
</div>
```

Failure mode: infinite-scroll and scroll-spy silently stop firing. This is *correct* behavior now — native `scroll` doesn't bubble — but it looks like a regression.

**`onFocus`/`onBlur` now use native `focusin`/`focusout`** (#19186). These *do* bubble natively, which is why React can use them. Mostly transparent, but the underlying native `event.type` differs, so code inspecting `e.nativeEvent.type` breaks. Also fixed alongside: `relatedTarget` reported as `undefined` in Firefox (#19607).

**All `Capture` events use the real browser capture phase** (#19221). React 16 simulated capture ordering inside its own synthetic system; React 17 uses `addEventListener(..., true)`. Ordering between React capture handlers and *native* capture handlers changes.

**`onSubmit`/`onReset` are now delegated** (#19333) — they weren't before.

**`onTouchStart`, `onTouchMove`, `onWheel` are passive** (#19654).

```jsx
// BAD on React 17+ — preventDefault is ignored; browser logs an error
<div onTouchMove={(e) => e.preventDefault()}>…</div>

// GOOD — attach a non-passive native listener yourself
function NoScroll({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const onTouchMove = (e) => e.preventDefault();
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);
  return <div ref={ref}>{children}</div>;
}
```

> **Confidence hedge on the touch change:** the changelog wording is *"Keep* `onTouchStart`, `onTouchMove`, and `onWheel` passive" (#19654) — the word "Keep" suggests this may already have been true for some of these in React 16, i.e. possibly *not* a 17 change at all. The *DOM consequence* (`preventDefault` in a passive listener is ignored and warns) is unambiguous from the spec; whether it's a *17 migration item* is worth a direct test before you treat it as one. There is no React-level opt-out either way — you must attach a non-passive native listener yourself.

---

## Rule 4: Event pooling is gone — delete your `e.persist()` calls

**The rule:** React 17 removed the event-pooling optimization (#18969). Synthetic event objects are no longer recycled and nulled-out after the handler returns.

**Why:** pooling was a 2013-era optimization for browsers that no longer exist. It cost every React developer a confusing crash at least once.

**The failure it prevents:** the classic `Cannot read property 'value' of null` / *"This synthetic event is reused for performance reasons"* warning when you touch an event asynchronously.

```jsx
// BAD in React 16 — crashes, because `e` is recycled before the updater runs
function handleChange(e) {
  setData((data) => ({
    ...data,
    text: e.target.value, // e.target is null by the time this executes
  }));
}

// The React 16 workaround, now dead weight:
function handleChange(e) {
  e.persist();
  setData((data) => ({ ...data, text: e.target.value }));
}

// GOOD in React 17+ — just works, no persist needed
function handleChange(e) {
  setData((data) => ({ ...data, text: e.target.value }));
}
```

> **`e.persist()` still exists on React 17+ — it just does nothing.** So it's not a migration blocker and a codemod isn't urgent. But it's a **one-way door**: once you delete `persist()` calls or write new async-event code, you cannot roll back to React 16 without reintroducing the crash. If you're doing a staged rollout with a revert plan, leave the `persist()` calls in place until 17 is locked in. This is the sort of thing that makes a "safe" revert produce a broken app.

---

## Rule 5: `useEffect` cleanup timing changed — capture mutable values

Two distinct changes, both in the 17.0.0 changelog:

1. **`useEffect` cleanup functions run asynchronously** (#17925). Previously cleanup ran synchronously at unmount, like `componentWillUnmount`, blocking the screen update. Now, *"if the component is unmounting, the cleanup runs after the screen has been updated."*
2. **All effect cleanups (tree-wide) run before any new effects** (#17947). Previously ordering was only guaranteed within a single component; now it's guaranteed across the whole tree.

**Why:** synchronous cleanup on unmount put arbitrary user code on the critical path of a screen update — a jank source, and an obstacle to concurrent rendering. Tree-wide cleanup ordering removes a class of ordering bug where component A's new effect ran before component B's old cleanup.

**The failure it prevents:** dropped frames when unmounting large trees; effects observing a half-torn-down tree.

**The gotcha it introduces** — this is the one that actually bites:

```jsx
// BAD — someRef.current may already be null when cleanup runs, because
// cleanup is now deferred past the screen update (and React nulls refs
// during commit).
useEffect(() => {
  someRef.current.someSetupMethod();
  return () => {
    someRef.current.someCleanupMethod(); // 💥 TypeError: null
  };
});

// GOOD — capture the mutable value into the effect's closure
useEffect(() => {
  const instance = someRef.current;
  instance.someSetupMethod();
  return () => {
    instance.someCleanupMethod();
  };
});
```

The general rule: **anything mutable you read in setup, capture into a local before the cleanup closure.** This is a good habit independently of React 17 — React 18's StrictMode double-mount and concurrent features punish the same mistake harder.

**Nice surprise:** React 17 *specifically* suppresses the "Can't perform a React state update on an unmounted component" warning in the gap between unmount and deferred cleanup. Per the RC post, React *"does not fire setState warnings in the short gap between unmounting and the cleanup,"* so abort/`clearInterval` cleanups need no changes.

---

## Rule 6: The new JSX transform — adopt it, but know it's decoupled from React 17

**The rule:** Turn on the automatic JSX runtime. Stop writing `import React from 'react'` for JSX.

**Why:** the classic transform compiles JSX to `React.createElement()`, so `React` had to be in lexical scope in every JSX file — pure boilerplate, and a footgun (a bundler that tree-shakes an "unused" React import breaks the file). The new transform imports `react/jsx-runtime` automatically, produces slightly better output, and lets non-React libraries own JSX via `jsxImportSource`.

**Compilation, exactly:**

```js
// OLD (classic) — you must import React yourself
import React from 'react';
function App() {
  return React.createElement('h1', null, 'Hello world');
}

// NEW (automatic) — compiler inserts the import
import { jsx as _jsx } from 'react/jsx-runtime'; // inserted by the compiler; don't import it yourself
function App() {
  return _jsx('h1', { children: 'Hello world' });
}
```

> **Critical decoupling most write-ups get wrong:** the new JSX transform is **not a React 17 feature.** React added the `react/jsx-runtime` and `react/jsx-dev-runtime` entry points in 17.0.0, but **backported them to 16.14.0, 15.7.0, and 0.14.10.** You can adopt the new transform on React 16.14 and never touch 17; you can run React 17 with the classic transform forever. "Upgrade to 17 to drop your React imports" is a factual error.

**Adoption matrix** (from the primary announcement + TS release notes):

| Tool | Minimum version | Config |
|---|---|---|
| React runtime | 17.0.0, or backports 16.14.0 / 15.7.0 / 0.14.10 | — |
| Babel | v7.9.0+ | `["@babel/preset-react", { "runtime": "automatic" }]` |
| TypeScript | **4.1+** | `"jsx": "react-jsx"` (prod) / `"react-jsxdev"` (dev) |
| Flow | v0.126.0+ | `react.runtime=automatic` |
| Create React App | 4.0.0+ | automatic |
| Next.js | v9.5.3+ | automatic |
| Gatsby | v2.24.5+ | automatic |

```json
// babel.config.json
{ "presets": [["@babel/preset-react", { "runtime": "automatic" }]] }
```

```jsonc
// tsconfig.json — production
{
  "compilerOptions": {
    "module": "esnext",
    "target": "es2015",
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["./**/*"]
}
```

```jsonc
// tsconfig.dev.json — dev build, adds source location to elements
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "jsx": "react-jsxdev" }
}
```

`jsxImportSource` (TS 4.1, and Babel) defaults to `"react"` and redirects the auto-import — this is how Preact (`"jsxImportSource": "preact"`) and Emotion (`"@emotion/react"`) hook in.

**Codemod:** `npx react-codemod update-react-imports` — removes unused React imports and rewrites default imports to named imports.

**ESLint:** turn off the now-wrong rules, or you'll be told to add back the import you just removed:

```json
{ "rules": { "react/jsx-uses-react": "off", "react/react-in-jsx-scope": "off" } }
```

### Gotchas that bite in production

- **`import React from 'react'` is still required for everything that isn't JSX.** `useState`, `useEffect`, `createContext`, `memo`, `forwardRef` all still need a real import. The transform only removes the *implicit JSX* dependency. Prefer named imports: `import { useState } from 'react'`.
- **`react-jsxdev` vs `react-jsx` is not cosmetic.** `jsxDEV` carries `__source`/`__self` (file, line, column) into every element. Ship `react-jsxdev` to production and you leak source paths into your bundle and pay the runtime cost. Use two tsconfigs, or drive it from an env var. Easy to get wrong when one `tsconfig.json` serves both builds.
- **Mixed transforms across a monorepo interoperate fine** — a classic-built package and an automatic-built one produce identical elements. Debugging is where it hurts: half your stack shows `React.createElement`, half shows `_jsx`.
- **The classic transform is not deprecated.** React said it "will keep working" with no removal timeline. It still works in React 19. Don't tell readers it's going away.

---

## Rule 7: Two smaller 17 breakages that produce confusing failures

**`forwardRef`/`memo` returning `undefined` now throws** (#19550). Previously only class and function components were checked. Return `null` for "render nothing."

```jsx
// BAD — throws in React 17+; silently rendered nothing in 16
const Thing = memo(function Thing({ show }) {
  if (!show) return;          // implicit undefined
  return <div>hi</div>;
});

// GOOD
const Thing = memo(function Thing({ show }) {
  if (!show) return null;
  return <div>hi</div>;
});
```

This is a *good* change that turns a silent bug into a loud one — but it surfaces on upgrade day as "React 17 broke my app." It didn't; it found the bug.

**Component stacks are built from native error frames** (#18561). Stacks become clickable in the console and symbolicate correctly in production via sourcemaps. Mechanism: React throws and catches a temporary error inside each component above the failure to reconstruct the frame — a small perf penalty *on crashes only*, once per component type. Side effect: **error-reporting middleware that parses React's old synthetic stack format won't recognize the new one** — check your Sentry/Bugsnag grouping after upgrade.

**Private exports removed** (#18483) — internals that React Native Web reached into. `ReactTestUtils.SimulateNative` deprecated (#13407); React points you at React Testing Library.

---

## Migration checklist (16 → 17)

Ordered by expected yield:

1. `grep -rn "document.addEventListener" src/` — every hit is a delegation-change candidate. Fix with `{ capture: true }` or move the listener to the root container.
2. `grep -rn "stopPropagation" src/` — cross-reference with #1. The intersection is where the click-outside bugs live.
3. `grep -rn "onScroll" src/` — is the handler on the element that actually scrolls?
4. `grep -rn "onTouchMove\|onTouchStart\|onWheel" src/` — any `preventDefault()` inside may now be a no-op (verify per Rule 3's hedge).
5. Audit portal-heavy components and any third-party library with portal `stopPropagation` escape hatches.
6. Effect cleanups reading `ref.current` — capture into a local.
7. `react` and `react-dom` **must be the same version.** `react@17` + `react-dom@16` is not a supported configuration.
8. Leave `e.persist()` calls in place until you're sure you won't revert.
9. Adopt the new JSX transform as a **separate PR** — it's a whole-codebase diff, and mixing it with the event changes makes the upgrade unbisectable.

> **Facebook's own data point:** fewer than 20 components needed changes out of 100,000+. Useful for calming stakeholders — but note the selection bias: that's a codebase with unusually disciplined event handling and no third-party widget zoo. Your click-outside handlers and your pinned component libraries are where your number will come from, not React's.

---

## Sources

Primary. Note that the React 17 blog posts have been removed from `react.dev` (they 404) and survive only on `legacy.reactjs.org`; the authoritative, still-maintained record is the CHANGELOG.

- facebook/react `CHANGELOG.md`, 17.0.0 / 17.0.1 / 17.0.2 sections — https://github.com/facebook/react/blob/main/CHANGELOG.md (raw: https://raw.githubusercontent.com/facebook/react/main/CHANGELOG.md) — every PR number cited above
- React 17 RC announcement (delegation rationale, `capture: true` fix, event pooling, effect-cleanup gotcha, setState-warning suppression, native stacks) — https://legacy.reactjs.org/blog/2020/08/10/react-v17-rc.html
- React v17.0 release — https://legacy.reactjs.org/blog/2020/10/20/react-v17.html
- Introducing the New JSX Transform (backport versions, Babel/TS/Flow/CRA/Next/Gatsby minimums, codemod, eslint rules) — https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html
- React 18 upgrade guide (used to disprove the "mandatory hop" premise; IE11 quote; "behave as if it's running React 17") — https://react.dev/blog/2022/03/08/react-18-upgrade-guide
- Announcing TypeScript 4.1 ("React 17 JSX Factories": `react-jsx`, `react-jsxdev`) — https://devblogs.microsoft.com/typescript/announcing-typescript-4-1/
- TSConfig `jsx` / `jsxImportSource` reference — https://www.typescriptlang.org/tsconfig/#jsx
- `createPortal` reference (React-tree propagation caveat) — https://react.dev/reference/react-dom/createPortal
- reactjs/react-gradual-upgrade-demo (lazy-loading legacy React, context-bridging caveat, "escape hatch, not the norm") — https://github.com/reactjs/react-gradual-upgrade-demo
- npm registry — https://registry.npmjs.org/react and https://registry.npmjs.org/-/package/react/dist-tags

Supporting (issue tracker — used only for "known rough edge", not version facts):

- facebook/react#19659 "Attach Listeners Eagerly to Roots and Portal Containers" — https://github.com/facebook/react/pull/19659
- facebook/react#21989 — https://github.com/facebook/react/issues/21989
- facebook/react#23074 — https://github.com/facebook/react/issues/23074
- palantir/blueprint#6580 "Portal `stopPropagationEvents` is a no-op on React 17+" — https://github.com/palantir/blueprint/issues/6580
