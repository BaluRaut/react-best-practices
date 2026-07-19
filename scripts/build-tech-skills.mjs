// Build CONSOLIDATED, one-file-per-technology Claude skills from the same src/content.
//
// The granular skills (build-skills.mjs) trigger precisely; these bundles are the
// comprehensive per-tech references — one SKILL.md each for React, TypeScript, JavaScript.
// Same single source of prose, so they can never drift from the site.
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

// tech → ordered content slugs it consolidates, plus its triggering description.
const TECHS = [
  {
    name: 'react',
    title: 'React',
    description:
      'Use for any React work — components, hooks, state, effects, forms, data fetching, performance, architecture, typing, or upgrading across versions. A consolidated, version-verified best-practices reference (React 19, the React Compiler) covering the fundamentals through production patterns, with bad-vs-good examples and when-not-to guidance.',
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
      'Use for any TypeScript work — configuring tsconfig, strictness, typing, or fixing type errors. A consolidated best-practices reference for the TypeScript 6/7 era (flipped strict defaults, the Go port): satisfies vs as, unknown over any, discriminated unions, generics, branded types, and typing React with @types/react 19.',
    slugs: ['ts-general', 'ts-react'],
  },
  {
    name: 'javascript',
    title: 'JavaScript',
    description:
      'Use for any modern JavaScript work — language features, async, immutability, error handling, performance, or naming/code conventions. A consolidated best-practices reference: ES2020–2024 features, promise combinators, AbortSignal, throw-vs-Result error handling, measured performance (loops, hot paths, benchmarking), and the Google/Airbnb conventions.',
    slugs: ['js-general', 'error-handling', 'performance-craft', 'conventions'],
  },
]

function slugAnchor(title) {
  return title.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
}

// Demote every heading one level — but ONLY outside fenced code blocks, so a `#` shell comment
// inside a ```bash block is not mistaken for a heading and corrupted.
function demoteHeadings(md) {
  let inFence = false
  return md
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence
        return line
      }
      if (!inFence && /^#{1,5}\s/.test(line)) return `#${line}`
      return line
    })
    .join('\n')
}

function build() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  for (const tech of TECHS) {
    const parts = []
    const toc = []
    for (const slug of tech.slugs) {
      let body
      try {
        body = readFileSync(join(CONTENT, `${slug}.md`), 'utf8').trim()
      } catch {
        console.warn(`  ! ${tech.name}: missing ${slug}.md — skipped`)
        continue
      }
      // Demote every heading one level (# → ##, ## → ###, …) so the page's own H1 becomes an H2
      // section and the consolidated file keeps exactly one H1.
      const h1 = body.match(/^#\s+(.+)$/m)?.[1] ?? slug
      toc.push(`- [${h1}](#${slugAnchor(h1)})`)
      parts.push(demoteHeadings(body))
    }

    const frontmatter =
      `---\n` +
      `name: ${tech.name}\n` +
      `description: ${JSON.stringify(tech.description)}\n` +
      `metadata:\n  source: ${SITE}\n---\n`

    const header =
      `# ${tech.title} — Best Practices (consolidated)\n\n` +
      `A single-file, version-verified ${tech.title} reference, consolidated from ` +
      `[${SITE.replace('https://', '')}](${SITE}/). Every rule is labelled 🟢 best practice / ` +
      `🟡 optimization / 🔴 advanced-gotcha, with bad-vs-good examples and a "when not to". ` +
      `These are guidelines and trade-offs, not laws.\n\n` +
      `## Contents\n\n${toc.join('\n')}\n\n---\n`

    const md = `${frontmatter}\n${header}\n${parts.join('\n\n---\n\n')}\n`
    const dir = join(OUT, tech.name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), md)
    console.log(`  ✓ tech-skills/${tech.name}/SKILL.md  (${md.split('\n').length} lines, ${tech.slugs.length} pages)`)
  }

  console.log(`\nBuilt ${TECHS.length} consolidated tech skills → ${OUT}`)

  if (process.argv.includes('--install')) {
    const target = join(homedir(), '.claude', 'skills')
    mkdirSync(target, { recursive: true })
    for (const tech of TECHS) {
      cpSync(join(OUT, tech.name), join(target, tech.name), { recursive: true })
    }
    console.log(`Installed ${TECHS.length} tech skills → ${target}`)
  }
}

build()
