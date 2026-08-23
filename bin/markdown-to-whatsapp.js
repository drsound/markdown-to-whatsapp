#!/usr/bin/env node
// Command line front of the converter: a file or stdin in, WhatsApp text out.
// `markdown-to-whatsapp mcp` hands over to the MCP server in ./mcp.js, loaded
// only then, so converting a file never pays for the protocol SDK.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { convertTextToWhatsapp, convertToBlocks, DEFAULT_OPTIONS } from '../docs/converter.js';

const { version } = createRequire(import.meta.url)('../package.json');

const USAGE = `markdown-to-whatsapp ${version}
Convert Markdown into WhatsApp formatting.

Usage:
  markdown-to-whatsapp [file.md] [options]     convert a file, or stdin when no file is given
  markdown-to-whatsapp mcp                     run as an MCP server over stdio

Options:
  --width <n>       monospace characters per line of the reader's bubble, 10-80 (default ${DEFAULT_OPTIONS.monoWidth})
  --tables <mode>   auto: a drawn table when it fits the width, a list otherwise; list: always a list (default auto)
  --layout <mode>   how a table reads as a list: auto | rows | columns | pairs (default auto)
  --separator       draw a rule between table rows (always drawn when a row wraps)
  --no-emoji        plain bold headings, no level emoji
  --json            print the blocks as JSON (text, source line, table details) instead of the text
  -h, --help        this help
  -v, --version     print the version
`;

function fail(message) {
    process.stderr.write(`markdown-to-whatsapp: ${message}\n`);
    process.exit(2);
}

let parsed;
try {
    parsed = parseArgs({
        allowPositionals: true,
        options: {
            width: { type: 'string' },
            tables: { type: 'string' },
            layout: { type: 'string' },
            separator: { type: 'boolean', default: false },
            emoji: { type: 'boolean', default: true },
            json: { type: 'boolean', default: false },
            help: { type: 'boolean', short: 'h', default: false },
            version: { type: 'boolean', short: 'v', default: false }
        }
    });
} catch (error) {
    fail(error.message + '\n' + USAGE);
}

const { values, positionals } = parsed;

if (values.help) {
    process.stdout.write(USAGE);
    process.exit(0);
}
if (values.version) {
    process.stdout.write(version + '\n');
    process.exit(0);
}

if (positionals[0] === 'mcp') {
    const { serve } = await import('./mcp.js');
    await serve(version);
} else {
    if (positionals.length > 1) fail(`one file at a time, got ${positionals.length}`);

    const options = {};
    if (values.width !== undefined) {
        const width = Number(values.width);
        if (!Number.isInteger(width) || width < 10 || width > 80) fail(`--width must be a whole number from 10 to 80, got "${values.width}"`);
        options.monoWidth = width;
    }
    if (values.tables !== undefined) {
        if (!['auto', 'list'].includes(values.tables)) fail(`--tables must be auto or list, got "${values.tables}"`);
        options.tableFormat = values.tables;
    }
    if (values.layout !== undefined) {
        if (!['auto', 'rows', 'columns', 'pairs'].includes(values.layout)) fail(`--layout must be auto, rows, columns or pairs, got "${values.layout}"`);
        options.listLayout = values.layout;
    }
    options.rowSeparator = values.separator;
    options.headingEmojis = values.emoji;

    let markdown;
    try {
        markdown = readFileSync(positionals.length ? positionals[0] : 0, 'utf8');
    } catch (error) {
        fail(positionals.length ? `cannot read ${positionals[0]}: ${error.message}` : `cannot read stdin: ${error.message}`);
    }

    const output = values.json
        ? JSON.stringify(convertToBlocks(markdown, options), null, 2)
        : convertTextToWhatsapp(markdown, options);
    process.stdout.write(output + '\n');
}
