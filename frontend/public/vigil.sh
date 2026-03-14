#!/bin/bash
# Vigil CLI — https://vigil.run
# Setup: set VK and WATCHER below, then chmod +x vigil.sh
set -euo pipefail

API="https://api.vigil.run"
VK="<your-api-key>"          # Get from https://vigil.run/account/developer
WATCHER="<your-watcher-id>"  # Get from dashboard URL
AUTH="Authorization: Bearer $VK"

case "${1:-status}" in
  status)
    echo "=== Vigil Inbox ==="
    curl -s "$API/api/usage" -H "$AUTH" | python3 -c "
import json, sys
u = json.load(sys.stdin)['usage']
print(f'Emails: {u[\"total_emails\"]} | Alerts: {u[\"total_alerts\"]} | Cost: \${u[\"current_month\"][\"cost\"]:.4f}')
for w in u['watchers']:
    print(f'  {w[\"watcher_name\"]}: {w[\"emails\"]} emails, {w[\"alerts\"]} alerts')
"
    curl -s "$API/api/watchers/$WATCHER/threads?status=active" -H "$AUTH" | python3 -c "
import json, sys
threads = json.load(sys.stdin).get('threads', [])
if threads: print(f'{len(threads)} active thread(s)')
for t in threads: print(f'  {t[\"subject\"]} — {t.get(\"summary\",\"\")}')
"
    ;;
  emails)
    curl -s "$API/api/watchers/$WATCHER/threads" -H "$AUTH" | python3 -c "
import json, sys
for t in json.load(sys.stdin).get('threads', [])[:int('${2:-10}')]:
    print(f'[{t[\"status\"]:8s}] {(t.get(\"original_date\") or t[\"last_activity\"])[:16]} | {(t.get(\"subject\") or \"(none)\")[:60]}')
    if t.get('summary'): print(f'           {t[\"summary\"][:80]}')
"
    ;;
  threads)
    curl -s "$API/api/watchers/$WATCHER/threads?status=${2:-active}" -H "$AUTH" | python3 -c "
import json, sys
threads = json.load(sys.stdin).get('threads', [])
print(f'{len(threads)} thread(s)')
for t in threads:
    print(f'  {t[\"subject\"]}')
    if t.get('summary'): print(f'    -> {t[\"summary\"]}')
"
    ;;
  obligations)
    curl -s -X POST "$API/api/watchers/$WATCHER/invoke" -H "$AUTH" -H "Content-Type: application/json" \
      -d '{"message":"What obligations need attention? Deadlines, waiting responses, anything urgent. Be specific."}' \
      | python3 -c "import json,sys; print(json.load(sys.stdin).get('message','No response'))"
    ;;
  chat)
    shift
    MSG="$*"
    curl -s -X POST "$API/api/watchers/$WATCHER/invoke" -H "$AUTH" -H "Content-Type: application/json" \
      -d "$(python3 -c "import json,sys; print(json.dumps({'message': sys.argv[1]}))" "$MSG")" \
      | python3 -c "import json,sys; print(json.load(sys.stdin).get('message','No response'))"
    ;;
  usage)
    curl -s "$API/api/usage" -H "$AUTH" | python3 -c "
import json, sys
u = json.load(sys.stdin)['usage']
print(f'Total: \${u[\"total_cost\"]:.4f} | Emails: {u[\"total_emails\"]} | Alerts: {u[\"total_alerts\"]}')
print(f'This month: \${u[\"current_month\"][\"cost\"]:.4f} ({u[\"current_month\"][\"invocations\"]} invocations)')
"
    ;;
  memories)
    curl -s "$API/api/watchers/$WATCHER/memory" -H "$AUTH" | python3 -c "
import json, sys
for m in json.load(sys.stdin).get('memories', []):
    print(f'  [{m.get(\"importance\",3)}] {m[\"content\"][:100]}')
"
    ;;
  tools)
    curl -s "$API/api/watchers/$WATCHER/tools" -H "$AUTH" | python3 -c "
import json, sys
tools = json.load(sys.stdin).get('tools', [])
if not tools: print('No custom tools.')
for t in tools:
    on = 'ON' if t.get('enabled') else 'OFF'
    print(f'  [{on}] {t[\"name\"]} — {t[\"description\"][:60]}')
    print(f'         {t[\"webhook_url\"][:50]} | {t.get(\"execution_count\",0)} runs')
"
    ;;
  *)
    echo "Vigil CLI — https://vigil.run"
    echo ""
    echo "  status       Inbox overview"
    echo "  emails [n]   Recent emails"
    echo "  threads [s]  Threads by status"
    echo "  obligations  What needs attention"
    echo "  chat \"msg\"   Talk to the agent"
    echo "  usage        Cost breakdown"
    echo "  memories     Agent memories"
    echo "  tools        Custom tools"
    ;;
esac
