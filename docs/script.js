// =================================================================================================
// CONSTANTS
// =================================================================================================

/**
 * Emojis to prepend to header lines by level.
 * @type {Record<number, string>}
 */
const HEADER_EMOJIS = {
    1: '📌',
    2: '🟠',
    3: '🟡',
    4: '🟢',
    5: '🔵',
    6: '⚫️'
};

// =================================================================================================
// MAIN CONVERSION LOGIC (using marked lexer)
// =================================================================================================

// Cached conversion options (set at start of each conversion)
let _tableFormat = 'auto';
let _tableThreshold = 26;

/**
 * Convert Markdown into a WhatsApp-friendly format using the marked lexer
 * for proper AST-based parsing instead of regex substitutions.
 *
 * Supported conversions:
 * - **bold** or __bold__ → *bold*
 * - *italic* or _italic_ → _italic_
 * - ***bold+italic*** → *_text_*
 * - ~~strikethrough~~ → ~strikethrough~
 * - `code` → `code`
 * - ```code blocks``` → ```code blocks```
 * - [text](url) → text (url)
 * - Headers → *emoji Header*
 * - Lists → preserved with proper markers
 * - Blockquotes → > prefix preserved
 *
 * @param {string} markdownText - The Markdown input.
 * @returns {string} The converted WhatsApp-compatible text.
 */
function convertTextToWhatsapp(markdownText) {
    if (!markdownText.trim()) {
        return '';
    }

    // Cache UI settings once at start of conversion (avoids repeated DOM queries)
    if (typeof document !== 'undefined') {
        _tableFormat = document.querySelector('input[name="tableFormat"]:checked')?.value || 'auto';
        _tableThreshold = parseInt(document.getElementById('tableThreshold')?.value || '26', 10);
    } else {
        _tableFormat = 'auto';
        _tableThreshold = 26;
    }

    const tokens = marked.lexer(markdownText);
    return renderTokens(tokens).trim();
}

/**
 * Render an array of block-level tokens to WhatsApp format.
 * @param {Array} tokens - Array of marked tokens
 * @returns {string} WhatsApp-formatted text
 */
function renderTokens(tokens) {
    const result = [];

    for (const token of tokens) {
        const rendered = renderToken(token);
        if (rendered !== null && rendered !== undefined) {
            result.push(rendered);
        }
    }

    return result.join('\n\n');
}

/**
 * Render a single block-level token to WhatsApp format.
 * @param {Object} token - A marked token
 * @returns {string|null} WhatsApp-formatted text
 */
function renderToken(token) {
    switch (token.type) {
        case 'heading':
            return renderHeading(token);

        case 'paragraph':
            return renderInline(token.tokens);

        case 'text':
            // Top-level text (e.g., in loose lists)
            if (token.tokens) {
                return renderInline(token.tokens);
            }
            return token.text;

        case 'code':
            return renderCodeBlock(token);

        case 'list':
            return renderList(token);

        case 'blockquote':
            return renderBlockquote(token);

        case 'hr':
            return '───────────────';

        case 'space':
            return null; // Skip empty space tokens

        case 'html':
            return token.text; // Pass through HTML as-is

        case 'table':
            return renderTable(token);

        default:
            // Fallback: return raw text if available
            return token.raw || '';
    }
}

/**
 * Render a heading token.
 * Headers are rendered as bold with an emoji prefix.
 * Any bold markers inside are stripped to avoid nested asterisks which WhatsApp doesn't support.
 * @param {Object} token - Heading token with depth and tokens
 * @returns {string} Formatted heading
 */
function renderHeading(token) {
    const emoji = HEADER_EMOJIS[token.depth] || HEADER_EMOJIS[6];
    // Use a special render mode that strips bold markers to avoid *header with *bold* inside*
    const content = renderInlineForHeader(token.tokens);
    return `*${emoji} ${content}*`;
}

/**
 * Render inline tokens for headers (bold markers stripped).
 * @param {Array} tokens - Array of inline tokens
 * @returns {string} Text with bold markers stripped
 */
