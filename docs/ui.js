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
    const emojiToggle = document.getElementById('emoji-toggle');

    const OPTIONS_KEY = 'mdwa-options';
    const options = { tableFormat: 'auto', tableThreshold: 28, borderStyle: 'unicode', headingEmojis: true };
    let showRaw = false;
    let isCopying = false;

    // ---- Options ----
    function loadOptions() {
        let stored = null;
        try { stored = JSON.parse(localStorage.getItem(OPTIONS_KEY) || 'null'); } catch (e) { }
        if (stored) Object.assign(options, stored);

        thresholdInput.value = String(options.tableThreshold);
        emojiToggle.classList.toggle('active', options.headingEmojis);
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
    function buildPreviewHTML(converted) {
        const out = [];
        const chunks = converted.split('```');
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
                    const marker = item[1] === '*' || item[1] === '-' ? '•' : item[1];
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

    // ---- Conversion + render ----
    let lastConverted = '';
    function render() {
        let converted = '';
        try {
            converted = convertTextToWhatsapp(input.value, options);
        } catch (error) {
            console.error('Conversion error:', error);
        }
        lastConverted = converted;
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
        // The border style is only worth choosing when every table is drawn as a box
        borderControls.hidden = tableControls.hidden || options.tableFormat !== 'ascii';
        emojiToggle.hidden = !mdContainsHeading(input.value);

        if (hasContent) {
            if (showRaw) {
                bubbleContent.innerHTML = '<div class="pv-raw">' + escapeHtml(converted) + '</div>';
            } else {
                bubbleContent.innerHTML = buildPreviewHTML(converted);
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
