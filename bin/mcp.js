// MCP server over stdio: one tool, the converter. Started by
// `markdown-to-whatsapp mcp`, which is what an agent's configuration runs.
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { convertToBlocks, DEFAULT_OPTIONS } from '../docs/converter.js';

// The description is what the model reads to decide whether to call the tool:
// it has to say what the tool does that the model would get wrong on its own
const DESCRIPTION = `Convert Markdown into the formatting WhatsApp renders (*bold*, _italic_, ~strike~, \`code\`, lists, quotes), ready to paste or send.
Use it instead of hand-writing WhatsApp syntax whenever the text has tables, nested lists, headings or inline formatting next to punctuation: it applies WhatsApp's real rules (markers only on word boundaries, escapes that WhatsApp does not interpret, no mid-word formatting) and draws each table as a monospace box that fits the reader's phone — padding removed, then borders, then cells word-wrapped — falling back to a bulleted list only when no box fits. Counting columns against a 26-character bubble is exactly what this tool does and a model does not.`;

const inputSchema = z.object({
    markdown: z.string().describe('The Markdown text to convert'),
    monoWidth: z.number().int().min(10).max(80).optional()
        .describe(`Monospace characters that fit on one line of the reader's WhatsApp bubble; about 26 on a 360 px phone (default ${DEFAULT_OPTIONS.monoWidth}). Tables are drawn to fit this width.`),
    tableFormat: z.enum(['auto', 'list']).optional()
        .describe('auto: a drawn table when it fits monoWidth, a bulleted list otherwise. list: always a bulleted list. Default auto.'),
    listLayout: z.enum(['auto', 'rows', 'columns', 'pairs']).optional()
        .describe('How a table reads when it is a list: rows (one group per row), columns (one group per column, for comparison matrices), pairs (bare "key: value" lines, two columns only). auto guesses from the headers. Default auto.'),
    rowSeparator: z.boolean().optional()
        .describe('Draw a rule between table rows. Always drawn when a row wraps. Default false.'),
    headingEmojis: z.boolean().optional()
        .describe('Prefix headings with a level emoji (📌 🟠 🟡 …) before the bold text. Default true.')
});

const outputSchema = z.object({
    text: z.string().describe('The WhatsApp-formatted message'),
    tables: z.array(z.object({
        key: z.string().describe('The table\'s header cells joined with |'),
        columns: z.number().int(),
        fitsBox: z.boolean().describe('A drawn box fits monoWidth (even if the table was asked to be a list)'),
        asList: z.boolean().describe('The table was written as a bulleted list'),
        listLayout: z.enum(['rows', 'columns', 'pairs']).nullable().describe('Which list layout it got, null for a box')
    })).describe('One entry per table in the document, in order')
});

export async function serve(version) {
    const server = new McpServer({ name: 'markdown-to-whatsapp', version });

    server.registerTool(
        'convert_markdown_to_whatsapp',
        {
            title: 'Convert Markdown to WhatsApp',
            description: DESCRIPTION,
            inputSchema,
            outputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
        },
        async ({ markdown, ...options }) => {
            try {
                const result = convertToBlocks(markdown, options);
                const output = {
                    text: result.text,
                    tables: result.blocks
                        .filter(block => block.tableIndex !== null)
                        .map(({ key, columns, fitsBox, asList, listLayout }) => ({ key, columns, fitsBox, asList, listLayout }))
                };
                return { content: [{ type: 'text', text: output.text }], structuredContent: output };
            } catch (error) {
                return { content: [{ type: 'text', text: `Conversion failed: ${error.message}` }], isError: true };
            }
        }
    );

    await server.connect(new StdioServerTransport());
}
