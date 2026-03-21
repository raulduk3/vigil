/** Linear — Create issues */
export const configSchema = {
    fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'lin_api_...' },
        { name: 'team_id', label: 'Team ID', type: 'text', required: true, placeholder: 'Team UUID from Linear settings' },
    ]
};

export async function execute(config: any, params: any): Promise<{ ok: boolean; message: string }> {
    const { api_key, team_id } = config;
    const { title, description, priority } = params;
    const mutation = `mutation { issueCreate(input: { teamId: "${team_id}", title: "${(title || '').replace(/"/g, '\\"')}", description: "${(description || '').replace(/"/g, '\\"')}", priority: ${priority || 0} }) { success issue { id identifier url } } }`;
    const resp = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': api_key },
        body: JSON.stringify({ query: mutation }),
    });
    if (!resp.ok) return { ok: false, message: `Linear API error: ${resp.status}` };
    const data = await resp.json() as any;
    if (data.data?.issueCreate?.success) {
        return { ok: true, message: `Created ${data.data.issueCreate.issue.identifier}: ${data.data.issueCreate.issue.url}` };
    }
    return { ok: false, message: data.errors?.[0]?.message || 'Failed to create issue' };
}