function renderInlineForHeader(tokens) {
    if (!tokens || !Array.isArray(tokens)) {
        return '';
    }

    return tokens.map(token => {
        switch (token.type) {
            case 'strong':
                // Skip bold marker, just render content (header is already bold)
                return renderInlineForHeader(token.tokens);

            case 'em':
                // Keep italic in headers
                return '_' + renderInlineForHeader(token.tokens) + '_';

            case 'del':
                return '~' + renderInlineForHeader(token.tokens) + '~';

            case 'codespan':
                return '`' + token.text + '`';

            case 'link':
                return renderInlineForHeader(token.tokens) + ' (' + token.href + ')';

            case 'text':
                return unescapeText(token.text);

            case 'escape':
                return token.text;

            default:
                return token.raw || token.text || '';
        }
    }).join('');
}

/**
 * Render a code block.
 * @param {Object} token - Code token
 * @returns {string} Formatted code block
 */
function renderCodeBlock(token) {
    return '```' + token.text + '```';
}

/**
 * Render a list (ordered or unordered).
 * Uses different bullet symbols for nested levels instead of indentation.
 * @param {Object} token - List token
 * @param {number} depth - Nesting depth (0 = top level)
 * @returns {string} Formatted list
 */
function renderList(token, depth = 0) {
    const items = [];

    token.items.forEach((item, index) => {
        let prefix;
        if (token.ordered) {
            const start = token.start || 1;
            prefix = `${start + index}.`;
        } else {
            // Check for task list items
            if (item.task) {
                prefix = item.checked ? '☑' : '☐';
            } else {
                // Use WhatsApp's * character, then add ◦ for each nesting level
                // Level 1: *
                // Level 2: * ◦
                // Level 3: * ◦ ◦
                // etc.
                if (depth === 0) {
                    prefix = '*';
                } else {
                    prefix = '* ' + '◦ '.repeat(depth).trim();
                }
            }
        }

        // Render item content
        let content;
        const nestedParts = [];

        if (item.tokens) {
            // Render nested content, handling nested lists
            const textParts = [];
            for (const subToken of item.tokens) {
                if (subToken.type === 'list') {
                    // Nested list - render with increased depth
                    nestedParts.push(renderList(subToken, depth + 1));
                } else {
                    textParts.push(renderToken(subToken) || '');
                }
            }
            content = textParts.join('').trim();
        } else {
            content = item.text || '';
        }

        items.push(`${prefix} ${content}`);
        // Add nested lists after the item
        for (const nested of nestedParts) {
            items.push(nested);
        }
    });

    return items.join('\n');
}

/**
 * Render a blockquote.
 * Handles nested blockquotes by detecting inner blockquote tokens.
 * @param {Object} token - Blockquote token
 * @returns {string} Formatted blockquote
 */
function renderBlockquote(token) {
    const lines = [];

    for (const subToken of token.tokens) {
        if (subToken.type === 'blockquote') {
            // Nested blockquote - add extra > prefix
            const nested = renderBlockquote(subToken);
            lines.push(nested.split('\n').map(line => '> ' + line).join('\n'));
        } else {
            const content = renderToken(subToken);
            if (content) {
                lines.push(content.split('\n').map(line => '> ' + line).join('\n'));
            }
        }
    }

    return lines.join('\n');
}

/**
 * Generate all padding configurations for progressive removal.
 * Order: full padding → remove right (last to first) → remove left (last to first)
 * @param {number} colCount - Number of columns
 * @returns {Array} Array of padding config objects
 */
function generatePaddingConfigs(colCount) {
    const configs = [];

    // Full padding
    configs.push({
        leftPadding: Array(colCount).fill(true),
        rightPadding: Array(colCount).fill(true)
    });

    // Remove right padding progressively (last to first column)
    for (let i = colCount - 1; i >= 0; i--) {
        const config = {
            leftPadding: Array(colCount).fill(true),
            rightPadding: Array(colCount).fill(true)
        };
        for (let j = i; j < colCount; j++) {
            config.rightPadding[j] = false;
        }
        configs.push(config);
    }

    // Remove left padding progressively (last to first column)
    for (let i = colCount - 1; i >= 0; i--) {
        const config = {
            leftPadding: Array(colCount).fill(true),
            rightPadding: Array(colCount).fill(false)
        };
        for (let j = i; j < colCount; j++) {
            config.leftPadding[j] = false;
        }
        configs.push(config);
    }

    return configs;
}

