// Copies marked's ES build into docs/vendor/, where the page's import map
// finds it. The page makes no request to a CDN that way, and the copy is
// pinned to the very version the package depends on: the test suite fails
// when the two drift apart, so bump marked in package.json, `npm install`,
// then `npm run vendor`.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const markedDir = dirname(require.resolve('marked/package.json'));
const version = JSON.parse(readFileSync(join(markedDir, 'package.json'), 'utf8')).version;

// The source map is not shipped, so its reference would only be a 404 in devtools
export const vendorSource = (dir) => readFileSync(join(dir, 'lib', 'marked.esm.js'), 'utf8').replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '\n');
writeFileSync(join(root, 'docs', 'vendor', 'marked.esm.js'), vendorSource(markedDir));
writeFileSync(join(root, 'docs', 'vendor', 'marked.LICENSE'),
    `marked ${version} — https://github.com/markedjs/marked\n\n` + readFileSync(join(markedDir, 'LICENSE'), 'utf8'));
console.log(`vendored marked ${version} into docs/vendor/`);
