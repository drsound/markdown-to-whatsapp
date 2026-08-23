// UI logic for the redesigned interface.
// Conversion logic lives in converter.js (convertTextToWhatsapp, mdContainsTable,
// mdContainsHeading); this file never formats Markdown itself.
(function () {
    const input = document.getElementById('markdown-input');
    const bubbleContent = document.getElementById('bubble-content');
    const chatEmpty = document.getElementById('chat-empty');
    const chatMsg = document.getElementById('chat-msg');
    const copyButton = document.getElementById('copy-button');
    const copyLabel = document.getElementById('copy-label');
    const shareLink = document.getElementById('share-link');
    const tableControls = document.getElementById('table-controls');
    const thresholdInput = document.getElementById('tableThreshold');
    const rawToggle = document.getElementById('raw-toggle');
    const previewTitle = document.getElementById('preview-title');
    const msgTime = document.getElementById('msg-time');
    const dropOverlay = document.getElementById('drop-overlay');
    const editorCard = document.getElementById('editor-card');
    const loadExample = document.getElementById('load-example');
    const themeLight = document.getElementById('theme-light');
    const themeDark = document.getElementById('theme-dark');
    const borderSeg = document.getElementById('border-seg');
    const borderControls = document.getElementById('border-controls');
    const thresholdLabel = document.getElementById('threshold-label');
    const thresholdUnit = document.getElementById('threshold-unit');
    const rowsControls = document.getElementById('rows-controls');
    const rowsToggle = document.getElementById('rows-toggle');
    const emojiToggle = document.getElementById('emoji-toggle');

    const OPTIONS_KEY = 'mdwa-options';
    const options = { tableFormat: 'auto', tableThreshold: 28, borderStyle: 'unicode', rowSeparator: false, headingEmojis: true };
    // Per-table overrides, keyed by the table's position in the document. Not
    // persisted: they belong to the text being converted, not to the user.
    const tableOverrides = [];
    let showRaw = false;
    let isCopying = false;

    // ---- Options ----
    function loadOptions() {
        let stored = null;
        try { stored = JSON.parse(localStorage.getItem(OPTIONS_KEY) || 'null'); } catch (e) { }
        if (stored) Object.assign(options, stored);

        thresholdInput.value = String(options.tableThreshold);
        emojiToggle.classList.toggle('active', options.headingEmojis);
        rowsToggle.classList.toggle('active', options.rowSeparator);
        rowsToggle.setAttribute('aria-pressed', String(options.rowSeparator));
        document.querySelectorAll('.fmt-seg button').forEach(b =>
            b.classList.toggle('active', b.dataset.fmt === options.tableFormat));
        borderSeg.querySelectorAll('button').forEach(b =>
            b.classList.toggle('active', b.dataset.border === options.borderStyle));
    }

    function storeOptions() {
        try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(options)); } catch (e) { }
    }

    // ---- Theme ----
    const systemTheme = window.matchMedia('(prefers-color-scheme: light)');

    function applyTheme(theme, remember) {
        document.body.classList.toggle('light', theme === 'light');
        themeLight.classList.toggle('active', theme === 'light');
        themeDark.classList.toggle('active', theme !== 'light');
        // Only an explicit click is remembered, so the page keeps following the
        // operating system until the visitor overrides it
        if (remember) {
            try { localStorage.setItem('mdwa-theme', theme); } catch (e) { }
        }
    }

    function storedTheme() {
        try {
            const theme = localStorage.getItem('mdwa-theme');
            return theme === 'light' || theme === 'dark' ? theme : null;
        } catch (e) {
            return null;
        }
    }

    themeLight.addEventListener('click', () => applyTheme('light', true));
    themeDark.addEventListener('click', () => applyTheme('dark', true));
    systemTheme.addEventListener('change', () => {
        if (!storedTheme()) applyTheme(systemTheme.matches ? 'light' : 'dark', false);
    });
    applyTheme(storedTheme() || (systemTheme.matches ? 'light' : 'dark'), false);

    // ---- WhatsApp-syntax → HTML preview ----
    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    // WhatsApp applies a marker only when it borders a non-alphanumeric character
    // and wraps non-space content, the same rule the converter follows
    function applyMarker(s, marker, tag) {
        const m = marker === '*' ? '\\*' : marker;
        const pattern = new RegExp(
            `(^|[^\\p{L}\\p{N}${m}])${m}(?![\\s${m}])((?:[^\\n${m}])+?)(?<!\\s)${m}(?![\\p{L}\\p{N}])`,
            'gu'
        );
        return s.replace(pattern, (match, before, content) => `${before}<${tag}>${content}</${tag}>`);
    }
    function inlineFmt(s) {
        let out = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
        out = applyMarker(out, '*', 'strong');
        out = applyMarker(out, '_', 'em');
        out = applyMarker(out, '~', 's');
        return out;
    }
    function renderChunks(text) {
        const out = [];
        const chunks = text.split('```');
        chunks.forEach((chunk, ci) => {
            if (ci % 2 === 1) {
                out.push('<div class="pv-code">' + escapeHtml(chunk.replace(/^\n/, '').replace(/\n$/, '')) + '</div>');
                return;
            }
            const lines = chunk.split('\n');
            let quote = [];
            const flushQuote = () => {
                if (!quote.length) return;
                out.push('<div class="pv-quote">' + quote.map(q => '<div>' + inlineFmt(escapeHtml(q)) + '</div>').join('') + '</div>');
                quote = [];
            };
            lines.forEach(line => {
                if (/^>\s?/.test(line)) { quote.push(line.replace(/^(>\s?)+/, '')); return; }
                flushQuote();
                if (line === '') { out.push('<div class="pv-gap"></div>'); return; }
                // WhatsApp turns `* `/`- ` and `1. ` line prefixes into real list
                // markers, so the preview must not show the raw character
                const item = /^([*-]|\d{1,9}\.)\s+(.*)$/.exec(line);
                if (item) {
                    const marker = item[1] === '*' || item[1] === '-' ? '\u2022' : item[1];
                    out.push('<div class="pv-item"><span class="pv-marker">' + marker + '</span>'
                        + '<span>' + inlineFmt(escapeHtml(item[2])) + '</span></div>');
                    return;
                }
                out.push('<div>' + inlineFmt(escapeHtml(line)) + '</div>');
            });
            flushQuote();
        });
        return out.join('');
    }

    // Each option sits on its own labelled line, the same grammar as the header bar
    function row(label, control) {
        return '<span class="opt-label">' + label + '</span><div class="pv-tc-cell">' + control + '</div>';
    }

    function seg(name, index, current, entries, extraClass) {
        return '<div class="seg' + (extraClass ? ' ' + extraClass : '') + '">' + entries.map(([value, label]) =>
            '<button type="button" data-table="' + index + '" data-opt="' + name + '" data-value="' + value + '"'
            + (value === current ? ' class="active"' : '') + '>' + label + '</button>').join('') + '</div>';
    }

    // The panel shows the options this table actually renders with, whether they
    // come from the document defaults or from its own override.
    function tableControlsHTML(index) {
        const own = tableOverrides[index] || {};
        const eff = Object.assign({}, options, own);
        const custom = Object.keys(own).length > 0;

        const head = '<div class="pv-tc-head"><span class="pv-tc-title">This table</span></div>';
        let reset = '';

        const rows = [row('Style', seg('tableFormat', index, eff.tableFormat, [['ascii', 'ASCII'], ['always', 'List'], ['auto', 'Auto']]))];

        if (eff.tableFormat === 'auto') {
            rows.push(row('Max', '<div class="pv-numfield">'
                + '<input type="number" class="pv-thr" min="1" max="200" value="' + eff.tableThreshold + '"'
                + ' data-table="' + index + '" data-opt="tableThreshold" data-pv-focus="thr-' + index + '"'
                + ' aria-label="Maximum table width in characters"><span>ch</span></div>'));
        }
        if (eff.tableFormat !== 'always') {
            rows.push(row('Border', seg('borderStyle', index, eff.borderStyle, [['unicode', 'Unicode'], ['ascii', 'Plain']], 'border-seg')));
        }
        if (eff.tableFormat !== 'always') {
            rows.push(row('Separator', '<button type="button" class="check' + (eff.rowSeparator ? ' active' : '') + '"'
                + ' data-table="' + index + '" data-opt="rowSeparator" data-value="toggle"'
                + ' aria-pressed="' + (eff.rowSeparator ? 'true' : 'false') + '"'
                + ' aria-label="Draw a rule between table rows"'
                + ' title="Draw a rule between table rows"><span class="check-box"></span></button>'));
        }

        if (custom) {
            reset = '<button type="button" class="pv-reset" data-table="' + index + '" data-opt="reset"'
                + ' title="Follow the document default again">reset to default</button>';
        }

        return '<div class="pv-table-controls"><div class="pv-tc-body">' + head
            + '<div class="pv-tc-grid">' + rows.join('') + '</div></div>' + reset + '</div>';
    }

    function buildPreviewHTML(blocks) {
        return blocks.map((block, i) => {
            const gap = i > 0 ? '<div class="pv-gap"></div>' : '';
            const body = renderChunks(block.text);
            if (block.tableIndex === null) return gap + body;
            // A table with settings of its own carries an accent stripe even when
            // unhovered: otherwise the header controls look broken when they skip it
            const own = tableOverrides[block.tableIndex];
            const overridden = own && Object.keys(own).length ? ' is-overridden' : '';
            return gap + '<div class="pv-table' + overridden + '" data-table="' + block.tableIndex + '">'
                + tableControlsHTML(block.tableIndex) + body + '</div>';
        }).join('');
    }

    // ---- Conversion + render ----
    let lastConverted = '';
    function render() {
        let converted = '';
        let blocks = [];
        try {
            const result = convertToBlocks(input.value, Object.assign({}, options, { tableOverrides }));
            converted = result.text;
            blocks = result.blocks;
        } catch (error) {
            console.error('Conversion error:', error);
        }
        lastConverted = converted;
        // A control the user is typing in survives the re-render
        const active = document.activeElement;
        const focusKey = active && active.dataset ? active.dataset.pvFocus : null;
        const hasContent = !!converted.trim();

        chatEmpty.hidden = hasContent;
        chatMsg.hidden = !hasContent;
        copyButton.disabled = !hasContent;
        shareLink.classList.toggle('disabled', !hasContent);
        shareLink.href = hasContent ? 'https://wa.me/?text=' + encodeURIComponent(converted) : '#';
        tableControls.hidden = !mdContainsTable(input.value);
        const showThreshold = options.tableFormat === 'auto';
        thresholdInput.hidden = !showThreshold;
        thresholdLabel.hidden = !showThreshold;
        thresholdUnit.hidden = !showThreshold;
        // Auto can still draw a box, so the border choice matters there too
        borderControls.hidden = tableControls.hidden || options.tableFormat === 'always';
        rowsControls.hidden = tableControls.hidden || options.tableFormat === 'always';
        emojiToggle.hidden = !mdContainsHeading(input.value);

        if (hasContent) {
            if (showRaw) {
                bubbleContent.innerHTML = '<div class="pv-raw">' + escapeHtml(converted) + '</div>';
            } else {
                bubbleContent.innerHTML = buildPreviewHTML(blocks);
                placePanels();
                if (focusKey) {
                    const restored = bubbleContent.querySelector('[data-pv-focus="' + focusKey + '"]');
                    if (restored) restored.focus();
                }
            }
            const now = new Date();
            msgTime.textContent = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
        }
        previewTitle.textContent = showRaw ? 'Raw output' : 'Preview';
        rawToggle.textContent = showRaw ? 'show preview' : 'view raw syntax';
    }

    function update() {
        storeOptions();
        render();
    }

    input.addEventListener('input', render);
    thresholdInput.addEventListener('input', () => {
        options.tableThreshold = parseInt(thresholdInput.value, 10) || 28;
        update();
    });
    document.querySelectorAll('.fmt-seg button').forEach(btn => {
        btn.addEventListener('click', () => {
            options.tableFormat = btn.dataset.fmt;
            document.querySelectorAll('.fmt-seg button').forEach(b => b.classList.toggle('active', b === btn));
            update();
        });
    });
    borderSeg.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            options.borderStyle = btn.dataset.border;
            borderSeg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
            update();
        });
    });
    rowsToggle.addEventListener('click', () => {
        options.rowSeparator = !options.rowSeparator;
        rowsToggle.classList.toggle('active', options.rowSeparator);
        rowsToggle.setAttribute('aria-pressed', String(options.rowSeparator));
        update();
    });

    // ---- Per-table overrides ----
    function setOverride(index, patch) {
        tableOverrides[index] = Object.assign({}, tableOverrides[index] || {}, patch);
        render();
    }

    // The panel opens upward by default, but #chat scrolls and would clip a panel
    // hanging above a table near the top: flip it below when there isn't room.
    // Decided on every render too, since a click inside the panel rebuilds the node.
    function placePanels(scope) {
        const chatTop = document.getElementById('chat').getBoundingClientRect().top;
        const tables = scope ? [scope] : bubbleContent.querySelectorAll('.pv-table');
        tables.forEach((table) => {
            const panel = table.querySelector('.pv-table-controls');
            if (!panel) return;
            const room = table.getBoundingClientRect().top - chatTop;
            table.classList.toggle('pv-flip', room < panel.offsetHeight + 16);
        });
    }

    bubbleContent.addEventListener('pointerover', (event) => {
        const table = event.target.closest('.pv-table');
        if (table) placePanels(table);
    });

    bubbleContent.addEventListener('click', (event) => {
        const control = event.target.closest('[data-opt]');
        if (!control) return;
        const index = Number(control.dataset.table);
        const opt = control.dataset.opt;

        if (opt === 'reset') {
            delete tableOverrides[index];
            render();
        } else if (opt === 'rowSeparator') {
            const own = tableOverrides[index] || {};
            const current = 'rowSeparator' in own ? own.rowSeparator : options.rowSeparator;
            setOverride(index, { rowSeparator: !current });
        } else if (control.dataset.value) {
            setOverride(index, { [opt]: control.dataset.value });
        }
    });

    bubbleContent.addEventListener('input', (event) => {
        const field = event.target.closest('input[data-opt="tableThreshold"]');
        if (!field) return;
        setOverride(Number(field.dataset.table), { tableThreshold: parseInt(field.value, 10) || options.tableThreshold });
    });

    emojiToggle.addEventListener('click', () => {
        options.headingEmojis = !options.headingEmojis;
        emojiToggle.classList.toggle('active', options.headingEmojis);
        update();
    });
    rawToggle.addEventListener('click', () => { showRaw = !showRaw; render(); });

    // ---- Example ----
    loadExample.addEventListener('click', () => {
        input.value = "# Release 2.4\nHi team! The new build is **ready for testing**.\n\n## Highlights\n* Faster _sync engine_\n* ~~Legacy importer~~ removed\n* `npm run deploy` works offline\n\n| Env | Status |\n|-----|--------|\n| Staging | Live |\n| Prod | Friday |\n\n> Please report bugs by **Thursday**.";
        render();
    });

    // ---- Drag & drop .md ----
    editorCard.addEventListener('dragover', (e) => { e.preventDefault(); dropOverlay.hidden = false; });
    editorCard.addEventListener('dragleave', () => { dropOverlay.hidden = true; });
    editorCard.addEventListener('drop', (e) => {
        e.preventDefault();
        dropOverlay.hidden = true;
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) file.text().then(t => { input.value = t; render(); });
    });

    // ---- Copy ----
    copyButton.addEventListener('click', () => {
        if (!lastConverted || isCopying) return;
        isCopying = true;
        navigator.clipboard.writeText(lastConverted).then(() => {
            copyLabel.textContent = 'Copied ✓';
            copyButton.classList.add('copied', 'copy-pulse');
            setTimeout(() => {
                copyLabel.textContent = 'Copy for WhatsApp';
                copyButton.classList.remove('copied', 'copy-pulse');
                isCopying = false;
            }, 2000);
        }).catch(err => {
            console.error('Could not copy text to clipboard:', err);
            isCopying = false;
        });
        window.getSelection().removeAllRanges();
    });

    loadOptions();
    render();
})();
