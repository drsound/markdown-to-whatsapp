// =================================================================================================
// Markdown → WhatsApp converter (pure: no DOM access, no globals except `marked`).
//
// Loaded both by the browser page (as a plain <script>, exposing the global
// `convertTextToWhatsapp`) and by the Node test suite (via `require`).
// =================================================================================================

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

/**
 * Default conversion options.
 * - tableFormat:    'auto' | 'ascii' | 'always' (always = bulleted list)
 * - tableThreshold: max table width in characters before degrading (auto mode)
 * - borderStyle:    'ascii' | 'unicode' box-drawing characters
 * - headingEmojis:  prepend a level emoji to headings
 */
const DEFAULT_OPTIONS = {
    tableFormat: 'auto',
    tableThreshold: 26,
    borderStyle: 'ascii',
    headingEmojis: true
};

/**
 * Box-drawing characters per border style.
 * `full` is the boxed table, `cm` the column separator of the compact (borderless) style.
 */
const BORDERS = {
    ascii: {
        tl: '+', tm: '+', tr: '+',
        ml: '+', mm: '+', mr: '+',
        bl: '+', bm: '+', br: '+',
        h: '-', hh: '=', v: '|', cm: '+'
    },
    unicode: {
        tl: '┌', tm: '┬', tr: '┐',
        ml: '╞', mm: '╪', mr: '╡',
        bl: '└', bm: '┴', br: '┘',
        h: '─', hh: '═', v: '│', cm: '┼'
    }
};

/**
 * Named HTML entities decoded back to plain characters.
 * WhatsApp has no entity support, so anything left encoded would be shown literally.
 */
const NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    nbsp: ' ', copy: '©', reg: '®', trade: '™',
    hellip: '…', mdash: '—', ndash: '–', minus: '−',
    euro: '€', pound: '£', yen: '¥', cent: '¢',
    deg: '°', plusmn: '±', times: '×', divide: '÷',
    laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
    bull: '•', middot: '·', sect: '§', para: '¶', dagger: '†',
    larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔',
    frac12: '½', frac14: '¼', frac34: '¾', sup2: '²', sup3: '³',
    iexcl: '¡', iquest: '¿', micro: 'µ', para: '¶', szlig: 'ß',
    // Latin-1 letters: the accented spellings that actually show up in text
    Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ',
    Ccedil: 'Ç', Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë',
    Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï', ETH: 'Ð', Ntilde: 'Ñ',
    Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø',
    Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý', THORN: 'Þ',
    agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ',
    ccedil: 'ç', egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë',
    igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï', eth: 'ð', ntilde: 'ñ',
    ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
    ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', thorn: 'þ', yuml: 'ÿ'
};

/**
 * Inline HTML tags mapped to the equivalent WhatsApp marker.
 * The same marker opens and closes, so open and close tags map to the same character.
 */
const HTML_INLINE_MARKERS = {
    b: '*', strong: '*',
    i: '_', em: '_',
    s: '~', del: '~', strike: '~',
    code: '`'
};

// Generic header keywords for Key-Value table detection (by language)
const KV_HEADERS_EN = ['attribute', 'value', 'key', 'parameter', 'property', 'field', 'description', 'setting', 'option', 'name', 'detail', 'spec', 'specification', 'metric', 'measure', 'item'];
const KV_HEADERS_IT = ['attributo', 'valore', 'chiave', 'parametro', 'proprietà', 'campo', 'descrizione', 'impostazione', 'opzione', 'nome', 'dettaglio', 'specifica', 'metrica', 'misura', 'elemento'];
const KV_HEADERS_ES = ['atributo', 'valor', 'clave', 'parámetro', 'propiedad', 'campo', 'descripción', 'configuración', 'opción', 'nombre', 'detalle', 'especificación', 'métrica', 'medida', 'elemento'];
const KV_HEADERS_FR = ['attribut', 'valeur', 'clé', 'paramètre', 'propriété', 'champ', 'description', 'réglage', 'option', 'nom', 'détail', 'spécification', 'métrique', 'mesure', 'élément'];
const KV_HEADERS_PT = ['atributo', 'valor', 'chave', 'parâmetro', 'propriedade', 'campo', 'descrição', 'configuração', 'opção', 'nome', 'detalhe', 'especificação', 'métrica', 'medida', 'elemento'];
const KV_HEADERS_DE = ['attribut', 'wert', 'schlüssel', 'parameter', 'eigenschaft', 'feld', 'beschreibung', 'einstellung', 'option', 'name', 'detail', 'spezifikation', 'metrik', 'messung', 'element'];
const KV_HEADERS_RU = ['атрибут', 'значение', 'ключ', 'параметр', 'свойство', 'поле', 'описание', 'настройка', 'опция', 'имя', 'деталь', 'спецификация', 'метрика', 'измерение', 'элемент'];
const KV_HEADERS_AR = ['سمة', 'قيمة', 'مفتاح', 'معامل', 'خاصية', 'حقل', 'وصف', 'إعداد', 'خيار', 'اسم', 'تفصيل', 'مواصفة', 'مقياس', 'قياس', 'عنصر'];
const KV_HEADERS_HI = ['विशेषता', 'मान', 'कुंजी', 'पैरामीटर', 'संपत्ति', 'क्षेत्र', 'विवरण', 'सेटिंग', 'विकल्प', 'नाम', 'विस्तार', 'विनिर्देश', 'मीट्रिक', 'माप', 'तत्व'];
const KV_HEADERS_BN = ['বৈশিষ্ট্য', 'মান', 'চাবি', 'প্যারামিটার', 'সম্পত্তি', 'ক্ষেত্র', 'বিবরণ', 'সেটিং', 'বিকল্প', 'নাম', 'বিস্তারিত', 'স্পেসিফিকেশন', 'মেট্রিক', 'পরিমাপ', 'উপাদান'];
const KV_HEADERS_ID = ['atribut', 'nilai', 'kunci', 'parameter', 'properti', 'bidang', 'deskripsi', 'pengaturan', 'opsi', 'nama', 'detail', 'spesifikasi', 'metrik', 'ukuran', 'elemen'];

