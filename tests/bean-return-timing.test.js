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

assert.ok(pch.includes('const PCH_RETURN_TRANSFER_SECONDS = 0.2;'), 'PCH automatic returns must last 0.20 seconds');
assert.ok(pch.includes('const PCH_RETURN_STAGGER_SECONDS = 0.028;'), 'PCH automatic returns must stagger by 0.028 seconds');
assert.ok(pch.includes('const PCH_SKILL_STAGGER_SECONDS = 0.028;'), 'PCH prop returns must stagger by 0.028 seconds');
assert.ok(pch.includes('const PCH_SKILL_TRANSFER_SECONDS = 0.2;'), 'PCH prop returns must last 0.20 seconds');

const pchInbound = section(pch, '    private animateBeanIntoConveyor(', '    private animateBeanReturn(');
assert.ok(pchInbound.includes('.to(PCH_TRANSFER_SECONDS,'), 'PCH inbound storage must retain its separate transfer timing');
assert.ok(pchInbound.includes("{ easing: 'quadIn' }"), 'PCH inbound storage easing must remain unchanged');

const pchReturn = section(pch, '    private animateBeanReturn(', '    private playReturnTargetPulse(');
assert.ok(pchReturn.includes('.delay(staggerIndex * PCH_RETURN_STAGGER_SECONDS)'), 'PCH automatic returns must use indexed launch timing');
assert.ok(/\.to\(PCH_RETURN_TRANSFER_SECONDS, \{[\s\S]*?position:[\s\S]*?scale:[\s\S]*?\}, \{ easing: 'sineOut' \}\)/.test(pchReturn), 'PCH automatic returns must use one sineOut flight');
assert.ok(/AudioMgr\.inst\.play\('place'\);[\s\S]*?AudioMgr\.inst\.vibratePlace\(\);[\s\S]*?this\.runtime\.renderBoardCell[\s\S]*?this\.finishReturnAnimation/.test(pchReturn), 'PCH landing feedback and completion must remain in the arrival callback');

const pchSkill = section(pch, '    private runConveyorSkill(', '    private resolveSkillSourceVisual(');
assert.ok(pchSkill.includes('.delay(index * PCH_SKILL_STAGGER_SECONDS)'), 'PCH prop returns must use fixed indexed launch timing');
assert.ok(/\.to\(PCH_SKILL_TRANSFER_SECONDS, \{[\s\S]*?position:[\s\S]*?scale:[\s\S]*?\}, \{ easing: 'sineOut' \}\)/.test(pchSkill), 'PCH prop returns must move and scale in one sineOut flight');
assert.ok(!pchSkill.includes('skillStaggerSeconds'), 'PCH prop returns must not compress large batches');
assert.ok(!pchSkill.includes("{ easing: 'circOut' }"), 'PCH prop returns must not retain the old circOut travel');

console.log('bean-return-timing.test.js passed');
