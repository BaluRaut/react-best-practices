# Claude Skills: how this reference authors itself

Every page you are reading is also a Claude Code skill. There is one copy of the prose in
`src/content/*.md`; the Vite site renders it, and `scripts/build-skills.mjs` compiles the same
files into `skills/<name>/SKILL.md`. The two outputs cannot drift because they share a source.

That constraint — "read well as a web page AND function as agent instructions" — is what this page
is about. It documents the Agent Skills format, the three specifications that disagree about it, how
we author to their intersection, and how you install these skills into your own Claude Code.

> This page is the one place in the reference where the topic and the medium are the same thing. If a
> rule here is wrong, every other page is mis-shaped. It is authored to the empirically verified spec
> as of 2026-07-18, against local Claude Code 2.1.210.

## There are three specifications, and they contradict

A "skill" is a directory with a `SKILL.md` file: YAML frontmatter plus a Markdown body. That much is
universal. Beyond it, three authorities define the contract, and they do not agree.

| Authority | URL | Scope |
|---|---|---|
| **Agent Skills open standard** | `agentskills.io/specification` | Portable, cross-vendor format |
| **Claude API / claude.ai** | `platform.claude.com/docs/en/agents-and-tools/agent-skills/` | Upload validation contract |
| **Claude Code** | `code.claude.com/docs/en/skills` | A superset with laxer validation |

> **The old doc URLs from 2025 have all moved (301/302).** `docs.claude.com/en/docs/claude-code/skills`
> now redirects to `code.claude.com/docs/en/skills`; the agent-skills pages moved to `platform.claude.com`;
> `agentskills.io/spec` is a 404 (the real path is `/specification`). Stale links are how people end up
> reading the wrong contract for the wrong surface.

Claude Code states the relationship verbatim:

> "Claude Code skills follow the Agent Skills open standard, which works across multiple AI tools.
> Claude Code extends the standard with additional features like invocation control, subagent
> execution, and dynamic context injection."

The headline contradiction is over what is *required*. The open standard requires `name` **and**
`description`. Claude Code says:

> "All fields are optional. Only `description` is recommended so Claude knows when to use the skill."

### The rule: author to the intersection

Write skills that satisfy the strictest authority (the open standard) and reach for Claude-Code-only
fields only when you genuinely need them. Concretely, and non-negotiably for the skills in this repo:

- **Always set `name`.** Even though Claude Code defaults it to the directory name.
- **Always set `description`.** It decides whether the skill ever runs (see below).
- **Always make `name` equal the directory name.** The open standard requires this; Claude Code does
  not. Matching costs nothing and keeps the skill portable and valid for an API upload.

> 🟢 **Best practice** — always set `name` and `description`, and make `name` equal the directory name.
> This is a portability/correctness rule, not an optimization: a skill missing `name` is invalid under
> the open standard and rejected on an API upload, even though Claude Code would silently accept it.
> Authoring to the strictest authority keeps one source of truth valid on every surface.
>
> **Tradeoffs.** *Pros:* one skill runs unchanged in Claude Code, the API, and any open-standard tool —
> no per-surface forks. *Cons:* you forgo the Claude-Code-only conveniences (directory-derived `name`,
> the extra behavioural fields) unless you consciously opt in. **When NOT to use it:** a skill you will
> *only ever* run in your own Claude Code and never upload or share can lean on the laxer rules — but
> matching the strict form is so cheap that "portable by default" is the better habit.

The build script does exactly this. Its header comment states the target: "the INTERSECTION of the
three skill authorities... always a kebab-case `name` matching the directory, always a `description`
under 1024 chars that leads with WHEN to use the skill."

## Frontmatter: required vs optional

### The open standard — the portable contract

Six fields, two required. This is the complete list.

