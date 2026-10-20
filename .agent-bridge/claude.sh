#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if [ ! -f .agent-bridge/runtime/mcp.json ]; then
  printf '%s\n' 'Codex 側で node .agent-bridge/bridge.mjs configure を実行してください。' >&2
  exit 1
fi
codex app-server daemon start
node .agent-bridge/bridge.mjs doctor
exec claude --mcp-config .agent-bridge/runtime/mcp.json \
  --dangerously-load-development-channels server:codex_bridge "$@"
