// Browser harness for runner failure reporting, not a substitute for real-game acceptance.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./semantic-session');

test('real browser reports incomplete flow, unhandled JS and HTTP failures with evidence', { timeout: 60000 }, async () => {
    const server = http.createServer((req, res) => {
        if (req.url === '/missing.js') { res.writeHead(503); res.end('deliberate test failure'); return; }
        res.setHeader('Content-Type', 'text/html');
        const script = req.url === '/js-error' ? '<script>setTimeout(()=>{throw Error("deliberate-runner-negative-case")},10)</script>'
            : req.url === '/frozen-page' ? '<script>setTimeout(()=>{while(true){}},100)</script>'
            : req.url === '/http-error' ? '<script src="/missing.js"></script>' : '';
        res.end('<!doctype html><title>Runner verification fixture</title><canvas width="80" height="80"></canvas>' + script);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const root = path.resolve('output/playwright/autoplay-negative-cases', String(Date.now()));
    try {
        for (const [route, expected] of [['/empty', 'incomplete'], ['/js-error', 'failed'], ['/http-error', 'failed'], ['/frozen-page', 'tool_failed']]) {
            const outDir = path.join(root, route.slice(1));
            const summary = await run({ scenario: 'core', url: `http://127.0.0.1:${server.address().port}${route}`,
                outDir, startedAt: new Date().toISOString(), persona: { name: 'negative-case', seed: 0,
                    browserChannel: 'chrome', maxSteps: 1, durationMs: 15000,
                    viewport: { width: 450, height: 800 }, screenshotEverySteps: 1 } });
            assert.equal(summary.status, expected, JSON.stringify(summary));
            assert.ok(summary.coverage.missing.length > 0);
            for (const file of ['summary.json', 'report.md', 'states.ndjson', 'trace.zip']) assert.ok(fs.existsSync(path.join(outDir, file)), file);
            if (route === '/js-error') {
                assert.ok(summary.pageErrors > 0);
                assert.match(fs.readFileSync(path.join(outDir, 'page_errors.ndjson'), 'utf8'), /deliberate-runner-negative-case/);
            }
            if (route === '/http-error') assert.ok(summary.networkFailures > 0);
            if (route === '/frozen-page') assert.match(summary.error, /timed out|Timeout/);
        }
    } finally { await new Promise(resolve => server.close(resolve)); }
});