| Field | Required | Constraint |
|---|---|---|
| `name` | **Yes** | Max 64 chars. Lowercase letters, numbers, hyphens only. No leading/trailing hyphen. |
| `description` | **Yes** | Max 1024 chars. Non-empty. What the skill does and when to use it. |
| `license` | No | License name or reference to a bundled license file. |
| `compatibility` | No | Max 500 chars. Environment requirements (product, packages, network). |
| `metadata` | No | Arbitrary key-value map for extra metadata. |
| `allowed-tools` | No | Space-separated pre-approved tools. Marked **(Experimental)**. |

Claude Code adds many more fields — `when_to_use`, `disable-model-invocation`, `user-invocable`,
`model`, `effort`, `context: fork`, `agent`, `hooks`, `paths`, `argument-hint`, `arguments`,
`disallowed-tools`, `shell` — all optional, all non-portable. Reach for them only on a
Claude-Code-only skill that needs the behaviour.

### Field verdicts — separating real from folklore

| Field | Verdict |
|---|---|
| `name`, `description` | Real everywhere. Required by the open standard. Set both. |
| `license` | Real (open standard). Anthropic's own shipped skills use it (`pdf`, `docx`, `mcp-builder`, `claude-api`). Not in Claude Code's table; Claude Code ignores it. |
| `metadata` | Real (open standard). Arbitrary string→string map. Ignored by Claude Code. |
| `compatibility` | Real, **open-standard-only**. Absent from Claude Code's table. |
| `model`, `when_to_use`, `context` | Real, but **Claude-Code-only**. Non-portable. |
| `allowed-tools` | Real in all three, but marked **(Experimental)** by the open standard, and narrower than it looks — see below. |
| **`version`** (top-level) | **Folklore.** In no authority's table. |
| **`tools`** | **Not a field in any spec.** The real field is `allowed-tools`. |

> 🔴 **Advanced / gotcha** — the fields that *look* real but aren't. `version:` and `tools:` parse
> without error and are silently ignored, so the mistake ships unnoticed.
>
> **`version:` as a top-level field is cargo-culted inside Anthropic's own plugins.** A scan of 41
> shipped `SKILL.md` files found 13 with a top-level `version:` — all plugin skills, all `0.1.0`-ish,
> all inert. Nothing consumes it. Two other skills write `tools: Read, Glob, Grep, Bash`, which is
> **not a field that exists** — they are silently not getting what the author intended. If you want a
> version, put it under `metadata`. Do not copy `tools:`.

This repo uses `metadata` to carry the source URL, staying inside the open standard:

```yaml
---
name: react-practices
description: "Use when writing or reviewing React components and hooks: deciding whether a useEffect is needed, placing state, using keys..."
metadata:
  source: https://baluraut.github.io/frontend-best-practices/react-practices
---
```

## `name`: constraints and two traps

Author to the open standard's rules — they are the strictest:

- 1–64 characters
- lowercase alphanumeric and hyphens only
- must not start or end with a hyphen
- **must not contain consecutive hyphens (`--`)**
- **must match the parent directory name**

Invalid per spec: `PDF-Processing` (uppercase), `-pdf` (leading hyphen), `pdf--processing` (double
hyphen). The Claude API adds one rule the open standard lacks: the name **cannot contain the reserved
words `anthropic` or `claude`**.

> **The reserved-word rule is contradicted by a first-party skill.** Anthropic ships
> `skills/claude-api/SKILL.md` with `name: claude-api` — which contains `claude` — and it is bundled
> with Claude Code. So the reserved-word rule is an **API-upload validation rule only**, not a property
> of the format. For a Claude Code-only skill it is inert; if you plan to upload to the Claude API,
> avoid `claude`/`anthropic` in the name. (The mechanism of the exemption is unknown — do not assert one.)

### The `name` field does NOT set the slash command in Claude Code

This is the trap most likely to surprise you. What you type after `/` comes from **where the file
lives**, not from `name`:

