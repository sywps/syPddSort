import { _decorator, Animation, AudioSource, Canvas, Color, Component, Label, Node, ParticleSystem2D, Rect, Size, Sprite, SpriteFrame, Tween, UIOpacity, UITransform, Vec3, Widget, tween } from 'cc';
import { AudioMgr } from './AudioMgr';

const { ccclass, property } = _decorator;

type Pose = { node: Node; scale: Vec3; angles: Vec3; opacity: UIOpacity | null; alpha: number };

/** Presentation only. The caller supplies the completed artwork and owns all reward/navigation actions. */
@ccclass('WinPanel2Presentation')
export class WinPanel2Presentation extends Component {
    @property(SpriteFrame) confettiAtlas: SpriteFrame | null = null;
    @property([SpriteFrame]) streakBadges: SpriteFrame[] = [];
    private confettiFrames: SpriteFrame[] = [];
    private entrance: Animation | null = null;
    private sweep: Animation | null = null;
    private light: Node | null = null;
    private confetti: Node | null = null;
    private particles: ParticleSystem2D[] = [];
    private sounds: AudioSource[] = [];
    private poses: Pose[] = [];
    private playing = false;

    private requireNode(path: string): Node {
        const node = this.node.getChildByPath(path);
        if (!node) throw new Error(`[WinPanel2] missing prefab node: ${path}`);
        return node;
    }

    onLoad(): void {
        this.entrance = this.node.getComponent(Animation);
        this.sweep = this.requireNode('Box/MiddleGroup/Sweep').getComponent(Animation);
        this.light = this.requireNode('Box/MiddleGroup/RotatingLight');
        this.confetti = this.requireNode('Confetti');
        this.particles = this.confetti.getComponentsInChildren(ParticleSystem2D);
        this.sounds = this.node.getComponents(AudioSource);
        // The sweep starts inactive; its Animation.onLoad has not created states yet.
        if (this.entrance?.defaultClip?.name !== 'WinPanel2Entrance' || this.sweep?.defaultClip?.name !== 'WinPanel2Sweep') {
            throw new Error('[WinPanel2] entrance or sweep AnimationClip is missing');
        }
        if (this.particles.length !== 27 || this.particles.some(particle => !particle.spriteFrame)) {
            throw new Error('[WinPanel2] expected 27 authored confetti emitters with SpriteFrames');
        }
        if (this.sounds.length !== 2 || this.sounds.some(source => !source.clip)) {
            throw new Error('[WinPanel2] victory and confetti AudioClips are missing');
        }
        this.configureConfettiStyle();
        let canvasNode: Node | null = this.node.parent;
        while (canvasNode && !canvasNode.getComponent(Canvas)) canvasNode = canvasNode.parent;
        if (!canvasNode) throw new Error('[WinPanel2] the panel must be mounted below a Canvas');
        const rootWidget = this.node.getComponent(Widget)!;
        // Some hosts keep Canvas at the design size. Scene alignment uses the actual visible viewport.
        rootWidget.target = this.node.scene;
        rootWidget.updateAlignment();
        this.node.on(Node.EventType.SIZE_CHANGED, this.fitLayout, this);
        this.fitLayout();
        const save = (node: Node) => {
            const opacity = node.getComponent(UIOpacity);
            this.poses.push({ node, scale: node.scale.clone(), angles: node.eulerAngles.clone(), opacity, alpha: opacity?.opacity ?? 255 });
            node.children.forEach(save);
        };
        // Root opacity belongs to the caller's asynchronous artwork readiness gate.
        this.node.children.forEach(save);
        this.stop();
    }

    private fitLayout(): void {
        if (!this.node.isValid) return;
        const size = this.node.getComponent(UITransform)!;
        const box = this.requireNode('Box');
        box.getComponent(UITransform)!.setContentSize(720, Math.max(1280, size.height));
        const scale = Math.min(1, size.width / 720, size.height / 1280);
        box.setScale(scale, scale, 1);
        // Widget owns the positions; compact screens only scale the whole content block.
        this.node.children.forEach(node => node.getComponentsInChildren(Widget).forEach(widget => widget.enabled && widget.updateAlignment()));
    }