/**
 * Render a table with optimal format (ASCII with minimal padding or list).
 * @param {Object} token - Table token
 * @returns {string} Formatted table
 */
function renderTable(token) {
    // Use cached settings (set at start of conversion)
    if (_tableFormat === 'always') {
        return renderTableAsList(token);
    }

    if (_tableFormat === 'ascii') {
        return renderTableAsAscii(token);
    }

    // 'auto' mode: try progressive padding removal

    const configs = generatePaddingConfigs(token.header.length);

    // Test each configuration
    for (const config of configs) {
        const width = calculateTableWidth(token, config);
        if (width <= _tableThreshold) {
            return renderTableAsAscii(token, config);
        }
    }

    // If no configuration fits, use list format
    return renderTableAsList(token);
}

/**
 * Calculate the width of the ASCII table with given padding configuration.
 * @param {Object} token - Table token
 * @param {Object} paddingConfig - { leftPadding: [bool, ...], rightPadding: [bool, ...] }
 * @returns {number} Total table width in characters
 */
function calculateTableWidth(token, paddingConfig = null) {
    const headerCells = token.header.map(cell => renderPlainText(cell.tokens));
    const bodyRows = token.rows.map(row => row.map(cell => renderPlainText(cell.tokens)));

    const colCount = headerCells.length;

    // Default: full padding for all columns
    if (!paddingConfig) {
        paddingConfig = {
            leftPadding: Array(colCount).fill(true),
            rightPadding: Array(colCount).fill(true)
        };
    }

    let totalWidth = 1; // Start with left border

    for (let i = 0; i < colCount; i++) {
        let maxWidth = headerCells[i].length;
        for (const row of bodyRows) {
            if (row[i] && row[i].length > maxWidth) {
                maxWidth = row[i].length;
            }
        }

        // Add left padding if enabled for this column
        if (paddingConfig.leftPadding[i]) {
            totalWidth += 1;
        }

        // Add content width
        totalWidth += maxWidth;

        // Add right padding if enabled for this column
        if (paddingConfig.rightPadding[i]) {
            totalWidth += 1;
        }

        // Add separator
        totalWidth += 1;
    }

    return totalWidth;
}

/**
 * Render a table as ASCII art with configurable padding.
 * @param {Object} token - Table token
 * @param {Object} paddingConfig - { leftPadding: [bool, ...], rightPadding: [bool, ...] }
 * @returns {string} ASCII table
 */
function renderTableAsAscii(token, paddingConfig = null) {
    // Extract all cell contents as PLAIN TEXT (no formatting markers)
    // since the table is inside a monospace block where formatting doesn't work
    const headerCells = token.header.map(cell => renderPlainText(cell.tokens));
    const bodyRows = token.rows.map(row =>
        row.map(cell => renderPlainText(cell.tokens))
    );

    // Calculate column widths (max of header and all body cells)
    const colCount = headerCells.length;
    const colWidths = [];

    for (let i = 0; i < colCount; i++) {
        let maxWidth = headerCells[i].length;
        for (const row of bodyRows) {
            if (row[i] && row[i].length > maxWidth) {
                maxWidth = row[i].length;
            }
        }
        colWidths.push(maxWidth);
    }

    // Default: full padding for all columns
    if (!paddingConfig) {
        paddingConfig = {
            leftPadding: Array(colCount).fill(true),
            rightPadding: Array(colCount).fill(true)
        };
    }

    // Helper to create a horizontal border line
    const createBorder = (left, mid, right, fill) => {
        return left + colWidths.map((w, i) => {
            const leftPad = paddingConfig.leftPadding[i] ? 1 : 0;
            const rightPad = paddingConfig.rightPadding[i] ? 1 : 0;
            return fill.repeat(w + leftPad + rightPad);
        }).join(mid) + right;
    };

    // Helper to create a data row
    const createRow = (cells) => {
        const paddedCells = cells.map((cell, i) => {
            const contentWidth = colWidths[i];
            const padding = contentWidth - cell.length;

            const leftPad = paddingConfig.leftPadding[i] ? ' ' : '';
            const rightPad = paddingConfig.rightPadding[i] ? ' '.repeat(padding + 1) : ' '.repeat(padding);

            return leftPad + cell + rightPad;
        });
        return '|' + paddedCells.join('|') + '|';
    };

    // Build the table
    const lines = [];

    // Top border
    lines.push(createBorder('+', '+', '+', '-'));

    // Header row
    lines.push(createRow(headerCells));

    // Header separator (thicker)
    lines.push(createBorder('+', '+', '+', '='));

    // Body rows
    for (const row of bodyRows) {
        lines.push(createRow(row));
    }

    // Bottom border
    lines.push(createBorder('+', '+', '+', '-'));

    return '```\n' + lines.join('\n') + '\n```';
}