| Location | Command name source |
|---|---|
| `~/.claude/skills/deploy/SKILL.md` | Directory name → `/deploy` |
| `.claude/skills/deploy/SKILL.md` | Directory name → `/deploy` |
| Nested `.claude/skills/` on name clash | Directory-qualified → `/apps/web:deploy` |
| `.claude/commands/deploy.md` | File name → `/deploy` |
| Plugin `skills/` subdir | Dir name, plugin-namespaced → `/my-plugin:review` |
| **Plugin-root `SKILL.md`** | **Frontmatter `name`** (the one exception) |

Verbatim: "The frontmatter `name` field sets the display label shown in skill listings and, except
for a plugin-root `SKILL.md`, does not change what you type after `/`." Making `name == directory
name` means the display label and the command agree, which is why we enforce it.

> 🔴 **Advanced / gotcha** — the slash command comes from the *directory*, not from `name` (except a
> plugin-root `SKILL.md`). Rename the frontmatter `name` and the command you type is unchanged; move
> the directory and it changes. Keeping `name == directory` collapses the two so they can't surprise you.

## `description`: the field that decides whether the skill runs

The `description` is injected into the system prompt at startup for every skill. Claude reads it to
pick the right skill from potentially 100+ candidates. If it is vague, the skill never triggers.

**Write in third person.** The description is system-prompt text; inconsistent point-of-view causes
discovery problems.

- Good: `Processes Excel files and generates reports`
- Avoid: `I can help you process Excel files` / `You can use this to process Excel files`

**Say WHAT it does and WHEN to use it.** The canonical shape from the docs' own examples is
`<what it does>. Use when <triggers>.`:

```yaml
# BAD — no triggers, no keywords, never matches
description: Helps with documents

