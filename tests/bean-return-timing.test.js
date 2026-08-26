const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const section = (source, startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0, `missing section start: ${startMarker}`);
    assert.ok(end > start, `missing section end: ${endMarker}`);
    return source.slice(start, end);
};

const magnet = read('assets/Scripts/Core/GameCtrlModules/GameplaySkillMagnetModule.ts');
const wand = read('assets/Scripts/Core/GameCtrlModules/GameplaySkillWandModule.ts');
const pch = read('assets/Scripts/Core/PchConveyorGameplayController.ts');

const magnetReturn = section(
    magnet,
    '        playForcedSkillPlanNearParallel(',
    '        playForcedSkillPlan(',
);
assert.ok(magnetReturn.includes('const SKILL_FLY_DUR = 0.2;'), 'active magnet/wand return flights must last 0.20 seconds');
assert.ok(magnetReturn.includes('const SKILL_MOVE_STAGGER = 0.028;'), 'active magnet/wand return flights must stagger by 0.028 seconds');
assert.ok(magnetReturn.includes('.delay(move.delay)'), 'active forced returns must apply their fixed indexed delay');
assert.ok(magnetReturn.includes("{ easing: 'sineOut' }"), 'active forced returns must use sineOut easing');
assert.ok(!magnet.includes('plan.maxStartDelay ='), 'active magnet entrypoints must not compress the fixed stagger');

const wandDump = section(
    wand,
    '        dumpRemainingSlotBeans(',
    '        /** 刷子归位完成后的清理 */',
);
assert.ok(wandDump.includes('const FLY_DURATION = 0.2;'), 'wand slot returns must last 0.20 seconds');
assert.ok(wandDump.includes('const STAGGER = 0.028;'), 'wand slot returns must stagger by 0.028 seconds');
assert.ok(wandDump.includes('.delay(i * STAGGER)'), 'wand slot returns must keep indexed launch timing');
assert.ok(/\.to\(FLY_DURATION, \{[\s\S]*?position:[\s\S]*?scale:[\s\S]*?\}, \{ easing: 'sineOut' \}\)/.test(wandDump), 'wand slot returns must move and scale in one sineOut flight');
assert.ok(!wandDump.includes("{ easing: 'circOut' }"), 'wand slot returns must not retain the old circOut travel');

assert.ok(pch.includes('const PCH_RETURN_TRANSFER_SECONDS = 0.3;'), 'PCH automatic returns must match the package 0.30-second flight');
assert.ok(pch.includes('const PCH_RETURN_STAGGER_SECONDS = 0.05;'), 'PCH automatic returns must match the package 0.05-second launch cadence');
assert.ok(pch.includes('const PCH_RETURN_COMPLETE_DELAY_SECONDS = 0.01;'), 'PCH automatic returns must keep the package 0.01-second completion delay');
assert.ok(!pch.includes('PCH_RETURN_PULSE_UP_SECONDS'), 'PCH automatic returns must not retain the local pulse-up timing');
assert.ok(!pch.includes('PCH_RETURN_PULSE_SETTLE_SECONDS'), 'PCH automatic returns must not retain the local pulse-settle timing');
assert.ok(pch.includes('const PCH_SKILL_STAGGER_SECONDS = 0.028;'), 'PCH prop returns must stagger by 0.028 seconds');
assert.ok(pch.includes('const PCH_SKILL_TRANSFER_SECONDS = 0.2;'), 'PCH prop returns must last 0.20 seconds');

const pchInbound = section(pch, '    private animateBeanIntoConveyor(', '    private animateBeanReturn(');
assert.ok(pchInbound.includes('.to(PCH_TRANSFER_SECONDS,'), 'PCH inbound storage must retain its separate transfer timing');
assert.ok(pchInbound.includes("{ easing: 'quadIn' }"), 'PCH inbound storage easing must remain unchanged');

