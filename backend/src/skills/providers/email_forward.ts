/** Email Forward — Send email via Resend */
export const configSchema = {
    fields: [
        { name: 'to_email', label: 'Send To', type: 'email', required: true, placeholder: 'team@company.com' },
        { name: 'from_name', label: 'From Name', type: 'text', required: false, placeholder: 'Vigil' },
    ]
};

export async function execute(config: any, params: any): Promise<{ ok: boolean; message: string }> {
    const { to_email, from_name } = config;
    const { subject, body } = params;
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return { ok: false, message: 'Resend API key not configured on server' };
    const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
        body: JSON.stringify({
            from: `${from_name || 'Vigil'} <notifications@vigil.run>`,
            to: [to_email],
            subject: subject || 'Vigil Alert',
            html: `<p>${(body || '').replace(/\n/g, '<br>')}</p>`,
        }),
    });
    if (!resp.ok) { const e = await resp.text(); return { ok: false, message: `Resend error: ${e.slice(0, 100)}` }; }
    return { ok: true, message: `Email sent to ${to_email}` };
}
