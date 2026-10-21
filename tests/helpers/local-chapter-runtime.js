'use strict';
const fs = require('fs'), path = require('path'), ts = require('typescript');
module.exports = function localModule(storage = new Map()) {
    const cache = {};
    function load(name) {
        if (cache[name]) return cache[name];
        if (name === 'cc') return { sys: { localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) } } };
        const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../assets/Scripts/Core', name.replace('./', '') + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
        const exports = {}; new Function('exports', 'require', code)(exports, load); cache[name] = exports; return exports;
    }
    return load('./LocalChapterRewards');
};
