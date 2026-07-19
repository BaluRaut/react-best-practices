// Compile the site's content into Claude Agent Skills.
//
// One source of prose, two outputs: the Vite site renders src/content/*.md, and this
// script turns the same files into skills/<name>/SKILL.md. They cannot drift because
// there is only one copy of the text.
//
// The frontmatter targets the INTERSECTION of the three skill authorities (the
// agentskills.io open standard, the Claude API contract, and Claude Code): always a
// kebab-case `name` matching the directory, always a `description` under 1024 chars
// that leads with WHEN to use the skill (the description is what decides whether the
// skill ever triggers, and it gets truncated, so the trigger goes first).
//
// Usage:  node scripts/build-skills.mjs         # writes ./skills/
//         node scripts/build-skills.mjs --install # also copies into ~/.claude/skills/

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CONTENT = join(ROOT, 'src/content')
const OUT = join(ROOT, 'skills')

// Which docs become skills, and the description that drives their triggering.
// Kept in step with the `skill` field in src/content/registry.ts.
const SKILLS = [
  {
    name: 'react-migration',
    src: 'migration-matrix',
    description:
      'Use when upgrading a React codebase across major versions (16, 17, 18, or 19), when you hit a React upgrade error, or when choosing a codemod for a React migration. Covers the hop-by-hop breaking changes, the literal error messages, the exact codemod commands, and rollback risk.',
  },
  {
    name: 'react-practices',
    src: 'react-practices',
    description:
      'Use when writing or reviewing React components and hooks: deciding whether a useEffect is needed, placing state, using keys, composing components, or configuring the React Compiler and manual memoization. Encodes react.dev guidance and the current (mature) React Compiler behaviour.',
  },
  {
    name: 'typing-react',
    src: 'ts-react',
    description:
      'Use when typing React with TypeScript: props, children, events, hooks, generic or polymorphic components, or when fixing @types/react 19 type errors after an upgrade. Reflects the React 19 typings and their breaking changes.',
  },
  {
    name: 'typescript-practices',
    src: 'ts-general',
    description:
      'Use when writing TypeScript or configuring tsconfig in the TypeScript 6/7 era: strictness flags, satisfies vs as, unions over enums, module resolution. Corrects advice that predates the flipped TS 6/7 defaults and the Go port.',
  },
  {
    name: 'modern-javascript',
    src: 'js-general',
    description:
      'Use when writing modern JavaScript: immutable array methods, structuredClone, AbortSignal cancellation, Object.groupBy, promise combinators, and error handling. Flags the nullish-coalescing vs OR bug and what is actually Baseline-available.',
  },
  {
    name: 'material-ui',
    src: 'mui',
    description:
      'Use when building UI with Material UI (MUI) v9, or migrating MUI from v5/v6/v7: theming, sx vs styled, dark mode with CSS variables and color schemes, and the migration codemods. Notes why MUI skipped v8 and why to build on Emotion, not Pigment CSS.',
  },
  {
    name: 'vite-react',
    src: 'vite',
    description:
      'Use when configuring a Vite + React single-page app or deploying one to GitHub Pages: the base path, env vars and the VITE_ secret-leak trap, code splitting, and the GitHub Actions deploy workflow. Targets Vite 8 (Rolldown).',
  },
  {
    name: 'react-quality',
    src: 'quality',
    description:
      'Use when testing React (Vitest + React Testing Library), fixing accessibility (focus management on route change, roles, labels), improving performance (INP, bundle size, code splitting), or choosing linters and project structure for a React SPA.',
  },
  {
    name: 'react-fundamentals',
    src: 'fundamentals',
    description:
      'Use when a React bug or decision needs the underlying model: render vs commit, reconciliation and keys, stale closures, dependency arrays, or why render must be pure. Explains the why behind the rules other skills apply.',
  },
  {
    name: 'react-architecture',
    src: 'architecture',
    description:
      'Use when structuring a React codebase: feature-based vs layer-based folders, colocation, and the measured cost of barrel files. For laying out a project so it survives growth.',
  },
  {
    name: 'react-state-management',
    src: 'state-management',
    description:
      'Use when deciding where React state should live: local, lifted, Context, or an external store (Zustand, Redux, Jotai). A decision guide with the measured cost of un-split Context re-renders.',
  },
  {
    name: 'react-forms',
    src: 'forms',
    description:
      'Use when building React forms: controlled vs uncontrolled inputs, React 19 Actions and useActionState, validation, and when react-hook-form earns its weight over plain state.',
  },
  {
    name: 'react-custom-hooks',
    src: 'custom-hooks',
    description:
      'Use when designing or reviewing a custom React hook: naming, return shapes, composition, when to extract, and advanced ref/latest patterns (which are advanced, not defaults).',
  },
  {
    name: 'react-data-layer',
    src: 'data-layer',
    description:
      'Use when fetching or caching server data in React: structuring the API layer, TanStack Query, request cancellation, and sequential vs parallel fetching. Treats server data as a cache, not state.',
  },
  {
    name: 'js-ts-performance',
    src: 'performance-craft',
    description:
      'Use when optimizing JavaScript or TypeScript performance, choosing a loop, or benchmarking: how to micro-benchmark without lying to yourself, the measured truth about for/while/forEach/map, hot-path idioms (object shapes, array holes, allocation), and which classic perf rules are now obsolete. Measure, do not guess.',
  },
  {
    name: 'frontend-design-principles',
    src: 'design-principles',
    description:
      'Use when structuring React components, hooks, or component APIs: SOLID applied to the front end, composition over configuration, polymorphism (the as prop, compound components, render props), and data-driven over conditional rendering. Follow these patterns instead of guessing at component design.',
  },
  {
    name: 'ant-design-v6',
    src: 'antd-v6',
    description:
      'Use when building UI with Ant Design (antd) v6, or migrating from v5: the React 18+ requirement, design tokens and ConfigProvider, the CSS-in-JS engine, dark algorithm, and v5→v6 breaking changes. Targets antd 6.5.x.',
  },
  {
    name: 'ant-design-v5',
    src: 'antd-v5',
    description:
      'Use when building UI with Ant Design (antd) v5: the CSS-in-JS design-token system, ConfigProvider theming, dark and compact algorithms, the static-method context pitfall (message/notification/Modal), and tree-shaking. Targets antd 5.29.x.',
  },
  {
    name: 'js-ts-error-handling',
    src: 'error-handling',
    description:
      'Use when handling errors in JavaScript or TypeScript: choosing throw vs a Result type, defining typed errors, exhaustive error handling, Error cause and Error.isError, retries and timeouts with AbortSignal, and where errors belong in a React app.',
  },
  {
    name: 'verified-method',
    src: 'method',
    description:
      'Use when deciding whether a version/library/performance claim is trustworthy, or before asserting one: verify against the npm registry and primary sources, run it instead of recalling it, and distinguish announced from shipped and deprecated from removed. Includes field-verified findings that corrected common folklore.',
  },
  {
    name: 'frontend-security',
    src: 'security',
    description:
      'Use when handling auth or security in a React/front-end app: where to store tokens (HttpOnly cookies vs localStorage and the XSS risk), role-based vs permission-based authorization, protecting routes, sanitizing user content and the dangerouslySetInnerHTML trap, CSRF, and the OWASP client-side risks.',
  },
  {
    name: 'code-conventions',
    src: 'conventions',
    description:
      'Use when naming things or choosing code style in JavaScript/TypeScript: identifier casing (camelCase/PascalCase/CONSTANT_CASE), abbreviations as words, named vs default exports, import ordering, and daily calls like no parameter mutation, no nested ternaries, and Map over object-as-dictionary. Based on the Google and Airbnb style guides.',
  },
]

