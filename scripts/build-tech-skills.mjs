// Build CONSOLIDATED, one-skill-per-technology Claude skills using PROGRESSIVE DISCLOSURE:
// a lean SKILL.md (principles + how-to + a reference index) plus a references/ folder holding
// the detailed pages, which Claude reads on demand. This is the real Agent Skills mechanism —
// there is no `@include`; SKILL.md points at reference files and the model loads them when needed.
//
// Same single source of prose (src/content), so the skills can never drift from the site.
//
//   node scripts/build-tech-skills.mjs            # writes ./tech-skills/
//   node scripts/build-tech-skills.mjs --install  # also copies into ~/.claude/skills/

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CONTENT = join(ROOT, 'src/content')
const OUT = join(ROOT, 'tech-skills')
const SITE = 'https://baluraut.github.io/frontend-best-practices'

const TECHS = [
  {
    name: 'react',
    title: 'React',
    description:
      'Apply modern React best practices when writing, reviewing, refactoring, or optimizing React — components, hooks, state, effects, forms, data fetching, performance, architecture, typing, or upgrading across versions. Version-verified for React 19 and the React Compiler. Read the referenced files for the detail on a given topic.',
    // priority perf list shown in SKILL.md
    perf: [
      'unnecessary re-renders (colocate state, split contexts, let the Compiler memoize)',
      'network waterfalls (parallelize independent fetches; server data is a cache)',
      'unnecessary Effects (derive during render; you probably do not need that Effect)',
      'large bundles (route-level code splitting, avoid side-effectful barrels)',
      'expensive renders (only after the above — measure with the Profiler first)',
    ],
    slugs: [
      'fundamentals', 'react-practices', 'design-principles', 'ts-react',
      'state-management', 'custom-hooks', 'forms', 'data-layer',
      'architecture', 'quality', 'security', 'migration-matrix',
      'react-19', 'react-18', 'react-17', 'react-16',
    ],
  },
  {
    name: 'typescript',
    title: 'TypeScript',
    description:
      'Apply modern TypeScript best practices when writing, reviewing, or configuring TypeScript — tsconfig strictness, satisfies vs as, unknown over any, discriminated unions, generics, branded types, and typing React with @types/react 19. Version-verified for the TypeScript 6/7 era (flipped strict defaults, the Go port). Read the referenced files for detail.',
    perf: [
      'type-check / editor speed (skipLibCheck, project references, isolatedModules; TS 7 is the Go port)',
      'not letting the type system push you toward runtime cost (types are erased; validate at the boundary, trust inside)',
    ],
    slugs: ['ts-general', 'ts-react'],
  },
  {
    name: 'javascript',
    title: 'JavaScript',
    description:
      'Apply modern JavaScript best practices when writing, reviewing, refactoring, or optimizing JavaScript — language features, async, immutability, error handling, performance, and naming/code conventions. Covers ES2020–2024, promise combinators, AbortSignal, throw-vs-Result errors, and measured performance. Read the referenced files for detail.',
    perf: [
      'algorithmic complexity (a Set/Map beats an O(n²) .includes-in-a-loop by orders of magnitude)',
      'allocation / GC pressure in hot loops (the usual real cause of "slow JS")',
      'sequential awaits over independent work (parallelize with Promise.all)',
      'loop construct only in a measured hot path over large data — never as a style rule',
    ],
    slugs: ['js-general', 'error-handling', 'performance-craft', 'conventions'],
  },
]

const CORE_PRINCIPLES = `## Core principles

- Prefer readability over cleverness, correctness over micro-optimization, maintainability over brevity.
- Use modern language/runtime features when they are supported — and note the support floor when it matters.
- **These are guidelines and trade-offs, not laws.** Every optimization here says when *not* to apply it.
- Never apply an optimization without a measurable or practical benefit; avoid premature optimization.
- Explain the trade-off when a recommendation depends on context.`

