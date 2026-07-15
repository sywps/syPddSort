import { SafeArea, Widget } from 'cc';
import {
    AudioMgr, Button, Label, Node, Prefab, Sprite, SpriteFrame, UITransform, instantiate,
} from '../GameCtrlShared';
import type { Bundle } from '../GameCtrlShared';

type TopHudMode = 'home' | 'game' | 'winSettlement';

type TopHudWidgets = {
    root: Node;
    settingsBtn: Node;
    goldBox: Node | null;
    vigorBox: Node | null;
    coinIcon: Node | null;
};

const TOP_HUD_PREFAB_PATH = 'UI/Prefabs/Panels/TopHud';
const TOP_HUD_ROOT_NAME = 'TopHud';
const SETTINGS_BUTTON_NAME = 'SettingsButton';
const SETTINGS_ICON_NAME = 'HomeSettingsIcon';
const GOLD_GROUP_NAME = 'GoldGroup';
const GOLD_BANNER_NAME = 'GoldBanner';
const GOLD_COUNT_NAME = 'GoldCount';
const VIGOR_GROUP_NAME = 'VigorGroup';
const VIGOR_BANNER_NAME = 'LivesBanner';
const VIGOR_COUNT_NAME = 'VigorCount';
const VIGOR_TIME_BG_NAME = 'TimeBg';
const VIGOR_TIME_NAME = 'VigorTime';
const LEGACY_TOP_HUD_NAMES = new Set([
    'Settings',
    'SettingsButton',
    'GoldGroup',
    'VigorGroup',
    'WinSettlementSettingsButton',
    'WinSettlementGoldBox',
]);
const SETTINGS_TEXTURE_NAME = '\u8bbe\u7f6e';
const HOME_GOLD_BANNER_TEXTURE_NAME = '\u91d1\u5e01\u6846 (2)';
const POPUP_CURRENCY_CHIP_TEXTURE_NAME = 'popup_currency_chip';

function setLayerDeep(node: Node, layer: number): void {
    node.layer = layer;
    for (const child of node.children) {
        setLayerDeep(child, layer);
    }
}

function syncWidget(widget: Widget, options: { left?: number; right?: number; top?: number; bottom?: number; full?: boolean }): void {
    const raw = widget as any;
    raw.isAlignLeft = options.full || Number.isFinite(options.left);
    raw.isAlignRight = options.full || Number.isFinite(options.right);
    raw.isAlignTop = options.full || Number.isFinite(options.top);
    raw.isAlignBottom = options.full || Number.isFinite(options.bottom);
    raw.left = options.full ? 0 : (options.left || 0);
    raw.right = options.full ? 0 : (options.right || 0);
    raw.top = options.full ? 0 : (options.top || 0);
    raw.bottom = options.full ? 0 : (options.bottom || 0);
    raw.alignMode = 2;
    widget.updateAlignment?.();
}

function requireChild(parent: Node, name: string, path: string): Node {
    const child = parent.getChildByName(name);
    if (!child?.isValid) {
        throw new Error(`[TopHudPrefab] missing node: ${path}`);
    }
    return child;
}

function requireUi(node: Node, path: string): UITransform {
    const ui = node.getComponent(UITransform);
    if (!ui) {
        throw new Error(`[TopHudPrefab] missing UITransform: ${path}`);
    }
    return ui;
}

function requireWidget(node: Node, path: string): Widget {
    const widget = node.getComponent(Widget);
    if (!widget) {
        throw new Error(`[TopHudPrefab] missing Widget: ${path}`);
    }
    return widget;
}

function requireSafeArea(node: Node, path: string): SafeArea {
    const safeArea = node.getComponent(SafeArea);
    if (!safeArea) {
        throw new Error(`[TopHudPrefab] missing SafeArea: ${path}`);
    }
    return safeArea;
}

function getOrAddButton(node: Node): Button {
    return node.getComponent(Button) || node.addComponent(Button);
}

function requireSprite(node: Node, path: string): Sprite {
    const sprite = node.getComponent(Sprite);
    if (!sprite) {
        throw new Error(`[TopHudPrefab] missing Sprite: ${path}`);
    }
    return sprite;
}

function requireLabel(node: Node, path: string): Label {
    const label = node.getComponent(Label);
    if (!label) {
        throw new Error(`[TopHudPrefab] missing Label: ${path}`);
    }
    return label;
}