const KEY_VALUE_HEADERS = [
    ...KV_HEADERS_EN, ...KV_HEADERS_IT, ...KV_HEADERS_ES, ...KV_HEADERS_FR,
    ...KV_HEADERS_PT, ...KV_HEADERS_DE, ...KV_HEADERS_RU, ...KV_HEADERS_AR,
    ...KV_HEADERS_HI, ...KV_HEADERS_BN, ...KV_HEADERS_ID
];

// =================================================================================================
// TEXT UTILITIES
// =================================================================================================

/**
 * Decode HTML entities (named, decimal and hexadecimal) into plain characters.
 * Single pass, so decoded output is never re-decoded (`&amp;lt;` → `&lt;`).
 * @param {string} text
 * @returns {string}
 */
function decodeEntities(text) {
    if (!text) return '';
    return text.replace(/&(#[Xx]?[0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]*);/g, (match, body) => {
        if (body[0] === '#') {
            const isHex = body[1] === 'x' || body[1] === 'X';
            const code = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
            if (!Number.isFinite(code) || code < 0 || code > 0x10FFFF) return match;
            try {
                return String.fromCodePoint(code);
            } catch {
                return match;
            }
        }
        const named = NAMED_ENTITIES[body];
        return named !== undefined ? named : match;
    });
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

// Code point ranges rendered double-width in a monospace font: East Asian Wide /
// Fullwidth in the BMP (WIDE_CHARS), plus the wide symbols, emoji blocks and
// supplementary-plane CJK ideographs (WIDE_SYMBOLS).
const WIDE_CHARS = /^[ᄀ-ᅟ〈-〉⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏ꥠ-꥿가-힣豈-﫿︐-︙︰-﹯＀-｠￠-￦]/;
const WIDE_SYMBOLS = /^(?:[⌚-⌛⏩-⏬⏰⏳◽-◾☔-☕♈-♓♿⚓⚡⚪-⚫⚽-⚾⛄-⛅⛎⛔⛪⛲-⛳⛵⛺⛽✅✊-✋✨❌❎❓-❕❗➕-➗➰➿⬛-⬜⭐⭕]|[\u{1F004}-\u{1FAFF}]|[\u{20000}-\u{3FFFD}])/u;

let _segmenter = null;

/**
 * Split a string into grapheme clusters (so emoji with modifiers count as one unit).
 * @param {string} str
 * @returns {string[]}
 */
function graphemes(str) {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        if (!_segmenter) _segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return Array.from(_segmenter.segment(str), part => part.segment);
    }
    return Array.from(str);
}

/**
 * Visual width of a string in monospace cells: emoji and East Asian wide characters
 * count as 2, everything else as 1. `String.length` would count UTF-16 units and
 * misalign every table containing emoji or CJK.
 * @param {string} str
 * @returns {number}
 */
