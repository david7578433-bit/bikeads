#!/usr/bin/env bash
# Make Media on Wheels v4 live: fast-forward GitHub `main` to `v4-light` (GitHub Pages serves docs/ from main).
# DRY RUN by default — it only shows what would change. Run with --go only after the owner's OK.
# Needs: git with push access to github.com/david7578433-bit/bikeads.
set -euo pipefail
REPO_URL="${REPO_URL:-https://github.com/david7578433-bit/bikeads.git}"
GO="${1:-}"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
git clone --quiet --no-checkout "$REPO_URL" "$tmp/r"
cd "$tmp/r"
git fetch --quiet origin v4-light main
MAIN="$(git rev-parse origin/main)"; V4="$(git rev-parse origin/v4-light)"
echo "main     = $MAIN"; echo "v4-light = $V4"
if ! git merge-base --is-ancestor "$MAIN" "$V4"; then
  echo "STOP: main has commits that v4-light does not have. Rebase v4-light on main first."; exit 1
fi
echo "Commits that would go live:"; git log --oneline "$MAIN..$V4"
git diff --stat "$MAIN" "$V4" | tail -3
if [ "$GO" != "--go" ]; then echo; echo "DRY RUN: nothing pushed. Run with --go to make it live."; exit 0; fi
git push origin "$V4:refs/heads/main"
echo "Pushed. GitHub Pages updates in about a minute: https://david7578433-bit.github.io/bikeads/"