# GOOD — what, then when, with concrete trigger keywords
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
```

Explicitly rejected by the docs: `Helps with documents`, `Processes data`, `Does stuff with files`.

> 🟢 **Best practice** — write the `description` in the third person and in the shape
> `<what it does>. Use when <triggers>.` with concrete keywords. This is a correctness rule for
> *discovery*, not a stylistic one: the description is the only text Claude sees at selection time, so a
> vague one means the skill silently never fires — the failure is an invisible no-op, not an error.

### Descriptions get silently truncated — front-load the trigger

There are two independent caps, both in Claude Code:

- **Per-entry cap: 1,536 characters** on `description` + `when_to_use` combined
  (`skillListingMaxDescChars`).
- **Global listing budget: ~1% of the model's context window** (`skillListingBudgetFraction`;
  env `SLASH_COMMAND_TOOL_CHAR_BUDGET`).

Verbatim:

> "The listing always contains every skill name, but if you have many skills, Claude Code shortens
> descriptions to fit the listing's character budget, which can strip the keywords Claude needs to
> match your request. When the listing overflows, Claude Code drops descriptions starting with the
> skills you invoke least, so the skills you use most keep their full text."

> 🟡 **Optimization** — front-load trigger keywords so they survive listing truncation. This only
> matters once you have many skills competing for the listing budget; for a handful of skills the whole
> description fits and ordering is cosmetic.
>
> **A rarely-used skill with a long description is exactly the one that gets its trigger keywords
> amputated.** Put the key use case FIRST. The skills in this repo lead with `Use when...` precisely
> so the trigger survives truncation. Diagnose listing cost with `/doctor` and the Skills row of
> `/context`.

Note the two ceilings: **1024** chars (open standard / API — the real portability limit) vs **1536**
(Claude Code's combined listing cap). Author against 1024 if portability matters; this repo's build
enforces a 1024-char maximum.

## Directory layout and precedence

Skills live in one of these locations. `<skill-name>` is both the directory name and the frontmatter
`name`.

| Level | Path | Applies to |
|---|---|---|
| Personal | `~/.claude/skills/<skill-name>/SKILL.md` | All your projects |
| Project | `.claude/skills/<skill-name>/SKILL.md` | This project only |
| Plugin | `<plugin>/skills/<skill-name>/SKILL.md` | Where the plugin is enabled |
| Enterprise | via managed settings | All users in the org |

### Precedence is the opposite of intuition

> "When skills share the same name across levels, enterprise overrides personal, and personal
> overrides project. A skill at any of these levels also overrides a bundled skill with the same name."

> 🔴 **Advanced / gotcha** — precedence runs opposite to most config systems.
>
> **Personal beats project.** That inverts how most config systems work. A `code-review` skill in
> your `~/.claude/skills/` silently shadows the one committed to a repo. If a project skill "isn't
> working," check for a personal skill of the same name first. Plugin skills sidestep this — they use
> a `plugin-name:skill-name` namespace and cannot collide.

Other layout facts worth knowing:

- **Parent-directory discovery**: project skills load from `.claude/skills/` in the starting
  directory and every parent up to the repo root.
- **Live reload**: edits/adds/removes under a watched skills directory take effect within the session,
  no restart. But **creating a top-level skills directory that did not exist at session start requires
  a restart**.
- **Security**: for a project skill, `allowed-tools` takes effect only after you accept the workspace
  trust dialog. Review project skills before trusting a repository — a skill can grant itself broad
  tool access.

## Progressive disclosure: the token model

Skills stay cheap through three levels of loading. This is the mechanism that lets a skill bundle
comprehensive reference material without paying for it every turn.

| Level | When loaded | Token cost | Content |
|---|---|---|---|
| **1: Metadata** | Always, at startup | **~100 tokens per skill** | `name` + `description` |
| **2: Instructions** | When the skill triggers | **Under 5k tokens** | The `SKILL.md` body |
| **3+: Resources** | As needed | **None until accessed** | Bundled files, read or executed on demand |

The subdirectory convention (all optional):

```
skill-name/
├── SKILL.md          # Required: frontmatter + instructions
├── scripts/          # Optional: executable code
├── references/       # Optional: load-on-demand documentation
└── assets/           # Optional: templates, images, data
```

> **These subdirs are a convention, not a loader contract.** Nothing auto-loads `references/`. Claude
> finds a file only because `SKILL.md` links to it: "Reference these files from your `SKILL.md` so
> Claude knows what they contain and when to load them." A reference file no one links to is dead weight.

> 🟢 **Best practice** — link every reference from `SKILL.md` and keep it one level deep, with a table
> of contents at the top of any file over 100 lines. The *why:* nothing auto-loads `references/` — Claude
> reaches a file only through a link, and it may only `head -100` a nested one, so an unlinked or deeply
> nested reference is either invisible or read incompletely.

Two consequences worth designing around:

- **Scripts are cheaper than generated code.** When Claude runs a bundled script, the script's source
  never enters the context window — only its output does. Prefer `Run scripts/validate.py` over
  pasting the equivalent logic into the body.
- **Keep references one level deep from `SKILL.md`.** When a reference points to another reference,
  Claude may preview the nested file with `head -100` instead of reading it fully, "resulting in
  incomplete information." For any reference file longer than 100 lines, put a table of contents at the
  top so the full scope is visible even under a partial read.

> 🟡 **Optimization** — prefer a bundled script (`Run scripts/validate.py`) over pasting the equivalent
> logic into the body, because the script's *source* never enters the context window — only its output
> does. Apply it when the body would otherwise carry non-trivial deterministic logic that runs on demand.
>
> **Tradeoffs.** *Pros:* keeps the recurring body token cost low (the body is re-attached every turn —
> see below); the logic is testable and versioned as a file. *Cons:* a script is another file to
> maintain, only helps for genuinely mechanical work, and adds an execution round-trip. **When NOT to
> use it:** a one-line check or a task with many valid approaches — inline prose is clearer and the token
> saving is noise. Reach for a script only when there is a fixed, fragile procedure worth freezing.

### Claude Code only: skill content is sticky

Not in the platform docs, and a real production surprise:

> 🔴 **Advanced / gotcha** — an invoked `SKILL.md` is *sticky*: its rendered body stays in the
> conversation for the rest of the session and is re-attached on compaction, so it is a **recurring**
> token cost, not a one-time one. Write standing instructions ("state what to do"), not one-time
> narration that only makes sense on the turn it loaded.

> "When you or Claude invoke a skill, the rendered `SKILL.md` content enters the conversation as a
> single message and stays there for the rest of the session. Claude Code does not re-read the skill
> file on later turns, so write guidance that should apply throughout a task as standing instructions
> rather than one-time steps."

Because the body is a **recurring** token cost that survives for the session, the guidance is: "State
what to do rather than narrating how or why." Auto-compaction re-attaches the most recent invocation
of each skill, keeping the first ~5,000 tokens of each within a combined ~25,000-token budget filled
most-recent-first — so an older skill can be dropped entirely.

> **If a skill seems to "stop working" after the first response, the content is usually still present
> and the model is just choosing other tools.** The docs' fix: strengthen the description and
> instructions, or use hooks for deterministic enforcement. Do not assume it was unloaded.

## Size guidance — the actual documented numbers

| Guidance | Value |
|---|---|
| `SKILL.md` body | **under 500 lines** (repeated across all three authorities) |
| `SKILL.md` body tokens | **< 5000 tokens** recommended |
| Metadata per skill | ~100 tokens |
| `description` | ≤ 1024 chars (open standard / API) |
| `description` + `when_to_use` in the Claude Code listing | truncated at 1,536 chars |
| `compatibility` | ≤ 500 chars |
| `name` | ≤ 64 chars |

The 500-line number is *guidance* ("for optimal performance"), not enforced — nothing rejects a
900-line `SKILL.md`. There is no documented word limit.

## Authoring best practices (quoted)

**The context window is a public good.** Default assumption: Claude is already very smart. Only add
context Claude doesn't already have. Challenge each piece: "Does Claude really need this explanation?
Can I assume Claude knows this? Does this paragraph justify its token cost?" A 50-token "Use
pdfplumber for text extraction" beats a 150-token version that first explains what a PDF is.

**Match freedom to the task's fragility.** Prose for tasks with many valid approaches; parameterized
scripts where a preferred pattern exists; exact, do-not-modify commands where operations are fragile:

> "Run exactly this script: `python scripts/migrate.py --verify --backup`. Do not modify the command
> or add additional flags."

**Anti-patterns, verbatim headers:**

- **Avoid Windows-style paths.** Always forward slashes: `scripts/helper.py`, never `scripts\helper.py`.
- **Avoid offering too many options.** Not "use pypdf, or pdfplumber, or PyMuPDF, or..." — provide a
  default with an escape hatch.
- **Avoid time-sensitive information.** Not "if you're doing this before August 2025, use the old
  API." Put superseded material in an `## Old patterns` section inside a `<details>` block. This is
  directly why the migration pages in this reference frame MUI v5→v9 and TS 5→7 as "current method"
  plus a collapsed "old patterns," never as dated conditionals.
