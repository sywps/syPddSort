'use strict';

// Runs before System.import / engine startup. No changes to other build targets.
function installCreatorWeb(scope, config) {
    const prefix = 'pdd.creator-web.v1:';
    const original = scope.localStorage;
    const probe = prefix + '__probe__';
    original.setItem(probe, '1');
    if (original.getItem(probe) !== '1') throw Error('浏览器无法保存无广告版存档');
    original.removeItem(probe);
    const keys = () => {
        const result = [];
        for (let i = 0; i < original.length; i++) {
            const key = original.key(i);
            if (key && key.startsWith(prefix)) result.push(key.slice(prefix.length));
        }
        return result;
    };
    const storage = {
        getItem: key => original.getItem(prefix + String(key)),
        setItem: (key, value) => original.setItem(prefix + String(key), String(value)),
        removeItem: key => original.removeItem(prefix + String(key)),
        key: index => keys()[index] ?? null,
        clear: () => keys().forEach(key => original.removeItem(prefix + key)),
        get length() { return keys().length; },
    };
    Object.defineProperty(scope, 'localStorage', { value: storage, configurable: true });
    if (scope.localStorage !== storage) throw Error('无广告版存档隔离初始化失败');
    scope.__PDD_CREATOR_WEB__ = Object.freeze({ version: 1, mainLevels: Object.freeze(config.mainLevels.slice()) });
    scope.__PDD_LEVEL_EXPERIMENT_BUCKET__ = 'off';
    scope.__PDD_USE_LOCAL_SKIN_MIRROR__ = true;
    scope.__PDD_CREATOR_WEB_READY__ = true;
}

function bootstrapSource(config) {
    return `window.__PDD_CREATOR_WEB_READY__ = false;
try { (${installCreatorWeb.toString()})(window, ${JSON.stringify(config)}); }
catch (error) {
    console.error('[creator-web] startup stopped', error);
    document.getElementById('GameDiv').hidden = true;
    var message = document.createElement('p');
    message.textContent = '无广告版启动失败：' + error.message + '。请允许浏览器保存网站数据后重试。';
    document.body.appendChild(message);
}
`;
}

module.exports = { installCreatorWeb, bootstrapSource };
