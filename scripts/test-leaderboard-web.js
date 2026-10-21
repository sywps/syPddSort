#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { requirePlaywright } = require('../tools/ai-runner/browser-session');
const { readGameSnapshot } = require('../tools/ai-runner/game-observer');
const { readLeaderboardSnapshot, homeReady, leaderboardReady } = require('../tools/ai-runner/leaderboard-observer');
const root = path.resolve(__dirname, '..');
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const append = (file, data) => fs.appendFileSync(file, JSON.stringify(data) + '\n');

function options(args) {
    const opts = { url: 'http://127.0.0.1:7456/?scene=db%3A%2F%2Fassets%2FScenes%2FBoot.scene',
        rounds: 10, settleMs: 10000, browserChannel: 'chrome', headed: false, video: false };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--headed') opts.headed = true;
        else if (arg === '--video') opts.video = true;
        else if (arg === '--help') { console.log('node scripts/test-leaderboard-web.js [--url LOCAL_URL] [--rounds 10] [--settle-ms 10000] [--headed] [--video] [--out-dir DIR]'); return null; }
        else {
            const key = { '--url': 'url', '--rounds': 'rounds', '--settle-ms': 'settleMs', '--out-dir': 'outDir' }[arg];
            if (!key || !args[i + 1]) throw Error('Unknown or incomplete argument: ' + arg);
            opts[key] = args[++i];
        }
    }
    const url = new URL(opts.url);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('Only local game URLs are supported');
    for (const [key, min, max] of [['rounds', 1, 100], ['settleMs', 1000, 60000]]) {
        opts[key] = Number(opts[key]);
        if (!Number.isInteger(opts[key]) || opts[key] < min || opts[key] > max) throw Error('Invalid ' + key);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    opts.outDir = path.resolve(root, opts.outDir || 'output/playwright/leaderboard-' + stamp);
    if (fs.existsSync(opts.outDir)) throw Error('Output directory already exists; evidence is never overwritten: ' + opts.outDir);
    return opts;
}

async function bounded(promise, ms, label) {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(label + ' timed out after ' + ms + 'ms')), ms);
    })]); } finally { clearTimeout(timer); }
}