    private configureConfettiStyle(): void {
        const atlas = this.confettiAtlas;
        if (!atlas?.texture || atlas.rotated || atlas.rect.width !== 128 || atlas.rect.height !== 128) {
            throw new Error('[WinPanel2] expected the existing untrimmed 128 x 128 confetti atlas');
        }
        this.confettiFrames = [[0, 42], [42, 42], [84, 44]].map(([x, width], index) => {
            const frame = new SpriteFrame();
            frame.name = `WinPanel2OwnConfetti${index}`;
            frame.texture = atlas.texture;
            frame.rect = new Rect(atlas.rect.x + x, atlas.rect.y, width, 128);
            frame.originalSize = new Size(width, 128);
            return frame;
        });
        // Same three silhouettes and six colors as the existing WinConfettiFx.
        const colors = ['#FF5B68', '#FFD34E', '#43C6F1', '#66D36E', '#A878F5', '#FF8E45'];
        this.particles.forEach((particle, index) => {
            const slot = index % 6;
            particle.spriteFrame = this.confettiFrames[slot < 3 ? 0 : slot < 5 ? 1 : 2];
            particle.aspectRatio = slot < 3 ? 26 / 37 : slot < 5 ? 22.5 / 63 : 34 / 88;
            particle.startColor = new Color(colors[index % colors.length]);
            particle.endColor = new Color(colors[index % colors.length]);
            particle.startColorVar = new Color(0, 0, 0, 0);
            particle.endColorVar = new Color(0, 0, 0, 0);
        });
    }

    /** Display only: the owner supplies streak state and separately handles reward transactions. */
    setWinStreak(count: number): void {
        if (!Number.isSafeInteger(count) || count < 0) throw new Error('[WinPanel2] invalid win streak');
        if (this.streakBadges.length !== 3 || this.streakBadges.some(frame => !frame?.isValid)) {
            throw new Error('[WinPanel2] three win streak badge SpriteFrames are required');
        }
        this.requireNode('Box/BottomGroup/WinStreakBar/Fill').getComponent(Sprite)!.fillRange = Math.min(count / 6, 1);
        const badge = this.requireNode('Box/BottomGroup/PrimaryBtn/WinStreakBadge');
        badge.getComponent(Sprite)!.spriteFrame = this.streakBadges[count >= 6 ? 2 : count >= 3 ? 1 : 0];
        badge.getChildByName('WinCount')!.getComponent(Label)!.string = `${count}连胜`;
    }

    /** Explicit start: wait for renderCompletedPatternPreview's successful onReady before calling. */
    play(): void {
        if (!this.entrance || !this.sweep || !this.light || !this.confetti) {
            throw new Error('[WinPanel2] presentation is not initialized');
        }
        if (!this.node.activeInHierarchy) throw new Error('[WinPanel2] cannot play a hidden panel');
        this.stop();
        this.playing = true;
        this.confetti.active = true;
        this.particles.forEach(particle => particle.resetSystem());
        this.entrance.play('WinPanel2Entrance');
        tween(this.light).by(15, { angle: -360 }).repeatForever().start();
        if (AudioMgr.inst.isSfxEnabled()) this.sounds.forEach(source => source.play());
    }

    /** Authored entrance event at 2.1667 seconds, matching the reference animation. */
    playSweep(): void {
        if (!this.playing || !this.sweep) return;
        this.sweep.node.active = true;
        this.sweep.play('WinPanel2Sweep');
    }

    update(): void {
        if (this.playing && !AudioMgr.inst.isSfxEnabled()) this.sounds.forEach(source => source.stop());
    }

    stop(): void {
        this.playing = false;
        this.entrance?.stop();
        this.sweep?.stop();
        if (this.light) Tween.stopAllByTarget(this.light);
        this.sounds.forEach(source => source.isValid && source.stop());
        this.particles.forEach(particle => {
            if (!particle.isValid) return;
            // stopSystem alone leaves live particles behind, which would leak into a replay.
            particle.resetSystem();
            particle.stopSystem();
        });
        if (this.confetti?.isValid) this.confetti.active = false;
        if (this.sweep?.node.isValid) this.sweep.node.active = false;
        this.poses.forEach(pose => {
            if (!pose.node.isValid) return;
            pose.node.setScale(pose.scale);
            pose.node.setRotationFromEuler(pose.angles);
            if (pose.opacity?.isValid) pose.opacity.opacity = pose.alpha;
        });
        if (this.node.isValid && this.node.parent) this.fitLayout();
    }

    onDisable(): void { this.stop(); }
    onDestroy(): void {
        this.node.off(Node.EventType.SIZE_CHANGED, this.fitLayout, this);
        this.stop(); this.poses.length = 0;
        this.confettiFrames.forEach(frame => frame.destroy());
        this.confettiFrames.length = 0;
    }
}
