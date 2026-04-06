#!/bin/bash
set -euo pipefail

# Configuration via environment variables
API="${VIGIL_API_URL:-https://api.vigil.run}"
VK="${VIGIL_API_KEY:?VIGIL_API_KEY is required. Get yours at https://vigil.run/account/developer}"
AUTH="Authorization: Bearer $VK"

# Resolve default watcher ID (first watcher on the account)
resolve_watcher() {
  if [ -n "${VIGIL_WATCHER_ID:-}" ]; then
    echo "$VIGIL_WATCHER_ID"
    return
  fi
  curl -sf "$API/api/watchers" -H "$AUTH" | python3 -c "
import json, sys
watchers = json.load(sys.stdin).get('watchers', [])
if not watchers: print('', end=''); sys.exit(1)
print(watchers[0]['id'], end='')
"
}

WATCHER=""
get_watcher() {
  if [ -z "$WATCHER" ]; then
    WATCHER=$(resolve_watcher) || { echo "Error: No watchers found. Create one at https://vigil.run"; exit 1; }
  fi
  echo "$WATCHER"
}

show_help() {
  echo "Vigil CLI — Manage email watchers from OpenClaw"
  echo ""
  echo "Usage: vigil.sh <command> [args]"
  echo ""
  echo "Commands:"
  echo "  status            Inbox overview, active threads, costs"
  echo "  emails [n]        List recent emails (default 10)"
  echo "  threads [status]  List threads by status (active|watching|ignored|resolved)"
  echo "  obligations       Ask the agent what needs attention"
  echo "  chat \"message\"    Talk to the agent"
  echo "  usage             Cost and usage breakdown"
  echo "  memories          List agent memories"
  echo "  tools             List custom tools"
  echo "  models            List available AI models"
  echo "  config            Show watcher configuration"
  echo "  set-model <id> <model>  Change a watcher's AI model"
  echo "  flush [watcher_id]      Flush all data for a watcher"
  echo ""
  echo "Environment:"
  echo "  VIGIL_API_KEY      Required. Your API key (vk_...)"
  echo "  VIGIL_API_URL      Optional. API base URL (default: https://api.vigil.run)"
  echo "  VIGIL_WATCHER_ID   Optional. Default watcher ID (auto-detects first watcher)"
}

case "${1:---help}" in
  -h|--help|help)
    show_help
    ;;

  status)
    WID=$(get_watcher)
    echo "=== Vigil Inbox Status ==="
    curl -sf "$API/api/watchers/$WID/export" -H "$AUTH" | python3 -c "
import json, sys
data = json.load(sys.stdin)
cs = data.get('cost_summary', {})
print(f'Emails processed: {len(data.get(\"emails\", []))}')
print(f'Total actions: {cs.get(\"total_actions\", 0)}')
print(f'Total cost: \${float(cs.get(\"total_cost\", 0)):.4f}')
for m in cs.get('models', []):
    print(f'  {m[\"model\"]}: {m[\"invocations\"]} calls, \${float(m.get(\"cost_usd\", 0)):.4f}')
"
    echo ""
    echo "=== Active Threads ==="
    curl -sf "$API/api/watchers/$WID/threads?status=active" -H "$AUTH" | python3 -c "
import json, sys
threads = json.load(sys.stdin).get('threads', [])
if not threads: print('No active threads.')
for t in threads:
    print(f'  {t[\"subject\"] or \"(no subject)\"} — {t.get(\"summary\",\"\")}')
"
    echo ""
    echo "=== Watching ==="
    curl -sf "$API/api/watchers/$WID/threads?status=watching" -H "$AUTH" | python3 -c "
import json, sys
threads = json.load(sys.stdin).get('threads', [])
if not threads: print('No watching threads.')
for t in threads[:5]:
    print(f'  {t[\"subject\"] or \"(no subject)\"}')
if len(threads) > 5: print(f'  ... and {len(threads)-5} more')
"
    ;;

  emails)
    LIMIT="${2:-10}"
    WID=$(get_watcher)
    curl -sf "$API/api/watchers/$WID/threads" -H "$AUTH" | python3 -c "
import json, sys
threads = json.load(sys.stdin).get('threads', [])
for t in threads[:int('$LIMIT')]:
    status = t['status']
    subj = t.get('subject') or '(no subject)'
    summary = t.get('summary') or ''
    od = t.get('original_date') or t.get('last_activity','')
    print(f'[{status:8s}] {od[:16]} | {subj[:60]}')
    if summary: print(f'           {summary[:80]}')
"
    ;;

  threads)
    STATUS="${2:-active}"
    WID=$(get_watcher)
    curl -sf "$API/api/watchers/$WID/threads?status=$STATUS" -H "$AUTH" | python3 -c "
import json, sys
threads = json.load(sys.stdin).get('threads', [])
print(f'{len(threads)} $STATUS thread(s)')
for t in threads:
    print(f'  {t[\"subject\"] or \"(no subject)\"}')
    if t.get('summary'): print(f'    → {t[\"summary\"]}')
"
    ;;

  obligations)
    echo "=== What Needs Attention ==="
    WID=$(get_watcher)
    curl -sf -X POST "$API/api/watchers/$WID/invoke" \
      -H "$AUTH" -H "Content-Type: application/json" \
      -d '{"message":"What obligations does the user have right now? What threads need responses? Any approaching deadlines? Be specific with dates and names."}' | python3 -c "
