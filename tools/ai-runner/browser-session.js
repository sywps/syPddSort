#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let configForFailure = null;

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function appendNdjson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, JSON.stringify(data) + '\n');
}

function createRng(seed) {
    let state = Math.floor(Number(seed) || 1) >>> 0;
    return function rng() {
        state += 0x6D2B79F5;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pickWeighted(weights, rng) {
    const entries = Object.entries(weights)
        .map(([name, weight]) => [name, Math.max(0, Number(weight) || 0)])
        .filter(([, weight]) => weight > 0);
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let cursor = rng() * total;
    for (const [name, weight] of entries) {
        cursor -= weight;
        if (cursor <= 0) return name;
    }
    return entries[entries.length - 1][0];
}

function randomBetween(range, fallbackMin, fallbackMax, rng) {
    const min = Number(range && range.min);
    const max = Number(range && range.max);
    const safeMin = Number.isFinite(min) ? min : fallbackMin;
    const safeMax = Number.isFinite(max) ? max : fallbackMax;
    return safeMin + (safeMax - safeMin) * rng();
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function stableHash(value) {
    return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 8);
}

function ensurePng() {
    try {
        return require('pngjs').PNG;
    } catch (err) {
        throw new Error('pngjs is required for screenshot analysis. Run npm install first. ' + err.message);
    }
}

function requirePlaywright() {
    try {
        return require('playwright');
    } catch (directErr) {
        const pathEntries = String(process.env.PATH || '').split(path.delimiter);
        for (const entry of pathEntries) {
            if (!/node_modules[\\/]?\.bin$/.test(entry)) continue;
            const packageDir = path.resolve(entry, '..', 'playwright');
            if (!fs.existsSync(packageDir)) continue;
            try {
                return require(packageDir);
            } catch (pathErr) {
                directErr.message += '; PATH candidate failed: ' + pathErr.message;
            }
        }
        throw directErr;
    }
}

function analyzeScreenshot(buffer) {
    const PNG = ensurePng();
    const png = PNG.sync.read(buffer);
    const width = png.width;
    const height = png.height;
    const sampleStep = Math.max(1, Math.floor(Math.sqrt((width * height) / 12000)));
    let count = 0;
    let lumaTotal = 0;
    let dark = 0;

    for (let y = 0; y < height; y += sampleStep) {
        for (let x = 0; x < width; x += sampleStep) {
            const idx = (width * y + x) << 2;
            const r = png.data[idx];
            const g = png.data[idx + 1];
            const b = png.data[idx + 2];
            const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            lumaTotal += luma;
            if (luma < 12) dark += 1;
            count += 1;
        }
    }

    const avgLuma = count ? lumaTotal / count : 0;
    const darkRatio = count ? dark / count : 1;
    return {
        width,
        height,
        avgLuma: Number(avgLuma.toFixed(2)),
        darkRatio: Number(darkRatio.toFixed(4)),
        imageHash: averageHash(png),
    };
}

function averageHash(png) {
    const cells = 8;
    const values = [];
    for (let cy = 0; cy < cells; cy += 1) {
        for (let cx = 0; cx < cells; cx += 1) {
            const x = clamp(Math.floor((cx + 0.5) * png.width / cells), 0, png.width - 1);
            const y = clamp(Math.floor((cy + 0.5) * png.height / cells), 0, png.height - 1);
            const idx = (png.width * y + x) << 2;
            values.push(0.2126 * png.data[idx] + 0.7152 * png.data[idx + 1] + 0.0722 * png.data[idx + 2]);
        }
    }
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    let bits = '';
    for (const value of values) bits += value >= avg ? '1' : '0';
    return BigInt('0b' + bits).toString(16).padStart(16, '0');
}

async function readRuntimeState(page) {
    return page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const rect = canvas ? canvas.getBoundingClientRect() : null;
        const ccRoot = typeof window !== 'undefined' ? window.cc : null;
        let sceneName = '';
        try {
            sceneName = ccRoot && ccRoot.director && ccRoot.director.getScene
                ? (ccRoot.director.getScene()?.name || '')
                : '';
        } catch (err) {
            sceneName = '';
        }
        return {
            url: location.href,
            title: document.title,
            readyState: document.readyState,
            ccReady: !!ccRoot,
            sceneName,
            canvas: canvas ? {
                present: true,
                width: canvas.width || 0,
                height: canvas.height || 0,
                clientWidth: rect ? Math.round(rect.width) : 0,
                clientHeight: rect ? Math.round(rect.height) : 0,
                left: rect ? Math.round(rect.left) : 0,
                top: rect ? Math.round(rect.top) : 0,
            } : { present: false },
        };
    }).catch((err) => ({ evalError: err.message }));
}

