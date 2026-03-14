export default function ApiReferencePage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>API Reference</h1>

      <p>
        The Vigil API lets you manage watchers, threads, memory, and custom tools programmatically.
        All endpoints return JSON.
      </p>

      <h2>Authentication</h2>
      <p>
        Every request requires an <code>Authorization</code> header. You can use either a JWT access token
        (from login) or an API key created on the <strong>Developer</strong> page.
      </p>
      <pre><code>Authorization: Bearer vk_your_api_key_here</code></pre>
      <p>API keys use the prefix <code>vk_</code>. The server hashes the key with SHA-256 and looks it up — the full key is never stored.</p>

      <h2>Base URL</h2>
      <pre><code>https://api.vigil.run/api</code></pre>

      <hr />

      <h2>Auth</h2>
      <Endpoint method="POST" path="/auth/register" desc="Create a new account.">
        {`// Request
{ "email": "you@example.com", "password": "..." }

// Response 201
{ "user": { "user_id", "email" }, "tokens": { "access_token", "refresh_token", "expires_in" } }`}
      </Endpoint>

      <Endpoint method="POST" path="/auth/login" desc="Sign in and receive tokens.">
        {`// Request
{ "email": "you@example.com", "password": "..." }

// Response 200
{ "user": { ... }, "tokens": { ... } }`}
      </Endpoint>

      <Endpoint method="POST" path="/auth/refresh" desc="Exchange a refresh token for a new access token.">
        {`// Request
{ "refresh_token": "..." }

// Response 200
{ "tokens": { "access_token", "refresh_token", "expires_in" } }`}
      </Endpoint>

      <Endpoint method="GET" path="/auth/me" desc="Get the current authenticated user.">
        {`// Response 200
{ "user": { "user_id", "account_id", "email", "role" } }`}
      </Endpoint>

      <hr />

      <h2>Watchers</h2>
      <Endpoint method="GET" path="/watchers" desc="List all watchers for the account.">
        {`// Response 200
{ "watchers": [ { "id", "name", "ingest_token", "ingestion_address", "status", ... } ] }`}
      </Endpoint>

      <Endpoint method="POST" path="/watchers" desc="Create a new watcher.">
        {`// Request
{ "name": "Work Email", "system_prompt": "...", "tools": ["send_alert"], "silence_hours": 48 }

// Response 201
{ "watcher": { ... } }`}
      </Endpoint>

      <Endpoint method="GET" path="/watchers/:id" desc="Get a single watcher by ID." />
      <Endpoint method="PUT" path="/watchers/:id" desc="Update watcher settings (name, prompt, tools, reactivity, etc.)." />
      <Endpoint method="DELETE" path="/watchers/:id" desc="Soft-delete a watcher and all associated data." />

      <Endpoint method="POST" path="/watchers/:id/invoke" desc="Manually invoke the agent. Pass a query or message.">
        {`// Query mode (structured JSON response)
{ "query": "Review active threads." }

// Chat mode (natural language response)
{ "message": "What needs my attention?" }`}
      </Endpoint>

      <hr />

      <h2>Threads</h2>
      <Endpoint method="GET" path="/watchers/:watcherId/threads" desc="List threads. Filter with ?status=active." />
      <Endpoint method="GET" path="/watchers/:watcherId/threads/:threadId" desc="Get a single thread with full details." />
      <Endpoint method="PUT" path="/watchers/:watcherId/threads/:threadId" desc="Update thread status or summary.">
        {`// Request
{ "status": "resolved", "summary": "Payment confirmed" }`}
      </Endpoint>
      <Endpoint method="DELETE" path="/watchers/:watcherId/threads/:threadId" desc="Delete a thread." />

      <hr />

      <h2>Memory</h2>
      <Endpoint method="GET" path="/watchers/:id/memory" desc="List all non-obsolete memories for a watcher.">
        {`// Response 200
{ "memories": [ { "id", "content", "importance", "obsolete", "created_at" } ] }`}
      </Endpoint>

      <Endpoint method="POST" path="/watchers/:id/memory" desc="Manually create a memory.">
        {`// Request
{ "content": "User's rent is $1,450/mo", "importance": 4 }`}
      </Endpoint>

      <Endpoint method="PUT" path="/watchers/:id/memory/:memoryId" desc="Update a memory's content, importance, or obsolete flag." />
      <Endpoint method="DELETE" path="/watchers/:id/memory/:memoryId" desc="Delete a memory." />

      <hr />

      <h2>Actions</h2>
      <Endpoint method="GET" path="/watchers/:id/actions" desc="List agent actions (invocations, alerts, tool calls). Supports ?limit=N and ?thread_id=X.">
        {`// Response 200
{ "actions": [ { "id", "trigger_type", "tool", "result", "cost_usd", "created_at", ... } ] }`}
      </Endpoint>

      <hr />

      <h2>Custom Tools</h2>
      <p>Custom tools are webhook-backed tools the agent can call. Configure them per watcher.</p>

      <Endpoint method="GET" path="/watchers/:id/tools" desc="List custom tools for a watcher." />

      <Endpoint method="POST" path="/watchers/:id/tools" desc="Create a custom tool.">
        {`// Request
{
  "name": "notify_slack",
  "description": "Send a message to Slack when something needs attention",
  "webhook_url": "https://hooks.slack.com/services/...",
  "headers": { "X-Custom": "value" },
  "parameter_schema": {
    "message": { "type": "string", "description": "The alert message" }
  }
}

// Response 201
{ "tool": { "id", "name", "webhook_url", "enabled", ... } }`}
      </Endpoint>

      <Endpoint method="PUT" path="/watchers/:id/tools/:toolId" desc="Update a custom tool's name, description, URL, headers, schema, or enabled flag." />
      <Endpoint method="DELETE" path="/watchers/:id/tools/:toolId" desc="Delete a custom tool." />

      <Endpoint method="POST" path="/watchers/:id/tools/:toolId/test" desc="Fire a test webhook with a sample payload.">
        {`// Response 200
{ "success": true, "status": 200, "response_body": "ok" }`}
      </Endpoint>

      <hr />

      <h2>Channels</h2>
      <p>Channels control where alerts are delivered (email or webhook).</p>
      <Endpoint method="GET" path="/watchers/:id/channels" desc="List alert channels." />
      <Endpoint method="POST" path="/watchers/:id/channels" desc="Add an alert channel.">
        {`// Request
{ "type": "email", "destination": "me@example.com" }`}
      </Endpoint>
      <Endpoint method="PUT" path="/watchers/:id/channels/:channelId" desc="Update (e.g. toggle enabled)." />
      <Endpoint method="DELETE" path="/watchers/:id/channels/:channelId" desc="Remove a channel." />

      <hr />

      <h2>API Keys</h2>
      <Endpoint method="GET" path="/keys" desc="List your API keys (prefix and metadata only, never the full key).">
        {`// Response 200
{ "keys": [ { "id", "name", "key_prefix": "vk_a1b2c3d", "usage_count", "created_at" } ] }`}
      </Endpoint>

      <Endpoint method="POST" path="/keys" desc="Create a new API key. The full key is returned once.">
        {`// Request
{ "name": "my-integration" }

// Response 201
{ "key": { "id", "name", "key_prefix", "full_key": "vk_..." } }`}
      </Endpoint>

      <Endpoint method="DELETE" path="/keys/:id" desc="Revoke an API key." />

      <hr />

      <h2>Usage</h2>
      <Endpoint method="GET" path="/usage" desc="Get usage and cost data for your account.">
        {`// Response 200
{
  "usage": {
    "total_cost": 0.42,
    "total_invocations": 312,
    "total_alerts": 28,
    "total_emails": 156,
    "current_month": { "cost": 0.08, "invocations": 45 },
    "watchers": [ { "watcher_id", "watcher_name", "cost", "invocations", "alerts", "emails" } ]
  }
}`}
      </Endpoint>

      <hr />

      <h2>Errors</h2>
      <p>All errors return a JSON body with an <code>error</code> field:</p>
      <pre><code>{`{ "error": "Watcher not found" }`}</code></pre>
      <ul>
        <li><code>400</code> — Bad request (missing or invalid fields)</li>
        <li><code>401</code> — Missing or invalid authentication</li>
        <li><code>404</code> — Resource not found or not owned by your account</li>
        <li><code>429</code> — Rate limited</li>
      </ul>
    </div>
  );
}

function Endpoint({ method, path, desc, children }: { method: string; path: string; desc: string; children?: React.ReactNode }) {
  const color = method === 'GET' ? 'text-blue-600 bg-blue-50' :
    method === 'POST' ? 'text-green-600 bg-green-50' :
    method === 'PUT' ? 'text-amber-600 bg-amber-50' :
    'text-red-600 bg-red-50';

  return (
    <div className="my-4">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${color}`}>{method}</span>
        <code className="text-sm">{path}</code>
      </div>
      <p className="text-sm text-gray-600 mb-2 mt-0">{desc}</p>
      {children && <pre><code>{children}</code></pre>}
    </div>
  );
}