function hasStaticTopHudStructure(root: Node): boolean {
    const settings = root.getChildByName(SETTINGS_BUTTON_NAME);
    const gold = root.getChildByName(GOLD_GROUP_NAME);
    const vigor = root.getChildByName(VIGOR_GROUP_NAME);
    return !!settings?.getChildByName(SETTINGS_ICON_NAME)
        && !!gold?.getChildByName(GOLD_BANNER_NAME)
        && !!gold?.getChildByName(GOLD_COUNT_NAME)
        && !!vigor?.getChildByName(VIGOR_BANNER_NAME)
        && !!vigor?.getChildByName(VIGOR_COUNT_NAME)
        && !!vigor?.getChildByName(VIGOR_TIME_BG_NAME)
        && !!vigor?.getChildByName(VIGOR_TIME_NAME);
}

function spriteFrameOf(node: Node | null | undefined): SpriteFrame | null {
    return node?.getComponent(Sprite)?.spriteFrame || null;
}

function getSettingFrame(parent: Node, runtime: any): SpriteFrame | null {
    return spriteFrameOf(parent.getChildByName('SettingsButton')?.getChildByName('HomeSettingsIcon'))
        || spriteFrameOf(parent.getChildByName('Settings')?.getChildByName('SettingsIcon'))
        || spriteFrameOf(runtime.getGameplayFixedRoot?.()?.getChildByName('TopBarGroup')?.getChildByName('Settings')?.getChildByName('SettingsIcon'))
        || runtime.getSF?.(SETTINGS_TEXTURE_NAME)
        || null;
}

function getGoldBannerFrame(parent: Node, runtime: any): SpriteFrame | null {
    return spriteFrameOf(parent.getChildByName('GoldGroup')?.getChildByName('GoldBanner'))
        || runtime.getSF?.(HOME_GOLD_BANNER_TEXTURE_NAME)
        || runtime.getSF?.(POPUP_CURRENCY_CHIP_TEXTURE_NAME)
        || null;
}

function getVigorBannerFrame(parent: Node): SpriteFrame | null {
    return spriteFrameOf(parent.getChildByName('VigorGroup')?.getChildByName('LivesBanner'));
}

function getVigorTimeBgFrame(parent: Node): SpriteFrame | null {
    return spriteFrameOf(parent.getChildByName('VigorGroup')?.getChildByName('TimeBg'));
}

function hideLegacyTopHudChildren(parent: Node, root: Node): void {
    for (const child of parent.children) {
        if (child === root) continue;
        if (LEGACY_TOP_HUD_NAMES.has(child.name)) {
            child.active = false;
        }
    }
}

