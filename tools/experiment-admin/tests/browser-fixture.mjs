import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createWorkbench } from '../server.mjs';
import { passwordHash } from '../store.mjs';
import { createTask, createExperiment, experimentAction } from '../domain.mjs';
import { fileURLToPath } from 'node:url';

// Isolated UI acceptance fixture. Never used by the normal workbench entrypoint.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const file = join(mkdtempSync(join(tmpdir(), 'pdd-ab-browser-')), 'ui.sqlite');
const app = createWorkbench({ root, file });
app.store.change(state => {
    const lead = { id: randomUUID(), username: 'ui-reviewer', name: '验收负责人', role: 'manager', password: passwordHash('ui-test-only-123456'), disabled: false };
    const intern = { id: randomUUID(), username: 'ui-intern', name: '验收实习生', role: 'intern', password: passwordHash('ui-test-only-123456'), disabled: false };
    state.users.push(lead, intern);
    for (const [index, title] of ['第 3 关容量单变量验证', '第 4 关时间调整', '准备下一批容量候选'].entries()) {
        const task = createTask(state, lead, { title: `[界面验收] ${title}`, brief: '仅用于工作台验收。检查任务分派、候选制作和审阅流程，不代表真实线上优化结论。',
            type: 'parameter', levelId: index === 1 ? 4 : 3, field: index === 1 ? 'timeLimit' : 'conveyorCapacity', ownerId: index === 2 ? '' : intern.id,
            samplePerGroup: 1000, windowHours: 24, minDays: 7, dailyEligible: 1000, maxFailurePercent: 5 }, root);
        if (index < 2) {
            let exp = createExperiment(state, intern, { taskId: task.id, title: index === 0 ? '[界面验收] 容量 60 → 66' : '[界面验收] 时间增加 30 秒', hypothesis: '验证负责人能看到唯一变量差异，确认流程不会修改线上内容。', candidate: task.baseline.data[task.field] + (index === 0 ? 6 : 30) });
            if (!index) {
                exp = experimentAction(state, intern, exp.id, { version: exp.version, action: 'evidence', checkedA: true, checkedB: true, checkedFailure: true, note: '自动化流程验收占位证据，不是真机测试。', reference: 'tests/workbench.test.mjs' }, root);
                experimentAction(state, intern, exp.id, { version: exp.version, action: 'submit' }, root);
            }
        }
    }
});
console.log(`UI acceptance fixture: ${await app.listen(4319)}. Isolated temporary database; no production data.`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
