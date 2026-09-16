'use strict';

(function (root) {
    const days = ['D1', 'D2', 'D3', 'D7'];
    const missing = '数据不可得';
    const percent = (users, base) => base > 0 ? `${(users / base * 100).toFixed(2)}%` : missing;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

    function validate(data) {
        if (data?.schemaVersion !== 1 || !datePattern.test(data.from) || !datePattern.test(data.to)
            || data.from > data.to || !Number.isFinite(Date.parse(data.cutoff)) || !Array.isArray(data.cohorts)) throw new Error('留存快照结构错误');
        const today = new Date(Date.parse(data.cutoff) + 8 * 3600000).toISOString().slice(0, 10);
        const seen = new Set();
        for (const row of data.cohorts) {
            if (!datePattern.test(row.date) || seen.has(row.date) || row.date < data.from || row.date > data.to
                || !Number.isInteger(row.registered) || row.registered < 0
                || !['complete', 'partial'].includes(row.status)) throw new Error('注册队列错误');
            seen.add(row.date);
            for (const day of days) {
                const value = row.retention?.[day];
                if (!value) continue;
                if (value.date !== addDays(row.date, Number(day.slice(1)))
                    || !['complete', 'partial', 'future'].includes(value.status)
                    || value.base !== row.registered) throw new Error('留存口径不一致');
                const expected = value.date < today ? 'complete' : value.date === today ? 'partial' : 'future';
                if (value.status !== expected) throw new Error('观察状态不一致');
                if (value.status !== 'future' && (!Number.isInteger(value.users) || value.users < 0 || value.users > value.base)) throw new Error('回访人数错误');
            }
        }
        for (let date = data.from; date <= data.to; date = addDays(date, 1)) {
            if (!seen.has(date)) throw new Error('注册日期缺失');
        }
        return data;
    }

    function toPublicSnapshot(source) {
        return validate({ schemaVersion: 1, cutoff: source.cutoff, from: source.from, to: source.to,
            cohorts: source.cohorts.map(row => ({ date: row.date, status: row.status, registered: row.registered,
                retention: Object.fromEntries(days.filter(day => row.retention?.[day]).map(day => {
                    const value = row.retention[day];
                    return [day, { date: value.date, status: value.status, base: value.base, users: value.users }];
                })) })) });
    }

    async function load(url, request = fetch) {
        try {
            const response = await request(url, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return validate(await response.json());
        } catch (_) { return { message: `${missing}：注册留存快照缺失、加载失败或格式错误；不影响其他日报区块。` }; }
    }

    function summarize(rows, day) {
        const mature = rows.filter(row => row.status === 'complete' && row.retention?.[day]?.status === 'complete');
        return { users: mature.reduce((sum, row) => sum + row.retention[day].users, 0),
            base: mature.reduce((sum, row) => sum + row.registered, 0), dates: mature.map(row => row.date),
            incomplete: rows.some(row => !row.retention?.[day]) };
    }

    function render(data, date, { escapeHtml: e, renderMetricCard: metric, renderTable: table }) {
        const wrap = content => `<section id="registered-retention" class="card span-12"><div class="card-header"><div class="card-title">注册用户留存 · D1 / D2 / D3 / D7</div></div><div class="card-body">${content}</div></section>`;
        if (!data || data.message) return wrap(`<div class="empty">${e(data?.message || missing)}</div>`);
        if (date < data.from || date > data.to) return wrap(`<div class="empty">数据不可得：所选注册日期不在快照覆盖范围 ${e(data.from)}～${e(data.to)}；请更新留存快照。</div>`);
        const rows = data.cohorts.filter(row => row.date <= date).sort((a, b) => a.date.localeCompare(b.date));
        const time = new Date(data.cutoff).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
        const cards = days.map(day => {
            const total = summarize(rows, day);
            return metric(`${day} 成熟队列留存`, total.incomplete ? missing : percent(total.users, total.base),
                total.incomplete ? '存在缺失指标，暂停该汇总' : `${total.users} / ${total.base} 人；注册队列 ${total.dates[0] || '无'}～${total.dates.at(-1) || '无'}`);
        }).join('');
        const cell = value => {
            if (!value) return missing;
            if (value.status === 'future') return `未成熟（${e(value.date)}）`;
            return `${percent(value.users, value.base)}（${value.users}/${value.base}）${value.status === 'partial' ? ' · 当日未结束，仅截至快照' : ''}`;
        };
        return wrap(`<p class="card-subtitle">固定快照，非实时。数据截止 ${e(time)}（北京时间）。所选日期控制注册队列范围：${e(data.from)}～${e(date)}，不是历史观察截止日。</p>
            <div class="metrics">${cards}</div>
            <p class="card-subtitle">分母：按最早有效 firstLoginTime 去重的全部注册用户；分子：注册后第 N 个北京时间自然日有任意 user_behavior 记录的用户。非连续留存、非单关留存，不限定主线玩法。汇总只纳入注册日与回访日均已结束的队列，不同 Dn 分母不同；行为漏报可能低估回访，注册不等于安装。</p>
            ${table(['注册日期', '注册人数', ...days], rows.map(row => [e(row.date) + (row.status === 'partial' ? '（未结束）' : ''), String(row.registered), ...days.map(day => cell(row.retention?.[day]))]))}`);
    }

    const api = { validate, toPublicSnapshot, load, summarize, render };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CloudbaseRegisteredRetention = api;
})(typeof window !== 'undefined' ? window : globalThis);
