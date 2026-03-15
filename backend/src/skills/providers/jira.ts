/** Jira — Create issues */
export const configSchema = {
    fields: [
        { name: 'domain', label: 'Jira Domain', type: 'text', required: true, placeholder: 'yourcompany.atlassian.net' },
        { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@company.com' },
        { name: 'api_token', label: 'API Token', type: 'password', required: true, placeholder: 'Atlassian API token' },
        { name: 'project_key', label: 'Project Key', type: 'text', required: true, placeholder: 'PROJ' },
    ]
};

export async function execute(config: any, params: any): Promise<{ ok: boolean; message: string }> {
    const { domain, email, api_token, project_key } = config;
    const { summary, description, issue_type } = params;
    const auth = Buffer.from(`${email}:${api_token}`).toString('base64');
    const resp = await fetch(`https://${domain}/rest/api/3/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
        body: JSON.stringify({
            fields: {
                project: { key: project_key },
                summary: summary || 'Vigil Alert',
                description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: description || '' }] }] },
                issuetype: { name: issue_type || 'Task' },
            }
        }),
    });
    if (!resp.ok) { const e = await resp.text(); return { ok: false, message: `Jira error ${resp.status}: ${e.slice(0, 100)}` }; }
    const data = await resp.json();
    return { ok: true, message: `Created ${data.key}: https://${domain}/browse/${data.key}` };
}
