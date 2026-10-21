#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectDir = path.resolve(__dirname, '..');
const personaDir = path.join(projectDir, 'tools', 'ai-runner', 'personas');
const workerPath = path.join(projectDir, 'tools', 'ai-runner', 'browser-session.js');
const defaultPreviewScene = 'db://assets/Scenes/Boot.scene';
const defaultUrl = 'http://localhost:7456/?scene=' + encodeURIComponent(defaultPreviewScene) + '&level=1&profile=local-test';

function fail(message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        fail('Failed to read JSON: ' + path.relative(projectDir, filePath) + ' ' + err.message);
    }
}

function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function parseArgs(argv) {
    const args = {
        target: 'web',
        url: defaultUrl,
        persona: 'smoke',
        allPersonas: false,
        headed: false,
        dryRun: false,
        scenario: 'random',
        runs: 1,
        playwrightPackage: process.env.AI_RUNNER_PLAYWRIGHT_PACKAGE || 'playwright',
        browserChannel: process.env.AI_RUNNER_BROWSER_CHANNEL || '',
    };

    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        const next = argv[i + 1];
        if (token === '--target' && next) {
            args.target = next;
            i += 1;
        } else if (token === '--url' && next) {
            args.url = next;
            i += 1;
        } else if ((token === '--persona' || token === '--profile') && next) {
            args.persona = next;
            i += 1;
        } else if (token === '--all-personas') {
            args.allPersonas = true;
        } else if (token === '--scenario' && next) {
            args.scenario = next;
            i += 1;
        } else if (token === '--levels' && next) {
            args.levels = next.split(',').map(Number);
            i += 1;
        } else if (token === '--runs' && next) {
            args.runs = Number(next);
            i += 1;
        } else if (token === '--replay' && next) {
            args.replay = path.resolve(next);
            i += 1;
        } else if (token === '--out-dir' && next) {
            args.outDir = next;
            i += 1;
        } else if (token === '--run-id' && next) {
            args.runId = next;
            i += 1;
        } else if (token === '--duration-ms' && next) {
            args.durationMs = Number(next);
            i += 1;
        } else if (token === '--steps' && next) {
            args.maxSteps = Number(next);
            i += 1;
        } else if (token === '--seed' && next) {
            args.seed = Number(next);
            i += 1;
        } else if (token === '--viewport' && next) {
            args.viewport = parseViewport(next);
            i += 1;
        } else if (token === '--screenshot-every' && next) {
            args.screenshotEverySteps = Number(next);
            i += 1;
        } else if (token === '--playwright-package' && next) {
            args.playwrightPackage = next;
            i += 1;
        } else if (token === '--browser-channel' && next) {
            args.browserChannel = next;
            i += 1;
        } else if (token === '--headed') {
            args.headed = true;
        } else if (token === '--dry-run') {
            args.dryRun = true;
        } else if (token === '--list-personas') {
            args.listPersonas = true;
        } else if (token === '--help' || token === '-h') {
            args.help = true;
        } else {
            fail('Unknown argument: ' + token);
        }
    }

    return args;
}

function validateArgs(args) {
    if (!['random', 'core', 'revive'].includes(args.scenario)) fail('--scenario must be random, core or revive');
    if (!Number.isSafeInteger(args.runs) || args.runs < 1 || args.runs > 100) fail('--runs must be 1..100');
    if (args.levels && (!args.levels.length || args.levels.some(n => !Number.isSafeInteger(n) || n < 1))) fail('--levels requires positive integers');
    if (args.levels && new Set(args.levels).size !== args.levels.length) fail('--levels must not contain duplicates');
    for (const key of ['maxSteps', 'durationMs', 'screenshotEverySteps']) {
        if (args[key] !== undefined && (!Number.isSafeInteger(args[key]) || args[key] < 1)) fail(key + ' must be a positive integer');
    }
    if (args.seed !== undefined && (!Number.isSafeInteger(args.seed) || args.seed < 0 || args.seed > 0xffffffff)) fail('--seed must be an unsigned 32-bit integer');
    let url;
    try { url = new URL(args.url); } catch { fail('Invalid --url'); }
    if (!['http:', 'https:'].includes(url.protocol)) fail('--url requires http(s)');
    if (args.scenario !== 'random' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
        fail('State-aware scenarios require a local preview URL');
    }
    if (args.replay && (args.levels || args.runs !== 1 || args.allPersonas)) fail('--replay cannot be combined with batch options');
}

