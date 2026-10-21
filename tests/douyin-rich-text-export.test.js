'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('fs');
const path = require('path');
const { restoreRichTextExport, ensureDouyinRichTextExport } = require('../scripts/ensure-douyin-rich-text-export');

function exportedTypes(source) {
    const RichText = class RichText {};
    const Label = class Label {};
    const exported = {};
    vm.runInNewContext(source, { System: { register(deps, declare) {
        const module = declare(values => Object.assign(exported, values));
        module.setters[0]({ q: RichText, l: Label });
        module.execute();
    } } });
    return { exported, RichText, Label };
}

const aliasOnly = 'System.register(["./engine.js"],function(e){return{setters:[function(t){e({Label:t.l,RichTextComponent:t.q})}],execute:function(){}}});';

test('restores the exact existing RichText class used by prefab components', () => {
    assert.equal(exportedTypes(aliasOnly).exported.RichText, undefined);
    const { exported, RichText, Label } = exportedTypes(restoreRichTextExport(aliasOnly));
    assert.equal(exported.RichText, RichText);
    assert.equal(exported.RichText, exported.RichTextComponent);
    assert.equal(exported.Label, Label);
});

test('a correct engine remains unchanged across repeated postbuilds', () => {
    const corrected = restoreRichTextExport(aliasOnly);
    assert.equal(restoreRichTextExport(corrected), corrected);
});

test('missing or ambiguous legacy exports fail explicitly instead of hiding stripped modules', () => {
    assert.throws(() => restoreRichTextExport('System.register([]);'), /enable rich-text/);
    assert.throws(() => restoreRichTextExport('RichTextComponent:a.b,RichTextComponent:c.d'), /enable rich-text/);
});

test('runtime repair touches only the engine entry and is wired into Douyin postbuild', () => {
    const dir = fs.mkdtempSync(path.resolve('temp/douyin-rich-text-'));
    try {
        fs.mkdirSync(path.join(dir, 'cocos-js'));
        const entry = path.join(dir, 'cocos-js/cc.hash.js');
        const implementation = path.join(dir, 'cocos-js/_virtual_cc.js');
        fs.writeFileSync(entry, aliasOnly);
        fs.writeFileSync(implementation, 'implementation unchanged');
        assert.equal(ensureDouyinRichTextExport(dir), true);
        assert.equal(ensureDouyinRichTextExport(dir), false);
        assert.equal(fs.readFileSync(implementation, 'utf8'), 'implementation unchanged');
        assert.equal(typeof exportedTypes(fs.readFileSync(entry, 'utf8')).exported.RichText, 'function');
        assert.match(fs.readFileSync('scripts/postbuild-douyin.js', 'utf8'), /ensureDouyinRichTextExport\(runtimeRoot\)/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
