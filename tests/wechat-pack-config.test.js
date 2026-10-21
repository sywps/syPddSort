const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { verifyAtlasDependencies } = require('../scripts/repair-douyin-atlas-dependencies');
const root = path.resolve(__dirname, '..');
const runtime = path.resolve(process.argv[2] || path.join(root, 'build/wechatgame/minigame'));
function files(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(dir, entry.name);
        return entry.isDirectory() ? files(file) : [file];
    });
}
// Execute the generated Cocos config decoder and pack initializer, including the
// actual dereference that previously threw undefined.packs. No engine patching.
const engineFile = files(path.join(runtime, 'cocos-js')).find(file => /_virtual_cc-.*\.js$/.test(file));
assert.ok(engineFile, 'generated Cocos engine is required');
const source = fs.readFileSync(engineFile, 'utf8');
const ast = ts.createSourceFile(engineFile, source, ts.ScriptTarget.Latest, true);
let prepare, initializeUuids, initializePacks, initializeVersions;
function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isFunctionExpression(node.initializer)) {
        const text = node.initializer.getText(ast);
        if (text.includes('.debug') && text.includes('.packs') && text.includes('.redirect') && text.includes('.extensionMap') && !text.includes('this.assetInfos')) prepare = text;
    }
    if (ts.isBinaryExpression(node) && ts.isFunctionExpression(node.right)) {
        const text = node.right.getText(ast);
        if (text.includes('packedUuids:') && text.includes('.packs')) initializePacks = text;
        else if (text.includes('this.assetInfos.clear()') && text.includes('{uuid:')) initializeUuids = text;
        else if (text.includes('this.assetInfos') && text.includes('.nativeVer=') && text.includes('.ver=')) initializeVersions = text;
    }
    ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(prepare && initializeUuids && initializePacks && initializeVersions, 'Cocos config functions must be found');
const decoderName = prepare.match(/\w+\[\w+\]=(\w+)\(\w+\[\w+\]\)/)?.[1];
assert.ok(decoderName, 'UUID decoding dependency must be identified');
function decodeUuid(value) {
    const [base, suffix] = value.split('@');
    if (base.length !== 22) return value;
    const hex = base.slice(0, 2) + Buffer.from(base.slice(2), 'base64').toString('hex');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}${suffix ? '@' + suffix : ''}`;
}
const decodeConfig = new Function(decoderName, `return (${prepare});`)(decodeUuid);
const initUuids = new Function(`return (${initializeUuids});`)();
const initPacks = new Function(`return (${initializePacks});`)();
const initVersions = new Function(`return (${initializeVersions});`)();
const configs = files(runtime).filter(file => /^config(?:\.[a-f0-9]+)?\.json$/i.test(path.basename(file)));
assert.ok(configs.length >= 5);
let members = 0;
for (const file of configs) {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    const stable = path.join(path.dirname(file), 'config.json');
    if (file !== stable && fs.existsSync(stable)) {
        assert.deepEqual(config, JSON.parse(fs.readFileSync(stable, 'utf8')), `config mirror differs: ${file}`);
    }
    const infos = new Map(); infos.add = infos.set;
    const target = { assetInfos: infos };
    try {
        decodeConfig(config);
        initUuids.call(target, config.uuids);
        initPacks.call(target, config.packs, config.extensionMap?.['.cconb']);
        initVersions.call(target, config.versions);
    } catch (error) { throw new Error(`${path.relative(runtime, file)}: ${error.message}`, { cause: error }); }
    for (const entries of Object.values(config.packs || {})) members += entries.length;
}
const atlas = verifyAtlasDependencies(runtime);
const build = fs.readFileSync(path.join(root, 'scripts/build-wechat.js'), 'utf8');
assert.ok(build.includes("runNode('tests/wechat-pack-config.test.js', [runtimeDir])"), 'WeChat build must run this gate before returning the package');
console.log(`wechat-pack-config.test.js passed: generated Cocos initialized ${configs.length} configs / ${members} pack members; ${atlas.length} atlas dependencies verified`);
