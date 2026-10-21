'use strict';

const fs = require('fs');
const path = require('path');
const { createRng, requirePlaywright } = require('./browser-session');
const { readGameSnapshot } = require('./game-observer');
const { chooseAction, invariantFailures, createCoverage, updateCoverage } = require('./game-policy');

const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const append = (file, value) => fs.appendFileSync(file, JSON.stringify(value) + '\n');

async function bounded(promise, ms, label) {
    let timer;
    try {
        return await Promise.race([promise, new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error(label + ' timed out after ' + ms + 'ms')), ms);
        })]);
    } finally { clearTimeout(timer); }
}

function fingerprint(s) {
    return JSON.stringify([s.phase, s.level, s.round, s.guide, s.validActions, s.bufferCount,
        s.lockedCount, s.cells?.map(c => [c.current, c.locked])]);
}

function report(summary) {
    return ['# Local gameplay test', '', `- Status: ${summary.status}`,
        `- Scenario: ${summary.scenario}; seed: ${summary.seed}; steps: ${summary.steps}`,
        `- URL: ${summary.url}`, `- Edition: ${summary.edition || 'not observed'}`,
        `- Build timestamp: ${summary.buildManifest?.builtAt || 'unavailable; source/build correspondence not established'}`,
        `- Missing milestones: ${summary.coverage.missing.join(', ') || 'none'}`,
        `- Failures: ${summary.failureReasons.join('; ') || 'none observed'}`,
        `- Error: ${summary.error || 'none'}`, '',
        '## Coverage', ...summary.coverage.required.map(key => `- ${key}: ${summary.coverage.milestones[key] ? 'observed' : 'NOT OBSERVED'}`), '',
        '## Evidence and limits',
        '- session-config.json + actions.ndjson retain inputs, delays, seed and before/after states.',
        '- trace.zip, screenshots, states.ndjson, console.ndjson, page_errors.ndjson and network.ndjson retain diagnostics.',
        '- A fresh browser context isolates local saves. External non-GET/HEAD/OPTIONS requests are blocked.',
        `- External requests blocked for isolation: ${summary.isolationBlocked || 0}. Cloud functionality is not accepted by this test.`,
        '- Browser reward behavior does not validate WeChat/Douyin advertisements, sharing, login or devices.',
        '- Random seed/timed input replay does not guarantee identical asynchronous game behavior.',
        '- incomplete means the flow was not completed within the action/time budget; it is not a pass or a confirmed game defect.',
        '', `Last state: ${summary.lastState?.phase || 'unknown'}, level ${summary.lastState?.level || '?'}`,
    ].join('\n') + '\n';
}

