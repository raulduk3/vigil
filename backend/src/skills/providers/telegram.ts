/** Telegram — Send message to a chat */
export const configSchema = {
    fields: [
        { name: 'bot_token', label: 'Bot Token', type: 'password', required: true, placeholder: '123456:ABC-DEF1234...' },
        { name: 'chat_id', label: 'Chat ID', type: 'text', required: true, placeholder: '-1001234567890 or @channelname' },
    ]
};

export async function execute(config: any, params: any): Promise<{ ok: boolean; message: string }> {
    const { bot_token, chat_id } = config;
    const { text } = params;
    const resp = await fetch(`https://api.telegram.org/bot${bot_token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id, text: text || 'Vigil alert', parse_mode: 'HTML' }),
    });
    if (!resp.ok) { const e = await resp.json().catch(() => ({})) as any; return { ok: false, message: e.description || `Telegram error ${resp.status}` }; }
    return { ok: true, message: `Message sent to ${chat_id}` };
}
