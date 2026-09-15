'use strict';

(function (root) {
    const missing = '数据不可得';
    const number = v => typeof v === 'number' && Number.isFinite(v) ? new Intl.NumberFormat('zh-CN').format(v) : missing;
    const percent = v => typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(2)}%` : missing;
    const typeLabel = { human_replay: '真人历史回放', bot: '机器人对手', friend: '好友挑战' };

    async function load(url, date, request = fetch) {
        try {
            const response = await request(url, { cache: 'no-store' });
            if (response.status === 404) return { message: `数据不可得：尚未生成 ${date} 的合作/PvP汇总。` };
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data.schemaVersion !== 1 || data.date !== date || !data.coop || !data.pvp) throw new Error('结构或日期不匹配');
            for (const mode of ['coop', 'pvp']) {
                const value = data[mode];
                if (!['available', 'unavailable'].includes(value.status)) throw new Error('未知数据状态');
                if (value.status === 'available' && (!Array.isArray(value.levels) || !Array.isArray(value.limitations)
                    || !Array.isArray(value[mode === 'coop' ? 'roles' : 'types']))) throw new Error('分析表缺失');
            }
            return data;
        } catch (_) { return { message: '数据不可得：合作/PvP汇总加载失败或格式错误，请检查文件与服务。' }; }
    }

    function render(data, { escapeHtml: e, renderMetricCard: metric, renderTable: table, renderBulletList: bullets }) {
        const time = data?.observationEnd ? new Date(data.observationEnd).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '';
        const period = time ? `观察至 ${time}（北京时间）${data.partial ? '，今天尚未完整' : '，自然日已结束'}；独立服务端口径，不叠加到主线或普通像素拼图。` : '独立玩法口径；缺少导出不等于没有用户。';
        function section(mode, title, content) {
            const value = data?.[mode];
            const unavailable = data?.message || value?.message || '该玩法尚未生成汇总';
            return `<section id="${mode}-analysis" class="card span-12"><div class="card-header"><div class="card-title">${title}</div><div class="card-subtitle">${e(period)}</div></div><div class="card-body">${value?.status === 'available' ? content(value) + '<p class="card-subtitle">人数不足5只记录信号，5–19继续观察；达到20也不等于AB样本充足。各表用户不可相加；旧版theme事件可能含排位，历史普通像素指标未在此回溯剥离。</p>' : `<div class="empty">${e(unavailable.startsWith('数据不可得') ? unavailable : '数据不可得：' + unavailable)}<br>在项目目录执行 <code>npm run analytics:social -- --date YYYY-MM-DD</code> 后刷新；读取失败需先修复权限、集合或字段。</div>`}</div></section>`;
        }
        const cards = items => `<div class="metrics">${items.map(args => metric(...args)).join('')}</div>`;
        const coop = section('coop', '合作玩法分析', d => {
            const signal = d.posts === 0 && d.newRuns === 0 && d.completionsInPeriod === 0
                ? '本日查询成功，未记录新发起、参与或完成；不是匹配失败率为零。'
                : d.creatorCompletedPosts > 0 && d.joinedPosts === 0
                    ? '本日发起队列已有个人完成，但尚未记录协作者加入；检查分享/广场触达，不能直接归因于关卡难度。'
                    : '分别观察发起者完成、协作者加入和整图达成；当天未完成仍可能继续异步参与。';
            return `${cards([
                ['新发起合作图', number(d.posts), `发起用户 ${number(d.creatorUV)} 人`],
                ['新参与用户', number(d.newRunUV), `新建个人记录 ${number(d.newRuns)}，含发起者与协作者`],
                ['当日完成个人记录', number(d.completionsInPeriod), `完成用户 ${number(d.completedUVInPeriod)}，可含前日创建`],
                ['新发起图达成率', percent(d.pairRate), `${number(d.pairedPosts)} / ${number(d.posts)} 图；非个人通关率`],
            ])}<p class="card-subtitle">${e(signal)}</p>
            ${table(['发起队列阶段', '图数', '转化口径'], [
                ['本日发起', number(d.posts), '按图ID去重'],
                ['发起者完成', number(d.creatorCompletedPosts), `${percent(d.creatorCompletionRate)} / 本日发起图`],
                ['至少一名协作者加入', number(d.joinedPosts), `${percent(d.joinRate)} / 发起者完成图`],
                ['双方至少各一人完成', number(d.pairedPosts), `${percent(d.pairRate)} / 本日发起图`],
            ])}
            ${table(['角色', '本日新建记录', '参与人数', '其中已完成', '完成比例'], d.roles.map(r => [r.role === 'creator' ? '发起者' : '协作者', number(r.runs), number(r.users), number(r.completedRuns), percent(r.completionRate)]))}
            ${table(['合作图关卡', '新发起图', '新个人记录', '参与UV', '个人已完成', '个人完成比例', '新图已达成'], d.levels.map(r => [number(r.levelId), number(r.posts), number(r.runs), number(r.users), number(r.completedRuns), percent(r.completionRate), number(r.pairedPosts)]))}
            ${bullets(d.limitations)}`;
        });
        const pvp = section('pvp', 'PvP 玩法分析', d => {
            const signal = d.matches === 0 && d.settlementsInPeriod === 0 ? '本日查询成功，未记录新对局或结算；匹配请求与失败次数仍不可得。'
                : d.expiredUnsettled > 0 ? '存在超过截止时间仍无结算的对局；优先核对恢复、提交与结算链路，不能直接等同于主动退出。'
                    : '分别比较三种对手类型；不要把机器人对局胜率当作真人对战水平。';
            return `${cards([
                ['新建对局', number(d.matches), `发起用户 ${number(d.initiatorUV)}；好友接受UV不可得`],
                ['新对局结算比例', percent(d.settlementRate), `${number(d.settledMatches)} / ${number(d.matches)} 对局`],
                ['当日真人结算人次', number(d.settlementsInPeriod), `结算用户 ${number(d.settlementUVInPeriod)}，可含前日对局`],
                ['过期未结算', number(d.expiredUnsettled), '本日新对局按expiresAt判断；非显式失败数'],
            ])}<p class="card-subtitle">${e(signal)}</p>
            ${table(['对手类型', '新对局', '发起UV', '已结算对局', '结算比例', '真人胜/负/平人次', '真人胜率', '过期未结算'], d.types.map(r => [e(typeLabel[r.type] || r.type), number(r.matches), number(r.initiatorUV), number(r.settledMatches), percent(r.settlementRate), `${number(r.wins)} / ${number(r.losses)} / ${number(r.draws)}`, percent(r.humanWinRate), number(r.expiredUnsettled)]))}
            ${table(['PvP关卡', '新对局', '发起UV', '已结算对局', '结算比例', '真人胜率', '过期未结算'], d.levels.map(r => [number(r.levelId), number(r.matches), number(r.initiatorUV), number(r.settledMatches), percent(r.settlementRate), percent(r.humanWinRate), number(r.expiredUnsettled)]))}
            <p class="card-subtitle">结算不完整对局：${number(d.partialSettlementMatches)}；全部实际参与者都有结算才计为已结算对局。</p>
            ${bullets(d.limitations)}`;
        });
        return coop + pvp;
    }
    const api = { load, render };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CloudbaseSocialReport = api;
})(typeof window !== 'undefined' ? window : globalThis);
