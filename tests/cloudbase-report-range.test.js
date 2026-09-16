'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs, run } = require('../scripts/cloudbase-report-range');
const { readCollection } = require('../scripts/social-report-job');

async function main() {
    const now = Date.parse('2026-09-14T16:30:00Z');
    const defaults = parseArgs([], now);
    assert.equal(defaults.from, '2026-08-31'); assert.equal(defaults.to, '2026-09-15'); assert.equal(defaults.days.length, 16);
    assert.throws(() => parseArgs(['--from', '2026-02-30'], now));
    assert.throws(() => parseArgs(['--to', '2026-09-16'], now));
    assert.throws(() => parseArgs(['--from', '2026-09-15', '--to', '2026-09-14'], now));
    assert.throws(() => parseArgs(['--wat'], now));
    assert.throws(() => parseArgs(['--from', '2026-01-01'], now));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pdd-range-test-'));
    const dryRoot = path.join(root, 'dry');
    await run(parseArgs(['--dry-run', '--out-root', dryRoot], now));
    assert.ok(!fs.existsSync(dryRoot), 'dry-run must not write or request credentials');
    const args = parseArgs(['--from', '2026-09-14', '--to', '2026-09-15', '--out-root', path.join(root, 'success')], now);
    const oldDir = path.join(args.outRoot, '2026-09-14'); fs.mkdirSync(oldDir, { recursive: true });
    fs.writeFileSync(path.join(oldDir, 'original.txt'), 'keep me');
    const calls = [];
    const dependencies = {
        bundle: { envId: 'cloud1-d5gzq8ia0c404ee3e' },
        funnel: async (date, dir) => { calls.push(`${date}:funnel`); assert.ok(fs.existsSync(dir)); },
        child: async (script, argv) => {
            const date = argv[argv.indexOf('--date') + 1]; calls.push(`${date}:${script}:${argv.includes('--reuse-existing')}`);
            const dir = script === 'social-report-job.js' ? path.join(args.outRoot, date) : argv[argv.indexOf('--out-dir') + 1];
            fs.mkdirSync(dir, { recursive: true });
            if (script === 'social-report-job.js') {
                fs.writeFileSync(path.join(dir, 'social_summary.json'), JSON.stringify({ date, coop: { status: 'available' }, pvp: { status: 'available' } }));
            } else {
                const collections = Object.fromEntries(['user_behavior', 'level_record', 'ad_stat', 'daily_stat', 'first_level_funnel'].map(n => [n, {}]));
                fs.writeFileSync(path.join(dir, 'combined_summary.json'), JSON.stringify({ date, collections }));
            }
        },
    };
    const result = await run(args, dependencies);
    assert.equal(result.status, 'complete'); assert.deepEqual(result.completed, args.days); assert.equal(calls.length, 8);
    assert.ok(calls[1].endsWith(':funnel') && calls[2].endsWith(':true'));
    assert.equal(fs.readFileSync(path.join(result.backupRoot, '2026-09-14/original.txt'), 'utf8'), 'keep me');
    assert.ok(!fs.existsSync(path.join(args.outRoot, '.range-job.lock')));
    const failedArgs = { ...args, outRoot: path.join(root, 'failure') };
    let attempts = 0;
    await assert.rejects(run(failedArgs, { ...dependencies, child: async () => { attempts++; throw Error('fixture failure'); } }), /2026-09-14未完成/);
    assert.equal(attempts, 1); assert.ok(!fs.existsSync(path.join(failedArgs.outRoot, '2026-09-15')));
    const failedRun = fs.readdirSync(failedArgs.outRoot).find(n => n.startsWith('.range-run-'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(failedArgs.outRoot, failedRun, 'status.json'))).status, 'failed');
    const bundle = { baseUrl: 'https://fixture.invalid', apiKey: 'fixture' };
    const records = Array.from({ length: 1001 }, (_, i) => ({ _id: String(i), timestamp: 100 + i }));
    const resultRange = await readCollection(bundle, 'test', 'timestamp', 1200, async url => {
        const q = JSON.parse(new URL(url).searchParams.get('query'));
        if (!q.$or) assert.ok(q.timestamp.$gte >= 100);
        return { ok: true, json: async () => ({ list: q.$or ? [] : records.filter(r => r.timestamp >= q.timestamp.$gte && r.timestamp < q.timestamp.$lt).slice(0, 1000) }) };
    }, 100);
    assert.equal(resultRange.rows.length, 1001); assert.equal(resultRange.coverage.slices[0].start, 100);
    console.log(`PASS: Shanghai dates, dry-run, per-day pipeline, backups, failure stop, nonzero partition start. Fixtures: ${root}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
