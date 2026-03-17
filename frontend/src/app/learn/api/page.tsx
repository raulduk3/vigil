export default function ApiReferencePage() {
  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Documentation</p>
      <h1>API Reference</h1>

      <p className="mb-12">
        The Vigil API lets you manage watchers, threads, memory, and custom tools programmatically.
        All endpoints return JSON and require an <code>Authorization</code> header.
      </p>

      <div className="space-y-6">
        <Section title="Authentication">
          <p>
            Use either a JWT access token (from login) or an API key from the <strong>Developer</strong> page.
          </p>
          <pre><code>Authorization: Bearer vk_your_api_key_here</code></pre>
          <p>API keys use the prefix <code>vk_</code>. The full key is never stored — only a SHA-256 hash.</p>

          <h4>Base URL</h4>
          <pre><code>https://api.vigil.run/api</code></pre>
        </Section>

        <Section title="Auth">
          <Endpoint method="POST" path="/auth/register" desc="Create a new account.">
            <Fields fields={[
              { name: 'email', type: 'string', required: true, desc: 'Valid email address (max 254 chars)' },
              { name: 'password', type: 'string', required: true, desc: 'Min 8 characters' },
              { name: 'name', type: 'string', required: false, desc: 'Display name' },
            ]} />
            <Response status={201}>{`{
  "user": { "user_id": "abc123", "email": "you@example.com" },
  "tokens": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "expires_in": 900
  }
}`}</Response>
          </Endpoint>

          <Endpoint method="POST" path="/auth/login" desc="Sign in and receive tokens.">
            <Fields fields={[
              { name: 'email', type: 'string', required: true },
              { name: 'password', type: 'string', required: true },
            ]} />
            <Response>{`{
  "user": { "user_id": "abc123", "email": "you@example.com" },
  "tokens": { "access_token": "...", "refresh_token": "...", "expires_in": 900 }
}`}</Response>
          </Endpoint>

          <Endpoint method="POST" path="/auth/refresh" desc="Exchange a refresh token for a new access token.">
            <Fields fields={[
              { name: 'refresh_token', type: 'string', required: true, desc: 'Also accepts refreshToken' },
            ]} />
            <Response>{`{
  "tokens": { "access_token": "...", "refresh_token": "...", "expires_in": 900 }
}`}</Response>
          </Endpoint>

          <Endpoint method="GET" path="/auth/me" desc="Get the current authenticated user.">
            <Response>{`{
  "user": { "user_id": "abc123", "account_id": "abc123", "email": "you@example.com", "role": "owner" }
}`}</Response>
          </Endpoint>
        </Section>

        <Section title="Watchers">
          <Endpoint method="GET" path="/watchers" desc="List all watchers for the account.">
            <Response>{`{
  "watchers": [
    {
      "id": "w_123", "name": "Work Email", "ingest_token": "tok_...",
      "ingestion_address": "work-tok_...@vigil.run", "status": "active", ...
    }
  ]
}`}</Response>
          </Endpoint>

          <Endpoint method="POST" path="/watchers" desc="Create a new watcher.">
            <Fields fields={[
              { name: 'name', type: 'string', required: true, desc: 'Display name for the watcher' },
              { name: 'system_prompt', type: 'string', required: true, desc: 'Instructions for the agent' },
              { name: 'tools', type: 'string[]', required: false, desc: 'Enabled tools. Default: ["send_alert"]' },
              { name: 'silence_hours', type: 'number', required: false, desc: 'Hours before silence alert. Default: 48' },
              { name: 'tick_interval', type: 'number', required: false, desc: 'Scheduled check interval in minutes. Default: 60' },
              { name: 'model', type: 'string', required: false, desc: 'LLM model. Default: "gpt-4.1"' },
              { name: 'template_id', type: 'string', required: false, desc: 'Watcher template to use' },
            ]} />
            <Response status={201}>{`{ "watcher": { "id": "w_123", "name": "Work Email", ... } }`}</Response>
          </Endpoint>

          <Endpoint method="GET" path="/watchers/:id" desc="Get a single watcher by ID." />

          <Endpoint method="PUT" path="/watchers/:id" desc="Update watcher settings. All fields optional, at least one required.">
            <Fields fields={[
              { name: 'name', type: 'string', required: false },
              { name: 'system_prompt', type: 'string', required: false },
              { name: 'tools', type: 'string[]', required: false },
              { name: 'silence_hours', type: 'number', required: false },
              { name: 'tick_interval', type: 'number', required: false },
              { name: 'model', type: 'string', required: false },
              { name: 'status', type: 'string', required: false, desc: '"active" or "paused"' },
              { name: 'reactivity', type: 'number', required: false, desc: 'Agent reactivity level' },
              { name: 'memory_sensitivity', type: 'number', required: false, desc: 'Memory storage sensitivity' },
            ]} />
          </Endpoint>

          <Endpoint method="DELETE" path="/watchers/:id" desc="Soft-delete a watcher and all associated data." />

          <Endpoint method="POST" path="/watchers/:id/invoke" desc="Manually invoke the agent. All fields optional.">
            <Fields fields={[
              { name: 'message', type: 'string', required: false, desc: 'Chat mode — natural language response. Mutually exclusive with query.' },
              { name: 'query', type: 'string', required: false, desc: 'Query mode — structured JSON response. Defaults to reviewing active threads if neither field is set.' },
            ]} />
            <Response>{`// Chat mode
{ "response": "You have 3 active threads..." }

// Query mode
{ "actions": [...], "thread_updates": [...], "email_analysis": {...} }`}</Response>
          </Endpoint>

          <Endpoint method="POST" path="/watchers/:id/digest" desc="Trigger a digest email for this watcher. No request body." />
        </Section>

        <Section title="Threads">
          <Endpoint method="GET" path="/watchers/:watcherId/threads" desc="List threads. Filter with ?status=active, ?status=watching, etc.">
            <Response>{`{
  "threads": [
    { "id": "t_123", "subject": "Invoice #4521", "status": "active", "summary": "...", ... }
  ]
}`}</Response>
          </Endpoint>

          <Endpoint method="GET" path="/watchers/:watcherId/threads/:threadId" desc="Get a single thread with full details." />

          <Endpoint method="PUT" path="/watchers/:watcherId/threads/:threadId" desc="Update thread status or metadata. All fields optional, at least one required.">
            <Fields fields={[
              { name: 'status', type: 'string', required: false, desc: '"active" | "watching" | "resolved" | "ignored"' },
              { name: 'summary', type: 'string', required: false, desc: 'Thread summary text' },
              { name: 'flags', type: 'object', required: false, desc: 'Custom flags as key-value pairs' },
            ]} />
          </Endpoint>

          <Endpoint method="DELETE" path="/watchers/:watcherId/threads/:threadId" desc="Delete a thread." />

          <Endpoint method="POST" path="/watchers/:watcherId/threads/:threadId/close" desc="Mark a thread as resolved. No request body. Returns 400 if already resolved or ignored." />
        </Section>

        <Section title="Memory">
          <Endpoint method="GET" path="/watchers/:id/memory" desc="List all non-obsolete memories for a watcher.">
            <Response>{`{
  "memories": [
    { "id": "m_123", "content": "User's rent is $1,450/mo", "importance": 4, "obsolete": false, "created_at": "..." }
  ]
}`}</Response>
          </Endpoint>

          <Endpoint method="POST" path="/watchers/:id/memory" desc="Manually create a memory.">
            <Fields fields={[
              { name: 'content', type: 'string', required: true, desc: 'Memory text. Must be non-empty.' },
              { name: 'importance', type: 'number', required: false, desc: '1-5 scale. Default: 3' },
            ]} />
            <Response status={201}>{`{ "memory": { "id": "m_123", "content": "...", "importance": 4 } }`}</Response>
          </Endpoint>

          <Endpoint method="PUT" path="/watchers/:id/memory/:memoryId" desc="Update a memory. All fields optional, at least one required.">
            <Fields fields={[
              { name: 'content', type: 'string', required: false, desc: 'Updated memory text' },
              { name: 'importance', type: 'number', required: false, desc: '1-5 scale' },
              { name: 'obsolete', type: 'boolean', required: false, desc: 'Mark memory as obsolete' },
            ]} />
          </Endpoint>

          <Endpoint method="DELETE" path="/watchers/:id/memory/:memoryId" desc="Delete a memory." />
        </Section>

        <Section title="Actions">
          <Endpoint method="GET" path="/watchers/:id/actions" desc="List agent actions (invocations, alerts, tool calls). Supports ?limit=N and ?thread_id=X.">
            <Response>{`{
  "actions": [
    {
      "id": "a_123", "trigger_type": "email_received", "tool": "send_alert",
      "result": "...", "cost_usd": 0.003, "created_at": "..."
    }
  ]
}`}</Response>
          </Endpoint>
        </Section>

        <Section title="Custom Tools">
          <p>Custom tools are webhook-backed extensions the agent can call. Configured per watcher.</p>

          <Endpoint method="GET" path="/watchers/:id/tools" desc="List custom tools for a watcher." />

          <Endpoint method="POST" path="/watchers/:id/tools" desc="Create a custom tool.">
            <Fields fields={[
              { name: 'name', type: 'string', required: true, desc: 'Tool name (e.g. "notify_slack")' },
              { name: 'description', type: 'string', required: true, desc: 'What the tool does — shown to the agent' },
              { name: 'webhook_url', type: 'string', required: true, desc: 'URL to POST to when the agent calls the tool' },
              { name: 'headers', type: 'object', required: false, desc: 'Custom headers sent with the webhook. Default: {}' },
              { name: 'parameter_schema', type: 'object', required: false, desc: 'JSON schema for the tool parameters. Default: {}' },
            ]} />
            <Response status={201}>{`{
  "tool": {
    "id": "ct_123", "name": "notify_slack",
    "description": "Send a message to Slack",
    "webhook_url": "https://hooks.slack.com/...",
    "headers": {},
    "parameter_schema": { "message": { "type": "string", "description": "The alert message" } },
    "enabled": true
  }
}`}</Response>
          </Endpoint>

          <Endpoint method="PUT" path="/watchers/:id/tools/:toolId" desc="Update a custom tool. All fields optional, at least one required.">
            <Fields fields={[
              { name: 'name', type: 'string', required: false },
              { name: 'description', type: 'string', required: false },
              { name: 'webhook_url', type: 'string', required: false },
              { name: 'headers', type: 'object', required: false },
              { name: 'parameter_schema', type: 'object', required: false },
              { name: 'enabled', type: 'boolean', required: false, desc: 'Enable or disable the tool' },
            ]} />
          </Endpoint>

          <Endpoint method="DELETE" path="/watchers/:id/tools/:toolId" desc="Delete a custom tool." />

          <Endpoint method="POST" path="/watchers/:id/tools/:toolId/test" desc="Fire a test webhook with a sample payload. No request body.">
            <Response>{`{ "success": true, "status": 200, "response_body": "ok" }`}</Response>
          </Endpoint>
        </Section>

        <Section title="Channels">
          <p>Channels control where alerts are delivered.</p>

          <Endpoint method="GET" path="/watchers/:id/channels" desc="List alert channels." />

          <Endpoint method="POST" path="/watchers/:id/channels" desc="Add an alert channel.">
            <Fields fields={[
              { name: 'type', type: 'string', required: true, desc: '"email" or "webhook"' },
              { name: 'destination', type: 'string', required: true, desc: 'Email address or webhook URL' },
            ]} />
            <Response status={201}>{`{ "channel": { "id": "ch_123", "type": "email", "destination": "me@example.com", "enabled": true } }`}</Response>
          </Endpoint>

          <Endpoint method="PUT" path="/watchers/:id/channels/:channelId" desc="Update a channel. All fields optional, at least one required.">
            <Fields fields={[
              { name: 'destination', type: 'string', required: false, desc: 'New email address or webhook URL' },
              { name: 'enabled', type: 'boolean', required: false, desc: 'Enable or disable the channel' },
            ]} />
          </Endpoint>

          <Endpoint method="DELETE" path="/watchers/:id/channels/:channelId" desc="Remove a channel." />
        </Section>

        <Section title="API Keys">
          <Endpoint method="GET" path="/keys" desc="List your API keys. The full key is never returned.">
            <Response>{`{
  "keys": [
    { "id": "k_123", "name": "my-integration", "key_prefix": "vk_a1b2c3d", "usage_count": 42, "created_at": "..." }
  ]
}`}</Response>
          </Endpoint>

          <Endpoint method="POST" path="/keys" desc="Create a new API key. The full key is returned only once.">
            <Fields fields={[
              { name: 'name', type: 'string', required: true, desc: 'Label for the key' },
              { name: 'permissions', type: 'string[]', required: false, desc: 'Permission scopes. Default: ["read"]' },
            ]} />
            <Response status={201}>{`{
  "key": {
    "id": "k_123", "name": "my-integration",
    "key_prefix": "vk_a1b2c3d", "full_key": "vk_a1b2c3d4e5f6..."
  }
}`}</Response>
          </Endpoint>

          <Endpoint method="DELETE" path="/keys/:id" desc="Revoke an API key." />
        </Section>

        <Section title="Usage">
          <Endpoint method="GET" path="/usage" desc="Get usage and cost data for your account.">
            <Response>{`{
  "usage": {
    "total_cost": 0.42,
    "total_invocations": 312,
    "total_alerts": 28,
    "total_emails": 156,
    "current_month": { "cost": 0.08, "invocations": 45 },
    "watchers": [
      { "watcher_id": "w_123", "watcher_name": "Work Email", "cost": 0.25, "invocations": 200, "alerts": 15, "emails": 100 }
    ]
  }
}`}</Response>
          </Endpoint>
        </Section>

        <Section title="Errors">
          <p>All errors return a JSON body with an <code>error</code> field:</p>
          <pre><code>{`{ "error": "Watcher not found" }`}</code></pre>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm mt-4">
            <code>400</code><span className="text-gray-600">Bad request — missing or invalid fields</span>
            <code>401</code><span className="text-gray-600">Missing or invalid authentication</span>
            <code>404</code><span className="text-gray-600">Resource not found or not owned by your account</span>
            <code>429</code><span className="text-gray-600">Rate limited</span>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="!mt-8 !mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Endpoint({ method, path, desc, children }: { method: string; path: string; desc: string; children?: React.ReactNode }) {
  const color = method === 'GET' ? 'text-blue-600 bg-blue-600/10' :
    method === 'POST' ? 'text-green-600 bg-green-600/10' :
    method === 'PUT' ? 'text-amber-600 bg-amber-600/10' :
    'text-red-600 bg-red-600/10';

  return (
    <div className="my-3 pb-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${color}`}>{method}</span>
        <code className="text-sm">{path}</code>
      </div>
      <p className="text-sm text-gray-500 !mb-2 !mt-0">{desc}</p>
      {children}
    </div>
  );
}

type FieldDef = { name: string; type: string; required: boolean; desc?: string };

function Fields({ fields }: { fields: FieldDef[] }) {
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider !mb-2">Request body</p>
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {fields.map((f) => (
              <tr key={f.name} className="border-b border-gray-100 last:border-0">
                <td className="px-3 py-2 font-mono text-sm text-gray-900 whitespace-nowrap align-top">
                  {f.name}
                  {f.required && <span className="text-red-400 ml-0.5">*</span>}
                </td>
                <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap align-top">{f.type}</td>
                <td className="px-3 py-2 text-gray-500 text-sm">{f.desc || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Response({ status = 200, children }: { status?: number; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider !mb-1">Response {status}</p>
      <pre className="!mt-0"><code>{children}</code></pre>
    </div>
  );
}