const MAX_DESCRIPTION = 1024 // open-standard limit

function frontmatter({ name, description }) {
  if (description.length > MAX_DESCRIPTION) {
    throw new Error(`description for "${name}" is ${description.length} chars (> ${MAX_DESCRIPTION})`)
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    throw new Error(`name "${name}" is not valid kebab-case (<=64 chars, no leading/trailing hyphen)`)
  }
  // description is single-line and quoted so a colon or '#' can't break the YAML.
  const desc = JSON.stringify(description)
  return `---\nname: ${name}\ndescription: ${desc}\nmetadata:\n  source: https://baluraut.github.io/frontend-best-practices/${SKILLS.find((s) => s.name === name).src}\n---\n`
}

function build() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  for (const skill of SKILLS) {
    const body = readFileSync(join(CONTENT, `${skill.src}.md`), 'utf8').trim()
    const dir = join(OUT, skill.name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), `${frontmatter(skill)}\n${body}\n`)
    console.log(`  ✓ skills/${skill.name}/SKILL.md  (${body.split('\n').length} lines)`)
  }

  writeFileSync(
    join(OUT, 'README.md'),
    [
      '# React Best Practices — Claude Skills',
      '',
      'Generated from the reference site by `scripts/build-skills.mjs`. Do not edit by hand —',
      'edit `src/content/*.md` and re-run the build.',
      '',
      '## Install',
      '',
      '```bash',
      '# personal skills (available in every project)',
      'cp -r skills/* ~/.claude/skills/',
      '',
      '# or, project-scoped (checked in with a repo)',
      'cp -r skills/* .claude/skills/',
      '```',
      '',
      'Claude loads a skill when your request matches its `description`. Nothing to import.',
      '',
      '## Skills',
      '',
      ...SKILLS.map((s) => `- **${s.name}** — ${s.description}`),
      '',
    ].join('\n'),
  )

  console.log(`\nBuilt ${SKILLS.length} skills → ${OUT}`)

  if (process.argv.includes('--install')) {
    const target = join(homedir(), '.claude', 'skills')
    mkdirSync(target, { recursive: true })
    for (const skill of SKILLS) {
      cpSync(join(OUT, skill.name), join(target, skill.name), { recursive: true })
    }
    console.log(`Installed ${SKILLS.length} skills → ${target}`)
  }
}

if (!existsSync(CONTENT)) {
  console.error(`content dir not found: ${CONTENT}`)
  process.exit(1)
}
build()
