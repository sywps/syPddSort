'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const base = path.join(root, 'artifacts/wechat-baselines/20261016-172522-A');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const runtimeSource = path.join(__dirname, 'runtime/wechat-leaderboard-diagnostic.js');
const engineAnchor = '        return application.init(cc);';

function packageDiagnostic(output) {
    const destination = path.resolve(output || path.join(root, 'artifacts/wechat-diagnostics/leaderboard-d1-20261019-final'));
    if (fs.existsSync(destination)) throw Error('Diagnostic destination exists; refusing overwrite: ' + destination);
    const manifest = JSON.parse(fs.readFileSync(path.join(base, 'generated-sha256.json'), 'utf8'))
        .filter(item => item.path.startsWith('package/'));
    const baseline = JSON.parse(fs.readFileSync(path.join(base, 'baseline.json'), 'utf8'));
    const configExceptions = [];
    for (const item of manifest) {
        const actual = hash(path.join(base, item.path));
        if (actual === item.sha256) continue;
        // Previously observed DevTools project settings edit; record it rather than silently revert.
        if (item.path === 'package/project.config.json') configExceptions.push({ path: item.path, originalSha256: item.sha256, currentSha256: actual });
        else throw Error('Baseline content changed: ' + item.path);
    }
    const originalEntry = fs.readFileSync(path.join(base, 'package/minigame/game.js'), 'utf8');
    if (originalEntry.split(engineAnchor).length !== 2) throw Error('Unknown engine entry; refusing patch');
    const buildMarker = 'globalThis.__PDD_CLIENT_BUILD_ID__=' + JSON.stringify(baseline.buildId) + ';';
    if (!originalEntry.includes(buildMarker)) throw Error('Baseline build ID mismatch');
    const result = { diagnosticOnly: true, baseline: base, baselineBuildId: baseline.buildId,
        cdnSlot: baseline.cdnSlot, appid: baseline.appid, runtimeSourceSha256: hash(runtimeSource),
        createdAt: new Date().toISOString(), packaging: 'exact-baseline-copy-with-entry-observer; no Cocos rebuild',
        baselineConfigExceptions: configExceptions, variants: [], deviceValidation: 'not-run', cloudTest: 'not-submitted' };
    for (const mode of ['full', 'panel', 'data']) {
        const target = path.join(destination, mode, 'package');
        for (const item of manifest) {
            const relative = item.path.slice('package/'.length);
            const file = path.join(target, relative);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.copyFileSync(path.join(base, item.path), file);
        }
        const config = { mode, diagnosticId: 'rank-d1-20261019-' + mode, baseBuildId: baseline.buildId };
        const intro = '// DIAGNOSTIC ONLY - DO NOT RELEASE\n' +
            'var pddRankDiagnostic = require("./rank-diagnostic.js")(globalThis, wx, console, require("./rank-diagnostic-config.json"));\n';
        fs.writeFileSync(path.join(target, 'minigame/game.js'), intro + originalEntry.replace(engineAnchor,
            '        pddRankDiagnostic.attachEngine(cc);\n' + engineAnchor));
        fs.copyFileSync(runtimeSource, path.join(target, 'minigame/rank-diagnostic.js'));
        fs.writeFileSync(path.join(target, 'minigame/rank-diagnostic-config.json'), JSON.stringify(config, null, 2) + '\n');
        const projectFile = path.join(target, 'project.config.json');
        const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
        project.projectname = '再来两把-排行榜诊断D1-' + mode;
        fs.writeFileSync(projectFile, JSON.stringify(project, null, 2) + '\n');
        const files = [];
        for (const item of manifest) {
            const file = item.path.slice('package/'.length), actual = hash(path.join(target, file));
            if (!['minigame/game.js', 'project.config.json'].includes(file) && actual !== item.sha256) {
                throw Error('Unexpected diagnostic change: ' + mode + '/' + file);
            }
            files.push({ path: file, sha256: actual, bytes: fs.statSync(path.join(target, file)).size });
        }
        for (const file of ['minigame/rank-diagnostic.js', 'minigame/rank-diagnostic-config.json']) {
            files.push({ path: file, sha256: hash(path.join(target, file)), bytes: fs.statSync(path.join(target, file)).size });
        }
        fs.writeFileSync(path.join(destination, mode, 'sha256.json'), JSON.stringify(files, null, 2) + '\n');
        result.variants.push({ mode, path: target, files: files.length,
            runtimeAddedBytes: files.filter(f => f.path.startsWith('minigame/')).reduce((sum, f) => sum + f.bytes, 0) - baseline.runtimeBytes,
            unchangedOriginalFiles: manifest.length - 2,
            changedOriginalFiles: ['minigame/game.js', 'project.config.json'],
            addedFiles: ['minigame/rank-diagnostic.js', 'minigame/rank-diagnostic-config.json'] });
    }
    fs.writeFileSync(path.join(destination, 'diagnostic-manifest.json'), JSON.stringify(result, null, 2) + '\n');
    return result;
}
if (require.main === module) {
    if (process.argv.length > 3) throw Error('Usage: node scripts/package-wechat-leaderboard-diagnostic.js [new-output-directory]');
    console.log(JSON.stringify(packageDiagnostic(process.argv[2]), null, 2));
}
module.exports = { packageDiagnostic };