async function run(config) {
    const out = config.outDir;
    fs.mkdirSync(path.join(out, 'screenshots'), { recursive: true });
    const tracked = ['assets/Scripts/Core/Panels/LeaderboardPanelController.ts',
        'assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts', 'assets/Scripts/Core/GameCtrlModules/FriendRankModule.ts',
        'assets/Scripts/Core/GameCtrlModules/CollectionAvatarModule.ts', 'assets/Scripts/Core/GameCtrlModules/GuideLeaderboardModule.ts',
        'assets/Scripts/Core/LeaderboardMgr.ts', 'assets/Scripts/Core/StartupRouteService.ts', 'assets/Scripts/Core/UiManifest.ts'];
    const source = tracked.map(name => ({ path: name, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex') }));
    const metadata = { ...config, scenario: 'leaderboard-repeat', initialTestStorage: { 'pdd.level': '11' },
        dataSource: 'local-preview', viewport: { width: 390, height: 844 },
        startedAt: new Date().toISOString(), source,
        head: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout?.trim(),
        boundary: 'Live Cocos preview with local leaderboard data; no WeChat cloud payload or native/GPU process memory acceptance.' };
    write(path.join(out, 'session-config.json'), metadata);
    const summary = { status: 'incomplete', flowStatus: 'incomplete', cloudDataCoverage: 'not-covered',
        memoryVerdict: 'observations-only', roundsRequested: config.rounds, roundsCompleted: 0,
        consoleErrors: 0, pageErrors: 0, networkFailures: 0, isolationBlocked: 0, errors: [], samples: [] };
    let browser, context, page, cdp, lastState, phase = 'launch';
    const pendingScriptHashes = [];
    const save = () => write(path.join(out, 'summary.json'), { ...summary, lastState, phase, updatedAt: new Date().toISOString() });
    async function state() {
        lastState = await bounded(page.evaluate(readLeaderboardSnapshot), 7000, 'Cocos observation');
        return lastState;
    }
    function assertHealthy() {
        if (summary.consoleErrors || summary.pageErrors || summary.networkFailures) throw Error('Observed console, page or network error; inspect evidence');
    }
    async function waitFor(predicate, label, ms = 20000) {
        const start = Date.now();
        while (Date.now() - start < ms) {
            const current = await state();
            assertHealthy();
            if (predicate(current)) return current;
            await page.waitForTimeout(200);
        }
        throw Error(label + ' not observed within ' + ms + 'ms');
    }
    async function screenshot(name) {
        await bounded(page.screenshot({ path: path.join(out, 'screenshots', name + '.png') }), 7000, 'Screenshot');
    }
    async function click(name, pathPart, round) {
        const observation = await bounded(page.evaluate(readGameSnapshot), 7000, 'Button observation');
        const matches = observation.buttons.filter(b => b.name === name && (!pathPart || b.path.includes(pathPart)));
        if (matches.length !== 1) throw Error('Expected exactly one visible input target ' + name + ', found ' + matches.length);
        const record = { ts: Date.now(), round, target: matches[0], before: lastState };
        write(path.join(out, 'last-action.json'), record);
        append(path.join(out, 'actions.ndjson'), record);
        await bounded(page.mouse.click(matches[0].point.x, matches[0].point.y), 5000, 'Mouse click');
    }
    async function sample(round, label, forcedGc = false) {
        if (forcedGc) await bounded(cdp.send('HeapProfiler.collectGarbage'), 15000, 'Diagnostic garbage collection');
        const engine = await state();
        const metrics = await cdp.send('Performance.getMetrics');
        const values = Object.fromEntries(metrics.metrics.map(m => [m.name, m.value]));
        const dom = await cdp.send('Memory.getDOMCounters');
        const item = { round, label, forcedGc, observedAt: new Date().toISOString(), engine,
            browser: { jsHeapUsedBytes: values.JSHeapUsedSize, jsHeapTotalBytes: values.JSHeapTotalSize,
                documents: dom.documents, domNodes: dom.nodes, eventListeners: dom.jsEventListeners } };
        summary.samples.push(item);
        append(path.join(out, 'samples.ndjson'), item);
        save();
        console.log(JSON.stringify({ round, label, forcedGc, nodes: engine.totalNodes,
            assets: engine.assetCount, textures: engine.textureCount, heapMiB: +(values.JSHeapUsedSize / 1048576).toFixed(2), rows: engine.visibleRows }));
        return item;
    }
    try {
        browser = await requirePlaywright().chromium.launch({ channel: config.browserChannel, headless: !config.headed });
        context = await browser.newContext({ viewport: metadata.viewport, deviceScaleFactor: 1,
            ...(config.video ? { recordVideo: { dir: path.join(out, 'video'), size: metadata.viewport } } : {}) });
        await context.tracing.start({ screenshots: true, snapshots: true });
        await context.addInitScript(() => localStorage.setItem('pdd.level', '11'));
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url());
            if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
                summary.isolationBlocked++;
                append(path.join(out, 'network.ndjson'), { type: 'isolation-blocked', method: request.method(), url: request.url() });
                await route.abort('blockedbyclient');
            } else await route.continue();
        });
        page = await context.newPage();
        page.on('console', msg => {
            if (msg.type() === 'error') summary.consoleErrors++;
            append(path.join(out, 'console.ndjson'), { ts: Date.now(), type: msg.type(), text: msg.text(), location: msg.location() });
        });
        page.on('pageerror', error => { summary.pageErrors++; append(path.join(out, 'page_errors.ndjson'), { ts: Date.now(), stack: error.stack }); });
        page.on('response', response => {
            if (response.status() >= 400 && !/\/favicon\.ico(?:\?|$)/.test(response.url())) {
                summary.networkFailures++; append(path.join(out, 'network.ndjson'), { type: 'http-error', url: response.url(), status: response.status() });
            }
            if (response.request().resourceType() === 'script') pendingScriptHashes.push(response.body().then(body => {
                append(path.join(out, 'served-scripts.ndjson'), { url: response.url(), bytes: body.length,
                    sha256: crypto.createHash('sha256').update(body).digest('hex') });
            }).catch(error => append(path.join(out, 'served-scripts.ndjson'), { url: response.url(), error: error.message })));
        });
        page.on('requestfailed', request => {
            const failure = request.failure()?.errorText || '';
            if (/BLOCKED_BY_CLIENT|blockedbyclient/i.test(failure)) return;
            summary.networkFailures++; append(path.join(out, 'network.ndjson'), { type: 'request-failed', url: request.url(), failure });
        });
        cdp = await context.newCDPSession(page);
        await cdp.send('Performance.enable');
        phase = 'startup';
        await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await waitFor(homeReady, 'Unobstructed homepage', 45000);
        await page.waitForTimeout(config.settleMs);
        await waitFor(homeReady, 'Stable homepage');
        await screenshot('00-home-baseline');
        await sample(0, 'baseline-raw');
        await sample(0, 'baseline-controlled-gc', true);
        for (let round = 1; round <= config.rounds; round++) {
            phase = 'round-' + round + '-open';
            await waitFor(homeReady, 'Homepage before opening');
            await click('LeaderboardBtn', '', round);
            await waitFor(leaderboardReady, 'Completed global tab and self row');
            // Let the existing popup animation and drawing complete without invoking game methods.
            await page.waitForTimeout(500);
            await waitFor(leaderboardReady, 'Visible settled leaderboard');
            const opened = await sample(round, 'opened');
            if (round === 1) summary.listFingerprint = JSON.stringify(opened.engine.rowText);
            else if (JSON.stringify(opened.engine.rowText) !== summary.listFingerprint) throw Error('Leaderboard contents changed between rounds');
            await screenshot(String(round).padStart(2, '0') + '-opened');
            phase = 'round-' + round + '-close';
            await click('XBtn', '/LeaderboardOverlay/', round);
            await waitFor(homeReady, 'Leaderboard closed and homepage restored');
            await page.waitForTimeout(config.settleMs);
            await waitFor(homeReady, 'Homepage after settling');
            await sample(round, 'closed-settled');
            await screenshot(String(round).padStart(2, '0') + '-closed');
            summary.roundsCompleted = round;
            assertHealthy();
            save();
        }
        phase = 'final-diagnostic';
        await sample(config.rounds, 'final-controlled-gc', true);
        assertHealthy();
        summary.flowStatus = 'passed';
        summary.status = 'completed-with-limitations';
    } catch (error) {
        summary.errors.push({ phase, message: error.message, stack: error.stack });
        summary.flowStatus = 'failed';
        summary.status = phase === 'launch' ? 'tool_failed' : 'failed';
        if (page) try { await screenshot('failure'); } catch (captureError) { summary.errors.push({ phase: 'capture', message: captureError.message }); }
    } finally {
        await Promise.allSettled(pendingScriptHashes);
        if (context) {
            try { await bounded(context.tracing.stop({ path: path.join(out, 'trace.zip') }), 10000, 'Trace save'); }
            catch (error) { summary.errors.push({ phase: 'trace', message: error.message }); summary.status = 'evidence_incomplete'; }
            try { await bounded(context.close(), 15000, 'Video finalization'); }
            catch (error) { summary.errors.push({ phase: 'video', message: error.message }); summary.status = 'evidence_incomplete'; }
        }
        if (browser) await browser.close();
        summary.finishedAt = new Date().toISOString();
        save();
    }
    const lines = ['# 排行榜 Web 专项测试', '', `- 状态：${summary.status}；流程：${summary.flowStatus}`,
        `- 完成 ${summary.roundsCompleted}/${config.rounds} 轮；关闭等待 ${config.settleMs}ms。`,
        '- 数据来源：本地预览，不是微信全国榜数据；可能为空列表，未注入榜单或头像样本。',
        '- 初始存档仅设置 pdd.level=11 以进入首页；新建浏览器 context，与个人存档隔离。',
        '- 通过真实鼠标点击，场景和资源只读观察，不调用打开/关闭等业务方法。',
        '- JS堆不是进程总内存；贴图RGBA8像素估算不是实测GPU内存；首尾强制GC样本单独标注。',
        `- 连续视频：${config.video ? '已请求，检查video目录及证据错误' : '未采集；默认保留逐轮截图、操作和trace。--video需要Playwright ffmpeg可用。'}`,
        '- 页面源码与当前checkout的对应仅通过元数据/源文件和实际加载脚本指纹记录；不冒充微信基准包。',
        '', '| 轮次 | 阶段 | JS堆 MiB | 场景节点 | 资源 | 贴图 | 缓存帧 | 榜单owner | 榜单行 |',
        '|---|---|---:|---:|---:|---:|---:|---:|---:|',
        ...summary.samples.map(s => `| ${s.round} | ${s.label} | ${(s.browser.jsHeapUsedBytes / 1048576).toFixed(2)} | ${s.engine.totalNodes} | ${s.engine.assetCount} | ${s.engine.textureCount} | ${s.engine.cachedSpriteFrames} | ${s.engine.leaderboardOwners} | ${s.engine.visibleRows} |`),
        '', `Console错误 ${summary.consoleErrors}，页面异常 ${summary.pageErrors}，网络失败 ${summary.networkFailures}，隔离拦截 ${summary.isolationBlocked}。`,
        ...summary.errors.map(e => `- ${e.phase}: ${e.message}`), '',
        '证据：session-config.json、samples.ndjson、actions.ndjson、served-scripts.ndjson、screenshots、'
            + (config.video ? 'video、' : '') + 'trace.zip。', ''];
    fs.writeFileSync(path.join(out, 'report.md'), lines.join('\n'));
    console.log('REPORT: ' + path.join(out, 'report.md'));
    return summary;
}

module.exports = { options, run };
if (require.main === module) {
    Promise.resolve().then(() => options(process.argv.slice(2))).then(config => config && run(config))
        .then(summary => { if (summary && (summary.flowStatus !== 'passed' || summary.status !== 'completed-with-limitations')) process.exitCode = 1; })
        .catch(error => { console.error(error.stack); process.exitCode = 1; });
}