/**
 * Render a table as a nested list (for wide tables).
 * Format:
 * * *Header1:* Value1
 * * ◦ _Header2:_ Value2
 * * ◦ _Header3:_ Value3
 * @param {Object} token - Table token
 * @returns {string} List-formatted table
 */
function renderTableAsList(token) {
    const headers = token.header.map(cell => renderPlainText(cell.tokens));
    const lines = [];

    for (const row of token.rows) {
        for (let i = 0; i < row.length; i++) {
            const header = headers[i] || `Column ${i + 1}`;
            // Use renderInline to preserve formatting in cell content
            const value = renderInline(row[i].tokens);

            if (i === 0) {
                // First column: bold header
                lines.push(`* *${header}:* ${value}`);
            } else {
                // Other columns: italic header with ◦ prefix
                lines.push(`* ◦ _${header}:_ ${value}`);
            }
        }
    }

    return lines.join('\n');
}

/**
 * Render inline tokens to WhatsApp format.
 * This handles bold, italic, strikethrough, code, links, etc.
 * @param {Array} tokens - Array of inline tokens
 * @returns {string} WhatsApp-formatted inline text
 */
function renderInline(tokens) {
    if (!tokens || !Array.isArray(tokens)) {
        return '';
    }

    const result = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const prevToken = tokens[i - 1];
        const nextToken = tokens[i + 1];

        // Check if this formatting token is adjacent to text (inside a word)
        // WhatsApp doesn't support partial-word formatting
        const isAdjacentToPrev = prevToken && prevToken.type === 'text' &&
            prevToken.text && !/\s$/.test(prevToken.text);
        const isAdjacentToNext = nextToken && nextToken.type === 'text' &&
            nextToken.text && !/^\s/.test(nextToken.text);
        const isPartialWord = isAdjacentToPrev || isAdjacentToNext;

        switch (token.type) {
            case 'strong':
                // Bold: **text** or __text__ → *text*
                if (isPartialWord) {
                    // Skip formatting for partial word - use plain text
                    result.push(renderPlainText(token.tokens));
                } else if (token.tokens && token.tokens.length === 1 && token.tokens[0].type === 'em') {
                    // Bold+italic: ***text***, **_text_**, __*text*__ → *_text_*
                    result.push('*_' + renderInline(token.tokens[0].tokens) + '_*');
                } else {
                    result.push('*' + renderInline(token.tokens) + '*');
                }
                break;

            case 'em':
                // Italic: *text* or _text_ → _text_
                if (isPartialWord) {
                    result.push(renderPlainText(token.tokens));
                } else if (token.tokens && token.tokens.length === 1 && token.tokens[0].type === 'strong') {
                    // Italic+bold: _**text**_, *__text__* → _*text*_
                    result.push('_*' + renderInline(token.tokens[0].tokens) + '*_');
                } else {
                    result.push('_' + renderInline(token.tokens) + '_');
                }
                break;

            case 'del':
                // Strikethrough: ~~text~~ → ~text~
                if (isPartialWord) {
                    result.push(renderPlainText(token.tokens));
                } else {
                    result.push('~' + renderInline(token.tokens) + '~');
                }
                break;

            case 'codespan':
                // Inline code: `text` → `text`
                result.push('`' + token.text + '`');
                break;

            case 'link':
                // Link: [text](url) → text (url)
                result.push(`${renderInline(token.tokens)} (${token.href})`);
                break;

            case 'image':
                // Image: ![alt](url) → [alt: url]
                result.push(`[${token.text}: ${token.href}]`);
                break;

            case 'text':
                // Plain text - handle escaped characters
                result.push(unescapeText(token.text));
                break;

            case 'escape':
                // Escaped character - use Unicode look-alikes that WhatsApp won't interpret
                result.push(escapeForWhatsApp(token.text));
                break;

            case 'br':
                result.push('\n');
                break;

            case 'html':
                result.push(token.text);
                break;

            default:
                // Fallback
                result.push(token.raw || token.text || '');
        }
    }

    return result.join('');
}