function parseViewport(value) {
    const match = String(value).match(/^(\d+)x(\d+)$/i);
    if (!match) fail('Invalid viewport. Expected WIDTHxHEIGHT, got: ' + value);
    return {
        width: Math.max(1, Number(match[1])),
        height: Math.max(1, Number(match[2])),
    };
}

function printHelp() {
    console.log(`Usage:
  node scripts/ai-runner.js --target web --persona smoke
  node scripts/ai-runner.js --target web --all-personas
  node scripts/ai-runner.js --target web --persona explorer --duration-ms 60000 --steps 120

Options:
  --target web                 Only web preview is supported in phase 1-2.
  --scenario random|core|revive Random exploration, win/next-level flow, or failure/revive flow.
  --levels 1,3,15              Run each requested starting level (fresh browser context per session).
  --runs NUMBER                Repeat each session with different recorded seeds (1..100).
  --replay session-config.json Replay a state-aware session's recorded input/timing.
  --url URL                    Preview URL. Defaults to ${defaultUrl}
  --persona NAME               Persona JSON under tools/ai-runner/personas.
  --profile NAME               Alias for --persona.
  --all-personas               Run every persona except smoke.
  --duration-ms NUMBER         Override persona duration.
  --steps NUMBER               Override persona maxSteps.
  --seed NUMBER                Override random seed.
  --viewport WIDTHxHEIGHT      Override browser viewport.
  --screenshot-every NUMBER    Override screenshot cadence.
  --out-dir PATH               Override output root.
  --run-id NAME                Override run id.
  --playwright-package NAME    Override npx package. Defaults to playwright.
  --browser-channel NAME       Use a system browser channel, e.g. chrome.
  --headed                     Show browser window.
  --dry-run                    Validate config without launching browser.
  --list-personas              List available personas.
`);
}

function listPersonaNames() {
    if (!fs.existsSync(personaDir)) return [];
    return fs.readdirSync(personaDir)
        .filter((name) => /\.json$/i.test(name))
        .map((name) => name.replace(/\.json$/i, ''))
        .sort();
}

function loadPersona(name) {
    const filePath = path.join(personaDir, name + '.json');
    if (!fs.existsSync(filePath)) {
        fail('Persona not found: ' + name + '. Available: ' + listPersonaNames().join(', '));
    }
    const persona = readJson(filePath);
    if (!persona.name) persona.name = name;
    validatePersona(persona, filePath);
    return persona;
}

function validatePersona(persona, filePath) {
    const label = path.relative(projectDir, filePath);
    if (!persona.description) fail(label + ' missing description');
    if (!persona.actionWeights || typeof persona.actionWeights !== 'object') {
        fail(label + ' missing actionWeights');
    }
    const totalWeight = Object.values(persona.actionWeights).reduce((sum, value) => sum + Number(value || 0), 0);
    if (totalWeight <= 0) fail(label + ' actionWeights must contain a positive total weight');
    if (!persona.maxSteps && !persona.durationMs) {
        fail(label + ' must define maxSteps or durationMs');
    }
}

function applyOverrides(persona, args) {
    const next = JSON.parse(JSON.stringify(persona));
    if (args.scenario !== 'random') {
        Object.assign(next, { maxSteps: 1200, durationMs: 180000,
            viewport: { width: 450, height: 800 }, screenshotEverySteps: 10 });
    }
    for (const key of ['durationMs', 'maxSteps', 'seed', 'viewport', 'screenshotEverySteps']) {
        if (args[key] !== undefined) next[key] = args[key];
    }
    next.headed = args.headed;
    if (args.browserChannel) next.browserChannel = args.browserChannel;
    return next;
}

