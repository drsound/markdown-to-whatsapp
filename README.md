# Markdown to WhatsApp Converter

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Status: Active](https://img.shields.io/badge/status-active-success.svg)](https://github.com/drsound/markdown-to-whatsapp)

A client-side web utility to convert standard Markdown into WhatsApp's formatting syntax.

**[➡️ Go to the Live Tool](https://drsound.github.io/markdown-to-whatsapp/)**

[![Screenshot of the app](./assets/screenshot.png)](https://drsound.github.io/markdown-to-whatsapp/)

---

## Purpose of this Tool

WhatsApp uses a non-standard syntax for text formatting (e.g., `*bold*`, `_italic_`, `~strikethrough~`). This is similar, but not identical, to standard Markdown.

This tool provides a simple way to convert text from Markdown sources (like text editors, Google Docs, etc.) into the format that WhatsApp expects, saving the need for manual correction.

The entire conversion process runs locally in your browser using JavaScript. **No data is ever sent to a server.**

## Supported Conversions

The script uses the [marked](https://github.com/markedjs/marked) library for proper AST-based parsing and handles:

### Text Styles
* **Bold:** `**text**` → `*text*`
* **Italic:** `*text*` or `_text_` → `_text_`
* **Strikethrough:** `~~text~~` → `~text~`
* **Inline code:** `` `code` `` → `` `code` ``
* **Bold+Italic:** `***text***` → `_*text*_` (preserves both styles)

### Headers
Headers are converted to bold text with level-specific emoji prefixes:
* `# H1` → `*📌 H1*`
* `## H2` → `*🟠 H2*`
* `### H3` → `*🟡 H3*`
* And so on...

The emoji prefix can be turned off in the UI (Headings · Emoji), leaving plain `*Title*`.

### Lists
* **Unordered lists:** Uses `*` prefix with `◦` for nested levels
  * Level 1: `* Item`
  * Level 2: `* ◦ Item`
  * Level 3: `* ◦ ◦ Item`
* **Ordered lists:** Preserves numbering, with `◦` marking nested levels
  * `1. A` / `◦ 1. A1` / `◦ ◦ 1. A1a` / `2. B`
* **Task lists:** `- [x]` → `☑`, `- [ ]` → `☐`, also inside ordered lists (`1. ☑ done`)
* **Loose items:** multiple paragraphs of one item are joined on a single line
* **Block content in items:** code blocks, blockquotes and nested lists are emitted on their own lines below the item

### Bubble width
A WhatsApp bubble fits a fixed number of monospace characters on one line — about **26** on a
360 px phone, which is the default. Measure yours by sending yourself a code block and counting
where it breaks, then set **Width** in the bar to that (the `?` next to it says the same). The
field accepts 10 to 80: no phone is outside that range.

The number is a property of the phone, not of any one table, so it governs everything monospace:
tables degrade to stay under it, and the preview draws every code block exactly that wide, wrapping
where the recipient's WhatsApp will wrap.

### Tables
A table is rendered in one of **two styles**, chosen in the UI for the whole document or for one
table at a time:

1. **Auto** (default): a drawn table inside a monospace block, as wide as it needs and never
   wider than the bubble — and the bulleted list when no box can be drawn at all.
   ```
   +--------+-------------+
   | Name   | Description |
   +========+=============+
   | Value  | Details     |
   +--------+-------------+
   ```

2. **List**: always the bulleted list.

**How the list is laid out**

A list can group the cells in three ways. The converter **guesses** from the headers and the
bold cells, and the guess can be overridden per table (Layout: Auto · Rows · Columns · Pairs):

* **Pairs** — 2 columns, whatever the headers: each row is a `key: value` line. Spelling the
  headers out on every row reads worse than `Italy: Rome` in nearly every table.
  ```
  * *CPU:* Intel Xeon
  * *RAM:* 64 GB
  * *Storage:* 1 TB SSD
  ```

* **Columns** — 3+ columns whose first header is empty or names a property ("Feature",
  "Spec", "Parameter"…), or whose first column is bold: a comparison matrix, where the things
  compared are the columns, so each column becomes a group.
  ```
  * *Proxmox*
  * ◦ _Kernel:_ KVM
  * ◦ _License:_ AGPL v3
  * *ESXi*
  * ◦ _Kernel:_ VMkernel
  * ◦ _License:_ Proprietary
  ```

* **Rows** — everything else: one group per row, labelled by its first cell.
  ```
  * *Product:* Laptop
  * ◦ _Price:_ $999
  * ◦ _Stock:_ 50
  * *Product:* Smartphone
  * ◦ _Price:_ $599
  * ◦ _Stock:_ 100
  ```

The property words are matched word by word ("Species" does not count as "spec") in **11
languages**: English, Italian, Spanish, French, Portuguese, German, Russian, Arabic, Hindi,
Bengali, and Indonesian. Pairs need exactly two columns; asked for on a wider table, it reads as
Rows.

**How the box degrades**

The box is not drawn at any width: it degrades until it fits `monoWidth`, and becomes a list when
nothing does. There is no way to ask for a table wider than the bubble.

1. Full box, removing padding column by column (right-side first, then left-side).
2. **Compact borderless** style, again removing padding progressively:
   ```
    Head1|Head2       |Head-N
   ------+------------+------
    A    |BBBBBBBBBBBB|C
   ```
3. **Wrapped** box, full borders first and then compact: each column gets at least its longest
   word, the remaining width is shared proportionally and cells are word-wrapped. Rows grow as
   tall as they need — there is no limit — and a rule is always drawn between them, since two
   wrapped rows without one run into each other. Cells align to the top of their row.
   ```
   +---------+--------------+
   | Feature | Notes here   |
   +=========+==============+
   | Alpha   | short note   |
   +---------+--------------+
   | Beta    | a slightly   |
   |         | longer note  |
   +---------+--------------+
   ```
4. **Bulleted List**, when not even the longest words fit (a long URL, five columns at 26
   characters…).

Whether a tall wrapped box reads better than the list is a judgement the preview lets you make:
that table's own panel switches it to List. A table that cannot fit any box says so in its panel
and offers the list layout instead of a style that could not change anything.

**Additional table behaviour**
* Column widths are measured in display cells, so emoji and CJK text stay aligned (`✅`, `日本語`
  count as two columns) — as far as the phone allows: those glyphs come from a fallback font too,
  so the alignment is best effort, unlike the ASCII borders.
* Column alignment (`:---`, `:---:`, `---:`) is honoured in the box and compact styles.
* Header-only tables render without an empty body or a doubled border.
* `<br>` inside a cell becomes a space, and an escaped `\|` becomes `¦` so it cannot fake an extra column.
* **Borders are plain ASCII** (`+-|=`), on purpose. WhatsApp's monospace font has no box-drawing
  glyphs: a phone takes `─` and `┌` from whatever fallback font it has, at whatever width that
  font gives them, and a rule of 26 of them wraps onto two lines while the text rows next to it
  do not. `+-|` are the only characters whose width a monospace font actually promises — which
  is also why the escaped pipe becomes `¦`, a Latin-1 character from the same font as `à`.
* **Row separator** (default off) draws a rule between body rows, in every boxed and compact style;
  a wrapped table draws it regardless.
* The **style**, the **row separator** and the **list layout** can be set **per table**: hovering
  a table in the preview reveals its own controls, which start from the document default and
  override it for that table only, showing only the ones that still apply (the separator on a
  box, the layout on a list). The width is not among them — there is one bubble, and it is the
  same for every table. A table carrying its own settings keeps a dashed mark, since the controls
  at the top of the panel deliberately leave it alone — its "reset" button hands it back to them.
  Overrides follow the table by its header text, so adding or removing a table above does not
  move them. A table nested inside a list item or a blockquote always follows the document default.

### Code blocks
Fenced and indented blocks reach WhatsApp verbatim: the converter never re-wraps or re-indents
them, since a line break inside code is content, not layout. WhatsApp wraps long lines by itself,
mid-word, and a chat bubble has no horizontal scroll — so the preview reproduces that wrap at
`monoWidth` instead of scrolling, and shows exactly where the recipient will see the break.

### Other Elements
* **Links:** `[text](url)` → `text (url)`; autolinks, `<https://x>`, `[url](url)` and `<me@x.com>` render as the bare URL or address (no duplication, no `mailto:` leak)
* **HTML entities:** decimal and hexadecimal references plus the common named ones — Latin-1 letters, punctuation and symbols (`caf&eacute;` → `café`, `&copy;` → `©`, `&#65;` → `A`). Rarer references (Greek, mathematical) are left as written.
* **Inline HTML:** `<b>`/`<strong>` → `*`, `<i>`/`<em>` → `_`, `<s>`/`<del>` → `~`, `<code>` → `` ` ``, `<br>` → newline; comments and other tags are stripped
* **HTML blocks:** tags removed, block boundaries turned into newlines, entities decoded
* **Blockquotes:** Preserves `>` prefix, supports nesting (`> > nested`)
* **Code blocks:** Preserved with triple backticks; a triple backtick inside the content is replaced with `ˋˋˋ` so it cannot close the block early
* **Horizontal rules:** `---` → `───────────────`
* **Escape characters:** Uses Unicode look-alikes (`∗`, `＿`, `∼`) so WhatsApp won't interpret them as formatting

### WhatsApp-Specific Handling
* **Partial-word formatting is ignored:** `super**bold**ly` → `superboldly` (WhatsApp doesn't support mid-word formatting)
* **Punctuation is a valid boundary:** `**Name**: value` → `*Name*: value`, and so are `(**x**)` and `**end**.`
* **No post-processing:** Clean AST-based conversion without regex hacks

## How to Use

1.  **Open the web page:** [https://drsound.github.io/markdown-to-whatsapp/](https://drsound.github.io/markdown-to-whatsapp/)
2.  **Paste, type or drop a `.md` file** into the left panel. "Try an example" fills it with a sample message.
3.  The right panel shows the message **in a WhatsApp bubble**, exactly as the recipient will see it; "view raw syntax" shows the text that will be copied. The two panels **scroll together** — whichever is under the pointer leads — and while you type the preview follows the cursor.
4.  **"Copy for WhatsApp"**, or **"Share on WhatsApp"** to open a chat with the message ready via `wa.me`. A very long message does not fit in a link — browsers cut URLs past a few thousand characters — so Share steps aside and says to copy instead.

The interface follows the **operating system's light or dark theme**; the header toggle
overrides it and that choice is remembered.
The options bar has one section per kind of content, each shown only while the text contains
it: **Bubble** (the width, when there is a table or a code block), **Tables** (style and
separator) and **Headings** (the emoji prefix). A control that another setting makes pointless
— the separator in List style, the width with nothing monospace to draw — is
dimmed in place rather than removed, so the bar keeps its shape. The options are stored in
`localStorage` along with the theme. Per-table choices are not stored: they belong to the
text being converted.

Hovering a table in the preview reveals its own controls, and a table with settings of its own
is marked with a dashed line.

## Development

### Running Tests

Node 18 or newer:

```bash
cd tests
npm install
npm test
```

The test suite uses file-based testing:
* `tests/inputs/*.md` - Markdown input files
* `tests/inputs/*.json` - optional per-fixture converter options (e.g. `{ "monoWidth": 40 }`)
* `tests/expected/*.txt` - Expected WhatsApp output

Tests also run in CI on every push and pull request (`.github/workflows/test.yml`).

### Project Structure

* `docs/converter.js` - the converter itself: pure, DOM-free, options passed as a parameter.
  It exposes `convertTextToWhatsapp(markdown, options)`, `convertToBlocks(markdown, options)`
  — the same conversion with the top-level blocks kept apart and each one tagged with the
  table it came from, which is what per-table options are built on — and the
  `mdContainsTable` / `mdContainsHeading` / `mdContainsCode` queries the UI uses to show an
  option only when it applies. Each block of `convertToBlocks` reports the source `line` it
  starts on — what keeps the two panels scrolling together — and each table block also its
  `key`, `columns`, `fitsBox` (a box is possible), `asList` (what was written) and `listLayout`,
  so the interface can offer exactly the choices left.
* `docs/ui.js` - page wiring: theme, contextual options, WhatsApp preview, scroll sync between the panels, copy and share
* `docs/index.html`, `docs/style.css` - markup and hand-written stylesheet (no CSS framework)

Options are `tableFormat` (`auto` | `list`), `monoWidth`, `rowSeparator`, `headingEmojis`,
`listLayout` (`auto` | `rows` | `columns` | `pairs`), and `tableOverrides` — either an array
indexed by the table's position in the document or an object keyed by the table's `key` (its
header texts joined with `|`, plus `#2`, `#3`… for repeated headers), each entry overriding any
of the others for that table alone. The page exposes `listLayout` per table only.

The older names are still accepted on input: `tableThreshold` for `monoWidth`, and `ascii` /
`always` for `tableFormat` (`ascii` never drew a box wider than the bubble, so it maps to `auto`).
When both the old and the new name are given, the new one wins and the old is dropped.
`borderStyle`, which used to choose Unicode box drawing, is accepted and ignored.

The [marked](https://github.com/markedjs/marked) version is pinned to **18.0.10** in both
`docs/index.html` (with an SRI hash) and `tests/package.json`, so the page and the tests
always parse Markdown the same way.

### Local Development

```bash
cd docs
python3 -m http.server 8080
# Open http://localhost:8080
```