- **Use consistent terminology.** Pick one term ("API endpoint") and never mix synonyms.
- **Solve, don't defer** (scripts). Handle `FileNotFoundError`/`PermissionError` in the script. No
  voodoo constants (`TIMEOUT = 47  # why 47?`) — "if you don't know the right value, how will Claude?"
- **Don't assume tools are installed.** State `pip install pypdf` explicitly.
- **MCP tool references** must be fully qualified: `ServerName:tool_name`. Without the prefix Claude
  may fail to locate the tool.

**Build evaluations first.** "Create evaluations BEFORE writing extensive documentation. This ensures
your skill solves real problems rather than documenting imagined ones." Run Claude without the skill,
document the failures, write ≥3 scenarios, then write minimal instructions and iterate.

> There is no built-in evaluation runner in the base product, but the `skill-creator` plugin
> (`/plugin install skill-creator@claude-plugins-official`) automates the loop: subagent-isolated
> runs, with-skill vs without-skill pass rates, blind A/B version comparison, and description tuning.

**Naming:** the docs *consider* gerund form (`processing-pdfs`, `analyzing-spreadsheets`) but do not
follow it themselves — shipped skills are `pdf`, `docx`, `skill-creator`, `mcp-builder`. Treat gerunds
as a weak preference; internal consistency matters more. Avoid `helper`, `utils`, `tools`, `documents`.

