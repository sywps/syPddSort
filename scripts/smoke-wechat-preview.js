#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const DEFAULT_URL = process.env.WECHAT_PREVIEW_URL || 'http://localhost:53981/';
const DEFAULT_OUT_DIR = path.resolve(__dirname, '..', 'temp', 'wechat-preview-smoke');
const FATAL_LOG_PATTERNS = [
    /\[ERROR\]/i,
    /Please load bundle gameAssets first/i,
    /gameAssets_bundle_missing_after_preload/i,
    /gameAssets_bean_assets_failed/i,
    /gameAssets_bean_assets_missing/i,
    /Unhandled/i,
    /ReferenceError/i,
    /TypeError/i,
];

function parseArgs(argv) {
    const result = {
        url: '',
        screenshot: '',
        logs: '',
        outDir: DEFAULT_OUT_DIR,
        minNonBlackRatio: Number(process.env.WECHAT_PREVIEW_MIN_NONBLACK_RATIO || 0.02),
        waitMs: Number(process.env.WECHAT_PREVIEW_WAIT_MS || 12000),
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--url') result.url = argv[++i] || '';
        else if (arg === '--screenshot') result.screenshot = argv[++i] || '';
        else if (arg === '--logs') result.logs = argv[++i] || '';
        else if (arg === '--out-dir') result.outDir = argv[++i] || '';
        else if (arg === '--min-nonblack-ratio') result.minNonBlackRatio = Number(argv[++i]);
        else if (arg === '--wait-ms') result.waitMs = Number(argv[++i]);
        else if (arg === '--help' || arg === '-h') {
            printUsage();
            process.exit(0);
        } else {
            fail('未知参数: ' + arg);
        }
    }
    if (!result.screenshot && !result.logs && !result.url && process.env.WECHAT_PREVIEW_URL) {
        result.url = DEFAULT_URL;
    }
    return result;
}

function printUsage() {
    console.log([
        'Usage:',
        '  node scripts/smoke-wechat-preview.js --screenshot <png> --logs <log.txt>',
        '  WECHAT_PREVIEW_URL=http://localhost:53981/ node scripts/smoke-wechat-preview.js --url http://localhost:53981/',
        '',
        'Checks:',
        '  - preview screenshot has enough non-black pixels',
        '  - preview logs do not contain startup fatal errors',
    ].join('\n'));
}

function fail(message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}

function assertFile(filePath, label) {
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        fail(label + ' 不存在: ' + filePath);
    }
}

function loadPng(filePath) {
    assertFile(filePath, '预览截图');
    return PNG.sync.read(fs.readFileSync(filePath));
}

function getNonBlackRatio(png) {
    let visible = 0;
    let nonBlack = 0;
    for (let i = 0; i < png.data.length; i += 4) {
        const alpha = png.data[i + 3];
        if (alpha < 8) continue;
        visible += 1;
        const r = png.data[i];
        const g = png.data[i + 1];
        const b = png.data[i + 2];
        if (Math.max(r, g, b) > 12) nonBlack += 1;
    }
    return visible > 0 ? nonBlack / visible : 0;
}

function validateScreenshot(filePath, minNonBlackRatio) {
    const png = loadPng(filePath);
    const ratio = getNonBlackRatio(png);
    if (ratio < minNonBlackRatio) {
        fail('预览截图疑似黑屏: nonBlackRatio=' + ratio.toFixed(4) + ', min=' + minNonBlackRatio);
    }
    return ratio;
}

function validateLogs(filePath) {
    assertFile(filePath, '预览日志');
    const text = fs.readFileSync(filePath, 'utf8');
    const badLine = text.split(/\r?\n/).find((line) => FATAL_LOG_PATTERNS.some((pattern) => pattern.test(line)));
    if (badLine) fail('预览日志包含启动致命错误: ' + badLine);
}

async function runPlaywrightSmoke(options) {
    let chromium;
    try {
        chromium = require('playwright').chromium;
    } catch (error) {
        fail('未找到 playwright。请改用 --screenshot/--logs 模式，或安装 playwright 后再用 --url 模式。');
    }
    fs.mkdirSync(options.outDir, { recursive: true });
    const screenshotPath = path.join(options.outDir, 'preview.png');
    const logsPath = path.join(options.outDir, 'preview.log');
    const logs = [];
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
        page.on('console', (message) => logs.push('[' + message.type().toUpperCase() + '] ' + message.text()));
        page.on('pageerror', (error) => logs.push('[ERROR] ' + (error && error.message ? error.message : String(error))));
        await page.goto(options.url || DEFAULT_URL, { waitUntil: 'load', timeout: 15000 });
        await page.waitForTimeout(Math.max(0, options.waitMs));
        await page.screenshot({ path: screenshotPath, fullPage: false });
    } finally {
        await browser.close();
        fs.writeFileSync(logsPath, logs.join('\n') + '\n');
    }
    const ratio = validateScreenshot(screenshotPath, options.minNonBlackRatio);
    validateLogs(logsPath);
    console.log('微信预览 smoke 通过: nonBlackRatio=' + ratio.toFixed(4));
    console.log('screenshot: ' + screenshotPath);
    console.log('logs: ' + logsPath);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.screenshot || options.logs) {
        if (!options.screenshot || !options.logs) fail('--screenshot 与 --logs 必须同时提供');
        const ratio = validateScreenshot(options.screenshot, options.minNonBlackRatio);
        validateLogs(options.logs);
        console.log('微信预览 smoke 通过: nonBlackRatio=' + ratio.toFixed(4));
        return;
    }
    if (!options.url) {
        printUsage();
        fail('缺少 smoke 输入：请提供 --url，或提供 --screenshot 与 --logs');
    }
    await runPlaywrightSmoke(options);
}

main().catch((error) => fail(error && error.message ? error.message : String(error)));
