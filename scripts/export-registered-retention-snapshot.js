'use strict';

// Export only anonymous cohort counts; never copy user-level records to the web root.
const fs = require('node:fs');
const path = require('node:path');
const { toPublicSnapshot } = require('../tools/cloudbase-registered-retention');
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/export-registered-retention-snapshot.js <verified-summary.json>');
const snapshot = toPublicSnapshot(JSON.parse(fs.readFileSync(input, 'utf8')));
const output = path.resolve(__dirname, '../artifacts/cloudbase-retention-report/registered-cohorts.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Exported ${snapshot.cohorts.length} anonymous cohorts; cutoff ${snapshot.cutoff}`);