function classifyState(runtime, metrics) {
    if (runtime.evalError) return 'RuntimeEvalError';
    if (!runtime.canvas || !runtime.canvas.present) return 'NoCanvas';
    if (metrics.darkRatio >= 0.985 && metrics.avgLuma < 10) return 'BlackScreen';
    if (runtime.sceneName) return 'Scene:' + runtime.sceneName;
    if (runtime.ccReady) return 'CocosReady';
    return 'Page:' + (runtime.readyState || 'unknown');
}

function recordState(graph, label) {
    graph.states[label] = (graph.states[label] || 0) + 1;
}

function recordEdge(graph, from, to, actionType) {
    const key = from + ' -> ' + to + ' [' + actionType + ']';
    graph.edges[key] = (graph.edges[key] || 0) + 1;
}

async function getCanvasBounds(page, viewport) {
    const rect = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return null;
        const box = canvas.getBoundingClientRect();
        return { left: box.left, top: box.top, width: box.width, height: box.height };
    }).catch(() => null);
    if (!rect || rect.width <= 0 || rect.height <= 0) {
        return { left: 0, top: 0, width: viewport.width, height: viewport.height };
    }
    const left = clamp(rect.left, 0, viewport.width - 1);
    const top = clamp(rect.top, 0, viewport.height - 1);
    const right = clamp(rect.left + rect.width, left + 1, viewport.width);
    const bottom = clamp(rect.top + rect.height, top + 1, viewport.height);
    return { left, top, width: right - left, height: bottom - top };
}

function pickZonePoint(bounds, persona, rng) {
    const zones = Array.isArray(persona.zones) && persona.zones.length ? persona.zones : [{ name: 'full', weight: 1 }];
    const weights = {};
    for (const zone of zones) weights[zone.name || stableHash(JSON.stringify(zone))] = zone.weight || 1;
    const selectedName = pickWeighted(weights, rng);
    const zone = zones.find((item) => (item.name || stableHash(JSON.stringify(item))) === selectedName) || zones[0];
    const xMin = Number.isFinite(zone.xMin) ? zone.xMin : 0;
    const xMax = Number.isFinite(zone.xMax) ? zone.xMax : 1;
    const yMin = Number.isFinite(zone.yMin) ? zone.yMin : 0;
    const yMax = Number.isFinite(zone.yMax) ? zone.yMax : 1;
    const x = bounds.left + bounds.width * (xMin + (xMax - xMin) * rng());
    const y = bounds.top + bounds.height * (yMin + (yMax - yMin) * rng());
    return {
        zone: zone.name || 'zone',
        x: Math.round(clamp(x, 0, bounds.left + bounds.width - 1)),
        y: Math.round(clamp(y, 0, bounds.top + bounds.height - 1)),
    };
}

async function performAction(page, persona, actionType, rng) {
    const viewport = page.viewportSize() || persona.viewport || { width: 960, height: 640 };
    const bounds = await getCanvasBounds(page, viewport);
    const point = pickZonePoint(bounds, persona, rng);
    if (actionType === 'wait') {
        return { type: actionType };
    }
    if (actionType === 'reload') {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: persona.navigationTimeoutMs || 30000 });
        return { type: actionType };
    }
    if (actionType === 'escape') {
        await page.keyboard.press('Escape');
        return { type: actionType };
    }
    if (actionType === 'doubleClick') {
        await page.mouse.dblclick(point.x, point.y);
        return { type: actionType, ...point };
    }
    if (actionType === 'drag') {
        const distance = randomBetween(persona.dragDistance, 80, 240, rng);
        const angle = rng() * Math.PI * 2;
        const target = {
            x: Math.round(clamp(point.x + Math.cos(angle) * distance, bounds.left, bounds.left + bounds.width - 1)),
            y: Math.round(clamp(point.y + Math.sin(angle) * distance, bounds.top, bounds.top + bounds.height - 1)),
        };
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
        await page.mouse.move(target.x, target.y, { steps: persona.dragSteps || 8 });
        await page.mouse.up();
        return { type: actionType, from: point, to: target };
    }
    await page.mouse.click(point.x, point.y);
    return { type: 'click', ...point };
}

async function observe(page, persona, outDir, step, reason, saveScreenshot, previousHash) {
    const screenshotsDir = path.join(outDir, 'screenshots');
    fs.mkdirSync(screenshotsDir, { recursive: true });
    const buffer = await page.screenshot({ fullPage: false });
    const metrics = analyzeScreenshot(buffer);
    const runtime = await readRuntimeState(page);
    const label = classifyState(runtime, metrics);
    const screenshotName = `${String(step).padStart(4, '0')}-${reason}-${label.replace(/[^a-z0-9_-]+/gi, '-')}.png`;
    const screenshotPath = path.join(screenshotsDir, screenshotName);
    if (saveScreenshot || label === 'BlackScreen' || label === 'NoCanvas') {
        fs.writeFileSync(screenshotPath, buffer);
    }
    return {
        step,
        reason,
        label,
        runtime,
        metrics,
        screenshot: (saveScreenshot || label === 'BlackScreen' || label === 'NoCanvas')
            ? path.relative(outDir, screenshotPath)
            : '',
        sameAsPrevious: previousHash ? previousHash === metrics.imageHash : false,
    };
}

