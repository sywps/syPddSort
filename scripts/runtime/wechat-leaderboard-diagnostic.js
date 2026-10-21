'use strict';

// Diagnostic packages only. No network telemetry, GC, release or cache-policy changes.
module.exports = function installLeaderboardDiagnostic(host, wxApi, log, config, timers) {
    if (!config || !['full', 'panel', 'data'].includes(config.mode)) throw Error('Invalid leaderboard diagnostic mode');
    if (host.__PDD_RANK_DIAG__) throw Error('Leaderboard diagnostic already installed');
    timers = timers || { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) };
    const now = config.now || Date.now;
    const mode = config.mode;
    const sink = log.__pddOriginalWarn || log.warn || log.log;
    const state = { mode, diagnosticId: config.diagnosticId, baseBuildId: config.baseBuildId,
        session: String(now()), round: 0, phase: 'boot', failed: false, events: [], dropped: 0,
        cloudSource: null, entryCount: null, fingerprint: null, avatarCalls: 0, catalogAvatarCalls: 0,
        urlAvatarCalls: 0, rowCalls: 0, storage: 'not-initialized' };
    let cc, runtime, hud, currentOpen = false, globalLoads = 0, seq = 0;
    let fileBytes = 0, logPath = null, fsApi = null, recordFailure = null;
    const deadlines = new Set();
    const wrappedRuntimes = new WeakSet(), wrappedManagers = new WeakSet();
    const limits = { events: 1200, fileBytes: 512 * 1024 };

    function utf8Bytes(text) {
        let bytes = 0;
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            if (code < 128) bytes++;
            else if (code < 2048) bytes += 2;
            else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length &&
                text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
            else bytes += 3;
        }
        return bytes;
    }

    function fingerprint(result) {
        // Local comparison token only; raw identifiers/names/URLs never enter diagnostic logs.
        const rows = (result.entries || []).concat(result.self ? [result.self] : []);
        let hash = 2166136261;
        for (const row of rows) {
            const value = JSON.stringify([row.uuid, row.rank, row.progressLevel, row.updatedAt,
                row.avatarUrl, row.avatarId, row.frameId]);
            for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }
    function refreshHud() {
        if (!hud || !hud.node.isValid) return;
        const last = state.events[state.events.length - 1];
        const sample = last && last.snapshot;
        hud.string = 'D1 ' + mode + ' #' + state.round + ' ' + new Date(now()).toISOString().slice(11, 19) + 'Z' +
            (sample ? ' N' + sample.nodes + ' T' + sample.textures : '') + (state.failed ? ' 异常' : '') +
            '\n' + state.phase + (state.entryCount === null ? '' : ' | ' + state.cloudSource + ':' + state.entryCount);
    }
    function record(event, extra, withSnapshot) {
        const row = { seq: ++seq, at: now(), session: state.session, mode, round: state.round, event,
            extra: extra || null };
        if (withSnapshot) {
            try { row.snapshot = snapshot(); }
            catch (error) { row.snapshotError = error.name; state.failed = true; }
        }
        state.phase = event;
        if (state.events.length >= limits.events) { state.events.shift(); state.dropped++; }
        state.events.push(row);
        try { sink.call(log, '[PDD_RANK_DIAG]', JSON.stringify(row)); }
        catch (_) { state.failed = true; }
        if (fsApi && logPath && state.storage === 'writing') {
            const line = JSON.stringify(row) + '\n';
            const bytes = utf8Bytes(line);
            if (fileBytes + bytes > limits.fileBytes) state.storage = 'limit-reached';
            else {
                try { fsApi.appendFileSync(logPath, line, 'utf8'); fileBytes += bytes; }
                catch (error) { state.storage = 'write-failed'; state.failed = true; }
            }
        }
        refreshHud();
        return row;
    }
    function fail(stage, error) {
        state.failed = true;
        record('diagnostic.failed', { stage, errorName: error && error.name || 'Error',
            message: String(error && error.message || '').slice(0, 160) });
    }
    function snapshot() {
        if (!cc) return { engine: 'not-attached' };
        const scene = cc.director.getScene(), textures = new Set();
        let nodes = 0, activeNodes = 0, assets = 0, owners = 0;
        const types = {}, dimensions = [];
        function remember(texture) {
            if (!texture || !cc.isValid(texture) || textures.has(texture)) return;
            textures.add(texture);
            dimensions.push({ width: Number(texture.width) || 0, height: Number(texture.height) || 0 });
        }
        function visit(node) {
            nodes++; if (node.activeInHierarchy) activeNodes++;
            const sprite = node.getComponent(cc.Sprite);
            if (sprite && sprite.spriteFrame) remember(sprite.spriteFrame.texture);
            for (const child of node.children) visit(child);
        }
        if (scene) visit(scene);
        cc.assetManager.assets.forEach(asset => {
            assets++;
            const type = asset.constructor && asset.constructor.name || 'unknown';
            types[type] = (types[type] || 0) + 1;
            if (asset instanceof cc.Texture2D) remember(asset);
            if (asset instanceof cc.SpriteFrame) remember(asset.texture);
        });
        if (runtime && runtime._spriteFrameCacheMeta) for (const meta of runtime._spriteFrameCacheMeta.values()) {
            if (meta.owners && meta.owners.has('panel:leaderboard')) owners++;
        }
        let heap = null;
        try {
            const perf = wxApi && wxApi.getPerformance && wxApi.getPerformance();
            const used = perf && perf.memory && perf.memory.usedJSHeapSize;
            if (typeof used === 'number' && Number.isFinite(used)) heap = used;
        } catch (_) { /* Unsupported heap API is explicitly null, not zero. */ }
        return { scene: scene && scene.name, nodes, activeNodes, assets, assetTypes: types,
            textures: textures.size, rgba8PixelEstimateBytes: dimensions.reduce((sum, d) => sum + d.width * d.height * 4, 0),
            largestTextureDimensions: dimensions.sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 6),
            spriteFrameCache: runtime && runtime.sfCache ? runtime.sfCache.size : null,
            leaderboardOwners: owners, usedJSHeapBytes: heap, memoryScope: 'observable-engine-and-js-only',
            avatarCalls: state.avatarCalls, catalogAvatarCalls: state.catalogAvatarCalls,
            urlAvatarCalls: state.urlAvatarCalls, rowCalls: state.rowCalls };
    }
    function scheduleSamples(phase) {
        const round = state.round;
        for (const delay of [1000, 5000, 10000]) {
            const expectedAt = now() + delay;
            const id = timers.setTimeout(() => {
                deadlines.delete(id);
                if (state.round !== round || currentOpen !== (phase === 'open')) return;
                record(phase + '.settle.' + delay, { delayBeyondScheduleMs: Math.max(0, now() - expectedAt) }, true);
            }, delay);
            deadlines.add(id);
        }
    }
    function wrapAsync(target, key, stage, onResult) {
        const original = target[key];
        if (typeof original !== 'function') throw Error('Missing diagnostic target ' + key);
        target[key] = function () {
            const start = now();
            const startDetail = key === 'init' ? { alreadyReady: !!this.cloudReady, hasPromise: !!this.initPromise || !!this.cloudInitPromise } :
                key === 'callLeaderboardCloudFunction' ? { action: ['submitProgress', 'getLeaderboard'].includes(arguments[0]) ? arguments[0] : 'other' } : null;
            record(stage + '.start', startDetail, true);
            let result;
            try { result = original.apply(this, arguments); }
            catch (error) { record(stage + '.error', { elapsedMs: now() - start, errorName: error.name }, true); throw error; }
            return Promise.resolve(result).then(value => {
                const detail = { elapsedMs: now() - start };
                if (typeof value === 'boolean') detail.ready = value;
                try { if (onResult) onResult(value, detail); }
                catch (error) { record(stage + '.invalid-result', { errorName: error.name }, true); throw error; }
                record(stage + '.end', detail, true);
                return value;
            }, error => {
                record(stage + '.error', { elapsedMs: now() - start, errorName: error.name }, true);
                throw error;
            });
        };
    }
    function hookManagers() {
        for (const name of ['WxCloudMgr', 'LeaderboardMgr']) {
            const Type = cc.js.getClassByName(name);
            if (!Type) throw Error('Unregistered class ' + name);
            if (wrappedManagers.has(Type)) continue;
            if (name === 'WxCloudMgr') wrapAsync(Type.prototype, 'init', 'cloud.sdk.init');
            else {
                const originalEnable = Type.prototype.enableCloudInit;
                Type.prototype.enableCloudInit = function () {
                    if (mode === 'panel' && currentOpen) { record('cloud.enable.skipped'); return; }
                    record('cloud.enable');
                    return originalEnable.apply(this, arguments);
                };
                wrapAsync(Type.prototype, 'submitProgress', 'rank.submit');
                wrapAsync(Type.prototype, 'callLeaderboardCloudFunction', 'rank.cloudcall', (value, detail) => {
                    detail.businessOk = value && typeof value.ok === 'boolean' ? value.ok : null;
                    if (detail.businessOk === false) record('rank.cloudcall.business-failed');
                });
                wrapAsync(Type.prototype, 'fetchLeaderboard', 'rank.fetch', (value, detail) => {
                    if (!value || !Array.isArray(value.entries)) throw Error('Invalid leaderboard response');
                    state.cloudSource = value.source;
                    state.entryCount = value.entries.length;
                    state.fingerprint = fingerprint(value);
                    Object.assign(detail, { source: value.source, entries: value.entries.length, fingerprint: state.fingerprint });
                    if (value.source !== 'wechat-cloud') record('rank.cloud.not-covered', { source: value.source });
                });
            }
            wrappedManagers.add(Type);
        }
    }
    function status(list, text) {
        const node = list.getChildByName('LeaderboardStatusTitle');
        const label = node && node.getComponent(cc.Label);
        if (!label) throw Error('Missing leaderboard status label');
        node.active = true; label.string = text;
    }
    function hookRuntime(target) {
        if (wrappedRuntimes.has(target)) return;
        const required = ['openLeaderboard', '_retainPanelTextureOwner', '_openPanelAfterTextures',
            'loadGlobalLeaderboard', 'renderLeaderboardRows', 'renderLeaderboardSelfBox',
            'loadAvatarToNode', 'renderLeaderboardRow', '_closePanelWithTextureOwner', 'switchLeaderboardTab',
            'getWeChatFriendAvatarEntries'];
        for (const name of required) if (typeof target[name] !== 'function') throw Error('Missing runtime method ' + name);
        const open = target.openLeaderboard;
        target.openLeaderboard = function () {
            if (state.failed) { this.showToast('诊断接入异常，请查看日志'); throw Error('Diagnostic invalid; refusing test'); }
            if (!currentOpen) {
                currentOpen = true; state.round++;
                state.cloudSource = null; state.entryCount = null; state.fingerprint = null;
                state.avatarCalls = state.catalogAvatarCalls = state.urlAvatarCalls = state.rowCalls = 0;
                record('open.before', null, true);
                scheduleSamples('open');
            }
            return open.apply(this, arguments);
        };
        const retain = target._retainPanelTextureOwner;
        target._retainPanelTextureOwner = function (key) {
            const result = retain.apply(this, arguments);
            if (key === 'leaderboard') record('panel.textures.retained', null, true);
            return result;
        };
        const prepare = target._openPanelAfterTextures;
        target._openPanelAfterTextures = function (key, names, isOpen, callback) {
            if (key !== 'leaderboard') return prepare.apply(this, arguments);
            record('panel.textures.start', { expected: names.length }, true);
            const args = Array.from(arguments);
            args[3] = function () { record('panel.textures.ready', null, true); return callback.apply(this, arguments); };
            return prepare.apply(this, args);
        };
        const load = target.loadGlobalLeaderboard;
        target.loadGlobalLeaderboard = async function (box, list, self) {
            record('panel.prefab.ready', null, true);
            if (mode === 'panel') {
                this.resetLeaderboardListState(list); self.active = false;
                status(list, 'D1 仅面板：未发起排行榜请求');
                record('rank.requests.skipped', null, true);
                return;
            }
            globalLoads++;
            const start = now(), round = state.round;
            try {
                const result = await load.apply(this, arguments);
                if (round !== state.round) { record('rank.flow.stale'); return result; }
                if (mode === 'data' && box.isValid && this.isLeaderboardTabRequestCurrent(arguments[3])) {
                    status(list, state.cloudSource === 'wechat-cloud'
                        ? 'D1 已返回' + state.entryCount + '项；未渲染列表/头像'
                        : 'D1 真实云榜未覆盖，请查看日志');
                }
                record('rank.flow.end', { elapsedMs: now() - start, source: state.cloudSource,
                    coverage: state.cloudSource === 'wechat-cloud' ? 'cloud-response-observed' : 'not-covered' }, true);
                return result;
            } catch (error) {
                record('rank.flow.error', { errorName: error.name }, true); throw error;
            } finally { globalLoads--; }
        };
        for (const key of ['renderLeaderboardRows', 'renderLeaderboardSelfBox']) {
            const render = target[key];
            target[key] = function () {
                if (mode === 'data' && globalLoads > 0) { record(key + '.skipped'); return; }
                if (currentOpen) record(key + '.start', null, true);
                const result = render.apply(this, arguments);
                if (currentOpen) record(key + '.end', null, true);
                return result;
            };
        }
        const avatar = target.loadAvatarToNode, row = target.renderLeaderboardRow;
        target.loadAvatarToNode = function (url, node, identity) {
            if (currentOpen) {
                state.avatarCalls++;
                if (identity && (identity.avatarId || identity.frameId)) state.catalogAvatarCalls++;
                else if (url && url.trim()) state.urlAvatarCalls++;
            }
            return avatar.apply(this, arguments);
        };
        target.renderLeaderboardRow = function () {
            if (currentOpen) state.rowCalls++;
            return row.apply(this, arguments);
        };
        wrapAsync(target, 'getWeChatFriendAvatarEntries', 'rank.friend-avatar-merge');
        const close = target._closePanelWithTextureOwner;
        target._closePanelWithTextureOwner = function (panel, key) {
            if (key !== 'leaderboard') return close.apply(this, arguments);
            if (globalLoads > 0) record('test.incomplete.closed-during-request');
            record('close.before', null, true);
            const result = close.apply(this, arguments);
            currentOpen = false;
            record('close.returned', null, true);
            scheduleSamples('close');
            return result;
        };
        const switchTab = target.switchLeaderboardTab;
        target.switchLeaderboardTab = function (box, tab) {
            if (tab === 'friend') {
                record('test.invalid.friend-tab');
                this.showToast('本包只测全国榜，请关闭后重新打开');
                return Promise.resolve();
            }
            return switchTab.apply(this, arguments);
        };
        wrappedRuntimes.add(target);
        record('diagnostic.runtime.ready', null, true);
    }
    function mountHud(scene) {
        const canvas = scene.getChildByName('Canvas');
        if (!canvas) return;
        const node = new cc.Node('RankDiagnosticD1'); node.layer = canvas.layer;
        canvas.addChild(node); node.setSiblingIndex(canvas.children.length - 1);
        const bounds = canvas.getComponent(cc.UITransform);
        node.addComponent(cc.UITransform).setContentSize(650, 64);
        node.setPosition(0, bounds ? bounds.height / 2 - 145 : 495);
        hud = node.addComponent(cc.Label); hud.fontSize = 20; hud.lineHeight = 24;
        hud.color = new cc.Color(245, 50, 50, 255);
        hud.overflow = cc.Label.Overflow.SHRINK;
        // No listeners, Button, Mask, Graphics, new Canvas or BlockInputEvents.
        refreshHud();
    }
    function sceneReady() {
        const scene = cc.director.getScene();
        if (!scene) return;
        try {
            mountHud(scene);
            hookManagers();
            const found = [];
            function visit(node) {
                for (const component of node.components || []) {
                    if (typeof component.openLeaderboard === 'function' && component._spriteFrameCacheMeta instanceof Map) found.push(component);
                }
                for (const child of node.children) visit(child);
            }
            visit(scene);
            if (found.length > 1) throw Error('Ambiguous leaderboard runtime');
            runtime = found[0] || null;
            if (runtime) hookRuntime(runtime);
            if (scene.name === 'Home' && !runtime) throw Error('Home leaderboard runtime unavailable');
            record('scene.ready', { scene: scene.name, hooked: !!runtime }, true);
        } catch (error) { fail('scene-hook', error); }
    }
    const api = { snapshot, state: () => JSON.parse(JSON.stringify({ ...state, logPath })),
        readLog: () => {
            if (!fsApi || !logPath) throw Error('Diagnostic file unavailable');
            return fsApi.readFileSync(logPath, 'utf8');
        },
        attachEngine(engine) {
            if (cc) throw Error('Diagnostic engine already attached');
            cc = engine;
            cc.director.on(cc.Director.EVENT_AFTER_SCENE_LAUNCH, sceneReady);
            record('engine.attached');
            if (cc.director.getScene()) sceneReady();
        },
        dispose() {
            for (const id of deadlines) timers.clearTimeout(id);
            deadlines.clear();
            if (cc) cc.director.off(cc.Director.EVENT_AFTER_SCENE_LAUNCH, sceneReady);
        } };
    host.__PDD_RANK_DIAG__ = api;
    try {
        if (wxApi && wxApi.env && wxApi.env.USER_DATA_PATH && wxApi.getFileSystemManager) {
            fsApi = wxApi.getFileSystemManager();
            logPath = wxApi.env.USER_DATA_PATH + '/pdd-rank-diagnostic-d1-' + mode + '.jsonl';
            fsApi.writeFileSync(logPath, '', 'utf8'); // One bounded file per mode, newest session replaces previous.
            state.storage = 'writing';
        } else state.storage = 'unavailable';
    } catch (error) { state.storage = 'init-failed'; recordFailure = error; }
    record('diagnostic.boot', { diagnosticId: config.diagnosticId, baseBuildId: config.baseBuildId,
        storage: state.storage, memoryScope: 'observable-engine-and-js-only' });
    if (recordFailure) fail('file-init', recordFailure);
    return api;
};
