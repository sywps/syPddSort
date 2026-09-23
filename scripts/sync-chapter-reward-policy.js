// Keep the cloud rule identical to the client policy without runtime cross-bundle imports.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/Scripts/Core/ChapterRewardPolicy.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
fs.writeFileSync(path.join(root, 'cloudfunctions/updateUserProfileAssets/chapter-reward-policy.js'), '// Generated from assets/Scripts/Core/ChapterRewardPolicy.ts\n' + output);
