/** GitHub — Create issues */
export const configSchema = {
    fields: [
        { name: 'token', label: 'Personal Access Token', type: 'password', required: true, placeholder: 'ghp_...' },
        { name: 'owner', label: 'Repo Owner', type: 'text', required: true, placeholder: 'username or org' },
        { name: 'repo', label: 'Repository', type: 'text', required: true, placeholder: 'repo-name' },
    ]
};

export async function execute(config: any, params: any): Promise<{ ok: boolean; message: string }> {
    const { token, owner, repo } = config;
    const { title, body, labels } = params;
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'User-Agent': 'Vigil' },
        body: JSON.stringify({ title: title || 'Vigil Alert', body: body || '', labels: labels || [] }),
    });
    if (!resp.ok) { const e = await resp.text(); return { ok: false, message: `GitHub error ${resp.status}: ${e.slice(0, 100)}` }; }
    const data = await resp.json();
    return { ok: true, message: `Created #${data.number}: ${data.html_url}` };
}
