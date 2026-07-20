#!/usr/bin/env bash
#
# Install the Frontend + HTML/CSS Best Practices Claude skills.
#
#   curl -fsSL https://raw.githubusercontent.com/BaluRaut/frontend-best-practices/main/install-skills.sh | bash
#
# Flags (append after `| bash -s --`):
#   --project    install into ./.claude/skills (this project only) instead of ~/.claude/skills (all projects)
#   --granular   install the ~39 fine-grained skills instead of the 5 consolidated per-tech skills
#
set -euo pipefail

DEST="$HOME/.claude/skills"
SRC="tech-skills"     # the 5 consolidated skills: react, typescript, javascript, css, html

for arg in "$@"; do
  case "$arg" in
    --project)  DEST="$(pwd)/.claude/skills" ;;
    --granular) SRC="skills" ;;
    *) echo "unknown flag: $arg" >&2; exit 1 ;;
  esac
done

command -v git >/dev/null || { echo "git is required"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Fetching skills…"
for repo in frontend-best-practices html-css-best-practices; do
  git clone --depth 1 --quiet "https://github.com/BaluRaut/$repo.git" "$TMP/$repo"
done

mkdir -p "$DEST"
cp -R "$TMP"/frontend-best-practices/"$SRC"/* "$DEST"/
cp -R "$TMP"/html-css-best-practices/"$SRC"/* "$DEST"/

echo
echo "Installed to $DEST:"
for d in "$DEST"/*/; do
  name="$(basename "$d")"
  [ -f "$d/SKILL.md" ] && echo "  ✓ $name"
done
echo
echo "Done. Claude Code auto-loads these — just open Claude in a project and ask it to write"
echo "React/TypeScript/JavaScript/CSS/HTML and the matching skill applies. No activation step."