function shouldIgnoreRequest(url) {
    return /\/favicon\.ico(?:$|\?)/i.test(url) || /^data:/i.test(url) || /^blob:/i.test(url);
}

function collectFailureReasons(counters, thresholds, noChangeStreak) {
    const reasons = [];
    if (counters.consoleErrors > thresholds.maxConsoleErrors) reasons.push('console errors exceeded');
    if (counters.pageErrors > thresholds.maxPageErrors) reasons.push('page errors exceeded');
    if (counters.networkFailures > thresholds.maxNetworkFailures) reasons.push('network failures exceeded');
    if (counters.blackScreens > thresholds.maxBlackScreens) reasons.push('black screens exceeded');
    if (counters.noCanvas > thresholds.maxNoCanvas) reasons.push('no canvas states exceeded');
    if (noChangeStreak > thresholds.maxNoChangeStreak) reasons.push('no visual change streak exceeded');
    return reasons;
}

function buildReport(summary, graph, failureReasons) {
    const topStates = Object.entries(graph.states).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const topEdges = Object.entries(graph.edges).sort((a, b) => b[1] - a[1]).slice(0, 16);
    const lines = [];
    lines.push('# AI Runner Persona Report');
    lines.push('');
    lines.push('- Persona: `' + summary.persona + '`');
    lines.push('- Status: `' + summary.status + '`');
    lines.push('- URL: ' + summary.url);
    lines.push('- Steps: ' + summary.steps);
    lines.push('- Unique states: ' + summary.uniqueStates);
    lines.push('- Unique edges: ' + summary.uniqueEdges);
    lines.push('- Console errors: ' + summary.consoleErrors);
    lines.push('- Page errors: ' + summary.pageErrors);
    lines.push('- Network failures: ' + summary.networkFailures);
    lines.push('- Screenshots: `screenshots/`');
    if (failureReasons.length) {
        lines.push('');
        lines.push('## Failure Reasons');
        for (const reason of failureReasons) lines.push('- ' + reason);
    }
    lines.push('');
    lines.push('## Top States');
    for (const [state, count] of topStates) lines.push('- `' + state + '`: ' + count);
    lines.push('');
    lines.push('## Top Edges');
    for (const [edge, count] of topEdges) lines.push('- `' + edge + '`: ' + count);
    lines.push('');
    lines.push('## Evidence');
    lines.push('- `actions.ndjson` records every action and state transition.');
    lines.push('- `console.ndjson`, `page_errors.ndjson`, and `network.ndjson` contain raw diagnostics.');
    return lines.join('\n') + '\n';
}

