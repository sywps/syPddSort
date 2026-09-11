import { esc, shell, modal, detail, button, input, area, select, resourceOptions, fieldNames, filteredTable } from './views.js';

const app = document.querySelector('#app'), dialog = document.querySelector('#dialog'), toast = document.querySelector('#toast');
let state, currentExperiment, toastTimer;
async function api(path, body) {
    const res = await fetch(`/api/${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || '请求失败，请检查服务连接');
    return payload;
}
function notice(message) { toast.textContent = message; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 5000); }
function open(html) { dialog.innerHTML = html; if (!dialog.open) dialog.showModal(); dialog.querySelector('input:not([type="hidden"]), textarea, select')?.focus(); }
function form(title, id, content, submit = '保存', wide = false) {
    open(modal(title, `<form id="${id}">${content}<p class="form-error" role="alert" hidden></p><div class="dialog-actions">${button('取消', 'close', '', 'quiet')}<button class="primary" type="submit">${submit}</button></div></form>`, wide));
}
async function reload() { state = await api('state'); render(); }
function render() { app.innerHTML = shell(state, location.hash.slice(1) || 'home'); }
function showDetail(id) { currentExperiment = id; open(detail(state, state.experiments.find(e => e.id === id))); }
function current() { return state.experiments.find(e => e.id === currentExperiment); }
function taskFor(e) { return state.tasks.find(t => t.id === e.taskId); }
function formError(form, error) { const box = form.querySelector('.form-error'); if (box) { box.textContent = error.message; box.hidden = false; } else notice(error.message); }

async function boot() {
    try {
        const auth = await api('auth');
        if (auth.user) { await reload(); return; }
        state = null; currentExperiment = null; dialog.close(); toast.hidden = true;
        const setup = auth.setup;
        app.innerHTML = `<div class="auth-layout"><section class="auth-story"><a class="brand" href="#"><span class="bead-logo">▦</span><div>拼豆实验室<small>游戏实验工作台</small></div></a><h1>让每一个想法，<br>都有一次认真的验证。</h1><p>领取任务，制作候选，观察数据。<br>把团队的每次尝试，积累成经验。</p><div class="auth-pattern" aria-hidden="true">▦ ▦ ▦</div><small>本地验证环境 · 不影响线上玩家</small></section><section class="auth-panel"><form id="${setup ? 'setup' : 'login'}"><h2>${setup ? '创建你的实验工作台' : '欢迎回来'}</h2><p>${setup ? '先创建负责人账号，再邀请团队成员。' : '登录后继续今天的实验。'}</p>${setup ? input('name', '你的姓名', '', 'text', 'maxlength="40" autocomplete="name"') : ''}${input('username', '账号', '', 'text', 'maxlength="60" autocomplete="username"')}${input('password', '密码', '', 'password', `minlength="12" maxlength="128" autocomplete="${setup ? 'new-password' : 'current-password'}"`)}<small>密码至少 12 个字符。账号权限在服务端校验。</small><p class="form-error" role="alert" hidden></p><button class="primary full" type="submit">${setup ? '创建并进入工作台' : '登录工作台'}</button></form></section></div>`;
    } catch (error) { app.innerHTML = `<div class="boot"><h2>工作台连接失败</h2><p>${esc(error.message)}</p>${button('重新连接', 'retry')}</div>`; }
}

function taskForm() {
    form('创建优化任务', 'new-task', `<div class="form-grid">${input('title', '任务名称', '', 'text', 'maxlength="100"')}${select('ownerId', '分派给', [['', '发布后领取'], ...state.users.filter(u => !u.disabled).map(u => [u.id, u.name])])}</div>${area('brief', '问题、依据和本轮交付', '', 'placeholder="例如：第 3 关退出较多，准备仅调整容量的候选，并提交试玩记录。"')}<div class="form-grid">${select('type', '实验模板', [['parameter', '关卡单参数'], ['background', '背景 PNG']])}${input('levelId', '目标主线关卡（第 2 关起）', 3, 'number', 'min="2" max="10000"')}${select('field', '允许修改的唯一变量', [['conveyorCapacity', '传送带容量'], ['timeLimit', '时间限制']])}<div id="control-resource-field" hidden>${select('controlResourceId', 'A 组背景', resourceOptions(state))}</div></div><div class="form-note">A 组从本地关卡文件冻结完整快照。不是线上版本确认；正式发布前仍需核对线上基线。</div><h3>预先固定判断规则</h3><div class="form-grid">${input('samplePerGroup', '每组目标样本', 1000, 'number', 'min="30" max="1000000"')}${input('windowHours', '用户观察窗口（小时）', 24, 'number', 'min="1" max="168"')}${input('minDays', '最短运行天数', 7, 'number', 'min="1" max="60"')}${input('maxFailurePercent', '失败率护栏（%）', 5, 'number', 'min="1" max="30"')}<label>预计每日符合条件用户（选填）<input name="dailyEligible" type="number" min="1" max="10000000" placeholder="没有数据时留空"></label></div><p class="muted">主指标固定为观察窗口内完成目标关卡的用户比例。目标样本由负责人按最小可检测差异确定，默认值不是充分样本保证。</p>`, '创建任务', true);
}
function experimentForm(taskId, exp = null, copy = false) {
    const task = state.tasks.find(t => t.id === taskId);
    const name = exp ? `${exp.title}${copy ? ' · 新候选' : ''}` : '';
    const candidate = exp?.candidate ?? (task.type === 'parameter' ? task.baseline.data[task.field] : '');
    const before = task.type === 'parameter' ? task.baseline.data[task.field] : state.resources.find(r => r.id === task.controlResource)?.name;
    form(copy ? '复制为新候选' : exp ? '编辑实验草稿' : '创建实验候选', exp && !copy ? 'edit-exp' : 'new-exp',
        `<input type="hidden" name="taskId" value="${task.id}"><p class="muted">优化任务：${esc(task.title)}</p>${input('title', '实验名称', name, 'text', 'maxlength="100"')}${area('hypothesis', '实验假设', exp?.hypothesis || '', 'placeholder="我认为这个变化会改善什么行为，依据是什么？"')}<div class="baseline-note">A 组已冻结：第 ${task.levelId} 关 · ${fieldNames[task.field]} = <strong>${esc(before)}</strong></div>${task.type === 'parameter' ? input('candidate', `B 组${fieldNames[task.field]}`, candidate, 'number', `min="${task.field === 'timeLimit' ? 30 : 12}" max="${task.field === 'timeLimit' ? 1800 : 300}"`) : select('candidate', 'B 组背景资源', resourceOptions(state), candidate)}<p class="muted">仅允许修改这一个变量。修改草稿后，之前的自测记录失效，需要重新自测。</p>`, '保存草稿');
}

function preview(id, assignment = null) {
    const exp = state.experiments.find(e => e.id === id), task = taskFor(exp);
    open(modal(assignment ? `验证用户 · ${assignment.variant} 组` : 'A/B 内容预览', `<p class="form-note">这是冻结内容的静态预览，不是游戏试玩。自测记录还应包含真实客户端的操作与失败路径证据。这里不会自动产生曝光事件。</p><div class="preview-grid">${(assignment ? [assignment.variant] : ['A', 'B']).map(v => `<section><h3>${v} 组 · ${v === 'A' ? '对照' : '候选'}</h3>${task.type === 'background' ? `<div class="background-preview"><img src="/api/resources/${v === 'A' ? task.controlResource : exp.candidate}" alt="${v} 组背景"><span class="preview-caption">背景原图预览</span></div>` : `<canvas width="420" height="420" data-board="${v}" aria-label="${v} 组关卡目标图"></canvas>`}<p>${fieldNames[task.field]}：${esc(task.type === 'parameter' ? (v === 'B' ? exp.candidate : exp.baseline.data[task.field]) : (state.resources.find(r => r.id === (v === 'A' ? task.controlResource : exp.candidate))?.name))}</p></section>`).join('')}</div>${assignment ? `<div class="warning">以下按钮只用于验证事件协议，不表示真实玩家行为，也不会生成正式结果。</div><div id="validation-actions" data-assignment="${esc(JSON.stringify(assignment))}">${button('确认内容已展示（测试曝光）', 'test-exposure')}${button('发送测试完成事件', 'test-complete')}${button('发送测试失败事件', 'test-failure')}</div>` : ''}<div class="dialog-actions">${button('返回实验', 'detail', id)}</div>`, true));
    dialog.querySelectorAll('canvas').forEach(canvas => drawBoard(canvas, exp.baseline.data.correctColorArr));
}
function drawBoard(canvas, board) {
    const ctx = canvas.getContext('2d'), cell = Math.min(380 / board.length, 380 / board[0].length);
    const colors = state.palette;
    ctx.fillStyle = '#f3f6fa'; ctx.fillRect(0, 0, 420, 420);
    const x0 = (420 - board[0].length * cell) / 2, y0 = (420 - board.length * cell) / 2;
    board.forEach((row, y) => row.forEach((color, x) => { if (color) { if (!colors[color]) throw new Error(`调色板缺少颜色 ${color}`); ctx.fillStyle = colors[color]; ctx.beginPath(); ctx.roundRect(x0 + x * cell, y0 + y * cell, cell - 1, cell - 1, 2); ctx.fill(); } }));
}

async function act(action, id) {
    if (action === 'close') { dialog.close(); return; }
    if (action === 'retry') return boot();
    if (action === 'refresh') { await reload(); notice('已获取最新状态'); return; }
    if (action === 'logout') { await api('logout', {}); return boot(); }
    if (action === 'new-task') return taskForm();
    if (action === 'detail') return showDetail(id);
    if (action === 'new-exp') return experimentForm(id);
    if (action === 'edit-exp' || action === 'copy') { currentExperiment = id; return experimentForm(taskFor(current()).id, current(), action === 'copy'); }
    if (action === 'preview') return preview(id);
    if (action === 'game-preview') {
        currentExperiment = id;
        return form('生成实际游戏试玩入口', 'game-preview', `${input('gameUrl', 'Cocos 本机预览地址', 'http://127.0.0.1:7456/', 'url')}${select('variant', '固定试玩分组', [['A', 'A 组：对照'], ['B', 'B 组：候选']])}<p class="form-note">有效期 1 小时，只授权本实验的这一组。游戏实际展示和通关后自动回传试玩记录，不进入实验效果统计。需先在 Cocos Creator 中打开当前游戏项目预览。</p>`, '生成试玩链接');
    }
    if (action === 'revoke-preview') { await api('previews/revoke', { id }); await reload(); showDetail(currentExperiment); return notice('试玩入口已撤销'); }
    if (action === 'claim') { await api('tasks/assign', { id, ownerId: state.user.id }); await reload(); return notice('任务已领取'); }
    if (action === 'assign-task') return form('分派任务', 'assign-task', `<input type="hidden" name="id" value="${id}">${select('ownerId', '成员', state.users.filter(u => !u.disabled).map(u => [u.id, u.name]))}`);
    if (action === 'new-user') return form('添加团队成员', 'new-user', `${input('name', '姓名', '', 'text', 'maxlength="40"')}${input('username', '账号', '', 'text', 'maxlength="60"')}${input('password', '初始密码', '', 'password', 'minlength="12" maxlength="128" autocomplete="new-password"')}${select('role', '角色', [['intern', '实验成员'], ['manager', '负责人']])}<p class="muted">请通过团队已有的安全方式交付初始密码，成员可自行修改。</p>`);
    if (action === 'password') return form('修改密码', 'password', `${input('current', '当前密码', '', 'password', 'autocomplete="current-password"')}${input('password', '新密码', '', 'password', 'minlength="12" maxlength="128" autocomplete="new-password"')}`, '修改并重新登录');
    if (action === 'disable-user') return form('禁用成员', 'disable-user', `<input type="hidden" name="id" value="${id}"><p>禁用后将立即退出该成员的所有会话。历史实验和操作记录保留。</p>`, '确认禁用');
    if (action === 'budget') return form('团队实验流量预算', 'budget', input('budget', '覆盖流量上限（%）', state.budget, 'number', 'min="1" max="100"'));
    if (action === 'batch-approve') {
        const ids = [...document.querySelectorAll('[data-review-id]:checked')].map(el => el.dataset.reviewId);
        if (!ids.length) throw new Error('请先勾选已检查过的待审阅候选');
        return form('批准所选候选', 'batch-approve', `<input type="hidden" name="items" value="${esc(JSON.stringify(ids.map(id => ({ id, version: state.experiments.find(e => e.id === id).version }))))}"><p>请确认已逐项检查差异和测试证据。本批 ${ids.length} 个候选会分别校验并加入排期队列。</p><ul>${ids.map(id => `<li>${esc(state.experiments.find(e => e.id === id).title)}</li>`).join('')}</ul>`, '逐项校验并批准');
    }
    if (action === 'upload') return form('上传背景候选', 'upload', `${input('name', '资源名称', '', 'text', 'maxlength="100"')}<label>PNG 文件<input name="file" type="file" accept="image/png" required></label><p class="muted">最多 4 MB。上传后解码校验，不会发布或覆盖现有图片。</p>`, '校验并上传');
    currentExperiment = id || currentExperiment;
    if (action.startsWith('test-')) {
        const holder = dialog.querySelector('#validation-actions'), assignment = JSON.parse(holder.dataset.assignment);
        const type = action.slice(5), ids = JSON.parse(holder.dataset.eventIds || '{}');
        ids[type] ||= crypto.randomUUID(); holder.dataset.eventIds = JSON.stringify(ids);
        await api('validation/event', { assignmentId: assignment.assignmentId, configHash: assignment.configHash, eventId: ids[type], type, reason: type === 'failure' ? '负责人手动验证失败事件' : '' });
        await reload(); return notice('测试事件已记录；仅属于本地验证数据');
    }
    const e = current();
    if (action === 'evidence') return form('记录自测证据', 'evidence', `<p class="form-note">请据实际测试填写。静态内容预览不能替代游戏操作验证。</p>${['checkedA', 'checkedB', 'checkedFailure'].map((key, i) => `<label class="check"><input type="checkbox" name="${key}" required>${['已检查 A 组内容与操作', '已检查 B 组内容与操作', '已检查资源失败与中断路径'][i]}</label>`).join('')}${area('note', '测试设备、步骤和结果', e.evidence?.note || '')}${input('reference', '证据位置（截图、录屏或测试记录路径）', e.evidence?.reference || '', 'text', 'maxlength="500"')}`, '保存自测记录');
    if (['return', 'terminate', 'anomaly'].includes(action)) return form(({ return: '退回修改', terminate: '终止本地验证', anomaly: '报告异常' })[action], action, area('note', '原因与说明'), '确认');
    if (action === 'start') {
        const t = taskFor(e);
        return form('启动本地验证', 'start', `<div class="warning">只向本地验证接口发布配置，不连接线上游戏。</div>${input('traffic', '覆盖流量（%）', 10, 'number', 'min="1" max="100"')}<p id="estimate" class="muted">${t.dailyEligible ? '填写流量后显示样本积累估算。' : '没有每日符合条件用户数，无法估算样本积累时间。'}</p><p>同关卡实验互斥；已参与过其他实验的验证用户不重新入组。观察窗口和最短运行周期不能跳过。</p>`, '确认启动验证');
    }
    if (action === 'validation') return form('验证分组与事件', 'validation', `<p>输入一个稳定的测试用户 ID。分组在服务端固定，同一个用户不能通过反复刷新换组。</p>${input('uid', '测试用户 ID', '', 'text', 'maxlength="128"')}`, '获取分组');
    if (action === 'recap') return form('填写实验复盘', 'recap', [['change', '改了什么'], ['hypothesis', '原来的假设'], ['finding', '数据说明了什么'], ['limits', '限制和异常'], ['next', '下一步建议']].map(([key, label]) => area(key, label, e.recap?.[key] || '')).join(''), '保存复盘', true);
    if (['submit', 'approve', 'stop', 'finish', 'archive'].includes(action)) {
        const descriptions = { submit: '提交后锁定草稿，负责人退回后才可修改。', approve: '批准这一冻结版本并加入待排期队列，不会立即开始分流。', stop: '停止新增用户入组，已有用户继续完成观察。', finish: '全部用户观察窗口成熟后，才能进入复盘。', archive: '确认这份复盘并归档，保留全部配置、事件统计和操作记录。' };
        return form('确认操作', action, `<p>${descriptions[action]}</p>`, '确认');
    }
    throw new Error('暂不支持此操作');
}

document.addEventListener('click', async event => {
    const target = event.target.closest('[data-action]'); if (!target) return;
    event.preventDefault(); target.disabled = true;
    try { await act(target.dataset.action, target.dataset.id); } catch (error) { notice(error.message); }
    finally { target.disabled = false; }
});
document.addEventListener('change', event => {
    if (event.target.name === 'type') {
        const bg = event.target.value === 'background';
        dialog.querySelector('#control-resource-field').hidden = !bg;
        dialog.querySelector('[name="field"]').closest('label').hidden = bg;
    }
    if (event.target.id === 'status-filter') filter();
});
document.addEventListener('input', event => {
    if (event.target.id === 'search') filter();
    if (event.target.name === 'traffic') {
        const task = taskFor(current()), traffic = Number(event.target.value);
        if (task.dailyEligible && traffic > 0) dialog.querySelector('#estimate').textContent = `样本积累粗估 ${Math.ceil(task.samplePerGroup * 2 / (task.dailyEligible * traffic / 100))} 天；还需满足 ${task.minDays} 天最短周期并等待 ${task.windowHours} 小时观察窗口。互斥和历史参与会减少实际可用用户。`;
    }
});
function filter() { document.querySelector('#experiment-table').innerHTML = filteredTable(state, document.querySelector('#search').value, document.querySelector('#status-filter').value); }
document.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.target, submit = form.querySelector('button[type="submit"]');
    if (submit.disabled) return; submit.disabled = true;
    const data = Object.fromEntries(new FormData(form)), id = form.id;
    try {
        if (['setup', 'login'].includes(id)) { await api(id, data); await reload(); return; }
        if (id === 'new-task') {
            for (const key of ['levelId', 'samplePerGroup', 'windowHours', 'minDays', 'maxFailurePercent']) data[key] = Number(data[key]);
            data.dailyEligible = data.dailyEligible ? Number(data.dailyEligible) : null;
            await api('tasks', data);
        } else if (id === 'new-exp' || id === 'edit-exp') {
            const task = state.tasks.find(t => t.id === data.taskId);
            if (task.type === 'parameter') data.candidate = Number(data.candidate);
            const result = id === 'new-exp' ? await api('experiments', data) : await api(`experiments/${currentExperiment}`, { ...data, action: 'edit', version: current().version });
            currentExperiment = result.id; await reload(); showDetail(result.id); notice('实验草稿已保存'); return;
        } else if (id === 'game-preview') {
            const result = await api('previews', { ...data, experimentId: currentExperiment, version: current().version });
            await reload();
            open(modal('试玩入口已生成', `<p>此入口固定为 ${esc(result.variant)} 组，有效期 1 小时。请仅提供给本次自测人员。</p><a class="button primary" href="${esc(result.url)}" target="_blank" rel="noopener noreferrer">打开实际游戏试玩</a><p class="muted">若提示入口过期、内容变化或资源失败，请回工作台重新生成。游戏试玩需要当前项目的 Cocos 预览服务。</p><div class="dialog-actions">${button('返回实验查看试玩记录', 'detail', currentExperiment)}</div>`)); return;
        } else if (id === 'new-user') await api('users', data);
        else if (id === 'batch-approve') {
            const result = await api('experiments/batch-approve', { items: JSON.parse(data.items) });
            await reload();
            open(modal('批量审阅结果', `<p>批准 ${result.items.filter(i => i.ok).length} 项，失败 ${result.items.filter(i => !i.ok).length} 项。</p><ul>${result.items.map(i => `<li>${esc(state.experiments.find(e => e.id === i.id)?.title || i.id)}：${i.ok ? '已批准，等待排期' : esc(i.error)}</li>`).join('')}</ul>`)); return;
        }
        else if (id === 'disable-user') await api('users/disable', data);
        else if (id === 'assign-task') await api('tasks/assign', data);
        else if (id === 'budget') await api('budget', { budget: Number(data.budget) });
        else if (id === 'password') { await api('password', data); dialog.close(); await boot(); notice('密码已修改，请重新登录'); return; }
        else if (id === 'upload') {
            if (data.file.size > 4 * 1024 * 1024) throw new Error('文件超过 4 MB');
            const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('文件读取失败')); reader.readAsDataURL(data.file); });
            await api('resources', { name: data.name, base64 });
        } else if (id === 'validation') {
            const assignment = await api('validation/assign', { uid: data.uid, levelId: taskFor(current()).levelId });
            if (!assignment.assigned) throw new Error(assignment.reason);
            await reload(); preview(assignment.experimentId, assignment); return;
        } else {
            if (id === 'evidence') for (const key of ['checkedA', 'checkedB', 'checkedFailure']) data[key] = data[key] === 'on';
            if (id === 'start') data.traffic = Number(data.traffic);
            await api(`experiments/${currentExperiment}`, { ...data, action: id, version: current().version });
            await reload(); showDetail(currentExperiment); notice('操作已保存'); return;
        }
        dialog.close(); await reload(); notice('已保存');
    } catch (error) { formError(form, error); }
    finally { submit.disabled = false; }
});
window.addEventListener('hashchange', () => { if (state) { dialog.close(); render(); } });
await boot();
