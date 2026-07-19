# Frontend Best Practices

A current, verified reference for **React, TypeScript, and JavaScript** — plus the full
**React 16 → 19 migration matrix** — built with Material UI and deployed to GitHub Pages.
Every page is also a **Claude Code skill**.

**Live:** https://baluraut.github.io/frontend-best-practices/

## Why this exists

Most React/TypeScript best-practices content on the web is quietly out of date. The defaults
have moved (TypeScript `strict` is on by default now; MUI skipped v8 entirely; the React
Compiler is stable and *changes* the memoization advice). Every version-specific claim here was
checked against a primary source or measured on a real install — not written from memory.

Verified stack, 2026: React `19.2.7` · TypeScript `7.0.2` · Material UI `9.2.0` · Vite `8.1.5`.

## One source, two outputs

The content lives once, in [`src/content/*.md`](src/content/). From it:

- the **Vite + MUI site** renders the browsable reference, and
- [`scripts/build-skills.mjs`](scripts/build-skills.mjs) compiles the same files into
  **`skills/<name>/SKILL.md`** Agent Skills.

They can't drift, because there's only one copy of the prose.

## Use the skills

```bash
npm run skills           # regenerate skills/ from src/content
npm run skills:install   # regenerate and copy into ~/.claude/skills/
```

Or copy the pre-built [`skills/`](skills/) directory straight in:

```bash
cp -r skills/* ~/.claude/skills/     # personal, all projects
cp -r skills/* .claude/skills/       # project-scoped, checked into a repo
```

Claude loads a skill when your request matches its `description` — no import step.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build  → dist/
npm run preview  # serve the production build locally
```

## Deploy

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): it builds
the site, regenerates the skills, and publishes `dist/` to GitHub Pages. One-time setup:
**Settings → Pages → Source: GitHub Actions**.

## License

MIT
