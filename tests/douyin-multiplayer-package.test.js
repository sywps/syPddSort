'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), assert = require('node:assert/strict');
const dir = 'artifacts/douyin-multiplayer-dev-v1';
const acorn = require('acorn');
const syntaxOptions = { ecmaVersion: 2020, sourceType: 'script' };
assert.throws(() => acorn.parse('let value; value ||= {};', syntaxOptions), SyntaxError);
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json')));
assert.equal(manifest.cloudPublished, false); assert.equal(manifest.environment, 'dev'); assert.equal(manifest.importedWechatReplays, false);
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
for (const file of manifest.files) {
    acorn.parse(fs.readFileSync(path.join(dir, 'functions', file.name), 'utf8'), syntaxOptions);
    assert.equal(hash(fs.readFileSync(path.join(dir, 'functions', file.name))), file.sha256);
    assert.equal(hash(fs.readFileSync(path.join('cloudfunctions-douyin', file.name))), file.sha256);
}
const elements = {};
function element() { return { selectedIndex: 0, value: '', textContent: '', appendChild() {}, focus() {}, select() {} }; }
let clipboard;
const html = fs.readFileSync(path.join(dir, '操作页.html'), 'utf8'), script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const sandbox = { document: { getElementById: id => elements[id] ||= element(), createElement: element }, navigator: { clipboard: { async writeText(value) { clipboard = value; } } } };
vm.runInNewContext(script + '\n globalThis.delivery = files;', sandbox);
(async () => {
    assert.equal(sandbox.delivery.length, 8);
    for (let i = 0; i < sandbox.delivery.length; i++) {
        elements.file.selectedIndex = i; elements.file.onchange(); await elements.copy.onclick();
        const file = sandbox.delivery[i]; assert.equal(hash(clipboard), file.sha256, 'copy preserves every character, including dollar operators');
        assert.equal(clipboard, fs.readFileSync(path.join(dir, 'functions', file.name), 'utf8'));
    }
    const runtime = require('../' + dir + '/functions/multiplayerRuntime');
    assert.equal(typeof runtime.createCoopService, 'function'); assert.equal(typeof runtime.createPvpService, 'function');
    console.log('PASS deploy package: standalone bundle loads, all hashes/source match, 8 complete clipboard copies verified, dev only and not deployed');
})().catch(error => { console.error(error); process.exitCode = 1; });