function timestampLabel(date) {
    return date.toISOString().replace(/[:.]/g, '-');
}

function dayLabel(date) {
    return date.toISOString().slice(0, 10);
}

function safeName(value) {
    return String(value || 'run').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'run';
}

function defaultOutputRoot(args, personas) {
    const now = new Date();
    const runId = safeName(args.runId || `${timestampLabel(now)}-${args.target}-${personas.map((item) => item.name).join('-')}`);
    return path.join(projectDir, 'artifacts', 'ai-runs', dayLabel(now), runId);
}

function runPersona(args, persona, rootOutDir) {
    const runOutDir = path.join(rootOutDir, safeName(persona.sessionName || persona.name));
    if (fs.existsSync(path.join(runOutDir, 'session-config.json'))) {
        fail('Session output already exists; choose a new --out-dir to preserve previous evidence: ' + runOutDir);
    }
    fs.mkdirSync(runOutDir, { recursive: true });
    const configPath = path.join(runOutDir, 'session-config.json');
    const config = {
        projectDir,
        target: args.target,
        url: args.url,
        outDir: runOutDir,
        persona,
        scenario: args.scenario,
        replayActions: args.replayActions,
        startedAt: new Date().toISOString(),
        source: {
            head: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, encoding: 'utf8' }).stdout?.trim() || 'unavailable',
            dirty: !!spawnSync('git', ['status', '--porcelain'], { cwd: projectDir, encoding: 'utf8' }).stdout?.trim(),
            note: 'Source checkout identity only; does not establish the served build version.',
        },
    };
    writeJson(configPath, config);

    // Invoke npm's JavaScript entry directly: spawning .cmd with shell:false fails with EINVAL on Windows.
    let launcher = 'npx';
    let prefix = [];
    if (process.platform === 'win32') {
        const npmRoots = [path.dirname(process.execPath), ...String(process.env.PATH || '').split(path.delimiter)];
        const npxCli = npmRoots.map(dir => path.join(dir, 'node_modules', 'npm', 'bin', 'npx-cli.js'))
            .find(file => fs.existsSync(file));
        if (!npxCli) throw Error('Cannot locate npm/bin/npx-cli.js; use the Node.js installation that includes npm');
        launcher = process.execPath;
        prefix = [npxCli];
    }
    const result = spawnSync(launcher, [...prefix,
        '--yes',
        '--package',
        args.playwrightPackage,
        'node',
        workerPath,
        configPath,
    ], {
        cwd: projectDir,
        env: process.env,
        stdio: 'inherit',
        shell: false,
        timeout: persona.durationMs + 90000,
        killSignal: 'SIGTERM',
    });

    const summaryPath = path.join(runOutDir, 'summary.json');
    const summary = fs.existsSync(summaryPath)
        ? readJson(summaryPath)
        : {
            persona: persona.name,
            status: 'tool_failed',
            outDir: runOutDir,
            error: result.error ? result.error.message : 'Worker did not write summary.json',
        };

    if (result.error) {
        summary.status = 'tool_failed';
        summary.error = result.error.message;
    } else if (result.status !== 0 && summary.status === 'passed') {
        summary.status = 'failed';
        summary.error = 'Worker exited with status ' + result.status;
    }
    writeJson(summaryPath, summary);
    return summary;
}

function buildCombinedReport(summary) {
    const lines = [];
    lines.push('# AI Runner Report');
    lines.push('');
    lines.push('- Target: `' + summary.target + '`');
    lines.push('- URL: ' + summary.url);
    lines.push('- Status: `' + summary.status + '`');
    lines.push('- Started at: ' + summary.startedAt);
    lines.push('- Output: `' + path.relative(projectDir, summary.outDir) + '`');
    lines.push('');
    lines.push('## Personas');
    for (const item of summary.personas) {
        lines.push('- `' + item.persona + '`: `' + item.status + '`, steps=' + (item.steps || 0)
            + ', states=' + (item.uniqueStates || 0)
            + ', edges=' + (item.uniqueEdges || 0)
            + ', consoleErrors=' + (item.consoleErrors || 0)
            + ', pageErrors=' + (item.pageErrors || 0)
            + ', networkFailures=' + (item.networkFailures || 0));
        if (item.coverage) lines.push('  - Missing milestones: ' + (item.coverage.missing.join(', ') || 'none'));
        if (item.error) lines.push('  - ' + item.error);
    }
    lines.push('');
    lines.push('## Next Debug Pointers');
    lines.push('- Open each persona subdirectory for `report.md`, `actions.ndjson`, `console.ndjson`, and screenshots.');
    lines.push('- Treat `tool_failed` as runner/environment failure, not proof of a game bug.');
    return lines.join('\n') + '\n';
}