async function run(config) {
    const out = config.outDir;
    fs.mkdirSync(path.join(out, 'screenshots'), { recursive: true });
    for (const name of ['actions', 'states', 'console', 'page_errors', 'network']) fs.writeFileSync(path.join(out, name + '.ndjson'), '');
    const persona = config.persona;
    const coverage = createCoverage(config.scenario);
    coverage.missing = coverage.required.slice();
    const rng = createRng(persona.seed);
    const start = Date.now();
    const summary = { persona: persona.name, scenario: config.scenario, seed: persona.seed, url: config.url,
        outDir: out, startedAt: config.startedAt, status: 'incomplete', steps: 0, coverage,
        failureReasons: [], consoleErrors: 0, pageErrors: 0, networkFailures: 0, isolationBlocked: 0 };
    let browser, context, page, state, lastTarget, lastFingerprint, lastProgress = start;
    const requestedLevel = Number(new URL(config.url).searchParams.get('level'));
    summary.requestedLevel = requestedLevel > 0 ? requestedLevel : null;
    let actionAttempts = 0;
    let phase = 'launch';
    const saveSummary = () => {
        summary.finishedAt = new Date().toISOString();
        summary.lastState = state;
        write(path.join(out, 'summary.json'), summary);
        fs.writeFileSync(path.join(out, 'report.md'), report(summary));
    };
    const capture = async name => {
        await bounded(page.screenshot({ path: path.join(out, 'screenshots', name + '.png'), timeout: 5000 }), 6000, 'screenshot');
    };
    try {
        browser = await requirePlaywright().chromium.launch({ headless: !persona.headed,
            ...(persona.browserChannel ? { channel: persona.browserChannel } : {}), timeout: 20000 });
        summary.browserVersion = browser.version();
        context = await browser.newContext({ viewport: persona.viewport });
        await context.tracing.start({ screenshots: true, snapshots: true });
        if (requestedLevel > 0) {
            // Initial test save only; CreatorWeb wraps this native storage before loading gameplay modules.
            await context.addInitScript(level => localStorage.setItem('pdd.creator-web.v1:pdd.creator.selectedLevel', String(level)), requestedLevel);
        }
        await context.route('**/*', async route => {
            const request = route.request();
            const target = new URL(request.url());
            const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
            if (!local && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
                summary.isolationBlocked++;
                append(path.join(out, 'network.ndjson'), { type: 'isolation-blocked', url: request.url(), method: request.method() });
                await route.abort('blockedbyclient');
            } else await route.continue();
        });
        page = await context.newPage();
        page.setDefaultTimeout(5000);
        page.on('console', msg => {
            if (msg.type() === 'error') summary.consoleErrors++;
            append(path.join(out, 'console.ndjson'), { ts: Date.now(), type: msg.type(), text: msg.text(), location: msg.location() });
        });
        page.on('pageerror', error => {
            summary.pageErrors++;
            append(path.join(out, 'page_errors.ndjson'), { ts: Date.now(), message: error.message, stack: error.stack });
        });
        page.on('response', response => {
            if (response.status() >= 400 && !/\/favicon\.ico(?:\?|$)/.test(response.url())) {
                summary.networkFailures++;
                append(path.join(out, 'network.ndjson'), { ts: Date.now(), type: 'http-error', url: response.url(), status: response.status() });
            }
        });
        page.on('requestfailed', request => {
            const failure = request.failure()?.errorText || '';
            if (/BLOCKED_BY_CLIENT|blockedbyclient/i.test(failure)) return;
            summary.networkFailures++;
            append(path.join(out, 'network.ndjson'), { ts: Date.now(), type: 'request-failed', url: request.url(), failure });
        });
        phase = 'navigation';
        await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        phase = 'observation';
        while (summary.steps < persona.maxSteps && Date.now() - start < persona.durationMs) {
            state = await bounded(page.evaluate(readGameSnapshot), 7000, 'game state observation');
            summary.edition = state.edition || summary.edition;
            if (state.edition === 'creator-web-immediate-reward' && !summary.buildManifest && !summary.manifestError) {
                try {
                    const response = await context.request.get(new URL('creator-web-manifest.json', config.url).href, { timeout: 3000 });
                    if (!response.ok()) throw Error('HTTP ' + response.status());
                    summary.buildManifest = await response.json();
                } catch (error) { summary.manifestError = error.message; }
            }
            append(path.join(out, 'states.ndjson'), { step: summary.steps, ...state });
            const done = updateCoverage(coverage, state);
            if (requestedLevel > 0 && coverage.initialLevel !== null && coverage.initialLevel !== requestedLevel) {
                summary.failureReasons.push(`requested-start-level-mismatch: expected ${requestedLevel}, observed ${coverage.initialLevel}`);
                break;
            }
            const failures = invariantFailures(state);
            if (summary.pageErrors) failures.push('unhandled-page-error');
            if (summary.consoleErrors > Number(persona.failureThresholds?.maxConsoleErrors ?? 0)) failures.push('console-error');
            if (summary.networkFailures > Number(persona.failureThresholds?.maxNetworkFailures ?? 0)) failures.push('network-error');
            if (failures.length) { summary.failureReasons.push(...failures); summary.status = 'failed'; break; }
            if (done) { summary.status = 'passed'; break; }
            const fp = fingerprint(state);
            if (fp !== lastFingerprint) { lastProgress = Date.now(); actionAttempts = 0; lastFingerprint = fp; }
            const startup = !coverage.milestones.gameplayReady;
            const stallBudget = startup ? 30000 : Math.max(20000, (state.carrierCount || 0) * 600);
            if (Date.now() - lastProgress > stallBudget && !state.expectedWait) {
                summary.failureReasons.push(startup ? 'startup-no-progress' : 'gameplay-no-progress');
                summary.status = state.observationError ? 'tool_failed' : 'failed';
                break;
            }
            if (summary.steps === 0 || summary.steps % persona.screenshotEverySteps === 0) await capture(String(summary.steps).padStart(4, '0'));
            const replay = config.replayActions?.[summary.steps];
            if (config.replayActions && !replay) break;
            let syncWaitMs = 0;
            if (replay?.action.type === 'click') {
                const syncStart = Date.now();
                while ((replay.before.phase !== state.phase || replay.before.level !== state.level)
                    && Date.now() - syncStart < 5000 && Date.now() - start < persona.durationMs) {
                    await page.waitForTimeout(100);
                    state = await bounded(page.evaluate(readGameSnapshot), 7000, 'replay state synchronization');
                    append(path.join(out, 'states.ndjson'), { step: summary.steps, replaySync: true, ...state });
                }
                syncWaitMs = Date.now() - syncStart;
                if (replay.before.phase !== state.phase || replay.before.level !== state.level) {
                    summary.failureReasons.push('replay-state-diverged');
                    break;
                }
            }
            const action = replay ? replay.action : chooseAction(state, config.scenario, rng, lastTarget);
            const delayMs = replay ? replay.delayMs : action.reason === 'board-cell' && config.scenario === 'revive' ? 100 : 300;
            const record = { step: summary.steps + 1, ts: Date.now(), before: { phase: state.phase, level: state.level,
                round: state.round, validActions: state.validActions, lockedCount: state.lockedCount, bufferCount: state.bufferCount },
                action, delayMs, ...(replay ? { syncWaitMs, recordedBefore: replay.before } : {}) };
            // Persist attempted input before execution so a hang does not erase the triggering action.
            write(path.join(out, 'last-action.json'), record);
            phase = 'input';
            if (action.type === 'click') {
                if (!Number.isFinite(action.x) || !Number.isFinite(action.y)) throw Error('Invalid replay/input coordinates');
                await bounded(page.mouse.click(action.x, action.y), 5000, 'browser input');
                actionAttempts++;
                if (action.reason === 'board-cell') lastTarget = action.target;
            }
            updateCoverage(coverage, state, action);
            await page.waitForTimeout(delayMs);
            summary.steps++;
            append(path.join(out, 'actions.ndjson'), record);
            phase = 'observation';
            saveSummary();
        }
        if (page) await capture('final');
    } catch (error) {
        summary.error = error.message;
        summary.failureReasons.push(phase + '-failure');
        summary.status = coverage.milestones.gameplayReady && /timed out/.test(error.message) ? 'failed' : 'tool_failed';
        if (page) {
            try { await capture('failure'); } catch (captureError) { summary.captureError = captureError.message; }
        }
    } finally {
        if (context) {
            try { await bounded(context.tracing.stop({ path: path.join(out, 'trace.zip') }), 8000, 'trace save'); }
            catch (error) { summary.traceError = error.message; }
        }
        if (browser) {
            try { await bounded(browser.close(), 5000, 'browser close'); }
            catch (error) { summary.closeError = error.message; }
        }
        summary.unacknowledgedInputAttempts = actionAttempts;
        saveSummary();
    }
    return summary;
}

module.exports = { run, bounded, fingerprint };
