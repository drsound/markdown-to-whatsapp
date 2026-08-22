// =================================================================================================
// Page wiring: reads the options from the UI, drives the converter, renders the preview.
// All conversion logic lives in converter.js.
// =================================================================================================

const STORAGE_KEY = 'markdown-to-whatsapp:options';

/**
 * Read the conversion options from the form controls.
 * @returns {Object}
 */
function readOptions() {
    return {
        tableFormat: document.querySelector('input[name="tableFormat"]:checked')?.value || 'auto',
        tableThreshold: parseInt(document.getElementById('tableThreshold').value, 10) || 26,
        borderStyle: document.querySelector('input[name="borderStyle"]:checked')?.value || 'ascii',
        headingEmojis: document.getElementById('headingEmojis').checked
    };
}

/**
 * Apply previously stored options to the form controls.
 * @param {Object} options
 */
function applyOptions(options) {
    if (!options || typeof options !== 'object') return;

    const format = document.querySelector(`input[name="tableFormat"][value="${options.tableFormat}"]`);
    if (format) format.checked = true;

    const border = document.querySelector(`input[name="borderStyle"][value="${options.borderStyle}"]`);
    if (border) border.checked = true;

    const threshold = parseInt(options.tableThreshold, 10);
    if (Number.isFinite(threshold) && threshold > 0) {
        document.getElementById('tableThreshold').value = String(threshold);
    }

    if (typeof options.headingEmojis === 'boolean') {
        document.getElementById('headingEmojis').checked = options.headingEmojis;
    }
}

/**
 * Load the stored options, ignoring corrupt or unavailable storage.
 * @returns {Object|null}
 */
function loadStoredOptions() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/**
 * Persist the current options.
 * @param {Object} options
 */
function storeOptions(options) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    } catch {
        // Private browsing or a full quota: the app still works without persistence
    }
}

// =================================================================================================
// WHATSAPP PREVIEW
// =================================================================================================

/**
 * Escape text for safe insertion into the preview markup.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Apply one WhatsApp emphasis marker, using WhatsApp's own boundary rules: the
 * opening marker must follow the start of the line or a non-alphanumeric
 * character and be followed by a non-space; the closing marker mirrors that.
 * @param {string} text
 * @param {string} marker - '*', '_' or '~'
 * @param {string} tag - HTML tag to wrap the content in
 * @returns {string}
 */
function applyMarker(text, marker, tag) {
    // In `u` mode only `*` is a valid identity escape of the three markers
    const m = marker === '*' ? '\\*' : marker;
    const pattern = new RegExp(
        `(^|[^\\p{L}\\p{N}${m}])${m}(?![\\s${m}])((?:[^\\n${m}])+?)(?<!\\s)${m}(?![\\p{L}\\p{N}])`,
        'gu'
    );
    return text.replace(pattern, (match, before, content) => `${before}<${tag}>${content}</${tag}>`);
}

// Placeholder wrapper for monospace blocks pulled out before emphasis is applied
const STASH_MARK = '\u0000';

/**
 * Render WhatsApp-formatted text as the HTML WhatsApp would show.
 * Purely cosmetic: the copy button always copies the raw text.
 * @param {string} text
 * @returns {string} HTML
 */