## `allowed-tools` is narrower than it looks

> 🔴 **Advanced / gotcha** — `allowed-tools` reads like a capability restriction but is the opposite.
>
> **`allowed-tools` is a per-turn permission grant, not a sandbox.** It "grants permission for the
> listed tools during the turn that invokes the skill... The grant clears when you send your next
> message... It does not restrict which tools are available: every tool remains callable."

So it suppresses permission prompts for one turn — it does not remove tools. To actually *remove*
tools, use `disallowed-tools` (also clears on the next message). For session-wide control, use
permission settings. It is marked Experimental in the open standard; keep it off portable skills.

**Tradeoffs.** *Pros:* fewer permission interruptions during a fragile, known-safe procedure. *Cons:*
it is Experimental, non-portable, and easy to misread as a security boundary it is not; a project skill's
grant is also gated behind the workspace-trust dialog. **When NOT to use it:** on any skill you intend to
share or upload, and any time you actually want to *restrict* tools — reach for `disallowed-tools` or
session permission settings instead.

## Install the skills in this repo

These skills live in `skills/` in this repository, one directory per skill, each with a `SKILL.md`.
They are generated from `src/content/*.md` — **do not edit `skills/` by hand**; edit the content and
rebuild.

```bash
# from the repo root: regenerate skills/ from src/content/
npm run skills            # → node scripts/build-skills.mjs
```

Copy them into Claude Code. Personal install makes them available in every project; project install
checks them in with a repo:

```bash
# personal — available in every project
cp -r skills/* ~/.claude/skills/

# or project-scoped — committed alongside a repo
mkdir -p .claude/skills && cp -r skills/* .claude/skills/
```

Or do both steps at once — build and copy into `~/.claude/skills/`:

```bash
npm run skills:install    # → node scripts/build-skills.mjs --install
```

After installing, Claude loads a skill when your request matches its `description` — nothing to
import. The eight skills produced here:

| Skill | Directory | Triggers on |
|---|---|---|
| `react-migration` | `skills/react-migration/` | Upgrading React across 16/17/18/19, upgrade errors, codemods |
| `react-practices` | `skills/react-practices/` | Writing/reviewing components and hooks, the React Compiler |
| `typing-react` | `skills/typing-react/` | Typing React with TypeScript, `@types/react` 19 errors |
| `typescript-practices` | `skills/typescript-practices/` | tsconfig and TS 6/7-era strictness |
| `modern-javascript` | `skills/modern-javascript/` | Immutable arrays, `structuredClone`, `AbortSignal`, Baseline features |
| `material-ui` | `skills/material-ui/` | Building with MUI v9, migrating v5/v6/v7 |
| `vite-react` | `skills/vite-react/` | Vite + React SPA config, GitHub Pages deploy |
| `react-quality` | `skills/react-quality/` | Testing, accessibility, performance, linting |

Then, in Claude Code, type `/` to see them, or just describe your task and let the description
matching pull the right one in. Because each skill's body stays under 500 lines and links its heavier
reference material one level deep, the listing cost is roughly `8 × ~100 tokens` at startup — the
bodies load only when a skill actually fires.

## Sources

- https://code.claude.com/docs/en/skills (Claude Code contract; 301 from `docs.claude.com/en/docs/claude-code/skills`)
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- https://agentskills.io/specification (Agent Skills open standard)
- https://github.com/anthropics/skills (first-party skills; `template/SKILL.md` = name + description only)
- Empirical: local Claude Code 2.1.210; frontmatter scan of 41 shipped `SKILL.md` files; this repo's `scripts/build-skills.mjs`