function displayWidth(str) {
    if (!str) return 0;
    let width = 0;
    for (const cluster of graphemes(str)) {
        if (cluster.includes('️') || WIDE_SYMBOLS.test(cluster) || WIDE_CHARS.test(cluster)) {
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
}

/**
 * Pad a cell to the given display width, honouring the column alignment.
 * @param {string} text
 * @param {number} width
 * @param {string|null} align - 'left' | 'center' | 'right' | null
 * @returns {string}
 */
function padCell(text, width, align) {
    const pad = Math.max(0, width - displayWidth(text));
    if (align === 'right') return ' '.repeat(pad) + text;
    if (align === 'center') {
        const left = Math.floor(pad / 2);
        return ' '.repeat(left) + text + ' '.repeat(pad - left);
    }
    return text + ' '.repeat(pad);
}

/**
 * Word-wrap a string to the given display width. Words longer than the width are
 * hard-split on grapheme boundaries.
 * @param {string} text
 * @param {number} width
 * @returns {string[]} physical lines (at least one)
 */
function wrapText(text, width) {
    if (width <= 0) return [text];
    const lines = [];
    let current = '';

    const pushWord = (word) => {
        let remaining = word;
        while (displayWidth(remaining) > width) {
            let chunk = '';
            for (const cluster of graphemes(remaining)) {
                if (displayWidth(chunk + cluster) > width) break;
                chunk += cluster;
            }
            if (!chunk) chunk = graphemes(remaining)[0] || '';
            lines.push(chunk);
            remaining = remaining.slice(chunk.length);
        }
        current = remaining;
    };

    for (const word of String(text).split(/\s+/).filter(Boolean)) {
        if (!current) {
            if (displayWidth(word) > width) pushWord(word);
            else current = word;
        } else if (displayWidth(current + ' ' + word) <= width) {
            current += ' ' + word;
        } else {
            lines.push(current);
            current = '';
            if (displayWidth(word) > width) pushWord(word);
            else current = word;
        }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
}

/**
 * Longest single word of a string, measured in display width.
 * @param {string} text
 * @returns {number}
 */
function longestWordWidth(text) {
    return String(text).split(/\s+/).filter(Boolean)
        .reduce((max, word) => Math.max(max, displayWidth(word)), 0);
}

/**
 * Merge user options with the defaults.
 * @param {Object} [options]
 * @returns {Object}
 */
function normalizeOptions(options) {
    const merged = Object.assign({}, DEFAULT_OPTIONS, options || {});
    const threshold = parseInt(merged.tableThreshold, 10);
    merged.tableThreshold = Number.isFinite(threshold) && threshold > 0 ? threshold : DEFAULT_OPTIONS.tableThreshold;
    if (!BORDERS[merged.borderStyle]) merged.borderStyle = DEFAULT_OPTIONS.borderStyle;
    return merged;
}

// =================================================================================================
// MAIN CONVERSION LOGIC (using marked lexer)
// =================================================================================================

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
 * - [text](url) → text (url), autolinks → url
 * - Headers → *emoji Header*
 * - Lists → preserved with proper markers
 * - Blockquotes → > prefix preserved
 * - Tables → ASCII/compact box or bulleted list
 * - Inline HTML → equivalent WhatsApp markers, other tags stripped
 * - HTML entities → decoded characters
 *
 * @param {string} markdownText - The Markdown input.
 * @param {Object} [options] - See DEFAULT_OPTIONS.
 * @returns {string} The converted WhatsApp-compatible text.
 */
function convertTextToWhatsapp(markdownText, options) {
    if (!markdownText || !markdownText.trim()) {
        return '';
    }

    const opts = normalizeOptions(options);
    const tokens = marked.lexer(markdownText);
    return renderTokens(tokens, opts).trim();
}

/**
 * Render an array of block-level tokens to WhatsApp format.
 * @param {Array} tokens - Array of marked tokens
 * @param {Object} opts - Conversion options
 * @returns {string} WhatsApp-formatted text
 */
function renderTokens(tokens, opts) {
    const result = [];

    for (const token of tokens) {
        const rendered = renderToken(token, opts);
        if (rendered) {
            result.push(rendered);
        }
    }

    return result.join('\n\n');
}

/**
 * Render a single block-level token to WhatsApp format.
 * Unknown tokens render as an empty string: raw Markdown must never leak through.
 * @param {Object} token - A marked token
 * @param {Object} opts - Conversion options
 * @returns {string} WhatsApp-formatted text ('' when the token produces no output)
 */
function renderToken(token, opts) {
    switch (token.type) {
        case 'heading':
            return renderHeading(token, opts);

        case 'paragraph':
            return renderInline(token.tokens);

        case 'text':
            // Top-level text (e.g., in loose lists)
            if (token.tokens) {
                return renderInline(token.tokens);
            }
            return decodeEntities(token.text);

        case 'code':
            return renderCodeBlock(token);

        case 'list':
            return renderList(token, opts);

        case 'blockquote':
            return renderBlockquote(token, opts);

        case 'hr':
            return '───────────────';

        case 'table':
            return renderTable(token, opts);

        case 'html':
            return renderHtmlBlock(token.text);

        case 'space':
        case 'def':
        case 'checkbox':
            return '';

        default:
            return '';
    }
}

/**
 * Render a heading token.
 * Headers are rendered as bold with an optional emoji prefix.
 * Any bold markers inside are stripped to avoid nested asterisks which WhatsApp doesn't support.
 * @param {Object} token - Heading token with depth and tokens
 * @param {Object} opts - Conversion options
 * @returns {string} Formatted heading
 */
function renderHeading(token, opts) {
    const content = renderInlineForHeader(token.tokens);
    if (!opts.headingEmojis) {
        return `*${content}*`;
    }
    const emoji = HEADER_EMOJIS[token.depth] || HEADER_EMOJIS[6];
    return `*${emoji} ${content}*`;
}

/**
 * Neutralise triple backticks inside monospace content: they would close the
 * generated fence early and leave the rest of the message mis-formatted.
 * @param {string} text
 * @returns {string}
 */
function fenceSafe(text) {
    return String(text).replace(/```/g, 'ˋˋˋ');
}

/**
 * Render a code block.
 * @param {Object} token - Code token
 * @returns {string} Formatted code block
 */
function renderCodeBlock(token) {
    return '```' + fenceSafe(token.text) + '```';
}

/**
 * Render a list (ordered or unordered).
 * Uses different bullet symbols for nested levels instead of indentation, which
 * WhatsApp collapses. Block children (code, blockquotes, tables, nested lists)
 * are emitted on their own lines below the item.
 * @param {Object} token - List token
 * @param {Object} opts - Conversion options
 * @param {number} depth - Nesting depth (0 = top level)
 * @returns {string} Formatted list
 */
function renderList(token, opts, depth = 0) {
    const lines = [];

    token.items.forEach((item, index) => {
        const marker = listMarker(token, item, index, depth);

        const inlineParts = [];
        const blockParts = [];

        if (item.tokens) {
            for (const subToken of item.tokens) {
                if (subToken.type === 'list') {
                    blockParts.push(renderList(subToken, opts, depth + 1));
                } else if (subToken.type === 'code') {
                    blockParts.push(renderCodeBlock(subToken));
                } else if (subToken.type === 'blockquote') {
                    blockParts.push(renderBlockquote(subToken, opts));
                } else if (subToken.type === 'table') {
                    blockParts.push(renderTable(subToken, opts));
                } else {
                    const rendered = renderToken(subToken, opts);
                    // Paragraphs of a loose item are joined with a space to stay on one line
                    if (rendered) inlineParts.push(rendered.replace(/\s*\n\s*/g, ' ').trim());
                }
            }
        } else if (item.text) {
            inlineParts.push(decodeEntities(item.text).replace(/\s*\n\s*/g, ' ').trim());
        }

        const content = inlineParts.filter(Boolean).join(' ');
        lines.push(content ? `${marker} ${content}` : marker);

        for (const block of blockParts) {
            if (block) lines.push(block);
        }
    });

    return lines.join('\n');
}

/**
 * Build the line prefix of a list item.
 * Unordered: `*`, then `* ◦`, `* ◦ ◦` … per nesting level.
 * Ordered: `1.`, then `◦ 1.`, `◦ ◦ 1.` … per nesting level.
 * Task items carry ☑/☐ instead of (unordered) or after (ordered) the bullet.
 * @param {Object} token - List token
 * @param {Object} item - List item token
 * @param {number} index - Item index within the list
 * @param {number} depth - Nesting depth
 * @returns {string}
 */
function listMarker(token, item, index, depth) {
    const nesting = '◦ '.repeat(depth);
    const checkbox = item.task ? (item.checked ? '☑' : '☐') : '';

    if (token.ordered) {
        const start = parseInt(token.start, 10);
        const number = (Number.isFinite(start) ? start : 1) + index;
        const prefix = `${nesting}${number}.`;
        return checkbox ? `${prefix} ${checkbox}` : prefix;
    }

    const bullet = depth === 0 ? '*' : `* ${nesting.trim()}`;
    return checkbox ? `${bullet === '*' ? '' : bullet + ' '}${checkbox}` : bullet;
}

/**
 * Render a blockquote.
 * Handles nested blockquotes by detecting inner blockquote tokens.
 * @param {Object} token - Blockquote token
 * @param {Object} opts - Conversion options
 * @returns {string} Formatted blockquote
 */
function renderBlockquote(token, opts) {
    const lines = [];

    for (const subToken of token.tokens) {
        if (subToken.type === 'blockquote') {
            // Nested blockquote - add extra > prefix
            const nested = renderBlockquote(subToken, opts);
            lines.push(nested.split('\n').map(line => '> ' + line).join('\n'));
        } else {
            const content = renderToken(subToken, opts);
            if (content) {
                lines.push(content.split('\n').map(line => '> ' + line).join('\n'));
            }
        }
    }

    return lines.join('\n');
}

/**
 * Convert a block of raw HTML into plain text: comments and tags are dropped,
 * block boundaries become newlines, entities are decoded.
 * @param {string} html
 * @returns {string}
 */
function renderHtmlBlock(html) {
    if (!html) return '';
    const text = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\s*br\s*\/?\s*>/gi, '\n')
        .replace(/<\/\s*(p|div|li|tr|h[1-6]|blockquote|section|article)\s*>/gi, '\n')
        // Keep the emphasis carried by inline tags, drop everything else
        .replace(/<\/?\s*([A-Za-z][A-Za-z0-9]*)[^>]*>/g, (tag, name) => HTML_INLINE_MARKERS[name.toLowerCase()] || '');
    return decodeEntities(text)
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// =================================================================================================
// INLINE RENDERING
// =================================================================================================

/**
 * Format a link the way WhatsApp shows it best: bare URL when the label adds
 * nothing, `text (url)` otherwise.
 * @param {string} text - Rendered link label
 * @param {string} href
 * @returns {string}
 */
function renderLink(text, href) {
    // The destination comes from the source verbatim, entities included: `&amp;`
    // left encoded would send the reader to a different query string
    const url = decodeEntities(href || '');
    const label = (text || '').trim();
    const bare = url.startsWith('mailto:') ? url.slice('mailto:'.length) : url;

    if (!label) return bare;
    if (!url) return label;
    if (label === url || label === bare) return bare;
    return `${label} (${url})`;
}

/**
 * Translate an inline HTML tag into its WhatsApp equivalent.
 * Unknown tags and comments disappear; their text content is kept by marked
 * as separate text tokens.
 * @param {string} raw - The raw tag, e.g. `<b>` or `</em>`
 * @returns {string}
 */
function renderInlineHtml(raw) {
    if (!raw) return '';
    if (raw.startsWith('<!--')) return '';
    const match = /^<\/?\s*([A-Za-z][A-Za-z0-9]*)/.exec(raw);
    if (!match) return '';
    const tag = match[1].toLowerCase();
    if (tag === 'br') return '\n';
    return HTML_INLINE_MARKERS[tag] || '';
}

/**
 * First code point of a string ('' when empty). Indexing would return a lone
 * surrogate for supplementary-plane characters, which no `\p{L}` test matches.
 * @param {string} text
 * @returns {string}
 */
function firstCodePoint(text) {
    return text ? String.fromCodePoint(text.codePointAt(0)) : '';
}

/**
 * Last code point of a string ('' when empty).
 * @param {string} text
 * @returns {string}
 */
function lastCodePoint(text) {
    if (!text) return '';
    const tail = text.slice(-2);
    return tail.length === 2 && tail.codePointAt(0) > 0xFFFF ? tail : text.slice(-1);
}

/**
 * For every position, the first character the following tokens will render,
 * falling back to `outerAfter` when the rest renders empty. Computed in a single
 * reverse pass: scanning forward per token would be quadratic on inputs with
 * many tokens that render nothing (a long run of stripped HTML tags, say).
 * @param {Array} tokens
 * @param {string} outerAfter
 * @returns {string[]} indexed by token position, length tokens.length + 1
 */
function followingChars(tokens, outerAfter) {
    const chars = new Array(tokens.length + 1);
    chars[tokens.length] = outerAfter;
    for (let i = tokens.length - 1; i >= 0; i--) {
        const text = renderPlainText([tokens[i]]);
        chars[i] = text ? firstCodePoint(text) : chars[i + 1];
    }
    return chars;
}

/**
 * Whether a formatting token sits inside a word. WhatsApp only applies markers
 * when they border a non-alphanumeric character, so punctuation such as
 * `**Name**:` is a valid boundary while `super**bold**ly` is not.
 * The neighbours are the rendered characters, so a boundary introduced by an
 * enclosing token counts too (`x[**bold**](url)y` is inside a word).
 * @param {string} before - Character rendered just before the token
 * @param {string} after - Character rendered just after the token
 * @returns {boolean}
 */
function isPartialWord(before, after) {
    // Both arguments are a single code point, so no anchors are needed - and
    // `/[\p{L}\p{N}]$/u` misses supplementary letters on V8 anyway
    const alphanumeric = /[\p{L}\p{N}]/u;
    return alphanumeric.test(before) || alphanumeric.test(after);
}

/**
 * Render inline tokens to WhatsApp format.
 * This handles bold, italic, strikethrough, code, links, etc.
 * @param {Array} tokens - Array of inline tokens
 * @param {Object} [context] - Characters surrounding these tokens in the output,
 *   as `{ before, after }`; used for word-boundary detection across containers.
 * @returns {string} WhatsApp-formatted inline text
 */
function renderInline(tokens, context) {
    if (!tokens || !Array.isArray(tokens)) {
        return '';
    }

    const outerBefore = (context && context.before) || '';
    const outerAfter = (context && context.after) || '';
    const nextChars = followingChars(tokens, outerAfter);
    const result = [];
    let before = lastCodePoint(outerBefore);
    const emit = (value) => {
        if (value) {
            result.push(value);
            before = lastCodePoint(value);
        }
    };

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const after = nextChars[i + 1];
        const partial = isPartialWord(before, after);

        switch (token.type) {
            case 'strong':
                // Bold: **text** or __text__ → *text*
                if (partial) {
                    // Skip formatting for partial word - use plain text
                    emit(renderPlainText(token.tokens));
                } else if (token.tokens && token.tokens.length === 1 && token.tokens[0].type === 'em') {
                    // Bold+italic: ***text***, **_text_**, __*text*__ → *_text_*
                    emit('*_' + renderInline(token.tokens[0].tokens) + '_*');
                } else {
                    emit('*' + renderInline(token.tokens) + '*');
                }
                break;

            case 'em':
                // Italic: *text* or _text_ → _text_
                if (partial) {
                    emit(renderPlainText(token.tokens));
                } else if (token.tokens && token.tokens.length === 1 && token.tokens[0].type === 'strong') {
                    // Italic+bold: _**text**_, *__text__* → _*text*_
                    emit('_*' + renderInline(token.tokens[0].tokens) + '*_');
                } else {
                    emit('_' + renderInline(token.tokens) + '_');
                }
                break;

            case 'del':
                // Strikethrough: ~~text~~ → ~text~
                if (partial) {
                    emit(renderPlainText(token.tokens));
                } else {
                    emit('~' + renderInline(token.tokens) + '~');
                }
                break;

            case 'codespan':
                // Inline code: `text` → `text`
                emit(partial
                    ? decodeEntities(token.text)
                    : '`' + decodeEntities(token.text) + '`');
                break;

            case 'link': {
                // The label is rendered where the link sits, so it inherits its
                // boundaries; the destination only separates it when there is one
                const separated = Boolean(decodeEntities(token.href || ''));
                const label = renderInline(token.tokens, { before, after: separated ? ' ' : after });
                emit(renderLink(label, token.href));
                break;
            }

            case 'image':
                // Image: ![alt](url) → [alt: url]
                emit(`[${decodeEntities(token.text)}: ${decodeEntities(token.href || '')}]`);
                break;

            case 'text':
                emit(decodeEntities(token.text));
                break;

            case 'escape':
                // Escaped character - use Unicode look-alikes that WhatsApp won't interpret
                emit(escapeForWhatsApp(decodeEntities(token.text)));
                break;

            case 'br':
                emit('\n');
                break;

            case 'html':
                emit(renderInlineHtml(token.text));
                break;

            case 'checkbox':
                // The list marker already carries ☑/☐
                break;

            default:
                break;
        }
    }

    return result.join('');
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
                return '`' + decodeEntities(token.text) + '`';

            case 'link':
                return renderLink(renderInlineForHeader(token.tokens), token.href);

            case 'image':
                return decodeEntities(token.text);

            case 'text':
                return decodeEntities(token.text);

            case 'escape':
                // A literal * inside would close the surrounding header bold
                return escapeForWhatsApp(decodeEntities(token.text));

            case 'br':
                return ' ';

            case 'html':
                return renderInlineHtml(token.text) === '\n' ? ' ' : '';

            default:
                return '';
        }
    }).join('');
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
                return decodeEntities(token.text);

            case 'link':
                return renderLink(renderPlainText(token.tokens), token.href);

            case 'image':
                return '[' + decodeEntities(token.text) + ']';

            case 'text':
                return decodeEntities(token.text);

            case 'escape':
                return escapeForWhatsApp(decodeEntities(token.text));

            case 'br':
                return ' ';

            case 'html':
                return renderInlineHtml(token.text) ? ' ' : '';

            default:
                return '';
        }
    }).join('');
}

// =================================================================================================
// TABLES
// =================================================================================================

/**
 * Extract a table cell as single-line plain text.
 * @param {Object} cell - Table cell token
 * @returns {string}
 */
function tableCellText(cell) {
    if (!cell) return '';
    return renderPlainText(cell.tokens)
        .replace(/\s*\n\s*/g, ' ')
        .replace(/\s+/g, ' ')
        // An escaped pipe would read as a column separator inside the grid
        .replace(/\|/g, '∣')
        .trim();
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
 * All layouts tried in `auto` mode, widest to narrowest:
 * full box with progressive padding removal, then the compact borderless style
 * with the same progression.
 * @param {number} colCount
 * @returns {Array} Array of layout configs
 */
function generateLayouts(colCount) {
    const layouts = [];
    for (const border of ['full', 'compact']) {
        for (const config of generatePaddingConfigs(colCount)) {
            const layout = Object.assign({ border }, config);
            if (border === 'compact') {
                // Trailing padding on the last column is invisible: never pay for it
                layout.rightPadding = layout.rightPadding.slice();
                layout.rightPadding[colCount - 1] = false;
            }
            layouts.push(layout);
        }
    }
    return layouts;
}

/**
 * Total width of a rendered table for the given column widths and layout.
 * @param {number[]} colWidths
 * @param {Object} layout
 * @returns {number}
 */
function layoutWidth(colWidths, layout) {
    const colCount = colWidths.length;
    let total = layout.border === 'full' ? 1 : 0;

    for (let i = 0; i < colCount; i++) {
        total += colWidths[i];
        if (layout.leftPadding[i]) total += 1;
        if (layout.rightPadding[i]) total += 1;
        if (layout.border === 'full' || i < colCount - 1) total += 1;
    }

    return total;
}

/**
 * Natural column widths (widest cell per column).
 * @param {string[]} header
 * @param {string[][]} rows
 * @returns {number[]}
 */
function naturalColumnWidths(header, rows) {
    return header.map((cell, i) => {
        let max = displayWidth(cell);
        for (const row of rows) {
            const width = displayWidth(row[i] || '');
            if (width > max) max = width;
        }
        return max;
    });
}

/**
 * Render a table with the optimal format (boxed / compact ASCII, wrapped, or list).
 * @param {Object} token - Table token
 * @param {Object} opts - Conversion options
 * @returns {string} Formatted table
 */
function renderTable(token, opts) {
    if (opts.tableFormat === 'always') {
        return renderTableAsList(token);
    }

    const header = token.header.map(tableCellText);
    const rows = token.rows.map(row => row.map(tableCellText));
    const align = token.align || header.map(() => null);
    const natural = naturalColumnWidths(header, rows);
    const fullLayout = {
        border: 'full',
        leftPadding: header.map(() => true),
        rightPadding: header.map(() => true)
    };

    if (opts.tableFormat === 'ascii') {
        return fenceTable(renderTableGrid(header, rows, natural, align, fullLayout, opts.borderStyle));
    }

    // 'auto' mode: progressively degrade until the table fits the threshold
    for (const layout of generateLayouts(header.length)) {
        if (layoutWidth(natural, layout) <= opts.tableThreshold) {
            return fenceTable(renderTableGrid(header, rows, natural, align, layout, opts.borderStyle));
        }
    }

    // Still too wide: try wrapping cell content inside a compact layout
    const wrapped = renderTableWrapped(header, rows, natural, align, opts);
    if (wrapped) return wrapped;

    // Nothing fits: fall back to a bulleted list
    return renderTableAsList(token);
}

/**
 * Wrap a rendered table in a monospace block.
 * @param {string[]} lines
 * @returns {string}
 */
function fenceTable(lines) {
    return '```\n' + fenceSafe(lines.join('\n')) + '\n```';
}

/**
 * Render the table grid for the given column widths and layout.
 * @param {string[]} header
 * @param {string[][]} rows - Physical rows (already wrapped, if any)
 * @param {number[]} colWidths
 * @param {Array} align
 * @param {Object} layout - { border, leftPadding, rightPadding }
 * @param {string} borderStyle - 'ascii' | 'unicode'
 * @returns {string[]} lines
 */
function renderTableGrid(header, rows, colWidths, align, layout, borderStyle) {
    const chars = BORDERS[borderStyle] || BORDERS.ascii;

    const renderRow = (cells) => {
        const parts = colWidths.map((width, i) => {
            const left = layout.leftPadding[i] ? ' ' : '';
            const right = layout.rightPadding[i] ? ' ' : '';
            return left + padCell(cells[i] || '', width, align[i]) + right;
        });
        return layout.border === 'full'
            ? chars.v + parts.join(chars.v) + chars.v
            : parts.join(chars.v).replace(/\s+$/, '');
    };

    const rule = (left, mid, right, fill) => {
        const segments = colWidths.map((width, i) => {
            const pad = (layout.leftPadding[i] ? 1 : 0) + (layout.rightPadding[i] ? 1 : 0);
            return fill.repeat(width + pad);
        });
        return left + segments.join(mid) + right;
    };

    const lines = [];

    if (layout.border === 'full') {
        lines.push(rule(chars.tl, chars.tm, chars.tr, chars.h));
        lines.push(renderRow(header));
        lines.push(rule(chars.ml, chars.mm, chars.mr, chars.hh));
        for (const row of rows) lines.push(renderRow(row));
        // A header-only table needs no body and no closing border
        if (rows.length) lines.push(rule(chars.bl, chars.bm, chars.br, chars.h));
    } else {
        lines.push(renderRow(header));
        lines.push(rule('', chars.cm, '', chars.h));
        for (const row of rows) lines.push(renderRow(row));
    }

    return lines;
}

/**
 * Last resort before the list format: keep the table tabular by word-wrapping
 * cells into a compact layout that fits the threshold.
 * @param {string[]} header
 * @param {string[][]} rows
 * @param {number[]} natural
 * @param {Array} align
 * @param {Object} opts
 * @returns {string|null} Rendered table, or null when even the longest words don't fit
 */
function renderTableWrapped(header, rows, natural, align, opts) {
    const colCount = header.length;

    // Threshold minus separators and padding
    const overhead = (colCount - 1) + 2 * colCount;
    const available = opts.tableThreshold - overhead;
    if (available < colCount) return null;

    // Each column must at least fit its longest single word
    const minima = header.map((cell, i) => {
        let min = longestWordWidth(cell);
        for (const row of rows) {
            min = Math.max(min, longestWordWidth(row[i] || ''));
        }
        return Math.max(1, Math.min(min, natural[i]));
    });

    const sum = list => list.reduce((a, b) => a + b, 0);
    if (sum(minima) > available) return null;

    // Distribute the slack proportionally to how much each column still wants
    const widths = minima.slice();
    const want = natural.map((width, i) => Math.max(0, width - minima[i]));
    const totalWant = sum(want);
    let slack = available - sum(widths);

    if (totalWant > 0 && slack > 0) {
        for (let i = 0; i < colCount && slack > 0; i++) {
            const share = Math.min(want[i], Math.floor((available - sum(minima)) * want[i] / totalWant));
            widths[i] += share;
        }
        slack = available - sum(widths);
        for (let i = 0; slack > 0 && i < colCount * 2; i++) {
            const col = i % colCount;
            if (widths[col] < natural[col]) {
                widths[col] += 1;
                slack -= 1;
            }
        }
    }

    // Expand every logical row into the physical lines produced by wrapping
    const wrapRow = (cells) => {
        const wrappedCells = widths.map((width, i) => wrapText(cells[i] || '', width));
        const height = Math.max(...wrappedCells.map(lines => lines.length));
        const physical = [];
        for (let line = 0; line < height; line++) {
            physical.push(wrappedCells.map(lines => lines[line] || ''));
        }
        return physical;
    };

    const headerLines = wrapRow(header);
    const bodyLines = [];
    for (const row of rows) bodyLines.push(...wrapRow(row));

    const chars = BORDERS[opts.borderStyle] || BORDERS.ascii;
    const lines = [];
    const renderRow = (cells) => widths
        .map((width, i) => ' ' + padCell(cells[i] || '', width, align[i]) + ' ')
        .join(chars.v)
        .replace(/\s+$/, '');

    for (const line of headerLines) lines.push(renderRow(line));
    // The last column has no visible right padding, so its rule segment is shorter
    lines.push(widths.map((width, i) => chars.h.repeat(width + (i < colCount - 1 ? 2 : 1))).join(chars.cm));
    for (const line of bodyLines) lines.push(renderRow(line));

    return fenceTable(lines);
}

/**
 * Detect table type based on structure and content.
 * Returns: 'keyvalue' | 'horizontal' | 'vertical'
 *
 * Priority:
 * 1. Key-Value table: 2 columns with generic headers (Attribute/Value, etc.)
 * 2. Horizontal table: first column cells contain bold text (parameter names)
 * 3. Vertical table: standard row-based grouping
 *
 * @param {Object} token - Table token
 * @returns {string} Table type
 */
function detectTableType(token) {
    const headers = token.header.map(cell => renderPlainText(cell.tokens).toLowerCase().trim());

    // Check for Key-Value table (2 columns with generic headers)
    if (headers.length === 2) {
        const bothGeneric = headers.every(h =>
            KEY_VALUE_HEADERS.some(kw => h.includes(kw))
        );
        if (bothGeneric) {
            return 'keyvalue';
        }
    }

    // Check for Horizontal table (most first-column cells are bold)
    let boldCount = 0;
    for (const row of token.rows) {
        if (row[0] && row[0].tokens) {
            const hasBold = row[0].tokens.some(t =>
                t.type === 'strong' ||
                (t.tokens && t.tokens.some(st => st.type === 'strong'))
            );
            if (hasBold) boldCount++;
        }
    }
    if (boldCount > token.rows.length / 2) {
        return 'horizontal';
    }

    // Default: Vertical table
    return 'vertical';
}

/**
 * Render a table as a nested list (for wide tables).
 * Automatically detects table type:
 * - Key-Value (2 cols, generic headers): each row becomes key: value
 * - Horizontal (first column bold): groups by column headers
 * - Vertical (standard): groups by rows
 * @param {Object} token - Table token
 * @returns {string} List-formatted table
 */
function renderTableAsList(token) {
    const headers = token.header.map(cell => renderPlainText(cell.tokens));

    // A header-only table has nothing to group by: keep the headers rather than
    // returning an empty string, which would drop the table from the message
    if (!token.rows.length) {
        return headers.filter(Boolean).map(header => `* *${header}*`).join('\n');
    }

    const tableType = detectTableType(token);
    const lines = [];

    if (tableType === 'keyvalue') {
        // Key-Value table: simple key: value format.
        // The key goes through renderPlainText: a bold key would otherwise nest
        // asterisks and produce `* **CPU*:* Xeon`.
        for (const row of token.rows) {
            const key = renderPlainText(row[0].tokens);
            const value = renderInline(row[1].tokens);
            lines.push(`* *${key}:* ${value}`);
        }
    } else if (tableType === 'horizontal') {
        // Horizontal table: group by column (skip first column header)
        for (let col = 1; col < headers.length; col++) {
            const columnHeader = headers[col];
            lines.push(`* *${columnHeader}*`);

            for (const row of token.rows) {
                const rowLabel = renderPlainText(row[0].tokens);
                const value = renderInline(row[col].tokens);
                lines.push(`* ◦ _${rowLabel}:_ ${value}`);
            }
        }
    } else {
        // Vertical table: group by row
        for (const row of token.rows) {
            for (let i = 0; i < row.length; i++) {
                const header = headers[i] || '';
                const value = renderInline(row[i].tokens);

                if (i === 0) {
                    lines.push(header ? `* *${header}:* ${value}` : `* ${value}`);
                } else {
                    lines.push(header ? `* ◦ _${header}:_ ${value}` : `* ◦ ${value}`);
                }
            }
        }
    }

    return lines.join('\n');
}

// =================================================================================================
// EXPORTS
// =================================================================================================

// CommonJS for the Node test suite; the browser picks up the global function.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        convertTextToWhatsapp,
        DEFAULT_OPTIONS,
        displayWidth,
        decodeEntities,
        wrapText
    };
}
