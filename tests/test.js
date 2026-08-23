/**
 * File-based test suite for the Markdown to WhatsApp converter.
 *
 * Structure:
 *   tests/inputs/   - Markdown input files (.md)
 *   tests/inputs/   - optional <name>.json sidecars with per-fixture converter options
 *   tests/expected/ - Expected WhatsApp output files (.txt)
 *
 * Run with: npm test (from the repository root)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { convertTextToWhatsapp, convertToBlocks } from '../docs/converter.js';
import { vendorSource } from '../scripts/vendor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// =================================================================================================
// TEST RUNNER
// =================================================================================================

const inputsDir = join(__dirname, 'inputs');
const expectedDir = join(__dirname, 'expected');

let passed = 0;
let failed = 0;

console.log('\n========== FILE-BASED TESTS ==========\n');

const inputFiles = readdirSync(inputsDir).filter(f => f.endsWith('.md')).sort();

for (const inputFile of inputFiles) {
    const testName = basename(inputFile, '.md');
    const expectedFile = testName + '.txt';
    const optionsFile = join(inputsDir, testName + '.json');

    try {
        const input = readFileSync(join(inputsDir, inputFile), 'utf-8');
        const expected = readFileSync(join(expectedDir, expectedFile), 'utf-8').trim();
        const options = existsSync(optionsFile)
            ? JSON.parse(readFileSync(optionsFile, 'utf-8'))
            : undefined;
        const actual = convertTextToWhatsapp(input, options);

        if (actual === expected) {
            console.log(`✅ ${testName}`);
            passed++;
        } else {
            console.log(`❌ ${testName}`);
            console.log('   --- Expected ---');
            console.log(expected.split('\n').map(l => '   ' + l).join('\n'));
            console.log('   --- Actual ---');
            console.log(actual.split('\n').map(l => '   ' + l).join('\n'));
            failed++;
        }
    } catch (err) {
        console.log(`⚠️  ${testName} - ${err.message}`);
        failed++;
    }
}

// =================================================================================================
// INVARIANTS
// =================================================================================================

console.log('\n========== INVARIANTS ==========\n');

function check(name, fn) {
    try {
        const problem = fn();
        if (problem) {
            console.log(`❌ ${name}\n   ${problem}`);
            failed++;
        } else {
            console.log(`✅ ${name}`);
            passed++;
        }
    } catch (err) {
        console.log(`⚠️  ${name} - ${err.message}`);
        failed++;
    }
}

// The page loads marked from docs/vendor/, the package from node_modules: they
// must be the same build, or the page and the tests parse Markdown differently
check('vendored marked matches the installed version', () => {
    const markedDir = dirname(require.resolve('marked/package.json'));
    const vendored = readFileSync(join(__dirname, '..', 'docs', 'vendor', 'marked.esm.js'), 'utf8');
    return vendored === vendorSource(markedDir) ? null : 'docs/vendor/marked.esm.js differs: run `npm run vendor`';
});

// The scroll sync lines the preview up with the editor through `line`
check('convertToBlocks reports the source line of every block', () => {
    const md = '# T\n\npara one\nstill\n\n* a\n* b\n\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n```\ncode\n```\n> q';
    const lines = convertToBlocks(md).blocks.map(block => block.line);
    const expected = [0, 2, 5, 9, 13, 16];
    return JSON.stringify(lines) === JSON.stringify(expected) ? null : `got ${JSON.stringify(lines)}, expected ${JSON.stringify(expected)}`;
});

check('the package entry is the page script', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.exports['.'] === './docs/converter.js' ? null : `exports["."] is ${pkg.exports['.']}`;
});

console.log('\n========== SUMMARY ==========\n');
console.log(`Total: ${passed + failed} tests`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