const pchReturn = section(pch, '    private animateBeanReturn(', '    private finishReturnAnimation(');
assert.ok(pchReturn.includes('const flightDelay = staggerIndex * PCH_RETURN_STAGGER_SECONDS;'), 'PCH automatic returns must preserve indexed launch timing');
assert.ok(pchReturn.includes('this.attachSphereFlyEffect(bean, sourceBeanSize, flightDelay);'), 'PCH automatic returns must attach the pooled Star/Trail effect with the same launch delay');
assert.ok(pchReturn.includes('.delay(flightDelay)'), 'PCH automatic returns must apply the indexed launch delay');
assert.ok(pchReturn.includes('.parallel('), 'PCH automatic returns must move, scale, and rotate in parallel');
assert.ok(/\.to\(PCH_RETURN_TRANSFER_SECONDS, \{[\s\S]*?position: targetLocal,[\s\S]*?scale: new Vec3\(targetScale, targetScale, 1\),[\s\S]*?\}, \{ easing: 'quadOut' \}\)/.test(pchReturn), 'PCH automatic return position and scale must use package-equivalent OutQuad easing');
assert.ok(/\.to\(PCH_RETURN_TRANSFER_SECONDS, \{[\s\S]*?eulerAngles: new Vec3\(0, 360, 0\),[\s\S]*?\}, \{ easing: 'linear' \}\)/.test(pchReturn), 'PCH automatic returns must rotate one local Y-axis turn linearly');
assert.ok(!pchReturn.includes('playReturnTargetPulse'), 'PCH automatic returns must not play the local 230ms landing pulse');
const hideIndex = pchReturn.indexOf('bean.active = false;');
const audioIndex = pchReturn.indexOf("AudioMgr.inst.play('place');");
const vibrateIndex = pchReturn.indexOf('AudioMgr.inst.vibratePlace();');
const renderIndex = pchReturn.indexOf('this.runtime.renderBoardCell(target.row, target.col);');
const settleIndex = pchReturn.indexOf('this.runtime.playBeanSettleMatchFxOnCell?.(target.row, target.col);');
const completeReturnIndex = pchReturn.indexOf('const completeReturn = () => {');
const destroyIndex = pchReturn.indexOf('this.destroyFlyBean(bean);', completeReturnIndex);
const finishIndex = pchReturn.indexOf('this.finishReturnAnimation(target);', destroyIndex);
const completionScheduleIndex = pchReturn.indexOf('this.runtime.scheduleOnce(completeReturn, PCH_RETURN_COMPLETE_DELAY_SECONDS);');
assert.ok(
    completeReturnIndex >= 0
        && completeReturnIndex < destroyIndex
        && destroyIndex < finishIndex
        && finishIndex < hideIndex
        && hideIndex < audioIndex
        && audioIndex < vibrateIndex
        && vibrateIndex < renderIndex
        && renderIndex < settleIndex
        && settleIndex < completionScheduleIndex,
    'PCH arrival must swap visuals and keep feedback before runtime-owned delayed completion',
);
assert.ok(!pchReturn.includes('.delay(PCH_RETURN_COMPLETE_DELAY_SECONDS)'), 'an inactive return bean must not own the completion delay');

const pchSkill = section(pch, '    private runConveyorSkill(', '    private resolveSkillSourceVisual(');
assert.ok(pchSkill.includes('.delay(index * PCH_SKILL_STAGGER_SECONDS)'), 'PCH prop returns must use fixed indexed launch timing');
assert.ok(/\.to\(PCH_SKILL_TRANSFER_SECONDS, \{[\s\S]*?position:[\s\S]*?scale:[\s\S]*?\}, \{ easing: 'sineOut' \}\)/.test(pchSkill), 'PCH prop returns must move and scale in one sineOut flight');
assert.ok(!pchSkill.includes('skillStaggerSeconds'), 'PCH prop returns must not compress large batches');
assert.ok(!pchSkill.includes("{ easing: 'circOut' }"), 'PCH prop returns must not retain the old circOut travel');

console.log('bean-return-timing.test.js passed');