function combinedStatus(summaries) {
    for (const status of ['failed', 'tool_failed', 'incomplete']) {
        if (summaries.some(item => item.status === status)) return status;
    }
    return 'passed';
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }
    if (args.target !== 'web') fail('Only --target web is supported in phase 1-2');

    if (args.replay) {
        const original = readJson(args.replay);
        if (!['core', 'revive'].includes(original.scenario)) fail('Only state-aware sessions support replay');
        args.scenario = original.scenario;
        args.url = original.url;
        args.replayPersona = original.persona;
        const actionsPath = path.join(path.dirname(args.replay), 'actions.ndjson');
        try {
            args.replayActions = fs.readFileSync(actionsPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
        } catch (error) { fail('Cannot read replay actions: ' + error.message); }
        if (!args.replayActions.length) fail('Replay has no recorded actions');
    }
    validateArgs(args);

    const names = listPersonaNames();
    if (args.listPersonas) {
        console.log(names.join('\n'));
        return;
    }

    const personaNames = args.allPersonas ? names.filter((name) => name !== 'smoke') : [args.persona];
    if (!personaNames.length) fail('No personas selected');
    const personas = args.replayPersona ? [{ ...args.replayPersona, headed: args.headed,
        browserChannel: args.browserChannel || args.replayPersona.browserChannel }]
        : personaNames.map((name) => applyOverrides(loadPersona(name), args));
    const rootOutDir = path.resolve(args.outDir || defaultOutputRoot(args, personas));

    if (args.dryRun) {
        console.log(JSON.stringify({
            target: args.target,
            scenario: args.scenario,
            levels: args.levels || ['URL/default'],
            runs: args.runs,
            url: args.url,
            outDir: rootOutDir,
            personas: personas.map((persona) => ({
                name: persona.name,
                maxSteps: persona.maxSteps,
                durationMs: persona.durationMs,
                actionWeights: persona.actionWeights,
                browserChannel: persona.browserChannel || '',
            })),
        }, null, 2));
        return;
    }

    fs.mkdirSync(rootOutDir, { recursive: true });
    const summaries = [];
    for (const persona of personas) for (const level of args.levels || [null]) for (let run = 0; run < args.runs; run++) {
        const seed = ((persona.seed ?? Date.now()) + run) >>> 0;
        const url = new URL(args.url);
        if (level !== null) url.searchParams.set('level', String(level));
        const batch = args.levels || args.runs > 1;
        const session = { ...persona, seed, sessionName: batch ? `${persona.name}-level-${level ?? 'url'}-seed-${seed}` : persona.name };
        summaries.push(runPersona({ ...args, url: url.href }, session, rootOutDir));
    }
    const status = combinedStatus(summaries);
    const combined = {
        status,
        target: args.target,
        url: args.url,
        outDir: rootOutDir,
        startedAt: new Date().toISOString(),
        personas: summaries,
    };
    writeJson(path.join(rootOutDir, 'summary.json'), combined);
    fs.writeFileSync(path.join(rootOutDir, 'report.md'), buildCombinedReport(combined));
    console.log('AI runner report: ' + path.relative(projectDir, path.join(rootOutDir, 'report.md')));
    if (status !== 'passed') process.exit(1);
}

if (require.main === module) main();
module.exports = { parseArgs, validateArgs, applyOverrides, combinedStatus };
