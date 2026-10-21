'use strict';

const fs = require('fs');
const path = require('path');

// Cocos 3.8 can retain cc.RichText through its legacy alias while omitting the
// named export consumed by game scripts. Both names must use the same class.
function restoreRichTextExport(source) {
    if (/\bRichText\s*:/.test(source)) return source;
    const aliases = [...source.matchAll(/\bRichTextComponent\s*:\s*([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)/g)];
    if (aliases.length !== 1) {
        throw new Error('Douyin engine is missing RichText; enable rich-text and rebuild the Cocos engine.');
    }
    const alias = aliases[0];
    return source.slice(0, alias.index) + `RichText:${alias[1]},` + source.slice(alias.index);
}

function ensureDouyinRichTextExport(runtimeRoot) {
    const engineDir = path.join(runtimeRoot, 'cocos-js');
    const entries = fs.readdirSync(engineDir).filter(name => /^cc(?:\.[\w-]+)?\.js$/.test(name));
    if (entries.length !== 1) throw new Error('Expected one Douyin Cocos engine entry for RichText verification.');
    const file = path.join(engineDir, entries[0]);
    const before = fs.readFileSync(file, 'utf8');
    const after = restoreRichTextExport(before);
    if (after !== before) fs.writeFileSync(file, after);
    return after !== before;
}

module.exports = { restoreRichTextExport, ensureDouyinRichTextExport };