function whatsappToHtml(text) {
    if (!text.trim()) {
        return '<div class="wa-empty">Nothing to preview yet.</div>';
    }

    const blocks = [];
    const stash = (html) => {
        blocks.push(html);
        return STASH_MARK + (blocks.length - 1) + STASH_MARK;
    };

    let body = escapeHtml(text.replace(new RegExp(STASH_MARK, 'g'), ''));

    // Monospace first, so its content is never treated as emphasis
    body = body.replace(/```([\s\S]*?)```/g, (match, code) =>
        stash(`<pre>${code.replace(/^\n/, '').replace(/\n$/, '')}</pre>`));
    body = body.replace(/`([^`\n]+)`/g, (match, code) => stash(`<code>${code}</code>`));

    body = applyMarker(body, '*', 'strong');
    body = applyMarker(body, '_', 'em');
    body = applyMarker(body, '~', 's');

    // Line structure: quotes, bullets and numbered items
    const html = [];
    let list = null;

    const closeList = () => {
        if (list) {
            html.push(`</${list}>`);
            list = null;
        }
    };
    const openList = (tag) => {
        if (list !== tag) {
            closeList();
            html.push(`<${tag}>`);
            list = tag;
        }
    };

    for (const line of body.split('\n')) {
        const quote = /^&gt;\s?(.*)$/.exec(line);
        if (quote) {
            closeList();
            html.push(`<blockquote>${quote[1] || '&nbsp;'}</blockquote>`);
            continue;
        }

        const bullet = /^([*-])\s+((?:◦\s+)*)(.*)$/.exec(line);
        if (bullet) {
            openList('ul');
            const indent = Math.min(2, (bullet[2].match(/◦/g) || []).length);
            html.push(`<li class="wa-indent-${indent}">${bullet[3]}</li>`);
            continue;
        }

        const numbered = /^((?:◦\s+)*)(\d+)\.\s+(.*)$/.exec(line);
        if (numbered) {
            openList('ol');
            const indent = Math.min(2, (numbered[1].match(/◦/g) || []).length);
            html.push(`<li value="${numbered[2]}" class="wa-indent-${indent}">${numbered[3]}</li>`);
            continue;
        }

        closeList();
        html.push(`<div class="wa-line">${line || '&nbsp;'}</div>`);
    }
    closeList();

    const restore = new RegExp(STASH_MARK + '(\\d+)' + STASH_MARK, 'g');
    return html.join('').replace(restore, (match, index) => blocks[Number(index)]);
}

// =================================================================================================
// DOM WIRING
// =================================================================================================

document.addEventListener('DOMContentLoaded', () => {

    const markdownInput = document.getElementById('markdown-input');
    const whatsappOutput = document.getElementById('whatsapp-output');
    const preview = document.getElementById('whatsapp-preview');
    const bubble = preview.querySelector('.bubble');
    const copyButton = document.getElementById('copy-button');
    const toast = document.getElementById('toast');
    const tabText = document.getElementById('tab-text');
    const tabPreview = document.getElementById('tab-preview');

    applyOptions(loadStoredOptions());

    /**
     * Convert the current input and refresh both output views.
     */
    function handleConversion() {
        const options = readOptions();
        storeOptions(options);

        try {
            const converted = convertTextToWhatsapp(markdownInput.value, options);
            whatsappOutput.value = converted;
            bubble.innerHTML = whatsappToHtml(converted);

            if (converted.trim()) {
                copyButton.removeAttribute('disabled');
            } else {
                copyButton.setAttribute('disabled', 'true');
            }
        } catch (error) {
            console.error('Conversion error:', error);
            whatsappOutput.value = 'Error during conversion. Check console for details.';
            bubble.textContent = whatsappOutput.value;
        }
    }

    markdownInput.addEventListener('input', handleConversion);
    document.querySelectorAll('input[name="tableFormat"], input[name="borderStyle"]').forEach(radio => {
        radio.addEventListener('change', handleConversion);
    });
    document.getElementById('tableThreshold').addEventListener('input', handleConversion);
    document.getElementById('headingEmojis').addEventListener('change', handleConversion);

    // Initial conversion for any pre-filled text.
    handleConversion();

    // ---------- Output tabs ----------

    /**
     * Show either the raw text or the WhatsApp-style preview.
     * @param {boolean} showPreview
     */
    function selectTab(showPreview) {
        tabPreview.setAttribute('aria-selected', String(showPreview));
        tabText.setAttribute('aria-selected', String(!showPreview));
        preview.hidden = !showPreview;
        whatsappOutput.hidden = showPreview;
    }

    tabText.addEventListener('click', () => selectTab(false));
    tabPreview.addEventListener('click', () => selectTab(true));
    selectTab(false);

    // ---------- Copy button ----------

    const originalButtonContent = copyButton.innerHTML;
    let isCopying = false;

    copyButton.addEventListener('click', () => {
        if (!whatsappOutput.value || isCopying) {
            return;
        }

        isCopying = true;

        // Modern Clipboard API (secure context and user gesture required). No legacy fallback.
        navigator.clipboard.writeText(whatsappOutput.value).then(() => {
            copyButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon--small" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>Copied!</span>
            `;
            copyButton.classList.add('copy-pulse');

            const originalBg = copyButton.style.backgroundColor;
            copyButton.style.backgroundColor = '#0b141a'; // Dark WhatsApp background for contrast

            setTimeout(() => {
                copyButton.innerHTML = originalButtonContent;
                copyButton.classList.remove('copy-pulse');
                copyButton.style.backgroundColor = originalBg;
                isCopying = false;
            }, 2000);

            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }).catch(err => {
            console.error('Could not copy text to clipboard:', err);
            isCopying = false;
        });

        window.getSelection().removeAllRanges();
    });
});
