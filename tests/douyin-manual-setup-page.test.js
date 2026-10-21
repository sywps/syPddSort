'use strict';
const assert = require('assert'), fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '..'), delivery = path.join(root, 'artifacts/douyin-prod-manual-20261011');
const html = fs.readFileSync(path.join(delivery, '操作页.html'), 'utf8');
assert(html.includes("connect-src 'none'"));
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
assert(!/localStorage|sessionStorage|fetch\(|XMLHttpRequest|sendBeacon/.test(script));
const manifest = JSON.parse(fs.readFileSync(path.join(delivery, 'manifest.json'), 'utf8'));
assert.equal(manifest.files.filter(file => file.replace).length, 7);
for (const file of manifest.files) {
    const content = fs.readFileSync(path.join(delivery, 'functions', file.name));
    assert(content.equals(fs.readFileSync(path.join(root, 'cloudfunctions-douyin', file.name))));
    assert.equal(crypto.createHash('sha256').update(content).digest('hex'), file.sha256);
}
function page(clipboardAllowed = true, randomAvailable = true) {
    const elements = new Map(), copied = [];
    const get = id => {
        if (!elements.has(id)) elements.set(id, { value: '', type: id === 'secret' ? 'password' : '',
            disabled: ['copyEnvSecret', 'copyHeaderSecret'].includes(id), children: [],
            append(child) { this.children.push(child); }, focus() {}, select() {} });
        return elements.get(id);
    };
    let randomCalls = 0;
    const context = { Uint8Array, document: { getElementById: get, createElement: () => ({}) },
        navigator: { clipboard: { async writeText(value) { if (!clipboardAllowed) throw Error('denied'); copied.push(value); } } },
        crypto: { getRandomValues(bytes) { randomCalls++; if (!randomAvailable) throw Error('unavailable'); bytes.fill(17); return bytes; } } };
    vm.runInNewContext(script, context);
    return { get, copied, randomCalls: () => randomCalls };
}
async function main() {
    const p = page();
    assert.equal(p.randomCalls(), 0, 'opening page must not generate credentials');
    assert.equal(p.get('file').children.length, 7);
    for (const option of p.get('file').children) {
        p.get('file').value = option.value; p.get('file').onchange();
        await p.get('copyCode').onclick();
        assert.equal(p.copied.pop(), fs.readFileSync(path.join(delivery, 'functions', option.value), 'utf8'));
    }
    p.get('generate').onclick();
    assert.equal(p.get('secret').type, 'password');
    assert.equal(p.get('generate').disabled, true);
    await p.get('copyEnvSecret').onclick(); await p.get('copyHeaderSecret').onclick();
    assert(/^[a-f0-9]{64}$/.test(p.copied[0])); assert.equal(p.copied[0], p.copied[1]);
    assert(!p.get('status').textContent.includes(p.copied[0]));
    p.get('generate').onclick(); assert.equal(p.randomCalls(), 1, 'no accidental replacement between copy steps');
    const existing = page(); existing.get('secret').value = 'invalid'; existing.get('useExisting').onclick();
    assert.equal(existing.get('copyEnvSecret').disabled, true);
    existing.get('secret').value = 'ab'.repeat(32); existing.get('useExisting').onclick();
    await existing.get('copyHeaderSecret').onclick(); assert.equal(existing.copied[0], 'ab'.repeat(32));
    assert.equal(existing.randomCalls(), 0);
    const denied = page(false); denied.get('generate').onclick(); await denied.get('copyHeaderSecret').onclick();
    assert(denied.get('status').textContent.includes('拒绝')); assert.equal(denied.copied.length, 0);
    const noRandom = page(true, false); noRandom.get('generate').onclick();
    assert.equal(noRandom.get('secret').value, ''); assert.equal(noRandom.get('copyEnvSecret').disabled, true);
    assert(noRandom.get('status').textContent.includes('未生成'));
    console.log('PASS manual operation page: exact full-file copies/hashes, masked same credential for two steps, no persistence/network, visible failures (DOM/clipboard/random mocked)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
