// =================================================================================================
// CONSTANTS
// =================================================================================================

/**
 * Emojis to prepend to header lines by level.
 * @type {Record}
 */
const HEADER_EMOJIS = {
    1: '📌',
    2: '🟠',
    3: '🟡',
    4: '🟢',
    5: '🔵',
    6: '⚫️'
};

/**
 * Unique placeholders used during tokenization to avoid conflicts.
 * Designed to be unlikely in user input.
 * @type {{ LIST_ITEM: string; BOLD_ITALIC_OPEN: string; BOLD_ITALIC_CLOSE: string; BOLD: string }}
 */
const PLACEHOLDERS = {
    LIST_ITEM: 'W5GL8rMkqLbaY25X',
    BOLD_ITALIC_OPEN: 'xygnaY9Es5J3gzyg',
    BOLD_ITALIC_CLOSE: 'U5YyaXpRPm4Nt6az',
    BOLD: 'gqR8z654Q388KAg9'
};


// =================================================================================================
// MAIN CONVERSION LOGIC
// =================================================================================================

/**
 * Convert Markdown into a WhatsApp-friendly format using a two-phase
 * tokenize-then-render pipeline to avoid formatting conflicts.
 *
 * Notes/limitations:
 * - Triple backticks must be on their own line; content inside is preserved verbatim; no language fences.
 * - Links [text](url) become "text (url)".
 * - ~~strikethrough~~ becomes ~strikethrough~ (WhatsApp dialect).
 * - Headers (# ... ######) render as bold with a leading emoji; inner * and _ are stripped intentionally.
 * - Bold (** or __) and italics (* or _) are normalized to WhatsApp syntax; *** becomes *_..._*.
 * - Inline code (`...`), blockquotes (>), tables, and images are not specially handled.
 * - Lists and headers are recognized only at line start; nested list indentation is not preserved beyond marker replacement.
 *
 * @param {string} markdownText - The Markdown input.
 * @returns {string} The converted WhatsApp-compatible text.
 */
function convertTextToWhatsapp(markdownText) {
    let inCodeBlock = false;

    // --- Phase 1: Tokenization ---
    // Process the text line-by-line to apply transformations in a safe order.
    const tokenizedLines = markdownText.split('\n').map(line => {
        // 1.1 Initial cleanup: remove trailing whitespace.
        let processedLine = line.trimEnd();

        // 1.2 Code block handling: toggle state on lines that are exactly ```; preserve contents verbatim.
        if (processedLine.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            return processedLine;
        }
        if (inCodeBlock) {
            return processedLine;
        }

        // 1.3 Tokenization and direct conversion pipeline (order is critical).

        // 1.3.1 Escape sanitization: unescape Markdown punctuation we support.
        // Safe because later passes replace conflicting markers with placeholders.
        processedLine = processedLine.replace(/\\([\\`*_{}[\]()#+.!|~>-])/g, '$1');

        // 1.3.2 Direct link conversion: [text](url) -> text (url)
        processedLine = processedLine.replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1 ($2)');

        // 1.3.3 Strikethrough: ~~text~~ -> ~text~ (WhatsApp)
        processedLine = processedLine.replace(/~~(.+?)~~/g, '~$1~');

        // 1.3.4 Headers: convert to bold + emoji; strip inner emphasis markers by policy.
        const headerMatch = processedLine.match(/^(#{1,6})\s+(.+)/);
        if (headerMatch) {
            const level = headerMatch[1].length;
            let content = headerMatch[2].trim();
            // Strip pre-existing * and _ to avoid nested emphasis in headers (intentional policy).
            content = content.replace(/[*_]/g, '');
            const emoji = HEADER_EMOJIS[level] || HEADER_EMOJIS[6];
            // Tokenize the entire header line for bolding.
            processedLine = `${PLACEHOLDERS.BOLD}${emoji} ${content}${PLACEHOLDERS.BOLD}`;
        }

        // 1.3.5 Ordered list spacing: normalize to a single space after "N." at line start.
        processedLine = processedLine.replace(/^(\s*\d+\.)\s+/g, '$1 ');

        // 1.3.6 List items: replace unordered list markers with a placeholder.
        processedLine = processedLine.replace(/^(\s*)[*+-]\s+/g, `$1${PLACEHOLDERS.LIST_ITEM} `);

        // 1.3.7 Combined styles tokenization: ***...*** or ___...___ -> placeholders first to avoid conflicts.
        processedLine = processedLine.replace(/(\*\*\*|___)(.+?)\1/g, `${PLACEHOLDERS.BOLD_ITALIC_OPEN}$2${PLACEHOLDERS.BOLD_ITALIC_CLOSE}`);

        // 1.3.8 Bold tokenization: **...** or __...__ -> placeholder.
        processedLine = processedLine.replace(/(\*\*|__)(.+?)\1/g, `${PLACEHOLDERS.BOLD}$2${PLACEHOLDERS.BOLD}`);

        // 1.3.9 Italic conversion last to avoid consuming bold markers: *...* or _..._ -> _..._
        processedLine = processedLine.replace(/([*_])(.+?)\1/g, '_$2_');

        return processedLine;
    });

    const tokenizedText = tokenizedLines.join('\n');

    // --- Phase 2: Rendering ---
    // Replace placeholders with final WhatsApp formatting.
    return tokenizedText
        .replace(new RegExp(PLACEHOLDERS.LIST_ITEM, 'g'), '*')
        .replace(new RegExp(PLACEHOLDERS.BOLD_ITALIC_OPEN, 'g'), '*_')
        .replace(new RegExp(PLACEHOLDERS.BOLD_ITALIC_CLOSE, 'g'), '_*')
        .replace(new RegExp(PLACEHOLDERS.BOLD, 'g'), '*');
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
        whatsappOutput.value = convertTextToWhatsapp(markdownInput.value);
    }

    // Convert on input changes.
    markdownInput.addEventListener('input', handleConversion);

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