'use strict';

// Included only by the separate diagnostic-package tool. No storage, network or reward writes.
module.exports = function installDiagnostic(host, tt, log, config, clock) {
    if (host.__PDD_SIDEBAR_DIAGNOSTIC__) return host.__PDD_SIDEBAR_DIAGNOSTIC__;
    const timer = clock || { setTimeout, setInterval };
    const originalError = log.error;
    const state = { version: config.version, base: config.base, source: '未取得', scene: '',
        entry: 0, phase: '入口脚本', errors: [], engine: '', shown: false };
    let cc, root, heading, details, panel, busy = false, modalPending = false;
    function clean(value) {
        return String(value || '').replace(/https?:\/\/[^\s"'<>]+/gi, url => url.split(/[?#]/)[0])
            .replace(/((?:openid|session_key|access_token|authorization|token|secret)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[隐藏]')
            .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[邮箱隐藏]').slice(0, 650);
    }
    function message(args) {
        return args.map(value => {
            if (typeof value === 'string') return clean(value);
            if (!value || typeof value !== 'object') return '';
            // Do not serialize identity/request objects. Keep only known error/resource fields.
            return ['message', 'errMsg', 'errorMessage', 'errorCode', 'levelPath', 'resource']
                .filter(key => typeof value[key] === 'string').map(key => key + ': ' + clean(value[key])).join(' ');
        }).filter(Boolean).join(' ').slice(0, 800);
    }
    function entry(options, kind) {
        state.entry++;
        state.shown = false;
        const sidebar = options && options.launch_from === 'homepage' && options.location === 'sidebar_card';
        state.source = kind + ' / ' + (sidebar ? '侧边栏' : '其他入口');
        state.scene = /^[0-9]{1,12}$/.test(String(options && options.scene || '')) ? String(options.scene) : '未知';
        refresh();
    }
    function summary() {
        return '排查版 ' + state.version + ' · 基于 ' + state.base + ' · dev\n' + state.source + ' #' + state.entry
            + ' · scene=' + state.scene + '\n画面: ' + state.engine + ' · 阶段: ' + state.phase;
    }
    function showNative() {
        if (state.shown || modalPending || !tt || typeof tt.showModal !== 'function') return;
        modalPending = true;
        timer.setTimeout(() => {
            modalPending = false;
            if (state.shown) return;
            state.shown = true;
            try { tt.showModal({ title: '排查版 ' + state.version + ' 启动诊断',
                content: summary() + '\n' + (state.errors.slice(-2).map(item => item.text).join('\n') || '尚未建立诊断画面，请截图。'),
                showCancel: false, confirmText: '知道了', fail: error => originalError.call(log, '[D1] diagnostic modal unavailable', error) }); }
            catch (error) { originalError.call(log, '[D1] diagnostic modal failed', error); }
        }, 100);
    }
    function capture(args, fatal) {
        if (busy) return;
        busy = true;
        try {
            const text = message(args);
            if (!text) return;
            const previous = state.errors[state.errors.length - 1];
            if (!previous || previous.text !== text || previous.entry !== state.entry) {
                state.errors.push({ text, entry: state.entry });
                if (state.errors.length > 6) state.errors.shift();
            }
            refresh();
            if (fatal || /\[SceneSplit\]|\[StartupLoading\]|\[LevelDataLoad\]|readFile:fail|load scene.*failed/i.test(text)) showNative();
        } catch (error) { originalError.call(log, '[D1] diagnostic observer failed', error); }
        finally { busy = false; }
    }
    log.error = function () {
        const args = Array.prototype.slice.call(arguments);
        try { return originalError.apply(log, args); }
        finally { capture(args, false); }
    };
    host.__PDD_STARTUP_DIAGNOSTIC__ = true;
    function refresh() {
        if (!heading || !heading.node.isValid) return;
        try {
            const events = host.__PDD_STARTUP_DIAGNOSTIC_EVENTS__;
            if (events && events.length) state.phase = clean(events[events.length - 1].event).slice(0, 80);
            state.engine = cc.director.getScene()?.name || '无场景';
            heading.string = summary();
            details.string = state.errors.length ? '最近错误（保留此前记录）\n' + state.errors.slice(-2)
                .map(item => '[入口 #' + item.entry + '] ' + item.text.slice(0, 280)).join('\n') : '';
            panel.active = !!state.errors.length;
        } catch (error) { originalError.call(log, '[D1] diagnostic refresh failed', error); }
    }
    function mount() {
        try {
            const scene = cc.director.getScene();
            if (!scene) return;
            if (root && root.isValid) root.destroy();
            const layer = 1 << 26;
            root = new cc.Node('D1DiagnosticCanvas'); root.layer = layer;
            root.addComponent(cc.UITransform);
            const canvas = root.addComponent(cc.Canvas);
            const cameraNode = new cc.Node('D1Camera'); cameraNode.layer = layer; cameraNode.parent = root;
            const camera = cameraNode.addComponent(cc.Camera);
            camera.projection = cc.Camera.ProjectionType.ORTHO;
            camera.near = 0.1; camera.far = 2000;
            camera.clearFlags = cc.Camera.ClearFlag.DEPTH_ONLY; camera.visibility = layer;
            canvas.cameraComponent = camera;
            camera.priority = 32760;
            root.parent = scene;
            function box(name, height, fontSize) {
                const node = new cc.Node(name); node.layer = layer; node.parent = root;
                node.addComponent(cc.UITransform);
                const bg = node.addComponent(cc.Graphics);
                const text = new cc.Node('Text'); text.layer = layer; text.parent = node;
                text.addComponent(cc.UITransform);
                const label = text.addComponent(cc.Label);
                label.fontSize = fontSize; label.lineHeight = fontSize + 4;
                label.color = new cc.Color(255, 255, 255, 255);
                label.horizontalAlign = cc.Label.HorizontalAlign.LEFT;
                label.verticalAlign = cc.Label.VerticalAlign.TOP;
                label.overflow = cc.Label.Overflow.SHRINK; label.enableWrapText = true;
                return { node, bg, text, label, height };
            }
            const header = box('Version', 104, 22), errorBox = box('Errors', 360, 23);
            heading = header.label; details = errorBox.label; panel = errorBox.node;
            function resize() {
                if (!root || !root.isValid) return;
                const size = cc.view.getVisibleSize(), width = Math.max(240, size.width - 36);
                root.getComponent(cc.UITransform).setContentSize(size.width, size.height);
                root.setPosition(size.width / 2, size.height / 2);
                camera.orthoHeight = size.height / 2;
                header.node.setPosition(0, size.height / 2 - 200);
                errorBox.node.setPosition(0, 0);
                for (const item of [header, errorBox]) {
                    item.node.getComponent(cc.UITransform).setContentSize(width, item.height);
                    item.text.getComponent(cc.UITransform).setContentSize(width - 20, item.height - 16);
                    item.bg.clear(); item.bg.fillColor = new cc.Color(15, 25, 45, 235);
                    item.bg.rect(-width / 2, -item.height / 2, width, item.height); item.bg.fill();
                }
            }
            resize(); refresh();
            // No touch listeners or BlockInputEvents; underlying gameplay keeps receiving input.
        } catch (error) {
            originalError.call(log, '[D1] diagnostic UI failed', error);
            capture(['诊断画面建立失败', error], true);
        }
    }
    const api = { snapshot: () => JSON.parse(JSON.stringify(state)), attachEngine(engine) {
        if (cc) return;
        cc = engine; state.phase = '引擎已载入';
        cc.director.on(cc.Director.EVENT_AFTER_SCENE_LAUNCH, mount);
        timer.setInterval(refresh, 500);
    } };
    host.__PDD_SIDEBAR_DIAGNOSTIC__ = api;
    try {
        entry(tt.getLaunchOptionsSync(), '冷启动');
        tt.onShow(options => entry(options, '回前台'));
        if (typeof tt.onError === 'function') tt.onError(error => capture([error], true));
        if (typeof tt.onUnhandledRejection === 'function') tt.onUnhandledRejection(event => capture([event && event.reason], true));
    } catch (error) { capture(['读取启动信息失败', error], true); }
    timer.setTimeout(() => { if (!heading || !heading.node.isValid) showNative(); }, 20000);
    return api;
};
