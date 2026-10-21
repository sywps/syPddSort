'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function packageDiagnostic() {
    const source = path.join(root, 'build/bytedance-mini-game-a-dev-launch-20261011-r2');
    const target = path.join(root, 'build/bytedance-mini-game-a-dev-launch-20261011-r2-diagnostic-d1');
    if (fs.existsSync(target)) throw Error('D1 output already exists; refusing overwrite');
    const report = JSON.parse(fs.readFileSync(path.join(root, '.planning/douyin-dev-launch-20261011/build-1ilwDa/package-verification.json')));
    // Confirm this is the exact built r2, not an edited or mislabeled project.
    for (const item of report.files) {
        // Developer-tool compilation conditions may have been changed by the user since delivery.
        if (item.file !== 'project.config.json' && hash(path.join(source, item.file)) !== item.sha256) throw Error('r2 changed: ' + item.file);
    }
    let entry = fs.readFileSync(path.join(source, 'game.js'), 'utf8');
    const anchor = 'return application.init(cc);';
    if (entry.split(anchor).length !== 2) throw Error('Unknown engine initialization entry');
    const intro = '// D1 DIAGNOSTIC ONLY - NOT FOR RELEASE\n' +
        'var pddStartupDiagnostic = require("./startup-diagnostic.js")(globalThis, tt, console, {version:"D1",base:"r2"});\n';
    entry = intro + entry.replace(anchor, 'pddStartupDiagnostic.attachEngine(cc);\n            ' + anchor);
    fs.mkdirSync(target, { recursive: true });
    // Only copy the original release manifest, excluding IDE caches/private settings.
    for (const item of report.files) {
        const dest = path.join(target, item.file); fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(source, item.file), dest);
    }
    const projectSource = path.join(root, '.planning/douyin-dev-launch-20261011/build-1ilwDa/worker/build/bytedance-mini-game/project.config.json');
    if (hash(projectSource) !== report.files.find(item => item.file === 'project.config.json').sha256) throw Error('Original project config changed');
    const originalProject = JSON.parse(fs.readFileSync(projectSource));
    originalProject.projectname = '抖音侧边栏排查 D1（勿提审）';
    // Use normal launch, never simulate sidebar qualification in the delivered diagnostic.
    delete originalProject.condition;
    fs.writeFileSync(path.join(target, 'project.config.json'), JSON.stringify(originalProject, null, 2));
    fs.writeFileSync(path.join(target, 'game.js'), entry);
    fs.copyFileSync(path.join(__dirname, 'runtime/douyin-startup-diagnostic.js'), path.join(target, 'startup-diagnostic.js'));
    for (const item of report.files) {
        if (['game.js', 'project.config.json'].includes(item.file)) continue;
        if (hash(path.join(target, item.file)) !== item.sha256) throw Error('Unexpected package change: ' + item.file);
    }
    const files = [...report.files.map(item => item.file), 'startup-diagnostic.js'].map(file => ({ file, sha256: hash(path.join(target, file)) }));
    const result = { source, target, version: 'D1', diagnosticOnly: true, unchangedFiles: report.files.length - 2,
        changes: ['game.js: diagnostic observer and engine hook', 'project.config.json: diagnostic title, normal launch', 'startup-diagnostic.js: new observer'], files };
    fs.writeFileSync(path.join(root, '.planning/douyin-dev-launch-20261011/diagnostic-d1-package.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ target, unchangedFiles: result.unchangedFiles, diagnosticOnly: true }));
}
if (require.main === module) packageDiagnostic();
module.exports = { packageDiagnostic };
