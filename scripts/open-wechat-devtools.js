#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const DEFAULT_PROJECT = path.join(projectRoot, 'build', 'wechatgame');
const DEFAULT_CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';

function fail(message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        fail('读取 JSON 失败: ' + filePath + ' ' + error.message);
    }
}

function parseArgs(argv) {
    const args = {
        project: DEFAULT_PROJECT,
        mode: 'open',
        openPort: process.env.WECHAT_DEVTOOLS_OPEN_PORT || '',
        autoPort: process.env.WECHAT_DEVTOOLS_AUTO_PORT || '',
        cli: process.env.WECHAT_DEVTOOLS_CLI || DEFAULT_CLI,
        debug: true,
        dryRun: false,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        const next = argv[i + 1];
        if (token === '--project' && next) {
            args.project = next;
            i += 1;
        } else if (token === '--mode' && next) {
            args.mode = next;
            i += 1;
        } else if (token === '--port' && next) {
            args.openPort = next;
            args.autoPort = next;
            i += 1;
        } else if (token === '--open-port' && next) {
            args.openPort = next;
            i += 1;
        } else if (token === '--automator-port' && next) {
            args.autoPort = next;
            i += 1;
        } else if (token === '--cli' && next) {
            args.cli = next;
            i += 1;
        } else if (token === '--no-debug') {
            args.debug = false;
        } else if (token === '--dry-run') {
            args.dryRun = true;
        } else if (token === '--help' || token === '-h') {
            printUsage();
            process.exit(0);
        } else {
            fail('未知参数: ' + token);
        }
    }

    if (!['open', 'auto', 'both'].includes(args.mode)) {
        fail('mode 必须是 open / auto / both: ' + args.mode);
    }
    return args;
}

function printUsage() {
    console.log(`Usage:
  node scripts/open-wechat-devtools.js [--project /ABS/build/wechatgame]
  node scripts/open-wechat-devtools.js --mode auto
  node scripts/open-wechat-devtools.js --mode both --open-port 34653 --automator-port 9420

Options:
  --project PATH       微信小游戏包目录，默认 build/wechatgame
  --mode MODE          open / auto / both，默认 open
  --port PORT          同时设置 open 与 auto 命令使用的 CLI --port
  --open-port PORT     open 命令使用的 CLI --port；默认不强制端口，复用当前 IDE server
  --automator-port P   auto 命令使用的 CLI --port；默认不强制端口，复用当前 IDE server
  --cli PATH           微信开发者工具 CLI 路径
  --no-debug           不传 --debug
  --dry-run            只做包检查并打印命令，不启动工具
`);
}

function assertDir(dir, label) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        fail(label + ' 不存在或不是目录: ' + dir);
    }
}

function assertFile(filePath, label) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        fail(label + ' 不存在: ' + filePath);
    }
}

function normalizeRoot(root) {
    return String(root || '').replace(/^\/+|\/+$/g, '');
}

function resolveMinigameRoot(projectDir, projectConfig) {
    const configuredRoot = normalizeRoot(projectConfig.miniprogramRoot || 'minigame');
    const root = path.join(projectDir, configuredRoot || 'minigame');
    assertDir(root, 'miniprogramRoot');
    return root;
}

function assertWechatPackage(projectDir) {
    assertDir(projectDir, '微信项目目录');

    const projectConfigPath = path.join(projectDir, 'project.config.json');
    assertFile(projectConfigPath, 'project.config.json');
    const projectConfig = readJson(projectConfigPath);
    if (projectConfig.compileType !== 'game') {
        fail('project.config.json compileType 必须是 game: ' + String(projectConfig.compileType || '<empty>'));
    }

    const minigameRoot = resolveMinigameRoot(projectDir, projectConfig);
    const gameJsonPath = path.join(minigameRoot, 'game.json');
    assertFile(gameJsonPath, 'minigame/game.json');
    assertFile(path.join(minigameRoot, 'game.js'), 'minigame/game.js');
    const gameJson = readJson(gameJsonPath);

    const subpackages = Array.isArray(gameJson.subpackages) ? gameJson.subpackages : [];
    const localMainDir = path.join(minigameRoot, 'assets', 'main');
    assertDir(localMainDir, '本地 bundle main root');
    const requiredSubpackages = ['bootstrap', 'homeAssets', 'gameAssets'];
    for (const name of requiredSubpackages) {
        const entry = subpackages.find((item) => item && item.name === name);
        if (!entry) fail('game.json 缺少分包: ' + name);
        const root = normalizeRoot(entry.root);
        assertDir(path.join(minigameRoot, root), '分包 ' + name + ' root');
    }

    const openDataContext = normalizeRoot(gameJson.openDataContext);
    if (openDataContext) {
        const openDataContextDir = path.join(minigameRoot, openDataContext);
        assertDir(openDataContextDir, 'openDataContext');
        assertFile(path.join(openDataContextDir, 'game.js'), 'openDataContext/game.js');
    }
}

function commandFor(args, command) {
    const port = command === 'auto' ? args.autoPort : args.openPort;
    const cliArgs = [command, '--project', args.project];
    if (port) cliArgs.push('--port', String(port));
    if (command === 'auto') cliArgs.push('--trust-project');
    if (args.debug) cliArgs.push('--debug');
    return cliArgs;
}

function runCli(args, command) {
    const cliArgs = commandFor(args, command);
    console.log('[wechat-devtools] ' + args.cli + ' ' + cliArgs.join(' '));
    if (args.dryRun) return;
    const result = spawnSync(args.cli, cliArgs, {
        cwd: projectRoot,
        env: process.env,
        stdio: 'inherit',
        shell: false,
    });
    if (result.error) fail(result.error.message);
    if (result.status !== 0) {
        fail('微信开发者工具 CLI 执行失败: command=' + command + ' status=' + result.status);
    }
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    args.project = path.resolve(args.project);
    args.cli = path.resolve(args.cli);

    if (process.platform !== 'darwin') {
        fail('当前脚本只支持 macOS 微信开发者工具 CLI');
    }
    assertFile(args.cli, '微信开发者工具 CLI');
    assertWechatPackage(args.project);

    if (args.mode === 'open' || args.mode === 'both') runCli(args, 'open');
    if (args.mode === 'auto' || args.mode === 'both') runCli(args, 'auto');
}

main();
