/**
 * Notion Skill Provider — appends a page to a Notion database.
 */

export interface NotionConfig {
    api_key: string;
    database_id: string;
}

export interface NotionParams {
    title: string;
    content: string;
    properties?: Record<string, string>;
}

export const configSchema = {
    fields: [
        { name: "api_key", label: "API Key", type: "password", required: true, placeholder: "secret_..." },
        { name: "database_id", label: "Database ID", type: "text", required: true, placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
    ],
};

export async function execute(config: NotionConfig, params: NotionParams): Promise<{ ok: boolean; message: string }> {
    if (!config.api_key || !config.database_id) {
        return { ok: false, message: "api_key and database_id are required" };
    }

    // Build page properties — always include a Name/title field
    const pageProperties: Record<string, unknown> = {
        Name: {
            title: [{ text: { content: params.title } }],
        },
    };

    // Add any extra flat string properties
    if (params.properties) {
        for (const [key, val] of Object.entries(params.properties)) {
            pageProperties[key] = {
                rich_text: [{ text: { content: val } }],
            };
        }
    }

    const pageBody: Record<string, unknown> = {
        parent: { database_id: config.database_id },
        properties: pageProperties,
    };

    // Append content as a paragraph block if provided
    if (params.content) {
        (pageBody as any).children = [
            {
                object: "block",
                type: "paragraph",
                paragraph: {
                    rich_text: [{ type: "text", text: { content: params.content.slice(0, 2000) } }],
                },
            },
        ];
    }

    const resp = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${config.api_key}`,
            "content-type": "application/json",
            "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify(pageBody),
        signal: AbortSignal.timeout(15000),
    });

    const data = await resp.json().catch(() => ({})) as any;
    if (!resp.ok) {
        return { ok: false, message: `Notion returned ${resp.status}: ${data?.message ?? "unknown error"}` };
    }

    return { ok: true, message: `Notion page created: ${data.id}` };
}
