#!/usr/bin/env bash
# Quick check that your Gemini key + model work — run this BEFORE building in Lovable,
# so you know the AI half works before wiring it up.
#
# Usage (after putting your key in .env):
#   bash scripts/test-gemini.sh
#
# If you get a 404 "model not found", the model ID changed — try the fallback:
#   GEMINI_MODEL=gemini-2.5-flash-lite bash scripts/test-gemini.sh
set -euo pipefail

# Auto-load GEMINI_API_KEY from the repo-root .env. We parse it with grep instead of
# sourcing the file, so a stray space around "=" or surrounding quotes won't break it.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ -z "${GEMINI_API_KEY:-}" ] && [ -f "$ROOT_DIR/.env" ]; then
  GEMINI_API_KEY="$(grep -E '^[[:space:]]*GEMINI_API_KEY[[:space:]]*=' "$ROOT_DIR/.env" \
    | head -1 | cut -d= -f2- \
    | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/^"//; s/"$//')"
  export GEMINI_API_KEY
fi

MODEL="${GEMINI_MODEL:-gemini-3.1-flash-lite}"
: "${GEMINI_API_KEY:?GEMINI_API_KEY not found — add it to .env (see .env.example)}"

echo "→ Calling ${MODEL} ..."
curl -sS "https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent" \
  -H "x-goog-api-key: ${GEMINI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Write one punchy Instagram caption for a bespoke tailor Eid sale."}]}]}'
echo
echo "→ If you see JSON with a \"text\" field above, your key + model work."
