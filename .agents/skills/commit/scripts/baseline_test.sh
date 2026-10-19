#!/usr/bin/env bash
# Re-run a test command against HEAD in a throwaway worktree, to tell failures that already
# existed from failures introduced by the pending change. The user's working tree is untouched.
#
# Usage: baseline_test.sh "<command>"
#   baseline_test.sh "npx vitest run tests/editor-smoke.test.jsx"
#   baseline_test.sh "cd server && uv run --frozen pytest -q tests/test_video_edit.py"
set -euo pipefail
[ $# -eq 1 ] || { echo "用法：baseline_test.sh \"<测试命令>\"" >&2; exit 2; }

repo=$(git rev-parse --show-toplevel)
dir=$(mktemp -d)
cleanup() { git -C "$repo" worktree remove --force "$dir" >/dev/null 2>&1 || true; rm -rf "$dir"; }
trap cleanup EXIT

git -C "$repo" worktree add --detach --quiet "$dir" HEAD
# Reuse installed dependencies without modifying them.
[ -d "$repo/node_modules" ] && ln -s "$repo/node_modules" "$dir/node_modules"
export UV_PROJECT_ENVIRONMENT="$repo/server/.venv" UV_NO_SYNC=1 PYTHONDONTWRITEBYTECODE=1

echo "在 HEAD（$(git -C "$repo" rev-parse --short HEAD)）上运行：$1"
cd "$dir"
set +e
bash -c "$1"
status=$?
set -e
echo "基线退出码：$status"
exit "$status"