const CODE_REVIEW = `## When reviewing code

1. Detect the anti-pattern and name it (e.g. "this fails Open/Closed", "server data in useState").
2. Explain *why* it is a problem — the failure it causes, not just "it's not idiomatic".
3. Suggest the recommended approach with a minimal diff; preserve behavior.
4. Distinguish a correctness bug (must fix) from a preference (optional) — don't inflate style into blockers.`

const REFACTORING = `## When refactoring

Don't change functionality. Improve readability, remove duplication, simplify logic, reduce nesting,
improve naming, and prefer composition over configuration. Make the smallest change that achieves the goal.`

const OUTPUT = `## Output expectations

Generated code should follow these practices, compile/typecheck cleanly, be idiomatic and production-ready,
and include comments only where they state a constraint the code can't show — not narration.`

/** First real paragraph of a page (skipping the H1 and any metadata line) — used as a 1-line index blurb. */
function firstPara(md) {
  const lines = md.split('\n')
  let started = false
  const buf = []
  for (const line of lines) {
    if (/^#\s/.test(line)) { started = true; continue }
    if (!started) continue
    if (line.trim() === '') { if (buf.length) break; else continue }
    if (/^[#>|`\-*]/.test(line.trim())) { if (buf.length) break; else continue }
    buf.push(line.trim())
  }
  return buf.join(' ').replace(/\s+/g, ' ').slice(0, 180)
}

function build() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  for (const tech of TECHS) {
    const dir = join(OUT, tech.name)
    const refDir = join(dir, 'references')
    mkdirSync(refDir, { recursive: true })

    const index = []
    for (const slug of tech.slugs) {
      let body
      try {
        body = readFileSync(join(CONTENT, `${slug}.md`), 'utf8').trim()
      } catch {
        console.warn(`  ! ${tech.name}: missing ${slug}.md — skipped`)
        continue
      }
      writeFileSync(join(refDir, `${slug}.md`), `${body}\n`)
      const title = body.match(/^#\s+(.+)$/m)?.[1] ?? slug
      index.push(`- **[${title}](references/${slug}.md)** — ${firstPara(body)}`)
    }

    const perf =
      `## Performance priorities\n\nOptimize only when it helps. In rough order of real-world impact:\n\n` +
      tech.perf.map((p, i) => `${i + 1}. ${p}`).join('\n') +
      `\n\nDo not introduce complexity without a measurable benefit.`

    const skill =
      `---\n` +
      `name: ${tech.name}\n` +
      `description: ${JSON.stringify(tech.description)}\n` +
      `metadata:\n  source: ${SITE}\n---\n\n` +
      `# ${tech.title} Best Practices\n\n` +
      `Apply these when writing, reviewing, refactoring, or optimizing ${tech.title} code. ` +
      `Each rule on the reference pages is labelled 🟢 best practice / 🟡 optimization / 🔴 advanced-gotcha, ` +
      `with a bad-vs-good example and a "when not to". Verified against the current stack; sourced from ` +
      `[${SITE.replace('https://', '')}](${SITE}/).\n\n` +
      `${CORE_PRINCIPLES}\n\n` +
      `## Reference files\n\n` +
      `Read the file for the topic you're working on — each is a focused, self-contained guide:\n\n` +
      `${index.join('\n')}\n\n` +
      `${CODE_REVIEW}\n\n${REFACTORING}\n\n${perf}\n\n${OUTPUT}\n`

    writeFileSync(join(dir, 'SKILL.md'), skill)
    console.log(`  ✓ ${tech.name}: SKILL.md (${skill.split('\n').length} lines) + ${index.length} reference files`)
  }

  console.log(`\nBuilt ${TECHS.length} progressive-disclosure tech skills → ${OUT}`)

  if (process.argv.includes('--install')) {
    const target = join(homedir(), '.claude', 'skills')
    mkdirSync(target, { recursive: true })
    for (const tech of TECHS) {
      rmSync(join(target, tech.name), { recursive: true, force: true })
      cpSync(join(OUT, tech.name), join(target, tech.name), { recursive: true })
    }
    console.log(`Installed ${TECHS.length} tech skills → ${target}`)
  }
}

build()
