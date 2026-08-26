#!/usr/bin/env python3
"""Generate a self-contained interactive HTML design report for DBT levels."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PALETTE = {
    0: "#00000000", 1: "#ED5090", 2: "#4EEAEA", 3: "#F8C811", 4: "#FE8B10",
    5: "#F4BD9E", 6: "#EBDEA6", 7: "#4A4DCF", 8: "#7221BC", 9: "#9FCE21",
    10: "#EA281A", 11: "#37A92D", 12: "#207955", 13: "#20A8DC", 14: "#EEB2BC",
    15: "#C4BED9", 16: "#974714", 17: "#782F3C", 18: "#36387E", 19: "#373737", 20: "#F2EDE4",
}
REPRESENTATIVE_IDS = [1, 2, 24, 25, 33, 57, 79, 111, 150, 175, 179]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("analysis", type=Path)
    parser.add_argument("level_dir", type=Path)
    parser.add_argument("output", type=Path)
    return parser.parse_args()


def compact_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def main() -> None:
    args = parse_args()
    analysis = json.loads(args.analysis.read_text(encoding="utf-8"))
    boards = {
        level_id: json.loads((args.level_dir / f"level_{level_id}.json").read_text(encoding="utf-8"))
        for level_id in REPRESENTATIVE_IDS
    }
    template = r'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DBT 182 关 · 关卡设计解剖</title>
<style>
:root{--ink:#202038;--muted:#686785;--paper:#f7f6ff;--panel:#fff;--line:#dcdaf0;--purple:#6655c7;--cyan:#31bfd1;--gold:#f2b735;--rose:#e75986;--green:#55ad69;--shadow:0 16px 50px rgba(66,56,126,.12)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:var(--ink);background:radial-gradient(circle at 12% 5%,#ebe7ff 0,transparent 28%),radial-gradient(circle at 92% 9%,#def8fb 0,transparent 24%),var(--paper);font-family:"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.65}
a{color:inherit}.shell{width:min(1180px,calc(100% - 32px));margin:auto}.hero{padding:76px 0 46px}.eyebrow{font:700 12px/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.18em;color:var(--purple)}h1{margin:12px 0 18px;font-family:"STKaiti","KaiTi",serif;font-size:clamp(42px,7vw,86px);font-weight:700;line-height:1.02;letter-spacing:-.04em}.hero-copy{max-width:760px;font-size:18px;color:var(--muted)}
.hero-ribbon{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin-top:42px;background:var(--line);border:1px solid var(--line);border-radius:22px;overflow:hidden;box-shadow:var(--shadow)}.hero-ribbon div{background:rgba(255,255,255,.88);padding:22px}.hero-ribbon strong{display:block;font:800 28px/1 ui-monospace,SFMono-Regular,monospace}.hero-ribbon span{font-size:13px;color:var(--muted)}
.toc{position:sticky;top:0;z-index:9;background:rgba(247,246,255,.86);backdrop-filter:blur(16px);border-block:1px solid rgba(220,218,240,.9)}.toc .shell{display:flex;gap:24px;overflow:auto}.toc a{padding:14px 0;text-decoration:none;white-space:nowrap;font-size:13px;font-weight:700;color:var(--muted)}
section{padding:66px 0;border-bottom:1px solid var(--line)}.section-head{display:grid;grid-template-columns:140px 1fr;gap:22px;margin-bottom:30px}.section-index{font:700 13px ui-monospace,SFMono-Regular,monospace;color:var(--purple)}h2{margin:0;font-family:"STKaiti","KaiTi",serif;font-size:clamp(30px,4vw,50px);line-height:1.1}.lead{max-width:820px;color:var(--muted);font-size:17px}
.chart-wrap,.panel{background:rgba(255,255,255,.92);border:1px solid var(--line);border-radius:24px;box-shadow:var(--shadow)}.chart-wrap{padding:22px;overflow:hidden}.chart-title{display:flex;justify-content:space-between;align-items:end;gap:16px;margin-bottom:12px}.chart-title strong{font-size:18px}.chart-title span{font-size:12px;color:var(--muted)}svg{display:block;width:100%;height:auto}.axis{stroke:#aaa7c5;stroke-width:1}.gridline{stroke:#e9e7f5;stroke-width:1}.curve{fill:none;stroke:var(--purple);stroke-width:3}.moving{fill:none;stroke:var(--gold);stroke-width:4}.dot{stroke:#fff;stroke-width:1.5;cursor:pointer}.annotation{font:700 11px ui-monospace,SFMono-Regular,monospace;fill:var(--ink)}
.legend{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;font-size:12px;color:var(--muted)}.legend i{display:inline-block;width:18px;height:4px;margin-right:6px;vertical-align:middle;border-radius:9px}.method-note{margin-top:16px;padding:16px 18px;border-left:4px solid var(--gold);background:#fff8e8;color:#6d5830;font-size:13px}
.phase-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-top:22px}.phase{padding:18px 14px;background:#fff;border:1px solid var(--line);border-radius:18px}.phase b{display:block;font:800 18px ui-monospace,SFMono-Regular,monospace}.phase span{font-size:12px;color:var(--muted)}
.split{display:grid;grid-template-columns:1.15fr .85fr;gap:22px}.bar-list{padding:24px}.bar-row{display:grid;grid-template-columns:86px 1fr 34px;gap:12px;align-items:center;margin:13px 0;font-size:13px}.bar-track{height:10px;background:#eeecf8;border-radius:9px;overflow:hidden}.bar-fill{height:100%;border-radius:9px;background:linear-gradient(90deg,var(--purple),var(--cyan))}
.insights{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.insight{padding:22px;background:#fff;border:1px solid var(--line);border-radius:20px}.insight b{display:block;margin-bottom:6px;font-size:16px}.insight p{margin:0;color:var(--muted);font-size:13px}
.level-wall{display:grid;grid-template-columns:repeat(26,1fr);gap:5px;padding:22px}.level-tile{aspect-ratio:1;border:0;border-radius:5px;color:#fff;font:700 9px ui-monospace,SFMono-Regular,monospace;cursor:pointer;transition:transform .15s,outline .15s}.level-tile:hover,.level-tile:focus-visible{transform:scale(1.28);outline:2px solid var(--ink);z-index:2}.level-tile[data-tier="舒缓"]{background:#53a985}.level-tile[data-tier="稳定"]{background:#6975c9}.level-tile[data-tier="高压"]{background:#d18c32}.level-tile[data-tier="尖峰"]{background:#d64e73}.wall-detail{min-height:116px;margin-top:12px;padding:18px 22px;background:#25253f;color:#fff;border-radius:18px;display:grid;grid-template-columns:90px 1fr auto;gap:18px;align-items:center}.wall-detail strong{font:800 34px ui-monospace,SFMono-Regular,monospace}.wall-detail p{margin:0;color:#cbc9df;font-size:13px}.play-link{padding:10px 14px;border:1px solid #74728d;border-radius:12px;text-decoration:none;font-size:13px}
.spike-table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden}.spike-table th,.spike-table td{padding:13px 14px;border-bottom:1px solid var(--line);text-align:left;font-size:13px}.spike-table th{color:var(--muted);font-weight:600}.score{font:800 16px ui-monospace,SFMono-Regular,monospace;color:var(--rose)}
.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.board-card{padding:16px;background:#fff;border:1px solid var(--line);border-radius:20px}.board-card header{display:flex;justify-content:space-between;gap:10px;margin-bottom:10px}.board-card b{font:800 18px ui-monospace,SFMono-Regular,monospace}.board-card span{font-size:12px;color:var(--muted)}canvas{display:block;width:100%;aspect-ratio:1;background:#f3f2fa;border-radius:14px}.board-actions{display:flex;gap:8px;margin-top:10px}.board-actions button{flex:1;border:1px solid var(--line);background:#fff;border-radius:10px;padding:8px;cursor:pointer}.board-actions button[aria-pressed="true"]{background:#292941;color:#fff}
.recommendations{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.recommendation{padding:24px;background:#25253f;color:#fff;border-radius:22px}.recommendation em{font:700 12px ui-monospace,SFMono-Regular,monospace;color:#8ce2e9}.recommendation h3{margin:8px 0;font-size:18px}.recommendation p{margin:0;color:#cfcede;font-size:13px}.footer{padding:40px 0 70px;color:var(--muted);font-size:12px}
@media(max-width:820px){.hero-ribbon{grid-template-columns:repeat(2,1fr)}.section-head{grid-template-columns:1fr}.phase-grid{grid-template-columns:repeat(2,1fr)}.split{grid-template-columns:1fr}.level-wall{grid-template-columns:repeat(14,1fr)}.gallery{grid-template-columns:repeat(2,1fr)}.recommendations{grid-template-columns:1fr}.wall-detail{grid-template-columns:70px 1fr}.play-link{grid-column:1/-1;text-align:center}}
@media(max-width:520px){.shell{width:min(100% - 20px,1180px)}.hero{padding-top:48px}.hero-ribbon{grid-template-columns:1fr 1fr}.hero-ribbon div{padding:16px}.insights,.gallery{grid-template-columns:1fr}.level-wall{grid-template-columns:repeat(10,1fr);padding:14px}.wall-detail{grid-template-columns:1fr}.phase-grid{grid-template-columns:1fr 1fr}.spike-table th:nth-child(4),.spike-table td:nth-child(4){display:none}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.level-tile{transition:none}}
</style>
</head>
<body>
<header class="hero"><div class="shell"><div class="eyebrow">LEVEL DESIGN AUTOPSY · ORIGINAL DBT 1–182</div><h1>不是爬坡，<br>是一条锯齿山脊。</h1><p class="hero-copy">182 关以极高乱序为底噪，用体量、颜色数、碎片化和离散计时器制造压力。真正的节奏不是持续变难，而是大幅尖峰后迅速泄压，再进入下一轮高位波动。</p><div class="hero-ribbon"><div><strong>182</strong><span>完整关卡</span></div><div><strong>73</strong><span>满盘关 · 40%</span></div><div><strong>121</strong><span>100% 全错位开局</span></div><div><strong>48</strong><span>原始 Hard 标记</span></div></div></div></header>
<nav class="toc"><div class="shell"><a href="#curve">难度曲线</a><a href="#taxonomy">关卡分类</a><a href="#wall">182 关墙</a><a href="#highlights">闪光点</a><a href="#bottlenecks">卡点</a><a href="#gallery">代表关</a><a href="#advice">设计建议</a></div></nav>
<main>
<section id="curve"><div class="shell"><div class="section-head"><div class="section-index">01 / CURVE</div><div><h2>前 15 关完成教学，之后进入高位震荡</h2><p class="lead">综合难度代理分由体量 24%、颜色数 18%、单位时间吞吐 18%、初始碎片化 18%、错位率 12% 与原始 Hard 10% 构成。它用于比较设计压力，不等同于真实失败率。</p></div></div><div class="chart-wrap"><div class="chart-title"><strong>逐关压力与 7 关移动均线</strong><span>点击点位可查看关卡详情</span></div><svg id="curveChart" viewBox="0 0 1080 380" role="img" aria-label="182关难度曲线"></svg><div class="legend"><span><i style="background:var(--purple)"></i>逐关压力</span><span><i style="background:var(--gold)"></i>7 关均线</span><span><i style="background:var(--rose)"></i>尖峰</span></div></div><div id="phases" class="phase-grid"></div><div class="method-note">边界：没有玩家通关率、失败次数和求解器最小步数据；“卡点”是配置风险预测。计时压力按豆豆数/秒衡量，但实际一次操作可搬运多个连通豆群，因此不可直接解释为每颗豆都需一次操作。</div></div></section>
<section id="taxonomy"><div class="shell"><div class="section-head"><div class="section-index">02 / TAXONOMY</div><div><h2>八类关卡，主力仍是标准图案</h2><p class="lead">分类是互斥的设计 archetype：先识别引导、巨幅与多色题，再按碎片化、稀疏度和体量分组。标签仍保留多维压力，避免一个名字掩盖关卡的复合特征。</p></div></div><div class="split"><div class="panel bar-list" id="categoryBars"></div><div class="insights"><article class="insight"><b>离散计时器</b><p>90 / 120 / 150 秒覆盖 179 关，难度主要由内容体量跳变，而不是连续调秒。</p></article><article class="insight"><b>全错位是常态</b><p>121 关开局没有一颗豆在正确位置，中位错位率为 100%。</p></article><article class="insight"><b>轮廓复用，图案不复刻</b><p>最大同轮廓家族有 19 关，但没有两关的标准化配色图案完全相同。</p></article><article class="insight"><b>容量波次</b><p>60 豆传送带面对 1,600 豆满盘时，理论上形成约 26.7 个容量波次。</p></article></div></div></div></section>
<section id="wall"><div class="shell"><div class="section-head"><div class="section-index">03 / WALL</div><div><h2>182 关墙：节奏的真实纹理</h2><p class="lead">绿色是舒缓，蓝色是稳定，橙色是高压，玫红是尖峰。密集的色彩交替直观显示：中后段没有稳定爬坡，而是持续插入尖峰与恢复关。</p></div></div><div class="panel level-wall" id="levelWall"></div><div class="wall-detail" id="wallDetail"></div></div></section>
<section id="highlights"><div class="shell"><div class="section-head"><div class="section-index">04 / HIGHLIGHTS</div><div><h2>这套设计真正发光的地方</h2></div></div><div class="insights"><article class="insight"><b>海报级内容密度</b><p>第 175 关把 1,362 颗豆铺成大型角色图，关卡本身就是可传播的视觉内容。</p></article><article class="insight"><b>同轮廓多次再编曲</b><p>40×40 满盘骨架被重复使用，但颜色区块持续改写，兼顾产能与新鲜感。</p></article><article class="insight"><b>颜色上限被真正利用</b><p>第 111 关使用 16 色，辨识压力不只来自数量，也来自相邻近似色的视觉扫描。</p></article><article class="insight"><b>尖峰后立刻泄压</b><p>第 57 关 87 分后，第 58 关下降 35.7 分；强烈对比能制造“死里逃生”的恢复感。</p></article></div></div></section>
<section id="bottlenecks"><div class="shell"><div class="section-head"><div class="section-index">05 / RISKS</div><div><h2>六个最值得盯住的卡点</h2><p class="lead">风险最高的不是绝对难度，而是相邻关的突变。第 25、33、57、150、162、166 关都在单关内突然抬升 34 分以上，玩家感知会像换了一套规则。</p></div></div><div class="table-responsive"><table class="spike-table"><thead><tr><th>关卡</th><th>代理分</th><th>体量</th><th>颜色</th><th>秒/豆</th><th>主要风险</th></tr></thead><tbody id="spikeRows"></tbody></table></div></div></section>
<section id="gallery"><div class="shell"><div class="section-head"><div class="section-index">06 / BOARDS</div><div><h2>十一张切片，看见设计语言</h2><p class="lead">每张卡可在目标图与开局乱序之间切换。目标图强调内容表达，乱序图暴露真实操作压力。</p></div></div><div class="gallery" id="galleryGrid"></div></div></section>
<section id="advice"><div class="shell"><div class="section-head"><div class="section-index">07 / ACTION</div><div><h2>如果要把它打磨成更稳的商业曲线</h2></div></div><div class="recommendations"><article class="recommendation"><em>PACE</em><h3>给尖峰加两关预热</h3><p>25、33、57、150 前各插入一关同颜色数但更小体量的练习题，把规则压力与耐力压力拆开。</p></article><article class="recommendation"><em>RELIEF</em><h3>固定 8–10 关一次恢复</h3><p>目前恢复关位置不稳定。用 450–650 豆、4–7 色的稀疏轮廓关建立可预期呼吸点。</p></article><article class="recommendation"><em>FAIRNESS</em><h3>降低全错位的单调底噪</h3><p>让约 20% 关卡保留 8–15% 正确豆，既提供开局反馈，也让乱序率成为可调难度旋钮。</p></article></div></div></section>
</main><footer class="footer"><div class="shell">数据：DBT 原始 1–182 关与转换后的线上 v3 关卡文件 · 报告生成于本地 · 难度为设计代理分，不含玩家遥测</div></footer>
<script>
const DATA=__ANALYSIS__;const BOARDS=__BOARDS__;const COLORS=__PALETTE__;const levels=DATA.levels;const summary=DATA.summary;
const q=s=>document.querySelector(s),el=(tag,cls)=>{const node=document.createElement(tag);if(cls)node.className=cls;return node};
function levelUrl(id){return `http://localhost:7456/?scene=db%3A%2F%2Fassets%2FBootstrapBundle%2FScenes%2FGame.scene&profile=local-test&levelfile=tools%2Fdbt%2Flevel_${id}.json`}
function renderCurve(){const svg=q('#curveChart'),W=1080,H=380,p={l:54,r:18,t:24,b:42},x=i=>p.l+(i-1)/(levels.length-1)*(W-p.l-p.r),y=v=>H-p.b-v/100*(H-p.t-p.b);let html='';[0,25,50,75,100].forEach(v=>{html+=`<line class="gridline" x1="${p.l}" y1="${y(v)}" x2="${W-p.r}" y2="${y(v)}"/><text x="${p.l-10}" y="${y(v)+4}" text-anchor="end" font-size="11" fill="#686785">${v}</text>`});[1,30,60,90,120,150,182].forEach(v=>html+=`<text x="${x(v)}" y="${H-14}" text-anchor="middle" font-size="11" fill="#686785">${v}</text>`);const path=levels.map((d,i)=>`${i?'L':'M'}${x(d.id).toFixed(1)},${y(d.difficulty).toFixed(1)}`).join(' ');const moving=summary.movingDifficulty.map((v,i)=>`${i?'L':'M'}${x(i+1).toFixed(1)},${y(v).toFixed(1)}`).join(' ');html+=`<line class="axis" x1="${p.l}" y1="${H-p.b}" x2="${W-p.r}" y2="${H-p.b}"/><path class="curve" d="${path}"/><path class="moving" d="${moving}"/>`;levels.forEach(d=>{const fill=d.tier==='尖峰'?'#d64e73':d.tier==='高压'?'#d18c32':'#6655c7';html+=`<circle class="dot" data-id="${d.id}" cx="${x(d.id)}" cy="${y(d.difficulty)}" r="${d.tier==='尖峰'?5:2.7}" fill="${fill}"><title>第${d.id}关 · ${d.difficulty}分</title></circle>`});[25,33,57,150,162,166].forEach((id,index)=>{const d=levels[id-1];html+=`<text class="annotation" x="${x(id)}" y="${Math.max(14,y(d.difficulty)-10-index%2*12)}" text-anchor="middle">L${id}</text>`});svg.innerHTML=html;svg.querySelectorAll('.dot').forEach(dot=>dot.addEventListener('click',()=>selectLevel(Number(dot.dataset.id))))}
function renderPhases(){q('#phases').innerHTML=summary.phases.map((p,i)=>`<article class="phase"><b>${p.range}</b><span>均分 ${p.meanDifficulty}<br>均量 ${Math.round(p.meanFilled)}<br>均色 ${p.meanColors}</span></article>`).join('')}
function renderCategories(){const order=['标准图案','巨幅满盘','稀疏轮廓','碎片调度','轻量恢复','多色辨识','巨幅图案','引导小局'],max=Math.max(...Object.values(summary.categoryCounts));q('#categoryBars').innerHTML=order.map(name=>`<div class="bar-row"><span>${name}</span><div class="bar-track"><div class="bar-fill" style="width:${summary.categoryCounts[name]/max*100}%"></div></div><b>${summary.categoryCounts[name]}</b></div>`).join('')}
function selectLevel(id){const d=levels[id-1];q('#wallDetail').innerHTML=`<strong>L${id}</strong><p>${d.category} · ${d.tier} ${d.difficulty} 分<br>${d.filled} 豆 / ${d.colors} 色 / ${d.width}×${d.height} / ${d.secondsPerBean} 秒每豆<br>${d.tags.join(' · ')}</p><a class="play-link" href="${levelUrl(id)}" target="_blank" rel="noopener">直接试玩</a>`}
function renderWall(){const wall=q('#levelWall');levels.forEach(d=>{const button=el('button','level-tile');button.type='button';button.dataset.tier=d.tier;button.textContent=d.id;button.setAttribute('aria-label',`第${d.id}关 ${d.tier} ${d.difficulty}分`);button.addEventListener('click',()=>selectLevel(d.id));wall.appendChild(button)});selectLevel(57)}
function renderSpikes(){q('#spikeRows').innerHTML=[57,33,150,79,175,111].map(id=>{const d=levels[id-1];return `<tr><td><b>L${id}</b></td><td class="score">${d.difficulty}</td><td>${d.filled}</td><td>${d.colors}</td><td>${d.secondsPerBean}</td><td>${d.tags.join(' / ')}</td></tr>`}).join('')}
function drawBoard(canvas,grid){const ctx=canvas.getContext('2d'),size=canvas.width=canvas.height=420,rows=grid.length,cols=grid[0].length,cell=Math.min(390/cols,390/rows),ox=(size-cols*cell)/2,oy=(size-rows*cell)/2;ctx.clearRect(0,0,size,size);grid.forEach((row,r)=>row.forEach((color,c)=>{if(!color)return;ctx.fillStyle=COLORS[color];const x=ox+c*cell,y=oy+r*cell,gap=Math.max(.6,cell*.08),radius=Math.max(1,(cell-gap*2)*.28);ctx.beginPath();ctx.roundRect(x+gap,y+gap,cell-gap*2,cell-gap*2,radius);ctx.fill()}))}
function renderGallery(){const grid=q('#galleryGrid');Object.entries(BOARDS).forEach(([id,board])=>{const metric=levels[Number(id)-1],card=el('article','board-card');card.innerHTML=`<header><b>L${id}</b><span>${metric.category}<br>${metric.filled} 豆 · ${metric.colors} 色</span></header><canvas aria-label="第${id}关目标图"></canvas><div class="board-actions"><button type="button" aria-pressed="true">目标图</button><button type="button" aria-pressed="false">开局乱序</button></div>`;const canvas=card.querySelector('canvas'),buttons=card.querySelectorAll('button');drawBoard(canvas,board.correctColorArr);buttons[0].onclick=()=>{drawBoard(canvas,board.correctColorArr);buttons[0].setAttribute('aria-pressed','true');buttons[1].setAttribute('aria-pressed','false')};buttons[1].onclick=()=>{drawBoard(canvas,board.initRandomColorArr);buttons[1].setAttribute('aria-pressed','true');buttons[0].setAttribute('aria-pressed','false')};grid.appendChild(card)})}
renderCurve();renderPhases();renderCategories();renderWall();renderSpikes();renderGallery();
</script>
</body></html>'''
    html = template.replace("__ANALYSIS__", compact_json(analysis))
    html = html.replace("__BOARDS__", compact_json(boards))
    html = html.replace("__PALETTE__", compact_json(PALETTE))
    args.output.write_text(html, encoding="utf-8")
    print(f"Wrote {args.output} ({args.output.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
