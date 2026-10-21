'use strict';

// Serialized into the page. Reads engine state and returns primitives only.
async function readLeaderboardSnapshot() {
    const cc = window.System?.import ? await window.System.import('cc') : window.cc;
    if (!cc?.director || !cc.assetManager) throw Error('Cocos observation API unavailable');
    const scene = cc.director.getScene();
    if (!scene) return { scene: null, ready: false };
    const nodes = [];
    function visit(node, path) {
        nodes.push({ node, path: path + '/' + node.name });
        for (const child of node.children) visit(child, path + '/' + node.name);
    }
    visit(scene, '');
    const overlay = nodes.find(({ node }) => node.name === 'LeaderboardOverlay' && node.activeInHierarchy)?.node;
    const box = overlay?.getChildByName('Box');
    const list = box?.getChildByName('LeaderboardList');
    const content = list?.getChildByPath('LeaderboardViewport/LeaderboardContent');
    const status = list?.getChildByName('LeaderboardStatusTitle');
    const self = box?.getChildByName('LeaderboardSelfBox');
    const rows = (content?.children || []).filter(n => /^Leaderboard\d+Row$/.test(n.name) && n.activeInHierarchy);
    const rowText = rows.map(row => ['Name', 'Progress'].map(key => row.getChildByName(key)?.getComponent(cc.Label)?.string || '').join(':'));
    const runtime = nodes.flatMap(({ node }) => node.components || []).find(c => c._spriteFrameCacheMeta instanceof Map);
    const scopes = {};
    if (runtime) for (const meta of runtime._spriteFrameCacheMeta.values()) {
        const key = String(meta.scope);
        scopes[key] = (scopes[key] || 0) + 1;
    }
    const assets = {};
    const textures = new Map();
    function rememberTexture(texture) {
        if (!texture || !cc.isValid(texture)) return;
        const key = texture.uuid || texture._uuid || texture._id;
        // Object keys are used locally only; no engine object escapes this function.
        if (!textures.has(texture)) textures.set(texture, { id: key || null, name: texture.name,
            width: texture.width, height: texture.height, refCount: texture.refCount });
    }
    cc.assetManager.assets.forEach(asset => {
        const type = asset.constructor?.name || 'unknown';
        assets[type] = (assets[type] || 0) + 1;
        if (cc.Texture2D && asset instanceof cc.Texture2D) rememberTexture(asset);
        if (cc.SpriteFrame && asset instanceof cc.SpriteFrame) rememberTexture(asset.texture);
    });
    for (const { node } of nodes) {
        const sprite = node.getComponent(cc.Sprite);
        if (sprite?.spriteFrame) rememberTexture(sprite.spriteFrame.texture);
    }
    const textureRows = [...textures.values()];
    const overlays = nodes.filter(({ node }) => /Overlay$/.test(node.name) && node.activeInHierarchy).map(n => n.path);
    const loading = nodes.some(({ node }) => /StartupLoadingUI/.test(node.name) && node.activeInHierarchy);
    return {
        observedAt: Date.now(), scene: scene.name, ready: !loading,
        totalNodes: nodes.length, activeNodes: nodes.filter(({ node }) => node.activeInHierarchy).length,
        overlays, leaderboardOpen: !!overlay, loading: !!status?.activeInHierarchy,
        loadingText: status?.getComponent(cc.Label)?.string || '',
        selfVisible: !!self?.activeInHierarchy, visibleRows: rows.length, rowText,
        activeTab: runtime?._leaderboardActiveTab || null,
        assets, assetCount: Object.values(assets).reduce((a, b) => a + b, 0),
        cachedSpriteFrames: runtime?.sfCache?.size ?? null,
        cacheScopes: scopes,
        leaderboardOwners: runtime ? [...runtime._spriteFrameCacheMeta.values()].filter(m => m.owners?.has('panel:leaderboard')).length : null,
        textureCount: textureRows.length,
        rgba8PixelEstimateBytes: textureRows.reduce((sum, t) => sum + (t.width || 0) * (t.height || 0) * 4, 0),
        largestTextures: textureRows.sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 12),
        frame: cc.director.getTotalFrames?.() ?? null,
    };
}

function homeReady(state) {
    return state.scene === 'Home' && state.ready && !state.leaderboardOpen && state.overlays.length === 0;
}

function leaderboardReady(state) {
    // Empty local lists are reported as such, not fabricated into cloud coverage.
    return state.scene === 'Home' && state.leaderboardOpen && !state.loading
        && state.selfVisible && state.activeTab === 'global';
}

module.exports = { readLeaderboardSnapshot, homeReady, leaderboardReady };
