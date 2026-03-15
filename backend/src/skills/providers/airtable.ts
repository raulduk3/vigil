/** Airtable — Create records */
export const configSchema = {
    fields: [
        { name: 'api_key', label: 'Personal Access Token', type: 'password', required: true, placeholder: 'pat...' },
        { name: 'base_id', label: 'Base ID', type: 'text', required: true, placeholder: 'appXXXXXXXXXXXXXX' },
        { name: 'table_name', label: 'Table Name', type: 'text', required: true, placeholder: 'Emails' },
    ]
};

export async function execute(config: any, params: any): Promise<{ ok: boolean; message: string }> {
    const { api_key, base_id, table_name } = config;
    const { fields } = params;
    const resp = await fetch(`https://api.airtable.com/v0/${base_id}/${encodeURIComponent(table_name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api_key}` },
        body: JSON.stringify({ records: [{ fields: fields || {} }] }),
    });
    if (!resp.ok) { const e = await resp.text(); return { ok: false, message: `Airtable error ${resp.status}: ${e.slice(0, 100)}` }; }
    const data = await resp.json();
    return { ok: true, message: `Created record: ${data.records?.[0]?.id || 'success'}` };
}