export function installTopHudModule(target: any): void {
    Object.assign(target, {
        rememberTopHudMount(parent: Node, mode: TopHudMode): void {
            const mounts = Array.isArray(this._topHudMounts) ? this._topHudMounts : [];
            const existing = mounts.find((entry: any) => entry?.parent === parent);
            if (existing) {
                existing.mode = mode;
            } else {
                mounts.push({ parent, mode });
            }
            this._topHudMounts = mounts.filter((entry: any) => entry?.parent?.isValid);
        },

        refreshTopHudPrefabMounts(): void {
            const mounts = Array.isArray(this._topHudMounts) ? this._topHudMounts : [];
            this._topHudMounts = mounts.filter((entry: any) => entry?.parent?.isValid);
            for (const entry of this._topHudMounts) {
                const parent = entry.parent as Node;
                const root = parent.getChildByName(TOP_HUD_ROOT_NAME);
                if (root?.isValid && !hasStaticTopHudStructure(root)) {
                    root.destroy();
                }
                this.syncTopHud?.(parent, entry.mode);
            }
        },

        preloadTopHudPrefab(): void {
            if (this._topHudPrefab || this._topHudPrefabLoading) return;
            if (typeof this._withGameAssetsBundle !== 'function') return;
            this._topHudPrefabLoading = true;
            this._withGameAssetsBundle((bundle: Bundle | null) => {
                if (!bundle) {
                    this._topHudPrefabLoading = false;
                    return;
                }
                bundle.load(TOP_HUD_PREFAB_PATH, Prefab, (err: Error | null, prefab: Prefab | null) => {
                    this._topHudPrefabLoading = false;
                    if (err || !prefab) return;
                    this._topHudPrefab = prefab;
                    this.refreshTopHudPrefabMounts?.();
                });
            });
        },

        ensureTopHudRoot(parent: Node): Node | null {
            let root = parent.getChildByName(TOP_HUD_ROOT_NAME);
            if (root?.isValid && !hasStaticTopHudStructure(root)) {
                if (this._topHudPrefab) {
                    root.destroy();
                    root = null;
                } else {
                    return null;
                }
            }
            if (!root?.isValid) {
                const prefab = this._topHudPrefab as Prefab | null;
                if (!prefab) {
                    return null;
                }
                root = instantiate(prefab);
                parent.addChild(root);
            }
            root.name = TOP_HUD_ROOT_NAME;
            root.active = true;
            root.setPosition(0, 0, 0);
            requireUi(root, TOP_HUD_ROOT_NAME).setContentSize(720, 1280);
            syncWidget(requireWidget(root, TOP_HUD_ROOT_NAME), { full: true });
            const safeArea = requireSafeArea(root, TOP_HUD_ROOT_NAME);
            safeArea.enabled = !parent.getComponent(SafeArea);
            setLayerDeep(root, parent.layer);
            root.setSiblingIndex(Math.max(0, parent.children.length - 1));
            return root;
        },

        syncTopHud(parent: Node, mode: TopHudMode): TopHudWidgets | null {
            if (!parent?.isValid) return null;
            this.rememberTopHudMount?.(parent, mode);
            const settingFrame = getSettingFrame(parent, this);
            const goldFrame = getGoldBannerFrame(parent, this);
            const vigorFrame = getVigorBannerFrame(parent);
            const vigorTimeBgFrame = getVigorTimeBgFrame(parent);
            const root = this.ensureTopHudRoot(parent);
            if (!root) return null;
            const applyFrame = (sprite: Sprite | null, frame: SpriteFrame | null, reason: string) => {
                if (!sprite || !frame) return;
                if (typeof this.scheduleSpriteFrameApply === 'function') {
                    this.scheduleSpriteFrameApply(sprite, frame, reason);
                    return;
                }
                sprite.spriteFrame = frame;
            };
            hideLegacyTopHudChildren(parent, root);

            const settingsBtn = requireChild(root, SETTINGS_BUTTON_NAME, `${TOP_HUD_ROOT_NAME}/${SETTINGS_BUTTON_NAME}`);
            const settingsButton = getOrAddButton(settingsBtn);
            const settingsIcon = requireChild(settingsBtn, SETTINGS_ICON_NAME, `${TOP_HUD_ROOT_NAME}/${SETTINGS_BUTTON_NAME}/${SETTINGS_ICON_NAME}`);
            const settingsSprite = requireSprite(settingsIcon, `${TOP_HUD_ROOT_NAME}/${SETTINGS_BUTTON_NAME}/${SETTINGS_ICON_NAME}`);
            if (!settingsSprite.spriteFrame && settingFrame) {
                applyFrame(settingsSprite, settingFrame, `top-hud:${mode}:settings`);
            }
            const goldNode = requireChild(root, GOLD_GROUP_NAME, `${TOP_HUD_ROOT_NAME}/${GOLD_GROUP_NAME}`);
            const vigorNode = requireChild(root, VIGOR_GROUP_NAME, `${TOP_HUD_ROOT_NAME}/${VIGOR_GROUP_NAME}`);
            let goldBox: Node | null = null;
            let vigorBox: Node | null = null;

            settingsBtn.targetOff(this);
            settingsButton.node.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play(mode === 'game' ? 'button' : 'uiPanel');
                this.openSettingsPanel?.();
            }, this);

            if (mode === 'home' || mode === 'winSettlement') {
                goldNode.active = true;
                const goldBanner = requireChild(goldNode, GOLD_BANNER_NAME, `${TOP_HUD_ROOT_NAME}/${GOLD_GROUP_NAME}/${GOLD_BANNER_NAME}`);
                const goldBannerSprite = requireSprite(goldBanner, `${TOP_HUD_ROOT_NAME}/${GOLD_GROUP_NAME}/${GOLD_BANNER_NAME}`);
                if (!goldBannerSprite.spriteFrame && goldFrame) {
                    applyFrame(goldBannerSprite, goldFrame, `top-hud:${mode}:gold`);
                }
                const goldCount = requireChild(goldNode, GOLD_COUNT_NAME, `${TOP_HUD_ROOT_NAME}/${GOLD_GROUP_NAME}/${GOLD_COUNT_NAME}`);
                const goldLabel = requireLabel(goldCount, `${TOP_HUD_ROOT_NAME}/${GOLD_GROUP_NAME}/${GOLD_COUNT_NAME}`);
                goldLabel.string = `${this.getGold?.() ?? 0}`;
                goldBox = goldNode;
                if (mode === 'home') {
                    this._goldCountLbl = goldLabel;
                    goldBox.targetOff(this);
                    getOrAddButton(goldBox).node.on(Button.EventType.CLICK, () => {
                        AudioMgr.inst.play('button');
                        this.openGoldAcquirePanel?.();
                    }, this);
                    this.refreshGoldUI?.();
                } else {
                    this._settlementGoldCountLbl = goldLabel;
                    if (!goldBannerSprite.spriteFrame) {
                        this.applySettlementSpriteFrame?.(goldBannerSprite, [HOME_GOLD_BANNER_TEXTURE_NAME, POPUP_CURRENCY_CHIP_TEXTURE_NAME], null);
                    }
                }
            } else if (goldNode?.isValid) {
                goldNode.active = false;
            }

            if (mode === 'home') {
                const count = `${this.getVigor?.() ?? 0}/${(this.constructor as any).VIGOR_CEILING}`;
                vigorNode.active = true;
                const vigorBanner = requireChild(vigorNode, VIGOR_BANNER_NAME, `${TOP_HUD_ROOT_NAME}/${VIGOR_GROUP_NAME}/${VIGOR_BANNER_NAME}`);
                const vigorBannerSprite = requireSprite(vigorBanner, `${TOP_HUD_ROOT_NAME}/${VIGOR_GROUP_NAME}/${VIGOR_BANNER_NAME}`);
                if (!vigorBannerSprite.spriteFrame && vigorFrame) {
                    applyFrame(vigorBannerSprite, vigorFrame, 'top-hud:home:vigor');
                }
                const vigorCount = requireChild(vigorNode, VIGOR_COUNT_NAME, `${TOP_HUD_ROOT_NAME}/${VIGOR_GROUP_NAME}/${VIGOR_COUNT_NAME}`);
                const vigorCountLabel = requireLabel(vigorCount, `${TOP_HUD_ROOT_NAME}/${VIGOR_GROUP_NAME}/${VIGOR_COUNT_NAME}`);
                vigorCountLabel.string = count;
                const timeBg = requireChild(vigorNode, VIGOR_TIME_BG_NAME, `${TOP_HUD_ROOT_NAME}/${VIGOR_GROUP_NAME}/${VIGOR_TIME_BG_NAME}`);
                const timeBgSprite = timeBg.getComponent(Sprite);
                if (timeBgSprite && !timeBgSprite.spriteFrame && vigorTimeBgFrame) {
                    applyFrame(timeBgSprite, vigorTimeBgFrame, 'top-hud:home:vigor-time-bg');
                }
                const vigorTime = requireChild(vigorNode, VIGOR_TIME_NAME, `${TOP_HUD_ROOT_NAME}/${VIGOR_GROUP_NAME}/${VIGOR_TIME_NAME}`);
                const vigorTimeLabel = requireLabel(vigorTime, `${TOP_HUD_ROOT_NAME}/${VIGOR_GROUP_NAME}/${VIGOR_TIME_NAME}`);
                vigorBox = vigorNode;
                this._vigorCountLbl = vigorCountLabel;
                this._vigorTimeLbl = vigorTimeLabel;
                vigorBox.targetOff(this);
                getOrAddButton(vigorBox).node.on(Button.EventType.CLICK, () => {
                    AudioMgr.inst.play('button');
                    this.showNoLivesAdModal?.(() => {});
                }, this);
                this.refreshVigorUI?.();
            } else if (vigorNode?.isValid) {
                vigorNode.active = false;
            }

            if (!settingsSprite.spriteFrame) {
                this.applySettlementSpriteFrame?.(settingsSprite, [SETTINGS_TEXTURE_NAME], settingFrame);
            }
            setLayerDeep(root, parent.layer);
            return { root, settingsBtn, goldBox, vigorBox, coinIcon: goldBox };
        },
    });
}
