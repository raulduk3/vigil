/** Google Sheets — Append rows */
export const configSchema = {
    fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'AIza...' },
        { name: 'spreadsheet_id', label: 'Spreadsheet ID', type: 'text', required: true, placeholder: 'From the URL: /d/{this-part}/edit' },
        { name: 'sheet_name', label: 'Sheet Name', type: 'text', required: false, placeholder: 'Sheet1' },
    ]
};

export async function execute(config: any, params: any): Promise<{ ok: boolean; message: string }> {
    const { api_key, spreadsheet_id, sheet_name } = config;
    const { values } = params; // array of values for one row
    const range = `${sheet_name || 'Sheet1'}!A:Z`;
    const resp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&key=${api_key}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [Array.isArray(values) ? values : [values || '']] }),
        }
    );
    if (!resp.ok) { const e = await resp.text(); return { ok: false, message: `Sheets error ${resp.status}: ${e.slice(0, 100)}` }; }
    return { ok: true, message: `Row appended to ${sheet_name || 'Sheet1'}` };
}