import json, sys
print(json.load(sys.stdin).get('message', 'No response'))
"
    ;;

  chat)
    MSG="${2:?Usage: vigil.sh chat \"your message\"}"
    WID=$(get_watcher)
    curl -sf -X POST "$API/api/watchers/$WID/invoke" \
      -H "$AUTH" -H "Content-Type: application/json" \
      -d "$(python3 -c "import json; print(json.dumps({'message': json.loads(sys.argv[1])}) if False else json.dumps({'message': sys.argv[1]}))" "$MSG")" | python3 -c "
import json, sys
print(json.load(sys.stdin).get('message', 'No response'))
"
    ;;

  usage)
    WID=$(get_watcher)
    curl -sf "$API/api/watchers/$WID/export" -H "$AUTH" | python3 -c "
import json, sys
data = json.load(sys.stdin)
cs = data.get('cost_summary', {})
print(f'Total cost: \${float(cs.get(\"total_cost\", 0)):.4f}')
print(f'Total actions: {cs.get(\"total_actions\", 0)}')
print(f'Emails: {len(data.get(\"emails\", []))}')
print(f'Threads: {len(data.get(\"threads\", []))}')
print(f'Memories: {len(data.get(\"memories\", []))}')
print()
models = cs.get('models', [])
if models:
    print('Model breakdown:')
    for m in models:
        print(f'  {m[\"model\"]}: {m[\"invocations\"]} calls, \${float(m.get(\"cost_usd\", 0)):.4f}')
"
    ;;

  memories)
    WID=$(get_watcher)
    curl -sf "$API/api/watchers/$WID/memory" -H "$AUTH" | python3 -c "
import json, sys
mems = json.load(sys.stdin).get('memories', [])
print(f'{len(mems)} memories')
for m in mems:
    imp = m.get('importance', 3)
    content = m.get('content', '')
    obs = ' (retired)' if m.get('obsolete') else ''
    print(f'  [{imp}] {content[:100]}{obs}')
"
    ;;

  tools)
    WID=$(get_watcher)
    curl -sf "$API/api/watchers/$WID/tools" -H "$AUTH" | python3 -c "
import json, sys
tools = json.load(sys.stdin).get('tools', [])
if not tools: print('No custom tools configured.')
for t in tools:
    enabled = 'ON' if t.get('enabled') else 'OFF'
    print(f'  [{enabled}] {t[\"name\"]} — {t[\"description\"][:60]}')
    print(f'         URL: {t[\"webhook_url\"][:50]}')
    print(f'         Executions: {t.get(\"execution_count\", 0)}')
"
    ;;

  models)
    curl -sf "$API/api/models" -H "$AUTH" | python3 -c "
import json, sys
data = json.load(sys.stdin)
models = data if isinstance(data, list) else data.get('models', [])
if not models: print('No models returned.')
for m in models:
    if isinstance(m, str):
        print(f'  {m}')
    else:
        name = m.get('id', m.get('name', m.get('model', str(m))))
        print(f'  {name}')
"
    ;;

  config)
    curl -sf "$API/api/watchers" -H "$AUTH" | python3 -c "
import json, sys
data = json.load(sys.stdin)
watchers = data if isinstance(data, list) else data.get('watchers', [])
for w in watchers:
    print(f'Watcher: {w.get(\"name\", \"unnamed\")}')
    print(f'  ID: {w[\"id\"]}')
    print(f'  Model: {w.get(\"model\", \"default\")}')
    print(f'  Email: {w.get(\"email\", \"n/a\")}')
    print(f'  Active: {w.get(\"active\", \"n/a\")}')
    if w.get('alert_channels'):
        print(f'  Alerts: {json.dumps(w[\"alert_channels\"])}')
    print()
"
    ;;

  set-model)
    WATCHER_ID="${2:?Usage: vigil.sh set-model <watcher_id> <model>}"
    MODEL="${3:?Usage: vigil.sh set-model <watcher_id> <model>}"
    echo "Setting model for watcher $WATCHER_ID to $MODEL..."
    curl -sf -X PATCH "$API/api/watchers/$WATCHER_ID" \
      -H "$AUTH" -H "Content-Type: application/json" \
      -d "$(python3 -c "import json; print(json.dumps({'model': '$MODEL'}))")" | python3 -c "
import json, sys
r = json.load(sys.stdin)
if r.get('error'): print(f'Error: {r[\"error\"]}')
else: print(f'Updated: {r.get(\"name\", \"watcher\")} now using {r.get(\"model\", \"$MODEL\")}')
"
    ;;

  flush)
    WID="${2:-$(get_watcher)}"
    echo "Flushing watcher $WID..."
    curl -sf -X POST "$API/api/watchers/$WID/flush" -H "$AUTH" | python3 -c "
import json, sys
r = json.load(sys.stdin)
if r.get('flushed'):
    d = r['deleted']
    print(f'Flushed: {d[\"emails\"]} emails, {d[\"threads\"]} threads, {d[\"memories\"]} memories')
else:
    print(f'Error: {r.get(\"error\", \"unknown\")}')
"
    ;;

  *)
    echo "Unknown command: $1"
    echo "Run 'vigil.sh --help' for usage."
    exit 1
    ;;
esac
