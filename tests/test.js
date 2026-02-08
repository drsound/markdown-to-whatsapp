/**
 * File-based test suite for Markdown to WhatsApp converter
 * 
 * Structure:
 *   tests/inputs/   - Markdown input files (.md)
 *   tests/expected/ - Expected WhatsApp output files (.txt)
 * 
 * Run with: npm test
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Mock browser globals that script.js expects
globalThis.document = { addEventListener: () => { } };
globalThis.marked = require('marked');

// Import the converter from the actual script
const { convertTextToWhatsapp } = require('../docs/script.js');

// =================================================================================================
// TEST RUNNER
// =================================================================================================

const inputsDir = join(__dirname, 'inputs');
const expectedDir = join(__dirname, 'expected');

let passed = 0;
let failed = 0;

console.log('\n========== FILE-BASED TESTS ==========\n');

const inputFiles = readdirSync(inputsDir).filter(f => f.endsWith('.md'));

for (const inputFile of inputFiles) {
    const testName = basename(inputFile, '.md');
    const expectedFile = testName + '.txt';

    try {
        const input = readFileSync(join(inputsDir, inputFile), 'utf-8');
        const expected = readFileSync(join(expectedDir, expectedFile), 'utf-8').trim();
        const actual = convertTextToWhatsapp(input);

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

console.log('\n========== SUMMARY ==========\n');
console.log(`Total: ${passed + failed} tests`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
