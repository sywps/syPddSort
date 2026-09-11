const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const script = path.resolve(__dirname, '../scripts/patch-bootstrap-dynamic-assets.js');
const context = {
    require: createRequire(script), module: { exports: {} },
    __dirname: path.dirname(script), process, console,
};
vm.runInNewContext(fs.readFileSync(script, 'utf8')
    + '\nmodule.exports.copyNative = copyGameAssetNativeArtifacts;', context);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-native-copy-test-'));
try {
    const source = path.join(root, 'source');
    const target = path.join(root, 'target');
    const uuid = 'a8feccb1-a86e-4451-9d65-b05bc0a32b97';
    const relative = path.join('native', 'a8', uuid + '.8c845');
    fs.mkdirSync(path.join(source, relative), { recursive: true });
    const bytes = Buffer.from([0, 1, 2, 255]);
    fs.writeFileSync(path.join(source, relative, 'hud_numbers.ttf'), bytes);
    fs.writeFileSync(path.join(source, 'native', 'a8', uuid + '.plain.png'), bytes);
    assert.equal(context.module.exports.copyNative(source, uuid, target), true);
    assert.deepEqual(fs.readFileSync(path.join(target, relative, 'hud_numbers.ttf')), bytes);
    assert.deepEqual(fs.readFileSync(path.join(target, 'native', 'a8', uuid + '.plain.png')), bytes);
    assert.equal(context.module.exports.copyNative(source, uuid, target), true);
    assert.equal(context.module.exports.copyNative(source, 'missing', target), false);
} finally {
    fs.rmSync(root, { recursive: true, force: true });
}
console.log('bootstrap-native-directory-copy.test.js passed');
