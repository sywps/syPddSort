#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectDir = path.resolve(__dirname, '..');
const personaDir = path.join(projectDir, 'tools', 'ai-runner', 'personas');
const workerPath = path.join(projectDir, 'tools', 'ai-runner', 'browser-session.js');
const defaultPreviewScene = 'db://assets/Scenes/Boot.scene';
const defaultUrl = 'http://localhost:7456/?scene=' + encodeURIComponent(defaultPreviewScene) + '&level=1';

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
    const runOutDir = path.join(rootOutDir, safeName(persona.name));
    fs.mkdirSync(runOutDir, { recursive: true });
    const configPath = path.join(runOutDir, 'session-config.json');
    const config = {
        projectDir,
        target: args.target,
        url: args.url,
        outDir: runOutDir,
        persona,
        startedAt: new Date().toISOString(),
    };
    writeJson(configPath, config);

    const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const result = spawnSync(npxBin, [
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
    }
    lines.push('');
    lines.push('## Next Debug Pointers');
    lines.push('- Open each persona subdirectory for `report.md`, `actions.ndjson`, `console.ndjson`, and screenshots.');
    lines.push('- Treat `tool_failed` as runner/environment failure, not proof of a game bug.');
    return lines.join('\n') + '\n';
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }
    if (args.target !== 'web') fail('Only --target web is supported in phase 1-2');

    const names = listPersonaNames();
    if (args.listPersonas) {
        console.log(names.join('\n'));
        return;
    }

    const personaNames = args.allPersonas ? names.filter((name) => name !== 'smoke') : [args.persona];
    if (!personaNames.length) fail('No personas selected');
    const personas = personaNames.map((name) => applyOverrides(loadPersona(name), args));
    const rootOutDir = path.resolve(args.outDir || defaultOutputRoot(args, personas));

    if (args.dryRun) {
        console.log(JSON.stringify({
            target: args.target,
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
    const summaries = personas.map((persona) => runPersona(args, persona, rootOutDir));
    const failed = summaries.some((item) => item.status !== 'passed');
    const combined = {
        status: failed ? 'failed' : 'passed',
        target: args.target,
        url: args.url,
        outDir: rootOutDir,
        startedAt: new Date().toISOString(),
        personas: summaries,
    };
    writeJson(path.join(rootOutDir, 'summary.json'), combined);
    fs.writeFileSync(path.join(rootOutDir, 'report.md'), buildCombinedReport(combined));
    console.log('AI runner report: ' + path.relative(projectDir, path.join(rootOutDir, 'report.md')));
    if (failed) process.exit(1);
}

main();
