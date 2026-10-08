(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('../scripts/daily-report-quality'));
    else root.CloudbaseReportDashboard = factory(root.DailyReportQuality);
})(typeof globalThis === 'object' ? globalThis : this, function (Q) {
    'use strict';
    const count = value => Q.numeric(value) === null ? '未采集' : Number(value).toLocaleString('zh-CN');
    const decimal = value => Q.numeric(value) === null ? '未采集' : Number(value).toFixed(1);
    const seconds = value => Q.numeric(value) === null ? '无耗时样本' : `${(Number(value) / 1000).toFixed(2)} 秒`;
    function rate(n, d) {
        const m = Q.measure(n, d);
        if (m.status === 'missing') return '未采集';
        if (m.status === 'no_sample') return '无样本';
        if (m.status === 'unpaired') return '不可直接比较';
        return `${(m.rate * 100).toFixed(1)}%${m.lowSample ? ' · 小样本' : ''}`;
    }
    function ratioEvidence(n, d) { return `${rate(n, d)}（${count(n)} / ${count(d)}）`; }
    function time(value) {
        if (!value) return '未知';
        return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value));
    }
    function card(id, title, subtitle, body, ui, folded = false) {
        const header = `<div class="card-title">${ui.escapeHtml(title)}</div><div class="card-subtitle">${ui.escapeHtml(subtitle)}</div>`;
        return folded
            ? `<details id="${id}" class="card span-12 report-section"><summary>${header}</summary><div class="card-body">${body}</div></details>`
            : `<section id="${id}" class="card span-12"><div class="card-header">${header}</div><div class="card-body">${body}</div></section>`;
    }
    const notice = (text, ui) => `<p class="report-note">${ui.escapeHtml(text)}</p>`;
    const official = summary => summary.analyticsV2?.available && summary.analyticsV2.environmentScope === 'wechat_release';
    const levelsOf = summary => summary.analyticsV2?.available ? summary.analyticsV2.levels || [] : [];
    function coverage(summary, modeIndex, ui) {
        const context = summary.reportContext, window = Q.windowInfo(summary);
        const builds = (context?.builds || []).map(x => `${x.id === 'unknown' ? '版本未记录' : x.id}：${count(x.events)} 条`).join('；');
        const environments = (context?.environments || []).map(x => `${x.name === 'wechat_release' ? '微信正式版' : x.name === 'unknown' ? '环境未记录' : x.name}：${count(x.events)} 条`).join('；');
        const modeRows = modeIndex?.envId === summary.envId && modeIndex?.date === summary.date
            ? Object.entries(modeIndex.modes || {}).map(([key, value]) => [ui.escapeHtml(value.label || key), count(value.counts?.user_behavior), count(value.counts?.first_level_funnel), count(value.counts?.level_record)]) : [];
        return card('report-scope', '数据范围与截止时间', '北京时间 · 正式主线独立统计 · 页面不是实时看板',
            `<div class="report-badges"><span>${ui.escapeHtml(summary.date)}</span><span>${window.label}</span><span>导出参考截止：${time(window.cutoff)}</span><span>${official(summary) ? 'CSD：已确认微信正式版' : 'CSD：正式版本覆盖未确认'}</span></div>`
            + `<details><summary>查看版本、采集覆盖及其他模式数量</summary>`
            + notice('总览沿用当前主线兼容事件口径；CSD 与新版单局明细仅使用其标明的版本范围，两者不能混作同一分母。当天未决不等于流失。', ui)
            + notice(`客户端版本（记录数，不是人数）：${builds || '历史汇总未保存版本分布，不能确认版本可比。'}`, ui)
            + notice(`采集环境：${environments || '历史汇总未保存环境分布。'}`, ui)
            + notice(context?.note || '历史文件没有可信抓取截止；汇总生成时间不是抓取时间，不与完整日直接比较。', ui)
            + (modeRows.length ? ui.table(['分类', '行为记录', '检查记录', '结局记录'], modeRows) : notice('全模式覆盖索引不可得；未知分类不能按零处理。', ui))
            + '</details>', ui);
    }
    function insights(summary, diagnosis, ui) {
        const items = (diagnosis?.recommendations || []).map(x => `${x.topic}：${x.finding} ${x.action}`);
        for (const v of levelsOf(summary)) {
            const c = v.csd;
            if (!official(summary) || !c) continue;
            if (c.technical?.count > 0) items.push(`第 ${v.levelId} 关技术异常 ${count(c.technical.count)} 次、涉及 ${count(c.technical.users)} 人；不能直接当作无法游玩人数。`);
            if (c.freeze?.rejected?.count > 0) items.push(`第 ${v.levelId} 关冰冻未生效 ${count(c.freeze.rejected.count)} 次、涉及 ${count(c.freeze.rejected.users)} 人，查看 CSD 中的奖励与效果证据。`);
            if (c.input?.episodes?.count > 0) items.push(`第 ${v.levelId} 关阻挡候选 ${count(c.input.episodes.count)} 段、涉及 ${count(c.input.episodes.users)} 人；已恢复 ${count(c.input.recovered)} 段，观察未完成 ${count(c.input.unfinished)} 段。`);
        }
        const core = diagnosis?.coreMetrics || {};
        if (Q.numeric(core.l1EnterUv) === 0) items.unshift('首关没有进入样本，暂不评价通过率，不触发首关低通过率告警。');
        if (Q.numeric(core.enterLevelUsers) > 0 && core.enterLevelUsers < Q.minimumSamples) items.unshift(`当前仅 ${core.enterLevelUsers} 名主线进入用户，样本很小，不据此判断难度改善或恶化。`);
        return card('report-observations', '重点观察', '区分已记录现象与待验证原因，不自动判定“难度过高”或“玩家无法游玩”',
            (items.length ? `<ul>${items.slice(0, 6).map(x => `<li>${ui.escapeHtml(x)}</li>`).join('')}</ul>`
                + (items.length > 6 ? `<details><summary>查看其余 ${items.length - 6} 项</summary><ul>${items.slice(6).map(x => `<li>${ui.escapeHtml(x)}</li>`).join('')}</ul></details>` : '')
                : notice('目前没有达到筛查条件的观察项；不代表已经证明没有问题。请结合数据覆盖查看。', ui))
            + notice(`比例筛查至少需要 ${Q.minimumSamples} 个适用样本；首关30%、首次归位60%、广告完成信号40%是人工筛查参考线，不是统计显著性或故障判定标准。`, ui), ui);
    }
    function levelOverview(summary, diagnosis, ui) {
        const modern = new Map(levelsOf(summary).map(x => [x.levelId, x]));
        const rows = new Map((diagnosis?.first20Levels || []).map(x => [x.levelId, x]));
        const body = Array.from({ length: 20 }, (_, index) => {
            const id = index + 1, r = rows.get(id), v = official(summary) ? modern.get(id) : null;
            return [`<strong>第 ${id} 关</strong>`, count(r?.enterUv), count(r?.passUv), rate(r?.passUv, r?.enterUv), count(r?.failUv),
                v ? count(v.terminal?.unresolved) : '未采集',
                v?.nextLevel ? ratioEvidence(v.nextLevel.enteredAfterPassUsers, v.nextLevel.passedUsers) : '未采集',
                `<button type="button" class="secondary report-level-button" data-report-level="${id}" aria-controls="report-level-detail">查看第 ${id} 关</button>`];
        });
        return card('report-levels', '前 20 关总览', '人数口径与局数口径分开；通过、失败人数可能重叠；下一关承接只看同人当天通关后进入',
            ui.table(['关卡', '进入人数', '通过人数', '通过人数 / 进入人数', '触发失败人数', '新版未决局', '新版下一关承接人数 / 通关人数', '详情'], body, { filterColumns: [0] })
            + notice('通过/进入是当日事件人数比，未逐人配对，不是严格的同批玩家转化率。下一关未进入可能是稍后继续、跨天或记录缺失，不直接算流失。失败事件可以发生在复活前，不等于最终失败局。', ui)
            + '<details id="report-level-detail"><summary>单关详情：选择上方关卡查看</summary><div id="report-level-detail-body"></div></details>', ui);
    }
    function renderCsdLevel(v, ui) {
        const c = v?.csd;
        if (!c) return notice('本关没有新版 CSD 明细，不能当作零异常。', ui);
        const metrics = [
            ['非预期阻挡候选', c.input?.episodes, `已恢复 ${count(c.input?.recovered)} 段；观察未完成 ${count(c.input?.unfinished)} 段；前台采样时长中位数 ${seconds(c.input?.foregroundDuration?.p50Ms)}、95分位 ${seconds(c.input?.foregroundDuration?.p95Ms)}`],
            ['冰冻实际生效', c.freeze?.applied, '记录效果执行成功，不是领取次数'],
            ['冰冻未生效', c.freeze?.rejected, `广告奖励成功但效果被拒绝 ${count(c.freeze?.rewardedButEffectRejected)} 次；奖励后缺效果证据 ${count(c.freeze?.rewardedWithoutEffectEvidence)} 次`],
            ['冰冻效果结果未知', c.freeze?.unknown, '效果事件缺明确成功/失败标记，不计入未生效'],
            ['技术异常', c.technical, '脚本或异步运行异常；次数不等于受影响人数'],
            ['内存告警', c.memoryWarnings, '系统内存压力信号，不等于已发生崩溃'],
        ];
        const labels = { no_pattern_hit: '没有命中图案', invalid: '规则判定无效', capacity_blocked: '容量限制', stored: '成功存入', partial: '部分存入', inactive: '非可操作状态' };
        const board = c.boardResults || {};
        const boardRows = Object.entries(labels).map(([key, label]) => [label, count(board[key])]);
        return ui.table(['检查项', '次数 / 片段', '涉及人数', '人数 / 本关进入人数（非配对）', '结果说明'], metrics.map(([label, metric, note]) =>
            [label, count(metric?.count), count(metric?.users), ratioEvidence(metric?.users, v.entered?.users), ui.escapeHtml(note)]))
            + '<h3>棋盘点击结果</h3>' + ui.table(['结果', '汇总次数'], boardRows)
            + notice('未命中可能是点到空白；规则无效和容量限制也不等于点击系统失灵。没有棋盘汇总时显示未采集，不用零代替。', ui)
            + '<h3>引导检查</h3>'
            + notice(v.guide?.applicable === false ? '本关不适用引导检查。'
                : `引导未命中 ${v.guide?.missingLatestSummary ? '未知（缺最新汇总）' : count(v.guide?.missCount)} 次、涉及 ${count(v.guide?.missUsers)} 人；连续未命中最大值 ${count(c.guideCounters?.maxConsecutiveMisses)}。缺汇总的次数保留未知；详细样本不作为全量。`, ui)
            + ui.table(['引导未命中原因', '次数'], Object.entries(c.guideCounters?.missReasons || {}).map(([key, n]) => [ui.escapeHtml(ui.display(key)), count(n)]));
    }
    function renderLevel(summary, levelId, ui) {
        const d = Q.normalizeDiagnosis(summary.dailyDiagnosis);
        const r = d?.first20Levels?.find(x => x.levelId === levelId);
        const v = official(summary) ? levelsOf(summary).find(x => x.levelId === levelId) : null;
        const record = summary.collections?.level_record?.summary?.levelRows?.find(x => x.levelId === levelId);
        const known = r?.recordCount > 0;
        const terminal = v?.terminal;
        const ends = terminal ? [['通过局', terminal.pass], ['最终失败局', terminal.fail], ['中止局（不等于主动退出）', terminal.abandon],
            ['其中明确退出局（中止局子集）', terminal.explicitExit], ['中止原因缺失局（中止局子集）', terminal.unknownAbandonReason], ['未决局', terminal.unresolved],
            ['其中后台超时未回（未决子集）', terminal.inferredUnreturned], ['终局冲突或无效（未决子集）', terminal.conflictingRounds]] : [];
        const failures = v?.failureReasons ? Object.entries(v.failureReasons) : [];
        const ad = d?.levelAdRelationship?.find(x => x.levelId === levelId);
        return `<h3>第 ${levelId} 关 · 难度、退出、广告与操作</h3><div class="metrics">`
            + ui.metric('当日人数比（兼容事件）', rate(r?.passUv, r?.enterUv), `通过 ${count(r?.passUv)} / 进入 ${count(r?.enterUv)} 人`)
            + ui.metric('新版同批进入局通过率', rate(terminal?.pass, v?.entered?.identifiedRounds), `通过 ${count(terminal?.pass)} / 可识别进入 ${count(v?.entered?.identifiedRounds)} 局；未决仍在分母`)
            + ui.metric('结局记录平均耗时', known ? `${decimal(r.avgDurationSeconds)} 秒` : '无结局样本', '不是纯通关用时；没有结局的局不在此样本')
            + ui.metric('结局记录平均尝试', known ? decimal(r.avgTryCount) : '无结局样本', `结果记录 ${count(r?.recordCount)} 条；中止记录 ${count(record?.abandonedCount)} 条（不混作失败）`) + '</div>'
            + '<h3>失败与离开</h3>' + (failures.length ? ui.table(['新版失败事件原因', '触发次数（不是最终失败局）'], failures.map(([key, n]) => [ui.escapeHtml(ui.display(key)), count(n)]))
                : notice(v ? '本次新版范围没有失败事件原因样本，不说明所有进入局均已通过。' : '新版失败原因未采集。', ui))
            + (v ? ui.table(['同批可识别进入局结局', '局数'], ends.map(([label, n]) => [label, count(n)])) : notice('缺少已确认正式版本的同局关联明细，不能从“进入减通过”推断主动退出。', ui))
            + (v ? notice(`明确离开意图涉及 ${count(v.exitIntentUsers)} 人，切后台涉及 ${count(v.backgroundUsers)} 人；意图不等于实际离开，切后台不等于失败。`, ui) : '')
            + '<h3>广告与道具</h3>' + ui.table(['兼容事件统计', '次数'], [
                ['广告展示信号', count(ad?.adShowPv)], ['广告完成信号', count(ad?.adFinishPv)],
                ['关卡记录中的磁铁使用', r?.pchStatsRecordCount > 0 ? count(r.magnetUses) : '无道具样本'],
                ['关卡记录中的刷子使用', r?.pchStatsRecordCount > 0 ? count(r.brushUses) : '无道具样本'],
                ['关卡记录中的冰冻使用', r?.pchStatsRecordCount > 0 ? count(r.freezeUses) : '无道具样本']])
            + notice(`新版免费扩容发放 ${count(v?.capacity?.freeGrants)} 次；广告扩容发放 ${count(v?.capacity?.adGrants)} 次。免费发放不计广告播放。`, ui)
            + (v ? renderCsdLevel(v, ui) : notice('该关新版 CSD 未覆盖，不能判定没有操作异常。', ui));
    }
    function advertising(summary, ui) {
        const values = official(summary) ? levelsOf(summary).filter(v => v.csd) : [];
        const rows = [], waits = [];
        for (const v of values) {
            const c = v.csd;
            const placements = c.placements || [{ page: '旧汇总：入口仅扩容，广告为本关所有位置', exposure: c.exposure, ads: c.ads }];
            for (const p of placements) {
                const a = p.ads;
                rows.push([`第 ${v.levelId} 关`, ui.escapeHtml(ui.display(p.page)), count(p.exposure?.freeEntry?.count), count(p.exposure?.adEntry?.count),
                    count(a?.nativeRequests), count(a?.final?.shown), count(a?.final?.completed), count(a?.final?.rewarded)]);
            }
            if (c.ads?.nativeRequests || c.ads?.final?.ambiguous) waits.push([`第 ${v.levelId} 关`, count(c.ads.waiting?.count), count(c.ads.waiting?.users),
                count(c.ads.loadingOutcomes?.shown), count(c.ads.loadingOutcomes?.failedWithoutShow), count(c.ads.loadingOutcomes?.unknownWithoutShow),
                `${seconds(c.ads.clickToShow?.p50Ms)} / ${seconds(c.ads.clickToShow?.p95Ms)}（${count(c.ads.clickToShow?.samples)} 个展示样本）`,
                `${count(c.ads.final?.failed)} / ${count(c.ads.final?.incomplete)} / ${count(c.ads.final?.unknown)}`]);
        }
        const legacy = ui.legacy;
        return card('report-ads', '广告与免费／分享奖励', '按广告位置看入口 → 请求 → 原生展示 → 完整观看 → 奖励到账；均为客户端证据，不是平台结算曝光或收入',
            (values.length ? ui.table(['关卡', '位置', '免费入口可见', '广告入口可见', '原生请求', '原生展示', '完整观看', '奖励到账'], rows)
                : notice('缺少已确认正式版本的广告事务数据；兼容事件仍可在下方查看，但不能推断原生广告的真实完播率。', ui))
            + notice('入口计数目前主要覆盖扩容，不能拿它作所有广告点击的分母。没有列出的广告位置不代表从未出现；旧汇总缺少位置或等待结局时显示未采集。', ui)
            + (values.length ? notice(`多请求冲突事务 ${count(values.reduce((sum, v) => sum + (v.csd.ads?.final?.ambiguous || 0), 0))} 个：不纳入原生请求、完成率或耗时样本。`, ui) : '')
            + '<details><summary>广告等待与最终结果</summary>'
            + ui.table(['关卡', '点击时加载中请求', '涉及人数', '等待后展示', '未展示就技术失败', '未展示且结果未知', '请求到展示中位数 / 95分位', '全部请求：技术失败 / 未看完 / 未知'], waits)
            + notice('等待后的展示、未展示失败、未展示未知为互斥分类。耗时只含匹配到展示的样本，无法代表一直没有展示的等待。全部请求的结果信号可能重叠，不能直接相加作请求总数。', ui) + '</details>'
            + `<details><summary>兼容广告事件与复活广告明细</summary>${legacy.ads()}${legacy.reviveAds()}</details>`
            + `<details><summary>分享复活（不计广告）与扩容单局明细</summary>${legacy.share()}${legacy.capacity()}</details>`, ui);
    }
    function checks(summary, ui) {
        const values = official(summary) ? levelsOf(summary).filter(v => v.csd) : [];
        const historical = levelsOf(summary).filter(v => v.csd?.exposure?.historicalUnknown?.count > 0)
            .map(v => [`第 ${v.levelId} 关`, count(v.csd.exposure.historicalUnknown.count), count(v.csd.exposure.historicalUnknown.users)]);
        const rows = values.map(v => {
            const c = v.csd;
            return [`第 ${v.levelId} 关`, count(v.entered?.users), `${count(c.input?.episodes?.count)} / ${count(c.input?.episodes?.users)}`,
                `${count(c.input?.recovered)} / ${count(c.input?.unfinished)}`, seconds(c.input?.foregroundDuration?.p95Ms),
                `${count(c.freeze?.applied?.count)} / ${count(c.freeze?.rejected?.count)}`, `${count(c.technical?.count)} / ${count(c.technical?.users)}`];
        });
        return card('report-checks', 'CSD 操作与异常检查', '详细检查默认收起；按关卡查看涉及人数、持续时长与恢复结果，不把次数当无法游玩人数',
            ui.table(['关卡', '新版进入人数', '阻挡片段 / 涉及人数', '恢复片段 / 观察未完成', '前台采样时长95分位', '冰冻生效 / 未生效次数', '技术异常次数 / 人数'], rows)
            + notice(`当前明细覆盖 ${values.length} 个关卡；无进入样本的零计数不代表该关已经验证正常。其他关卡缺失不填零。正常乱序、引导、后台与结算不作为持续阻挡故障；未恢复记录不证明永久卡住。`, ui)
            + notice(`当前主线分类中的零关卡游戏圈异常：${official(summary) ? count(summary.analyticsV2?.appDiagnostics?.gameCircleErrors?.count) : '未采集'} 次；这不是全应用总量，公共事件请切换“归属未知／公共事件”。棋盘点击与引导原因请展开上方单关详情。`, ui)
            + (historical.length ? '<h3>旧版入口分类未知（不能当广告播放）</h3>' + ui.table(['关卡', '入口记录数', '涉及人数'], historical) : '')
            + `<details><summary>前三关里程碑与引导明细（兼容会话口径）</summary>${ui.legacy.funnel()}${ui.legacy.guide()}</details>`, ui, true);
    }
    function trends(summary, summaries, ui) {
        const rows = summaries.map(s => {
            const c = Q.normalizeDiagnosis(s.dailyDiagnosis)?.coreMetrics || {};
            return [ui.escapeHtml(s.date), Q.windowInfo(s).label, count(c.enterLevelUsers), ratioEvidence(c.l1PassUv, c.l1EnterUv),
                count(c.adShowPv), ratioEvidence(c.adFinishPv, c.adShowPv), Q.comparable(summary, s) ? '完整日及版本集合一致' : '不作直接涨跌比较'];
        });
        return card('report-trends', '最近 7 份日报', '只加载同环境、同玩法的已分流报告；部分日、未知窗口或版本不一致时不生成涨跌结论',
            ui.table(['日期', '窗口', '主线进入人数', '首关人数比', '广告展示信号次数', '广告完成信号比', '与当前可比性'], rows)
            + notice('目前未生成昨日同一截止时间的切片，因此当日快照不与昨日全天直接比较。即使版本集合一致，实验分流和人群占比仍可能变化，涨跌不等于因果。', ui), ui, true);
    }
    function render(summary, summaries, ui, modeIndex) {
        const d = Q.normalizeDiagnosis(summary.dailyDiagnosis), c = d?.coreMetrics || {};
        const errors = official(summary) ? levelsOf(summary).filter(v => v.csd?.technical) : [];
        const errorCount = errors.reduce((sum, v) => sum + v.csd.technical.count, 0);
        const hero = `<div class="metrics">${ui.metric('主线进入人数', count(c.enterLevelUsers), '当日进入事件去重人数；不是全游戏活跃人数')}`
            + ui.metric('首关通过人数 / 进入人数', rate(c.l1PassUv, c.l1EnterUv), `${count(c.l1PassUv)} / ${count(c.l1EnterUv)} 人；非同批配对转化`)
            + ui.metric('广告展示信号', count(c.adShowPv), `兼容客户端记录；完成 ${count(c.adFinishPv)} 次；入口可见不计为播放`)
            + ui.metric('关卡技术异常记录', errors.length ? `${count(errorCount)} 次` : '未采集', `CSD覆盖 ${errors.length} 个关卡；涉及人数见分关明细，不跨关相加`) + '</div>';
        const date = encodeURIComponent(summary.date), mode = encodeURIComponent(summary.reportMode);
        return coverage(summary, modeIndex, ui)
            + '<nav class="report-nav span-12" aria-label="日报章节"><a href="#report-overview">核心指标</a><a href="#report-levels">前20关</a><a href="#report-ads">广告与奖励</a><a href="#report-checks">CSD检查</a><a href="#report-experiments">实验</a><a href="#report-quality">数据质量</a></nav>'
            + card('report-overview', '主线核心指标', '每个指标标明样本与口径；无样本不显示成 0%', hero, ui)
            + insights(summary, d, ui) + levelOverview(summary, d, ui) + advertising(summary, ui) + checks(summary, ui)
            + trends(summary, summaries, ui)
            + card('report-experiments', '当日实验记录', '这是所选日期的数据，不是从实验开始到现在的累计结果；有记录不等于实验仍在投放', ui.legacy.experiments(), ui, true)
            + card('report-experiment-history', '历史实验快照', '归档快照，不参与当前日报结论，不自动更新',
                '<a href="/artifacts/experiment-report-20260918/index.html">查看 2026年9月15—18日 11:12 实验快照（选豆、首关及鼓励音效）</a>', ui, true)
            + card('report-estimates', '辅助估算与行为路径', '净价值是解释型模型，不是实际收入；未通关、未回访及未决须按各自观察窗口解释',
                notice('下方旧模型的“纯流失”仅指当日未见通过且无广告完成，不证明玩家永久离开。“收益分”基于客户端广告完成记录估算，没有平台收入与结算证据。', ui)
                + ui.legacy.estimates() + ui.legacy.paths(), ui, true)
            + card('report-quality', '数据质量与来源', '缺失、未知、无样本与确认零分开；旧快照自动应用展示保护，不篡改原始记录', ui.legacy.quality()
                + notice(`CSD 排除不满足环境口径的记录 ${count(summary.analyticsV2?.quality?.excludedEnvironmentRows)} 条；缺局标识的行为记录 ${count(summary.analyticsV2?.quality?.missingBehaviorRound)} 条。`, ui)
                + `<div class="link-row"><a href="${ui.reportRoot}/${date}/modes/${mode}/combined_summary.json">当前模式汇总数据</a></div>`, ui, true);
    }
    return { render, renderLevel, rate, count, ratioEvidence, time };
});
