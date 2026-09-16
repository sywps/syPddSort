#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');
const { shanghaiDayRange, createApiKeyBundle } = require('./user-behavior-daily-job');
const { readCollection } = require('./social-report-job');
const ROOT = path.resolve(__dirname, '..');
const DAY = 86400000;
const today = (now) => new Date(now + 8 * 3600000).toISOString().slice(0, 10);

function parseArgs(argv, now = Date.now()) {
    const args = { from: '2026-08-31', to: today(now), outRoot: path.join(ROOT, 'artifacts/cloudbase-daily-report'), dryRun: false, help: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--dry-run') { args.dryRun = true; continue; }
        if (argv[i] === '--help' || argv[i] === '-h') { args.help = true; continue; }
        const key = { '--from': 'from', '--to': 'to', '--out-root': 'outRoot' }[argv[i]];
        assert.ok(key && argv[i + 1] && !argv[i + 1].startsWith('--'), '参数无效或缺少值');
        args[key] = argv[++i];
    }
    for (const value of [args.from, args.to]) {
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(value), '日期需为YYYY-MM-DD');
        assert.equal(new Date(value + 'T00:00:00Z').toISOString().slice(0, 10), value, '日期不存在');
    }
    assert.ok(args.from <= args.to && args.to <= today(now), '日期范围倒置或包含未来日期');
    const start = shanghaiDayRange(args.from).startMs, end = shanghaiDayRange(args.to).startMs;
    assert.ok((end - start) / DAY < 90, '单次最多90个自然日，请拆分');
    args.days = [];
    for (let t = start; t <= end; t += DAY) args.days.push(today(t));
    args.outRoot = path.resolve(ROOT, args.outRoot);
    return args;
}

function writeJson(file, value) {
    const lines = JSON.stringify(value, null, 2).split('\n'), temp = file + '.tmp';
    fs.writeFileSync(temp, '', { mode: 0o600 });
    for (let i = 0; i < lines.length; i += 200) fs.appendFileSync(temp, lines.slice(i, i + 200).join('\n') + '\n');
    fs.renameSync(temp, file);
}

function runChild(script, args) {
    // Existing daily CLI prints full summaries; suppress them rather than leaking IDs or error bodies.
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(__dirname, script), ...args], { cwd: ROOT, stdio: 'ignore' });
        child.on('error', () => reject(new Error(`${script}无法启动`)));
        child.on('close', code => code === 0 ? resolve() : reject(new Error(`${script}失败（exit=${code}），检查认证、网络与数据权限；未继续下一天`)));
    });
}

async function exportFunnel(date, dir, bundle) {
    const range = shanghaiDayRange(date), end = Math.min(Date.now(), range.endMs);
    const { rows, coverage } = await readCollection(bundle, 'first_level_funnel', 'timestamp', end, fetch, range.startMs);
    const folder = path.join(dir, 'first_level_funnel'); fs.mkdirSync(folder, { recursive: true });
    const target = path.join(folder, `database_export-${bundle.envId}-first_level_funnel-${date}.json`), temp = target + '.tmp';
    fs.writeFileSync(temp, '', { mode: 0o600 });
    for (let i = 0; i < rows.length; i += 200) fs.appendFileSync(temp, rows.slice(i, i + 200).map(row => JSON.stringify(row)).join('\n') + '\n');
    fs.renameSync(temp, target);
    writeJson(path.join(dir, 'funnel_partition_coverage.json'), { date, observationEnd: new Date(end).toISOString(), partial: end < range.endMs, uniqueIds: rows.length, ...coverage });
}

async function run(args, dependencies = {}) {
    const plan = { from: args.from, to: args.to, days: args.days, outRoot: args.outRoot, includesSocial: true };
    if (args.dryRun) { console.log(JSON.stringify(plan, null, 2)); return plan; }
    const bundle = dependencies.bundle || createApiKeyBundle();
    assert.equal(bundle.envId, 'cloud1-d5gzq8ia0c404ee3e', '未确认的CloudBase环境');
    const child = dependencies.child || runChild, funnel = dependencies.funnel || exportFunnel;
    fs.mkdirSync(args.outRoot, { recursive: true });
    const lock = path.join(args.outRoot, '.range-job.lock');
    const fd = fs.openSync(lock, 'wx', 0o600); fs.closeSync(fd);
    let runDir;
    try { runDir = fs.mkdtempSync(path.join(args.outRoot, '.range-run-')); }
    catch (error) { fs.unlinkSync(lock); throw error; }
    const manifest = { ...plan, startedAt: new Date().toISOString(), status: 'running', completed: [], currentDate: null, backupRoot: path.join(runDir, 'backups') };
    const manifestPath = path.join(runDir, 'status.json');
    try {
        writeJson(manifestPath, manifest);
        for (const date of args.days) {
            manifest.currentDate = date; writeJson(manifestPath, manifest);
            const dir = path.join(args.outRoot, date), backup = path.join(manifest.backupRoot, date);
            const hadExisting = fs.existsSync(dir);
            if (hadExisting) { fs.mkdirSync(path.dirname(backup), { recursive: true }); fs.cpSync(dir, backup, { recursive: true, errorOnExist: true, force: false }); }
            console.log(`[${date}] 开始；${hadExisting ? `已有文件备份至 ${backup}` : '新建日报'}`);
            await child('user-behavior-daily-job.js', ['--date', date, '--collections', 'user_behavior,level_record,ad_stat,daily_stat', '--out-dir', dir]);
            await funnel(date, dir, bundle);
            await child('user-behavior-daily-job.js', ['--date', date, '--reuse-existing', '--out-dir', dir]);
            await child('social-report-job.js', ['--date', date, '--out-root', args.outRoot]);
            const combined = JSON.parse(fs.readFileSync(path.join(dir, 'combined_summary.json'), 'utf8'));
            const social = JSON.parse(fs.readFileSync(path.join(dir, 'social_summary.json'), 'utf8'));
            assert.equal(combined.date, date); assert.equal(social.date, date);
            for (const name of ['user_behavior', 'level_record', 'ad_stat', 'daily_stat', 'first_level_funnel']) assert.ok(combined.collections[name], `缺少${name}`);
            assert.ok(social.coop.status === 'available' && social.pvp.status === 'available', '合作或PvP数据不可得');
            manifest.completed.push(date); writeJson(manifestPath, manifest);
            console.log(`[${date}] 完成`);
        }
        manifest.status = 'complete'; manifest.currentDate = null;
        manifest.finishedAt = new Date().toISOString(); writeJson(manifestPath, manifest);
        console.log(`全部完成；清单：${manifestPath}`);
        console.log(`http://127.0.0.1:8080/tools/cloudbase-report.html?date=${args.to}`);
        return manifest;
    } catch (error) {
        manifest.status = 'failed'; manifest.error = error.message; writeJson(manifestPath, manifest);
        throw new Error(`${manifest.currentDate || '初始化'}未完成；当前日可能有部分更新，请勿当成完整日报。详情和备份：${manifestPath}`);
    } finally { fs.unlinkSync(lock); }
}

module.exports = { parseArgs, run, exportFunnel };
if (require.main === module) {
    Promise.resolve().then(() => {
        const args = parseArgs(process.argv.slice(2));
        if (args.help) return console.log('npm run analytics:range -- [--from 2026-08-31] [--to YYYY-MM-DD] [--out-root PATH] [--dry-run]\n默认截至北京时间今天，包含合作与PvP；仅生成本地数据，不启动服务器。');
        return run(args);
    }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