/**
 * Unescape common HTML entities that marked may produce.
 * @param {string} text - Text to unescape
 * @returns {string} Unescaped text
 */
function unescapeText(text) {
    if (!text) return '';
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

/**
 * Convert Markdown formatting characters to Unicode look-alikes.
 * This prevents WhatsApp from interpreting escaped characters as formatting.
 * @param {string} char - The escaped character
 * @returns {string} Unicode look-alike character
 */
function escapeForWhatsApp(char) {
    const lookAlikes = {
        '*': '∗',  // U+2217 ASTERISK OPERATOR
        '_': '＿', // U+FF3F FULLWIDTH LOW LINE
        '~': '∼',  // U+223C TILDE OPERATOR
        '`': 'ˋ',  // U+02CB MODIFIER LETTER GRAVE ACCENT
    };
    return lookAlikes[char] || char;
}

/**
 * Render inline tokens as plain text (no formatting markers).
 * Used for content inside monospace blocks like tables where formatting doesn't work.
 * @param {Array} tokens - Array of inline tokens
 * @returns {string} Plain text without formatting markers
 */
function renderPlainText(tokens) {
    if (!tokens || !Array.isArray(tokens)) {
        return '';
    }

    return tokens.map(token => {
        switch (token.type) {
            case 'strong':
            case 'em':
            case 'del':
                // Strip formatting markers, just return content
                return renderPlainText(token.tokens);

            case 'codespan':
                // Keep code content but without backticks
                return token.text;

            case 'link':
                // Link as "text (url)"
                return renderPlainText(token.tokens) + ' (' + token.href + ')';

            case 'image':
                return '[' + token.text + ']';

            case 'text':
                return unescapeText(token.text);

            case 'escape':
                return token.text;

            case 'br':
                return ' ';

            default:
                return token.raw || token.text || '';
        }
    }).join('');
}

// =================================================================================================
// DOM MANIPULATION AND EVENT LISTENERS
// =================================================================================================

// Wait for the DOM to be fully loaded before running the script.
document.addEventListener('DOMContentLoaded', () => {

    // Get references to the DOM elements.
    const markdownInput = document.getElementById('markdown-input');
    const whatsappOutput = document.getElementById('whatsapp-output');
    const copyButton = document.getElementById('copy-button');
    const toast = document.getElementById('toast');

    /**
     * Handle real-time conversion as the user types.
     */
    function handleConversion() {
        try {
            whatsappOutput.value = convertTextToWhatsapp(markdownInput.value);
        } catch (error) {
            console.error('Conversion error:', error);
            whatsappOutput.value = 'Error during conversion. Check console for details.';
        }
    }

    // Convert on input changes.
    markdownInput.addEventListener('input', handleConversion);

    // Convert on table format option changes
    document.querySelectorAll('input[name="tableFormat"]').forEach(radio => {
        radio.addEventListener('change', handleConversion);
    });
    const thresholdInput = document.getElementById('tableThreshold');
    if (thresholdInput) {
        thresholdInput.addEventListener('input', handleConversion);
    }

    // Initial conversion for any pre-filled text.
    handleConversion();

    // Copy button handler.
    copyButton.addEventListener('click', () => {
        if (!whatsappOutput.value) {
            return;
        }

        // Use the modern Clipboard API (secure context and user gesture required). No legacy fallback.
        navigator.clipboard.writeText(whatsappOutput.value).then(() => {
            // Show success toast.
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }).catch(err => {
            // Log any errors to the console for debugging.
            console.error('Could not copy text to clipboard:', err);
        });

        // Deselect any selection after the copy attempt.
        window.getSelection().removeAllRanges();
    });
});

// =================================================================================================
// EXPORTS (for Node.js testing)
// =================================================================================================

// Export for Node.js while keeping browser compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { convertTextToWhatsapp };
}