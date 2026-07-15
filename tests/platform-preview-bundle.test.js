const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const previewMeta = JSON.parse(fs.readFileSync(path.join(root, 'assets/PreviewBundle.meta'), 'utf8'));
const previewController = fs.readFileSync(path.join(root, 'assets/PreviewBundle/PreviewController.ts'), 'utf8');
const buildConfig = fs.readFileSync(path.join(root, 'scripts/write-wechat-build-config.js'), 'utf8');
const buildWechat = fs.readFileSync(path.join(root, 'scripts/build-wechat.js'), 'utf8');

assert.strictEqual(previewMeta.userData?.isBundle, true, 'Preview assets must live in a dedicated Cocos Asset Bundle');
assert.strictEqual(previewMeta.userData?.bundleName, 'preview', 'Preview bundle name must be stable');
assert.ok(previewController.includes("from '../Scripts/Core/GameRuntimeHost'"), 'Preview controller must keep using the real runtime host in editor/plain web');
assert.ok(!buildConfig.includes("root: 'db://assets/PreviewBundle'"), 'default WeChat builds must not output PreviewBundle');
assert.ok(buildWechat.includes("assertRuntimeLocalBundleAbsent(runtimeDir, 'preview'"), 'WeChat build must reject PreviewBundle artifacts');
assert.ok(buildWechat.includes("['PreviewController', 'UIPreview', 'Panel Preview', 'Fx Preview']"), 'WeChat build must reject preview code symbols');

console.log('platform-preview-bundle.test.js passed');
