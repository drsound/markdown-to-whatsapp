// UI logic for the page.
// Conversion logic lives in converter.js (convertToBlocks, mdContainsTable,
// mdContainsHeading, mdContainsCode); this file never formats Markdown itself.
(function () {
    const input = document.getElementById('markdown-input');
    const bubbleContent = document.getElementById('bubble-content');
    const chatEmpty = document.getElementById('chat-empty');
    const chatMsg = document.getElementById('chat-msg');
    const copyButton = document.getElementById('copy-button');
    const copyLabel = document.getElementById('copy-label');
    const shareLink = document.getElementById('share-link');
    const optbar = document.getElementById('preview-options');
    const widthInput = document.getElementById('monoWidth');
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
    const widthControls = document.getElementById('width-controls');
    const bubbleSection = document.getElementById('bubble-section');
    const tablesSection = document.getElementById('tables-section');
    const headingsSection = document.getElementById('headings-section');
    const rowsControls = document.getElementById('rows-controls');
    const rowsToggle = document.getElementById('rows-toggle');
    const emojiToggle = document.getElementById('emoji-toggle');

    const OPTIONS_KEY = 'mdwa-options';
    // The document options the bar edits. `listLayout` is deliberately not
    // among them: which way a table reads as a list is a property of that
    // table, so it only exists as a per-table override.
    const options = Object.assign({}, DEFAULT_OPTIONS);
    // Per-table overrides, keyed by the table's header (see tableKey in the
    // converter) so they stay on their table when one is added above. Not
    // persisted: they belong to the text being converted, not to the user.
    const tableOverrides = Object.create(null);
    let showRaw = false;
    let isCopying = false;

    function setCheck(button, on) {
        button.classList.toggle('active', on);
        button.setAttribute('aria-pressed', String(on));
    }

    // ---- Options ----
    function loadOptions() {
        let stored = null;
        try { stored = JSON.parse(localStorage.getItem(OPTIONS_KEY) || 'null'); } catch (e) { }
        if (stored) {
            // Only the keys we know: the storage belongs to the visitor, not to us,
            // and whatever is in it goes straight into the converter
            Object.keys(options).forEach(key => {
                if (stored[key] !== undefined) options[key] = stored[key];
            });
            // Settings saved before the width became a global: the value survives,
            // the old names do not, and the next save writes the storage clean
            if (stored.monoWidth === undefined && stored.tableThreshold !== undefined) {
                options.monoWidth = stored.tableThreshold;
            }
            if (FORMAT_ALIASES[stored.tableFormat]) options.tableFormat = FORMAT_ALIASES[stored.tableFormat];
        }
        const width = parseInt(options.monoWidth, 10);
        options.monoWidth = Number.isFinite(width) && width > 0 ? width : DEFAULT_OPTIONS.monoWidth;
        if (options.tableFormat !== 'list') options.tableFormat = 'auto';
        options.listLayout = DEFAULT_OPTIONS.listLayout;

        widthInput.value = String(options.monoWidth);
        setCheck(emojiToggle, options.headingEmojis);
        setCheck(rowsToggle, options.rowSeparator);
        document.querySelectorAll('.fmt-seg button').forEach(b =>
            b.classList.toggle('active', b.dataset.fmt === options.tableFormat));
        borderSeg.querySelectorAll('button').forEach(b =>
            b.classList.toggle('active', b.dataset.border === options.borderStyle));
    }

    function storeOptions() {
        try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(options)); } catch (e) { }
    }

    // A group that another setting makes pointless stays where it is, dimmed,
    // so the bar keeps its shape while the visitor clicks around it
    function setEnabled(group, enabled) {
        group.classList.toggle('is-disabled', !enabled);
        group.setAttribute('aria-disabled', String(!enabled));
        group.querySelectorAll('button, input').forEach(el => { el.disabled = !enabled; });
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

    function attr(value) {
        return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function seg(name, key, current, entries) {
        return '<div class="seg">' + entries.map(([value, label, title]) =>
            '<button type="button" data-key="' + attr(key) + '" data-opt="' + name + '" data-value="' + value + '"'
            + (title ? ' title="' + attr(title) + '"' : '')
            + (value === current ? ' class="active"' : '') + '>' + label + '</button>').join('') + '</div>';
    }

    function check(name, key, on, title) {
        return '<button type="button" class="check' + (on ? ' active' : '') + '"'
            + ' data-key="' + attr(key) + '" data-opt="' + name + '" data-value="toggle"'
            + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
            + ' aria-label="' + attr(title) + '" title="' + attr(title) + '"><span class="check-box"></span></button>';
    }

    const LAYOUT_LABELS = { rows: 'Rows', columns: 'Columns', pairs: 'Pairs' };

    // The panel shows the options this table actually renders with, whether they
    // come from the document defaults or from its own override, and only the
    // ones that can still change something: Style where a box is possible,
    // Separator on a box, Layout on a list.
    function tableControlsHTML(block) {
        const key = block.key;
        const own = tableOverrides[key] || {};
        const eff = Object.assign({}, options, own);
        const custom = Object.keys(own).length > 0;

        const head = '<div class="pv-tc-head"><span class="pv-tc-title">This table</span></div>';
        const rows = [];

        if (block.fitsBox) {
            rows.push(row('Style', seg('tableFormat', key, eff.tableFormat, [
                ['auto', 'Auto', 'Drawn table when it fits the bubble, bulleted list otherwise'],
                ['list', 'List', 'Always a bulleted list']
            ])));
        }

        if (!block.asList) {
            rows.push(row('Separator', check('rowSeparator', key, eff.rowSeparator,
                'Draw a rule between table rows (always drawn when a row wraps)')));
        } else {
            const guessed = LAYOUT_LABELS[block.listLayout] || '';
            const entries = [
                ['auto', 'Auto', guessed ? 'Guess from the headers — here: ' + guessed : 'Guess from the headers'],
                ['rows', 'Rows', 'One group per row, labelled by its first cell'],
                ['columns', 'Columns', 'One group per column, labelled by its header']
            ];
            // Pairs need a key and a value, nothing else: two columns exactly
            if (block.columns === 2) entries.push(['pairs', 'Pairs', 'Bare key: value lines, headers dropped']);
            rows.push(row('Layout', seg('listLayout', key, eff.listLayout, entries)));
        }

        let body = '<div class="pv-tc-grid">' + rows.join('') + '</div>';
        if (!block.fitsBox) {
            // No box of this table fits the bubble: say why instead of offering a
            // style that could not change anything
            body = '<p class="pv-tc-note">No box fits ' + options.monoWidth
                + ' ch, so it reads as a list.</p>' + body;
        }

        const reset = custom
            ? '<button type="button" class="pv-reset" data-key="' + attr(key) + '" data-opt="reset"'
                + ' title="Follow the document default again">reset to default</button>'
            : '';

        return '<div class="pv-table-controls"><div class="pv-tc-body">' + head
            + body + '</div>' + reset + '</div>';
    }

    // Every block is wrapped and tagged with the source line it starts on, which
    // is what keeps the two panes scrolling together
    function buildPreviewHTML(blocks) {
        return blocks.map((block, i) => {
            const gap = i > 0 ? '<div class="pv-gap"></div>' : '';
            let body = renderChunks(block.text);
            if (block.tableIndex !== null) {
                // A table with settings of its own carries an accent stripe even when
                // unhovered: otherwise the header controls look broken when they skip it
                const own = tableOverrides[block.key];
                const overridden = own && Object.keys(own).length ? ' is-overridden' : '';
                body = '<div class="pv-table' + overridden + '" data-key="' + attr(block.key) + '">'
                    + tableControlsHTML(block) + body + '</div>';
            }
            return gap + '<div class="pv-block" data-line="' + block.line + '">' + body + '</div>';
        }).join('');
    }

    // ---- Conversion + render ----
    let lastConverted = '';
    let lastBlocks = [];
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
        lastBlocks = blocks;
        editorTops = null;
        const hasContent = !!converted.trim();

        chatEmpty.hidden = hasContent;
        chatMsg.hidden = !hasContent;
        copyButton.disabled = !hasContent;
        shareLink.classList.toggle('disabled', !hasContent);
        shareLink.href = hasContent ? 'https://wa.me/?text=' + encodeURIComponent(converted) : '#';
        // Sections come and go with the content; within a section, a control
        // that the current settings make pointless is dimmed in place
        const hasTable = mdContainsTable(input.value);
        const hasCode = mdContainsCode(input.value);
        const hasHeading = mdContainsHeading(input.value);
        const isList = options.tableFormat === 'list';

        optbar.hidden = !(hasTable || hasCode || hasHeading);
        // The width governs everything monospace: code blocks and boxed tables.
        // In list mode a table draws no monospace at all, so with no code block
        // around either the knob is connected to nothing
        bubbleSection.hidden = !(hasTable || hasCode);
        setEnabled(widthControls, hasCode || !isList);
        tablesSection.hidden = !hasTable;
        setEnabled(borderControls, !isList);
        setEnabled(rowsControls, !isList);
        headingsSection.hidden = !hasHeading;

        // The preview draws every monospace block at the real bubble width
        bubbleContent.style.setProperty('--mono-cols', String(options.monoWidth));

        if (hasContent) {
            if (showRaw) {
                bubbleContent.innerHTML = '<div class="pv-raw">' + escapeHtml(converted) + '</div>';
            } else {
                bubbleContent.innerHTML = buildPreviewHTML(blocks);
                placePanels();
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

    // ---- Keeping the panes together ----
    // Both panes scroll on their own. The one under the pointer leads: the block
    // at its top is brought to the top of the other, with the position inside
    // the block carried over so the follower moves smoothly rather than in
    // jumps. While typing, the preview follows the caret's block instead.
    const chat = document.getElementById('chat');
    const mirror = document.getElementById('editor-mirror');
    let leader = null;
    // Where each block starts in the editor's scroll space, measured lazily and
    // thrown away on every render and resize
    let editorTops = null;

    // A textarea gives no position for a line, so a hidden copy with the same
    // font and width is filled with the lines before it and measured
    function measureEditorTops() {
        const style = getComputedStyle(input);
        const padTop = parseFloat(style.paddingTop);
        mirror.style.width = (input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) + 'px';
        mirror.style.font = style.font;
        mirror.style.lineHeight = style.lineHeight;
        mirror.style.letterSpacing = style.letterSpacing;
        const lines = input.value.split('\n');
        return lastBlocks.map(block => {
            if (block.line === 0) return padTop;
            // The zero-width space keeps a trailing empty line from collapsing
            mirror.textContent = lines.slice(0, block.line).join('\n') + '\u200b';
            return padTop + mirror.getBoundingClientRect().height;
        });
    }

    function previewTops() {
        const chatTop = chat.getBoundingClientRect().top - chat.scrollTop;
        return Array.from(bubbleContent.querySelectorAll('.pv-block'),
            el => el.getBoundingClientRect().top - chatTop);
    }

    // Map a scroll offset through two lists of block tops: the block it falls
    // in, and how far into it, are kept; everything past the last block maps
    // onto the rest of the other pane
    function mapScroll(offset, fromTops, fromEnd, toTops, toEnd) {
        if (!fromTops.length) return offset;
        let i = fromTops.length - 1;
        while (i > 0 && fromTops[i] > offset) i--;
        const fromStart = fromTops[i];
        const fromNext = i + 1 < fromTops.length ? fromTops[i + 1] : fromEnd;
        const toStart = toTops[i];
        const toNext = i + 1 < toTops.length ? toTops[i + 1] : toEnd;
        const span = fromNext - fromStart;
        const fraction = span > 0 ? Math.min(1, Math.max(0, (offset - fromStart) / span)) : 0;
        return toStart + fraction * (toNext - toStart);
    }

    input.addEventListener('scroll', () => {
        if (leader !== 'editor' || chatMsg.hidden) return;
        if (!editorTops) editorTops = measureEditorTops();
        // Tops are relative to the content; scrollTop of a pane whose first block
        // sits at its padding maps onto the other pane's padding the same way
        const tops = previewTops();
        const target = mapScroll(input.scrollTop + editorTops[0], editorTops, input.scrollHeight, tops, chat.scrollHeight);
        chat.scrollTop = target - tops[0];
    });
    chat.addEventListener('scroll', () => {
        if (leader !== 'preview' || chatMsg.hidden) return;
        if (!editorTops) editorTops = measureEditorTops();
        const tops = previewTops();
        const target = mapScroll(chat.scrollTop + tops[0], tops, chat.scrollHeight, editorTops, input.scrollHeight);
        input.scrollTop = target - editorTops[0];
    });
    input.addEventListener('pointerenter', () => { leader = 'editor'; });
    chat.addEventListener('pointerenter', () => { leader = 'preview'; });
    // A key scrolls the editor wherever the pointer is
    input.addEventListener('keydown', () => { leader = 'editor'; });
    window.addEventListener('resize', () => { editorTops = null; });

    // Bring the block holding the caret into the preview, leaving it where it
    // is when it is already in sight: a keystroke must not jolt the chat
    function followCaret() {
        if (chatMsg.hidden || !lastBlocks.length) return;
        const line = input.value.slice(0, input.selectionStart).split('\n').length - 1;
        let index = 0;
        while (index + 1 < lastBlocks.length && lastBlocks[index + 1].line <= line) index++;
        const el = bubbleContent.querySelectorAll('.pv-block')[index];
        if (!el) return;
        const chatRect = chat.getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        const margin = 16;
        if (rect.top < chatRect.top + margin) {
            chat.scrollTop += rect.top - chatRect.top - margin;
        } else if (rect.bottom > chatRect.bottom - margin) {
            chat.scrollTop += Math.min(rect.bottom - chatRect.bottom + margin, rect.top - chatRect.top - margin);
        }
    }

    input.addEventListener('input', () => {
        leader = 'editor';
        render();
        followCaret();
    });
    widthInput.addEventListener('input', () => {
        // An empty field is mid-edit, not a request to go back to the default:
        // reacting would flash every monospace block at the default width
        if (widthInput.value === '') return;
        options.monoWidth = parseInt(widthInput.value, 10) || DEFAULT_OPTIONS.monoWidth;
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
        setCheck(rowsToggle, options.rowSeparator);
        update();
    });
    emojiToggle.addEventListener('click', () => {
        options.headingEmojis = !options.headingEmojis;
        setCheck(emojiToggle, options.headingEmojis);
        update();
    });

    // ---- Per-table overrides ----
    function setOverride(key, patch) {
        tableOverrides[key] = Object.assign({}, tableOverrides[key] || {}, patch);
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
        const key = control.dataset.key;
        const opt = control.dataset.opt;

        if (opt === 'reset') {
            delete tableOverrides[key];
            render();
        } else if (opt === 'rowSeparator') {
            const own = tableOverrides[key] || {};
            const current = 'rowSeparator' in own ? own.rowSeparator : options.rowSeparator;
            setOverride(key, { rowSeparator: !current });
        } else if (control.dataset.value) {
            setOverride(key, { [opt]: control.dataset.value });
        }
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
