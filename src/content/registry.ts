// The single source of truth for what exists.
//
// Each doc is one markdown file in this directory. The SAME files are compiled into
// Claude skills by `scripts/build-skills.mjs`, which is the whole point of the layout:
// the site and the skills cannot drift apart, because there is only one copy of the prose.

export type Section = 'foundations' | 'versions' | 'stack' | 'meta'

export interface Doc {
  slug: string
  title: string
  /** Shown on cards and used verbatim as the Claude skill `description`. */
  blurb: string
  section: Section
  /** Rendered as chips; also become skill metadata keywords. */
  tags: string[]
  /** If set, this doc is compiled to ~/.claude/skills/<skill>/SKILL.md */
  skill?: string
}

export const SECTIONS: Record<Section, { title: string; blurb: string }> = {
  foundations: {
    title: 'Foundations',
    blurb:
      'Rules that hold regardless of your React version, meta-framework, or component library.',
  },
  versions: {
    title: 'Versions & Migration',
    blurb:
      'React 16 → 19, one hop at a time: what breaks, the error you actually see, and the fix.',
  },
  stack: {
    title: 'The Stack',
    blurb: 'Material UI, Vite, and the surrounding discipline — testing, a11y, performance, tooling.',
  },
  meta: {
    title: 'Using This as Claude Skills',
    blurb: 'Every page here is also an Agent Skill. How that works, and how to install them.',
  },
}

export const DOCS: Doc[] = [
  // ── Foundations ──────────────────────────────────────────────────────────────
  {
    slug: 'react-practices',
    title: 'React Rules That Outlive Versions',
    blurb:
      'Timeless React practices: why you probably do not need that Effect, state colocation, keys, composition, and what the now-stable React Compiler changes about memoization.',
    section: 'foundations',
    tags: ['react', 'effects', 'state', 'composition', 'react-compiler'],
    skill: 'react-practices',
  },
  {
    slug: 'ts-react',
    title: 'Typing React with TypeScript',
    blurb:
      'Typing props, children, events, hooks, generic and polymorphic components against @types/react 19 — including the breaking changes that bite on upgrade.',
    section: 'foundations',
    tags: ['typescript', 'react', 'types', 'props', 'hooks'],
    skill: 'typing-react',
  },
  {
    slug: 'ts-general',
    title: 'TypeScript in the TS 7 Era',
    blurb:
      'What the Go port and the flipped defaults change about TypeScript advice: strictness flags worth adding, satisfies vs as, unions over enums, and why most TS articles are now wrong.',
    section: 'foundations',
    tags: ['typescript', 'strict', 'satisfies', 'unions', 'ts7'],
    skill: 'typescript-practices',
  },
  {
    slug: 'js-general',
    title: 'Modern JavaScript',
    blurb:
      'The JavaScript worth reaching for in 2026: immutable array methods, structuredClone, AbortSignal, Object.groupBy, Error cause, and the ?? vs || bug.',
    section: 'foundations',
    tags: ['javascript', 'es2024', 'async', 'immutability'],
    skill: 'modern-javascript',
  },

  // ── Versions ─────────────────────────────────────────────────────────────────
  {
    slug: 'migration-matrix',
    title: 'The React 16 → 19 Migration Matrix',
    blurb:
      'Every hop from React 16 to 19: what breaks, the literal error message, the codemod, and the rollback risk. Start here if you are upgrading.',
    section: 'versions',
    tags: ['migration', 'upgrade', 'codemod', 'react-16', 'react-19'],
    skill: 'react-migration',
  },
  {
    slug: 'react-16',
    title: 'React 16 — Where the Mental Model Was Built',
    blurb:
      'Fiber, error boundaries, the new Context API, and hooks. What a codebase stuck on 16 looks like and which of its patterns are now actively harmful.',
    section: 'versions',
    tags: ['react-16', 'fiber', 'hooks', 'legacy'],
  },
  {
    slug: 'react-17',
    title: 'React 17 — The Stepping Stone',
    blurb:
      'The "no new features" release: the event delegation change, the new JSX transform, and whether you actually need this hop at all.',
    section: 'versions',
    tags: ['react-17', 'jsx-transform', 'events'],
  },
  {
    slug: 'react-18',
    title: 'React 18 — Concurrent, and the Traps',
    blurb:
      'createRoot, automatic batching, StrictMode double-invoking your effects, useSyncExternalStore and tearing. The migration pain nobody warns you about.',
    section: 'versions',
    tags: ['react-18', 'concurrent', 'strictmode', 'batching'],
  },
  {
    slug: 'react-19',
    title: 'React 19 — Current',
    blurb:
      'Actions, use(), ref as a prop, document metadata — and the removals: propTypes, defaultProps, string refs, findDOMNode, legacy context.',
    section: 'versions',
    tags: ['react-19', 'actions', 'use', 'removals'],
  },

  // ── Stack ────────────────────────────────────────────────────────────────────
  {
    slug: 'mui',
    title: 'Material UI v5 → v9',
    blurb:
      'Why MUI skipped v8, what Pigment CSS actually is now, sx vs styled, theming, and dark mode the v9 way without the flash.',
    section: 'stack',
    tags: ['mui', 'material-ui', 'theming', 'dark-mode', 'sx'],
    skill: 'material-ui',
  },
  {
    slug: 'vite',
    title: 'Vite 8 + React SPA',
    blurb:
      'Config, aliases, env vars and the secret-leak footgun, code splitting — plus deploying to GitHub Pages without the blank page or the 404.',
    section: 'stack',
    tags: ['vite', 'spa', 'github-pages', 'deploy', 'bundling'],
    skill: 'vite-react',
  },
  {
    slug: 'quality',
    title: 'Testing, A11y, Performance, Tooling',
    blurb:
      'The discipline around the code: RTL query priority, focus management on route change, INP, the barrel-file cost, and whether oxlint is ready.',
    section: 'stack',
    tags: ['testing', 'accessibility', 'performance', 'eslint', 'vitest'],
    skill: 'react-quality',
  },

  // ── Meta ─────────────────────────────────────────────────────────────────────
  {
    slug: 'skills',
    title: 'These Docs Are Also Claude Skills',
    blurb:
      'How every page here compiles into an Agent Skill, what the SKILL.md spec actually requires, and how to install them.',
    section: 'meta',
    tags: ['claude', 'agent-skills', 'skill-md'],
  },
]

export const DOCS_BY_SLUG = new Map(DOCS.map((d) => [d.slug, d]))

// Lazy, NOT eager: an eager glob inlines all ~7,000 lines of markdown into the entry
// chunk, so the landing page pays for prose no one has opened yet. Loading each body on
// demand keeps the initial bundle small and matches the router's lazy DocPage — the doc
// text arrives in the same round trip as the DocPage code.
const loaders = import.meta.glob('./*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

const loaderBySlug = new Map(
  Object.entries(loaders).map(([path, load]) => [
    path.replace(/^\.\//, '').replace(/\.md$/, ''),
    load,
  ]),
)

export function loadBody(slug: string): Promise<string> | undefined {
  return loaderBySlug.get(slug)?.()
}

export function docsInSection(section: Section): Doc[] {
  return DOCS.filter((d) => d.section === section)
}
