#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const automator = require('miniprogram-automator');

const projectPath = path.resolve(__dirname, '..', 'build', 'wechatgame');
const screenshotPath = path.resolve(__dirname, '..', 'artifacts', 'wechat-runtime.png');

async function main() {
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    const miniProgram = await automator.launch({
        cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
        projectPath,
        port: 9420,
        trustProject: true,
        timeout: 60000,
    });
    const consoleEntries = [];
    const exceptions = [];
    miniProgram.on('console', (entry) => consoleEntries.push(entry));
    miniProgram.on('exception', (entry) => exceptions.push(entry));
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const systemInfo = await miniProgram.systemInfo();
    const globals = await miniProgram.evaluate(() => ({
        buildId: globalThis.__PDD_CLIENT_BUILD_ID__ || '',
        platform: globalThis.__PDD_BUILD_PLATFORM__ || '',
        startupTrace: globalThis.__PDD_STARTUP_TRACE__ || null,
    }));
    await miniProgram.screenshot({ path: screenshotPath });
    console.log(JSON.stringify({ systemInfo, globals, consoleEntries, exceptions, screenshotPath }, null, 2));
    miniProgram.disconnect();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