async function run(config) {
    const { chromium } = requirePlaywright();
    const persona = config.persona;
    const outDir = config.outDir;
    fs.mkdirSync(outDir, { recursive: true });

    const rng = createRng(persona.seed || Date.now());
    const thresholds = {
        maxConsoleErrors: Number(persona.failureThresholds?.maxConsoleErrors ?? 0),
        maxPageErrors: Number(persona.failureThresholds?.maxPageErrors ?? 0),
        maxNetworkFailures: Number(persona.failureThresholds?.maxNetworkFailures ?? 0),
        maxBlackScreens: Number(persona.failureThresholds?.maxBlackScreens ?? 0),
        maxNoCanvas: Number(persona.failureThresholds?.maxNoCanvas ?? 3),
        maxNoChangeStreak: Number(persona.failureThresholds?.maxNoChangeStreak ?? 24),
    };
    const counters = {
        consoleErrors: 0,
        pageErrors: 0,
        networkFailures: 0,
        blackScreens: 0,
        noCanvas: 0,
    };
    const graph = { states: {}, edges: {} };
    const startedAt = Date.now();
    const maxSteps = Math.max(1, Number(persona.maxSteps || 80));
    const durationMs = Math.max(1, Number(persona.durationMs || 120000));
    const screenshotEvery = Math.max(1, Number(persona.screenshotEverySteps || 10));

    const browser = await chromium.launch({ headless: !persona.headed });
    let page;
    let steps = 0;
    let noChangeStreak = 0;
    const failureReasons = [];

    try {
        const context = await browser.newContext({ viewport: persona.viewport || { width: 960, height: 640 } });
        page = await context.newPage();
        page.on('console', (msg) => {
            const entry = { ts: new Date().toISOString(), type: msg.type(), text: msg.text(), location: msg.location() };
            if (msg.type() === 'error') counters.consoleErrors += 1;
            appendNdjson(path.join(outDir, 'console.ndjson'), entry);
        });
        page.on('pageerror', (err) => {
            counters.pageErrors += 1;
            appendNdjson(path.join(outDir, 'page_errors.ndjson'), { ts: new Date().toISOString(), message: err.message, stack: err.stack });
        });
        page.on('requestfailed', (request) => {
            const url = request.url();
            if (shouldIgnoreRequest(url)) return;
            counters.networkFailures += 1;
            appendNdjson(path.join(outDir, 'network.ndjson'), {
                ts: new Date().toISOString(),
                url,
                method: request.method(),
                resourceType: request.resourceType(),
                failure: request.failure(),
            });
        });

        await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: persona.navigationTimeoutMs || 30000 });
        await page.waitForTimeout(Number(persona.initialWaitMs || 2500));

        let previous = await observe(page, persona, outDir, 0, 'initial', true, '');
        recordState(graph, previous.label);
        let previousHash = previous.metrics.imageHash;

        while (steps < maxSteps && Date.now() - startedAt < durationMs) {
            steps += 1;
            const actionType = pickWeighted(persona.actionWeights, rng);
            const action = await performAction(page, persona, actionType, rng);
            await page.waitForTimeout(Math.round(randomBetween(persona.waitMs, 120, 650, rng)));
            const saveScreenshot = steps % screenshotEvery === 0 || steps === 1;
            const current = await observe(page, persona, outDir, steps, action.type, saveScreenshot, previousHash);
            if (current.label === 'BlackScreen') counters.blackScreens += 1;
            if (current.label === 'NoCanvas') counters.noCanvas += 1;
            noChangeStreak = current.sameAsPrevious ? noChangeStreak + 1 : 0;
            recordState(graph, current.label);
            recordEdge(graph, previous.label, current.label, action.type);
            appendNdjson(path.join(outDir, 'actions.ndjson'), {
                ts: new Date().toISOString(),
                step: steps,
                from: previous.label,
                to: current.label,
                action,
                screenshot: current.screenshot,
                metrics: current.metrics,
            });
            previous = current;
            previousHash = current.metrics.imageHash;

            const nextReasons = collectFailureReasons(counters, thresholds, noChangeStreak);
            if (nextReasons.length && persona.stopOnFailure !== false) {
                failureReasons.push(...nextReasons);
                break;
            }
        }

        await observe(page, persona, outDir, steps, 'final', true, previousHash);
    } finally {
        await browser.close();
    }

    if (!failureReasons.length) {
        failureReasons.push(...collectFailureReasons(counters, thresholds, noChangeStreak));
    }
    const status = failureReasons.length ? 'failed' : 'passed';
    const summary = {
        persona: persona.name,
        description: persona.description,
        status,
        url: config.url,
        outDir,
        startedAt: config.startedAt,
        finishedAt: new Date().toISOString(),
        steps,
        uniqueStates: Object.keys(graph.states).length,
        uniqueEdges: Object.keys(graph.edges).length,
        consoleErrors: counters.consoleErrors,
        pageErrors: counters.pageErrors,
        networkFailures: counters.networkFailures,
        blackScreens: counters.blackScreens,
        noCanvas: counters.noCanvas,
        noChangeStreak,
        failureReasons,
    };
    writeJson(path.join(outDir, 'state_graph.json'), graph);
    writeJson(path.join(outDir, 'summary.json'), summary);
    fs.writeFileSync(path.join(outDir, 'report.md'), buildReport(summary, graph, failureReasons));
    if (status !== 'passed') process.exitCode = 1;
}

async function main() {
    const configPath = process.argv[2];
    if (!configPath) throw new Error('Usage: node tools/ai-runner/browser-session.js <session-config.json>');
    const config = readJson(path.resolve(configPath));
    configForFailure = config;
    await run(config);
}

main().catch((err) => {
    if (configForFailure && configForFailure.outDir) {
        fs.mkdirSync(configForFailure.outDir, { recursive: true });
        const summary = {
            persona: configForFailure.persona?.name || 'unknown',
            status: 'tool_failed',
            url: configForFailure.url,
            outDir: configForFailure.outDir,
            error: err.message,
            stack: err.stack,
            steps: 0,
        };
        writeJson(path.join(configForFailure.outDir, 'summary.json'), summary);
        fs.writeFileSync(path.join(configForFailure.outDir, 'report.md'), '# AI Runner Tool Failure\n\n' + err.stack + '\n');
    }
    console.error(err.stack || err.message);
    process.exit(1);
});
