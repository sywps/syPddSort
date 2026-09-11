export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const labels = { draft: '草稿', returned: '已退回', review: '待审阅', queued: '待排期', running: '运行中', observing: '等待观察', terminated: '异常终止', recap: '待复盘', archived: '已归档' };
export const fieldNames = { timeLimit: '时间限制', conveyorCapacity: '传送带容量', background: '背景图' };
export const typeNames = { parameter: '关卡参数', background: '背景图' };
export const time = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—';
export const badge = status => `<span class="badge ${esc(status)}">${labels[status] || esc(status)}</span>`;
export const button = (label, action, id = '', style = '') => `<button type="button" class="${style}" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
export const empty = (title, detail, action = '') => `<div class="empty"><div class="empty-beads" aria-hidden="true">▦</div><h3>${title}</h3><p>${detail}</p>${action}</div>`;
export const member = (s, id) => s.users.find(u => u.id === id)?.name || '待领取';
const taskOf = (s, e) => s.tasks.find(t => t.id === e.taskId);
const percent = value => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
export const input = (name, label, value = '', type = 'text', extra = '') => `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra} required></label>`;
export const area = (name, label, value = '', extra = '') => `<label>${label}<textarea name="${name}" rows="3" maxlength="2000" ${extra} required>${esc(value)}</textarea></label>`;
export const select = (name, label, options, value = '') => `<label>${label}<select name="${name}">${options.map(([id, text]) => `<option value="${esc(id)}" ${String(id) === String(value) ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
export const resourceOptions = s => [['', '请选择已上传的图片'], ...s.resources.map(r => [r.id, `${r.name}（${r.width}×${r.height}）`])];
export function modal(title, content, wide = false) {
    return `<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2>${button('关闭', 'close', '', 'quiet')}</div><div class="dialog-body ${wide ? 'wide' : ''}">${content}</div>`;
}

export function shell(s, page) {
    const manager = s.user.role === 'manager';
    const nav = [['home', '工作概览', '◫'], ['tasks', '优化任务', '▤'], ['experiments', '实验管理', '⚗'], ['schedule', '审阅与排期', '◷'], ['resources', '资源候选库', '▧'], ['knowledge', '复盘与经验', '▣'], ['team', '团队与记录', '♧']];
    return `<aside class="sidebar"><a href="#home" class="brand"><span class="bead-logo" aria-hidden="true">▦</span><div>拼豆实验室<small>游戏实验工作台</small></div></a>
        <nav aria-label="主导航">${nav.map(([id, name, icon]) => `<a href="#${id}" class="${page === id ? 'active' : ''}" ${page === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon}</span>${name}${id === 'schedule' && s.experiments.some(e => e.status === 'review') ? `<b>${s.experiments.filter(e => e.status === 'review').length}</b>` : ''}</a>`).join('')}</nav>
        <div class="sidebar-note"><strong>一次，只改变一个变量</strong><p>让每次尝试，都留下可复用的经验。</p></div>
        <div class="profile"><span class="avatar">${esc(s.user.name.slice(0, 1))}</span><div><strong>${esc(s.user.name)}</strong><small>${manager ? '负责人' : '实验成员'}</small></div>${button('退出', 'logout', '', 'quiet')}</div></aside>
        <main><header class="topbar"><span>拼豆豆 <span class="slash">/</span> ${nav.find(n => n[0] === page)?.[1] || '工作概览'}</span><div class="actions">${button('刷新数据', 'refresh', '', 'quiet')}<span class="environment"><i></i>本地验证环境</span>${button('退出', 'logout', '', 'mobile-logout quiet')}</div></header>
        <div class="environment-notice">当前工作台的发布与数据仅用于本地验证，尚未连接线上游戏。正式玩家不会受到影响。</div>
        <div class="workspace" id="workspace">${pageContent(s, page)}</div><footer>所有时间按北京时间显示 · 内容修改与审阅均保留记录</footer></main>`;
}
function heading(title, sub, actions = '') { return `<div class="page-heading"><div><h1>${title}</h1><p>${sub}</p></div><div class="actions">${actions}</div></div>`; }
function expTable(s, experiments) {
    if (!experiments.length) return empty('还没有符合条件的实验', '从优化任务创建第一个候选，系统会自动冻结对照版本。', '<a class="button" href="#tasks">前往优化任务</a>');
    return `<div class="table-wrap"><table><thead><tr><th>实验 / 优化任务</th><th>唯一变量</th><th>状态</th><th>负责人</th><th>创建时间</th><th></th></tr></thead><tbody>${experiments.map(e => {
        const t = taskOf(s, e);
        return `<tr><td>${e.status === 'review' && s.user.role === 'manager' ? `<input class="batch-check" type="checkbox" data-review-id="${e.id}" aria-label="选择实验 ${esc(e.title)}">` : ''}<strong>${esc(e.title)}</strong><small>${esc(t.title)}</small></td><td>第 ${t.levelId} 关<small>${fieldNames[t.field]}</small></td><td>${badge(e.status)}${e.anomaly ? '<small class="danger-text">有异常记录</small>' : ''}</td><td>${esc(member(s, e.ownerId))}</td><td class="muted">${time(e.createdAt).split(' ')[0]}</td><td>${button('查看', 'detail', e.id, 'quiet')}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}
function pageContent(s, page) {
    const manager = s.user.role === 'manager';
    if (page === 'tasks') return heading('优化任务', '先明确问题，再让团队准备一批有依据的候选。', manager ? button('＋ 创建任务', 'new-task', '', 'primary') : '') +
        (s.tasks.length ? `<div class="task-list">${s.tasks.map(t => `<article class="task-card"><div class="task-line"><span class="type-label">${typeNames[t.type]} · 第 ${t.levelId} 关</span><span>${esc(member(s, t.ownerId))}</span></div><h2>${esc(t.title)}</h2><p>${esc(t.brief)}</p><div class="task-spec"><span>唯一变量 <b>${fieldNames[t.field]}</b></span><span>目标样本 <b>${t.samplePerGroup.toLocaleString()} / 组</b></span><span>候选 <b>${s.experiments.filter(e => e.taskId === t.id).length}</b></span></div><div class="task-actions">${!t.ownerId ? button('领取任务', 'claim', t.id) : ''}${manager ? button('分派', 'assign-task', t.id, 'quiet') : ''}${manager || t.ownerId === s.user.id ? button('创建候选', 'new-exp', t.id, 'primary') : '<span class="muted">由任务负责人创建候选</span>'}</div></article>`).join('')}</div>` : empty('从一个具体问题开始', manager ? '创建任务，选择目标关卡和唯一变量，再交给团队准备候选。' : '负责人还没有创建任务。任务发布后，可在这里领取。', manager ? button('创建第一个任务', 'new-task', '', 'primary') : ''));
    if (page === 'experiments') return heading('实验管理', '所有候选、审阅状态和版本，都在同一处。') + `<div class="toolbar"><label class="search-label">搜索实验<input id="search" placeholder="搜索名称、任务、负责人…"></label><label>状态<select id="status-filter"><option value="">全部状态</option>${Object.entries(labels).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label></div><div id="experiment-table">${expTable(s, s.experiments)}</div>`;
    if (page === 'schedule') {
        const used = s.experiments.filter(e => ['running', 'observing'].includes(e.status)).reduce((n, e) => n + e.traffic, 0);
        return heading('审阅与排期', '按流量安排实验，避免同一关卡和同一批用户相互干扰。', manager ? button('批准所选候选', 'batch-approve', '', 'primary') + button('设置流量预算', 'budget') : '') +
            `<section class="budget-panel"><div><span>团队验证流量</span><h2>${used}% <small>/ ${s.budget}% 预算</small></h2><p>观察中的实验继续保留流量槽位。A/B 在覆盖流量内各分配约一半。</p></div><div class="slot-grid" aria-label="流量占用">${Array.from({ length: 100 }, (_, i) => `<i class="${i < used ? 'used' : i < s.budget ? 'available' : ''}"></i>`).join('')}</div></section><h2 class="section-title">等待你审阅</h2>${expTable(s, s.experiments.filter(e => e.status === 'review'))}<h2 class="section-title">排期与观察队列</h2>${expTable(s, s.experiments.filter(e => ['queued', 'running', 'observing', 'terminated'].includes(e.status)))}`;
    }
    if (page === 'resources') return heading('资源候选库', '上传仅创建候选。原图不可覆盖，发布时引用固定版本。', button('＋ 上传 PNG', 'upload', '', 'primary')) +
        `<div class="template-strip"><span class="enabled">已开放：关卡单参数、背景 PNG</span><span>待接入：引导流程、地图替换、音乐、音效</span></div>` + (s.resources.length ? `<div class="resource-grid">${s.resources.map(r => `<article class="resource-card"><img src="/api/resources/${r.id}" alt="${esc(r.name)}"><div><h3>${esc(r.name)}</h3><p>${r.width} × ${r.height} · ${(r.size / 1024).toFixed(0)} KB</p><small>${esc(member(s, r.ownerId))} · ${time(r.createdAt).split(' ')[0]}</small></div></article>`).join('')}</div>` : empty('为下一个实验准备素材', '上传经过检查的 PNG，支持 64×64 至 2048×4096，单张不超过 4 MB。', button('上传第一张背景图', 'upload', '', 'primary')));
    if (page === 'knowledge') return heading('复盘与经验', '保留正向、负向和无明确差异的结果，避免重复试错。') + expTable(s, s.experiments.filter(e => ['recap', 'archived'].includes(e.status)));
    if (page === 'team') return heading('团队与记录', '账号权限由服务端验证，每个关键操作都可以追溯。', `${button('修改我的密码', 'password')}${manager ? button('＋ 添加成员', 'new-user', '', 'primary') : ''}`) +
        `<section class="panel"><table><thead><tr><th>成员</th><th>账号</th><th>角色</th><th>状态</th><th></th></tr></thead><tbody>${s.users.map(u => `<tr><td><strong>${esc(u.name)}</strong></td><td>${esc(u.username)}</td><td>${u.role === 'manager' ? '负责人' : '实验成员'}</td><td>${u.disabled ? '已禁用' : '正常'}</td><td>${manager && u.id !== s.user.id && !u.disabled ? button('禁用', 'disable-user', u.id, 'quiet danger-text') : ''}</td></tr>`).join('')}</tbody></table></section><h2 class="section-title">${manager ? '团队' : '我的'}操作记录</h2><section class="panel audit">${[...s.audit].reverse().map(a => `<div><time>${time(a.time)}</time><strong>${esc(a.actor)}</strong><span>${esc(actionName(a.action))}</span><small>${esc(a.detail)}</small></div>`).join('') || '<p>暂无操作记录</p>'}</section>`;
    const own = s.experiments.filter(e => manager || e.ownerId === s.user.id);
    return heading(`${esc(s.user.name)}，开始今天的实验`, '把一个问题拆成可验证的变化，让每次尝试都有明确去向。', manager ? button('＋ 创建优化任务', 'new-task', '', 'primary') : '<a class="button primary" href="#tasks">查看可领取任务</a>') +
        `<div class="summary-strip">${[['待领取任务', s.tasks.filter(t => !t.ownerId).length, 'tasks'], ['待审阅', own.filter(e => e.status === 'review').length, 'schedule'], ['需要修改', own.filter(e => e.status === 'returned').length, 'experiments'], ['待复盘', own.filter(e => e.status === 'recap').length, 'knowledge']].map(([label, n, target]) => `<a href="#${target}"><span>${label}</span><strong>${n}<small> 项</small></strong></a>`).join('')}</div>
        <div class="home-grid"><section><div class="section-heading"><h2>当前实验</h2><a href="#experiments">查看全部</a></div>${expTable(s, own.filter(e => e.status !== 'archived').slice(-6).reverse())}</section><aside class="workflow-note"><span class="bead-symbol" aria-hidden="true">▦</span><h2>把想法变成<br>可靠的结论</h2><ol><li>明确一个优化问题</li><li>只改变一个变量</li><li>先自测，再提交审阅</li><li>等待样本和观察窗口</li><li>记录结果，积累经验</li></ol><p>不以实验数量或正向结果数量排名。</p></aside></div>`;
}
export function filteredTable(s, query, status) {
    return expTable(s, s.experiments.filter(e => (!status || e.status === status) && `${e.title} ${taskOf(s, e).title} ${member(s, e.ownerId)}`.toLowerCase().includes(query.toLowerCase())));
}
export function actionName(action) {
    return ({ edit: '修改草稿', evidence: '记录自测', submit: '提交审阅', approve: '批准候选', return: '退回修改', start: '启动本地验证', stop: '停止入组', terminate: '终止验证', finish: '进入复盘', recap: '提交复盘', archive: '确认归档', anomaly: '报告异常' })[action] || action;
}
export function detail(s, exp) {
    const task = taskOf(s, exp), r = s.results[exp.id], m = s.user.role === 'manager', owner = m || exp.ownerId === s.user.id;
    const resourceName = id => s.resources.find(r => r.id === id)?.name || id;
    const before = task.type === 'background' ? resourceName(task.controlResource) : exp.baseline.data[task.field];
    const after = task.type === 'background' ? resourceName(exp.candidate) : exp.candidate;
    const buttons = [];
    if (owner && ['draft', 'returned'].includes(exp.status)) buttons.push(button('编辑候选', 'edit-exp', exp.id), button('记录自测', 'evidence', exp.id), button('提交审阅', 'submit', exp.id, 'primary'));
    if (m && exp.status === 'review') buttons.push(button('退回修改', 'return', exp.id), button('批准并排队', 'approve', exp.id, 'primary'));
    if (m && exp.status === 'queued') buttons.push(button('启动本地验证', 'start', exp.id, 'primary'));
    if (m && exp.status === 'running') buttons.push(button('停止新增入组', 'stop', exp.id), button('验证分组与事件', 'validation', exp.id));
    if (m && ['running', 'observing'].includes(exp.status)) buttons.push(button('终止验证', 'terminate', exp.id, 'danger-text'));
    if (m && ['observing', 'terminated'].includes(exp.status)) buttons.push(button('结束观察，进入复盘', 'finish', exp.id));
    if (owner && exp.status === 'recap') buttons.push(button('填写复盘', 'recap', exp.id, 'primary'));
    if (m && exp.status === 'recap' && exp.recap) buttons.push(button('确认并归档', 'archive', exp.id));
    return modal(exp.title, `<div class="detail-meta">${badge(exp.status)}<span>${esc(member(s, exp.ownerId))}</span><span>版本 ${exp.version}</span><span>第 ${task.levelId} 关</span></div>
        ${exp.feedback ? `<div class="warning">退回原因：${esc(exp.feedback)}</div>` : ''}${exp.anomaly ? `<div class="warning">异常：${esc(exp.anomaly.note)}</div>` : ''}
        <h3>实验假设</h3><p>${esc(exp.hypothesis)}</p><div class="comparison"><section><span class="variant">A</span><div><small>冻结对照 · ${fieldNames[task.field]}</small><h3>${esc(before)}</h3></div></section><section><span class="variant treatment">B</span><div><small>候选方案 · ${fieldNames[task.field]}</small><h3>${esc(after)}</h3></div></section></div>
        <div class="actions">${button('查看 A/B 内容预览', 'preview', exp.id)}${button('复制为新候选', 'copy', exp.id)}${owner ? button('报告异常', 'anomaly', exp.id, 'quiet') : ''}${m ? `<a class="button quiet" href="/api/export/${exp.id}">导出验证记录</a>` : ''}</div>
        <h3>实际游戏试玩</h3>${owner && !['archived', 'terminated'].includes(exp.status) ? button('生成游戏试玩入口', 'game-preview', exp.id, 'primary') : ''}<p class="muted">以下为客户端自动上报的自测记录，与下方手工验证数据分开。不是生产玩家数据，也不是通关可信校验。</p>${(s.previews?.sessions || []).filter(p => p.experimentId === exp.id).map(p => {
            const events = (s.previews.events || []).filter(e => e.sessionId === p.id);
            return `<div class="evidence"><strong>${p.variant} 组 · ${esc(p.issuerName)}</strong><small>${time(p.createdAt)} · ${p.revoked ? '已撤销' : p.expires <= Date.now() ? '已过期' : '有效'}</small><p>${events.length ? events.map(e => `${({ loaded: '配置已加载', exposure: '游戏已实际展示', complete: '已通关', failure: '失败' })[e.type]}：${time(e.time)}${e.reason ? ' ' + esc(e.reason) : ''}`).join('<br>') : '等待游戏连接，尚无试玩事件'}</p>${!p.revoked && (m || p.issuerId === s.user.id) ? button('撤销入口', 'revoke-preview', p.id, 'quiet') : ''}</div>`;
        }).join('')}<h3>自测记录</h3>${exp.evidence ? `<div class="evidence"><p>${esc(exp.evidence.note)}</p><small>证据：${esc(exp.evidence.reference)}</small><small>${esc(exp.evidence.tester)} · ${time(exp.evidence.time)}</small></div>` : '<p class="muted">还没有自测证据，暂时不能提交审阅。</p>'}
        <h3>判断规则</h3><p>${esc(task.metric)}。每组目标 ${task.samplePerGroup} 人，用户观察窗口 ${task.windowHours} 小时，最短运行 ${task.minDays} 天；失败率超过 ${task.maxFailurePercent}% 时停止入组（每组至少 20 人）。</p>
        <h3>结果 <span class="type-label">仅本地验证数据</span></h3><div class="result-status">${r.status}</div><div class="table-wrap"><table><thead><tr><th>组别</th><th>分配</th><th>曝光</th><th>失败</th><th>成熟样本</th><th>完成</th><th>完成率</th></tr></thead><tbody>${r.rows.map(row => `<tr><td>${row.variant}</td><td>${row.assigned}</td><td>${row.exposed}</td><td>${row.failed}</td><td>${row.mature}</td><td>${row.completed}</td><td>${percent(row.rate)}</td></tr>`).join('')}</tbody></table></div><p class="muted">B − A：${r.delta === null ? '暂无成熟样本' : `${(r.delta * 100).toFixed(2)} 个百分点`}；95% 差值区间：${r.ci ? r.ci.map(v => `${(v * 100).toFixed(2)}`).join(' 至 ') + ' 个百分点' : '—'}。截止 ${time(r.cutoff)}。</p>
        ${exp.recap ? `<h3>实验复盘</h3>${[['change', '改了什么'], ['hypothesis', '原假设'], ['finding', '数据说明'], ['limits', '限制'], ['next', '下一步']].map(([k, label]) => `<div class="recap-row"><strong>${label}</strong><p>${esc(exp.recap[k])}</p></div>`).join('')}` : ''}
        ${exp.history?.length ? `<details class="version-history"><summary>历史版本（${exp.history.length}）</summary>${[...exp.history].reverse().map(h => `<section><strong>版本 ${h.version} · ${esc(h.title)}</strong><p>${badge(h.status)} B 组：${esc(task.type === 'background' ? resourceName(h.candidate) : h.candidate)}<br>假设：${esc(h.hypothesis)}<br>自测：${esc(h.evidence?.note || '未记录')}<br>退回原因：${esc(h.feedback || '无')}</p><small>${esc(h.actor)} · ${time(h.savedAt)}</small></section>`).join('')}</details>` : ''}<div class="dialog-actions">${buttons.join('')}</div>`, true);
}
