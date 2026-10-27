// Ana sayfa kontrol paneli: hesaplar ve grafikler (SVG/HTML, kütüphane yok)
import { todayISO, addDays, diffDays, mondayOf, trDate, MONTHS, SEV } from './data.js';
import { scoreOf, findings } from './report.js';
import { esc, icon } from './ui.js';

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
const pct = (a, b) => b ? Math.round(a / b * 100) : null;

function monthsBack(n) {
  const [y, m] = todayISO().split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// done: tamamlanmış denetimler; open/all: {item, ans, audit} bulgu listeleri
export function dashData({ done, open, all, branches }) {
  const t = todayISO();
  const months = monthsBack(6).map(ym => {
    const list = done.filter(a => a.date.startsWith(ym));
    const sc = list.map(a => scoreOf(a).score).filter(v => v != null);
    const [y, m] = ym.split('-').map(Number);
    return { ym, label: MONTHS[m - 1].slice(0, 3), full: `${MONTHS[m - 1]} ${y}`, n: list.length, avg: avg(sc) };
  });
  const cur = months[5], prev = months[4];

  const crit = open.filter(x => x.item.sev === 'kritik').length;
  const since90 = addDays(t, -90);
  const closed90 = all.filter(x => x.ans.closed && x.ans.closedAt >= since90);
  const onTime = closed90.filter(x => !x.ans.due || x.ans.closedAt <= x.ans.due).length;

  const catMap = new Map();
  let catTotal = 0;
  for (const x of all) {
    if (x.audit.date < since90) continue;
    catMap.set(x.item.cat, (catMap.get(x.item.cat) || 0) + 1);
    catTotal++;
  }
  let cats = [...catMap.entries()].map(([cat, n]) => ({ cat, n })).sort((a, b) => b.n - a.n);
  if (cats.length > 6) {
    const rest = cats.slice(5).reduce((s, c) => s + c.n, 0);
    cats = cats.slice(0, 5).concat([{ cat: 'Diğer başlıklar', n: rest, other: true }]);
  }

  const status = { late: 0, soon: 0, later: 0 };
  const sev = { kritik: 0, major: 0, minor: 0 };
  for (const x of open) {
    sev[x.item.sev]++;
    const d = x.ans.due ? diffDays(t, x.ans.due) : 99;
    if (d < 0) status.late++; else if (d <= 3) status.soon++; else status.later++;
  }

  const karne = branches.map(b => {
    const list = done.filter(a => a.branchId === b.id).sort((p, q) => (q.date + (q.startedAt || 0)).localeCompare(p.date + (p.startedAt || 0)));
    if (!list.length) return null;
    const s = scoreOf(list[0]);
    const ps = list[1] ? scoreOf(list[1]).score : null;
    return {
      id: b.id, name: b.name, score: s.score, crit: s.crit,
      delta: ps != null && s.score != null ? s.score - ps : null,
      open: open.filter(x => x.audit.branchId === b.id).length,
      since: diffDays(list[0].date, t),
      spark: list.slice(0, 6).reverse().map(a => scoreOf(a).score).filter(v => v != null),
    };
  }).filter(Boolean).sort((a, b) => b.open - a.open || (a.score ?? 0) - (b.score ?? 0));

  const mon = mondayOf(t);
  const week = DAYS.map((label, i) => {
    const iso = addDays(mon, i);
    return {
      iso, label, day: Number(iso.slice(8)), today: iso === t, past: iso < t,
      done: done.filter(a => a.date === iso),
      planned: branches.filter(b => b.planned === iso),
    };
  });

  return {
    months, week, cats, catTotal, status, sev, karne,
    kpi: {
      n: cur.n, nPrev: prev.n, avg: cur.avg, avgPrev: prev.avg,
      open: open.length, crit, onTime: pct(onTime, closed90.length), onTimeN: closed90.length,
    },
  };
}

// ---------- parçalar ----------
function delta(v, good = 'up', unit = '') {
  if (v == null || v === 0) return `<span class="dl flat">${v === 0 ? '= aynı' : ''}</span>`;
  const up = v > 0;
  const ok = (up && good === 'up') || (!up && good === 'down');
  return `<span class="dl ${ok ? 'pos' : 'neg'}">${up ? '▲' : '▼'} ${Math.abs(v)}${unit}</span>`;
}

export function spark(vals, w = 72, h = 26) {
  if (vals.length < 2) return '';
  const lo = Math.min(...vals) - 4, hi = Math.max(...vals) + 4;
  const x = i => 2 + i * (w - 4) / (vals.length - 1);
  const y = v => h - 3 - (v - lo) / (hi - lo || 1) * (h - 6);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const l = vals.length - 1;
  return `<svg class="spk" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(l).toFixed(1)}" cy="${y(vals[l]).toFixed(1)}" r="2.6" fill="currentColor"/></svg>`;
}

export function kpiHTML(d) {
  const k = d.kpi;
  const avgSpark = d.months.map(m => m.avg).filter(v => v != null);
  return `<div class="tiles d-kpis">
    <a class="tile kpi" href="#/ozet"><small>${icon('flag')} Bu ay denetim</small><b>${k.n}</b>
      <span class="kpi-s">${delta(k.n - k.nPrev)}<em>geçen ay ${k.nPrev}</em></span></a>
    <a class="tile kpi" href="#/ozet"><small>${icon('chart')} Ortalama puan</small>
      <div class="kpi-row"><b>${k.avg ?? '—'}</b><span class="kpi-spk">${spark(avgSpark)}</span></div>
      <span class="kpi-s">${k.avg != null && k.avgPrev != null ? delta(k.avg - k.avgPrev, 'up', ' puan') : '<span class="dl flat"></span>'}<em>${k.avgPrev != null ? `geçen ay ${k.avgPrev}` : 'son 6 ay'}</em></span></a>
    <a class="tile kpi ${k.crit ? 'warn' : ''}" href="#/bulgular" data-f="acik"><small>${icon('alert')} Açık bulgu</small><b>${k.open}</b>
      <span class="kpi-s">${k.crit ? `<span class="dl neg">${k.crit} kritik</span>` : '<span class="dl pos">kritik yok</span>'}<em>takipte</em></span></a>
    <a class="tile kpi" href="#/bulgular" data-f="kapandi"><small>${icon('clock')} Zamanında kapanma</small><b>${k.onTime == null ? '—' : '%' + k.onTime}</b>
      <span class="kpi-s"><em>son 90 gün · ${k.onTimeN} kapanan</em></span></a>
  </div>`;
}

export function weekHTML(d) {
  const doneN = d.week.reduce((s, x) => s + x.done.length, 0);
  const planN = d.week.reduce((s, x) => s + x.planned.length, 0);
  return `<section class="card pad d-week">
    <header class="card-h"><h3>Bu hafta</h3><small class="muted">${doneN} denetim yapıldı${planN ? ` · ${planN} planlı` : ''}</small></header>
    <div class="wk">${d.week.map(x => {
      const tip = [`${x.label} ${trDate(x.iso)}`, ...x.done.map(a => `✓ ${a.branchName}`), ...x.planned.map(b => `◷ ${b.name} (planlı)`)].join('\n');
      return `<div class="wk-d ${x.today ? 'today' : ''} ${x.past ? 'past' : ''}" data-tip="${esc(tip)}">
        <span class="wk-l">${x.label}</span><span class="wk-n">${x.day}</span>
        <span class="wk-dots">${x.done.map(() => '<i class="dn"></i>').join('')}${x.planned.map(() => '<i class="pl"></i>').join('')}</span></div>`;
    }).join('')}</div>
    <p class="wk-leg"><span><i class="dn"></i> yapıldı</span><span><i class="pl"></i> planlı</span></p>
  </section>`;
}

export function openHTML(d) {
  const s = d.status, tot = s.late + s.soon + s.later;
  const seg = (n, cls, label, ic) => n ? `<span class="sb-seg ${cls}" style="flex:${n}" data-tip="${esc(`${label}: ${n} bulgu (%${Math.round(n / tot * 100)})`)}"></span>` : '';
  const row = (n, cls, label, ic) => `<li><span class="lg ${cls}">${icon(ic)}</span><span class="grow">${label}</span><b>${n}</b></li>`;
  return `<section class="card pad d-open">
    <header class="card-h"><h3>Açık bulgular</h3><a class="btn link sm" href="#/bulgular" data-f="acik">Tümü ${icon('chevron')}</a></header>
    ${tot ? `<div class="sb" role="img" aria-label="Açık bulguların termin durumu">${seg(s.late, 'late', 'Termini geçen')}${seg(s.soon, 'soon', '3 gün içinde')}${seg(s.later, 'ok', 'Zamanı var')}</div>
      <ul class="sb-leg">${row(s.late, 'late', 'Termini geçen', 'alert')}${row(s.soon, 'soon', '3 gün içinde', 'clock')}${row(s.later, 'ok', 'Zamanı var', 'check')}</ul>
      <div class="sev-row">${Object.entries(SEV).map(([k, v]) => `<div class="sev-c"><span class="sev sev-${k}">${v.label}</span><b>${d.sev[k]}</b></div>`).join('')}</div>`
      : `<p class="empty-s">${icon('check')} Açık bulgu yok. Her şey yolunda.</p>`}
  </section>`;
}

export function catsHTML(d) {
  const max = Math.max(1, ...d.cats.map(c => c.n));
  return `<section class="card pad d-cats">
    <header class="card-h"><h3>Bulgular hangi başlıkta?</h3><small class="muted">son 90 gün · ${d.catTotal} bulgu</small></header>
    ${d.cats.length ? `<div class="hb">${d.cats.map(c => `
      <div class="hb-r ${c.other ? 'other' : ''}" data-tip="${esc(`${c.cat}: ${c.n} bulgu (%${Math.round(c.n / d.catTotal * 100)})`)}">
        <span class="hb-l">${esc(c.cat)}</span>
        <span class="hb-t"><i style="width:${(c.n / max * 100).toFixed(1)}%"></i></span>
        <b>${c.n}</b></div>`).join('')}</div>`
      : `<p class="empty-s">Son 90 günde bulgu yok.</p>`}
  </section>`;
}

export function karneHTML(d, band) {
  const rows = d.karne.slice(0, 6);
  return `<section class="card pad d-karne">
    <header class="card-h"><h3>Şube karnesi</h3><a class="btn link sm" href="#/subeler">Tüm şubeler ${icon('chevron')}</a></header>
    ${rows.length ? `<div class="kt" role="table">
      <div class="kt-h" role="row"><span>Şube</span><span>Gidişat</span><span>Puan</span><span>Açık</span><span>Son</span></div>
      ${rows.map(r => `<a class="kt-r" role="row" href="#/sube/${r.id}">
        <span class="kt-n"><b>${esc(r.name)}</b></span>
        <span class="kt-s b-${band(r.score, r.crit)}-t">${spark(r.spark, 64, 24) || '<em>—</em>'}</span>
        <span class="kt-p"><span class="score-dot sm b-${band(r.score, r.crit)}">${r.score ?? '—'}</span>${r.delta ? `<i class="${r.delta > 0 ? 'pos' : 'neg'}">${r.delta > 0 ? '▲' : '▼'}${Math.abs(r.delta)}</i>` : ''}</span>
        <span class="kt-o ${r.open ? 'has' : ''}">${r.open}</span>
        <span class="kt-d">${r.since === 0 ? 'bugün' : `${r.since} gün`}</span></a>`).join('')}
    </div>` : '<p class="empty-s">Henüz tamamlanmış denetim yok.</p>'}
  </section>`;
}

export function trendHTML() {
  return `<section class="card pad d-trend">
    <header class="card-h"><h3>Puan gidişatı</h3><small class="muted">son 6 ay · aylık ortalama</small></header>
    <div class="chart" data-chart="trend"></div>
  </section>`;
}

// ---------- puan gidişatı (gerçek genişliğe göre çizilir) ----------
function drawTrend(el, months) {
  const W = Math.max(280, el.clientWidth), H = 220, pl = 34, pr = 18, pt = 22, pb = 30;
  const vals = months.map(m => m.avg);
  const has = vals.filter(v => v != null);
  if (!has.length) { el.innerHTML = '<p class="empty-s">Son 6 ayda tamamlanmış denetim yok.</p>'; return; }
  let lo = Math.floor((Math.min(...has) - 10) / 10) * 10;
  lo = Math.max(0, Math.min(60, lo));
  const step = (100 - lo) > 40 ? 20 : 10;
  const y = v => pt + (100 - v) / (100 - lo) * (H - pt - pb);
  const sx = (W - pl - pr) / (months.length - 1);
  const x = i => pl + i * sx;
  let g = '';
  for (let v = lo; v <= 100; v += step) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="tg"/><text x="${pl - 8}" y="${y(v) + 4}" class="tl" text-anchor="end">${v}</text>`;
  if (75 > lo) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(75)}" y2="${y(75)}" class="tr"/><text x="${W - pr}" y="${y(75) - 6}" class="tl tr-l" text-anchor="end">İyi sınırı 75</text>`;
  // boş aylarda çizgi kesilir
  const segs = [];
  let curS = [];
  vals.forEach((v, i) => { if (v == null) { if (curS.length) segs.push(curS); curS = []; } else curS.push(i); });
  if (curS.length) segs.push(curS);
  const base = y(lo);
  const area = segs.filter(s => s.length > 1).map(s => `M${x(s[0])},${base} ` + s.map(i => `L${x(i)},${y(vals[i])}`).join(' ') + ` L${x(s[s.length - 1])},${base} Z`).join(' ');
  const line = segs.map(s => s.map((i, k) => `${k ? 'L' : 'M'}${x(i)},${y(vals[i])}`).join(' ')).join(' ');
  const last = vals.reduce((li, v, i) => v != null ? i : li, -1);
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Son 6 ayın aylık ortalama denetim puanı">
    <defs><linearGradient id="tgFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    ${g}
    <path d="${area}" fill="url(#tgFill)"/>
    <path d="${line}" class="tln"/>
    <line class="tx" x1="0" x2="0" y1="${pt - 6}" y2="${base}" visibility="hidden"/>
    ${vals.map((v, i) => v == null ? '' : `<circle cx="${x(i)}" cy="${y(v)}" r="4" class="tp" data-i="${i}"/>`).join('')}
    ${last >= 0 ? `<text x="${x(last)}" y="${y(vals[last]) - 12}" text-anchor="middle" class="tv">${vals[last]}</text>` : ''}
    ${months.map((m, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="tl ${i === months.length - 1 ? 'now' : ''}">${m.label}</text>`).join('')}
    ${months.map((m, i) => `<rect class="th" x="${x(i) - sx / 2}" y="0" width="${sx}" height="${H}" data-i="${i}"
      data-tip="${esc(m.avg == null ? `${m.full}\nDenetim yok` : `${m.full}\nOrtalama ${m.avg} puan · ${m.n} denetim`)}"/>`).join('')}
  </svg>`;
  const svg = el.querySelector('svg'), cross = svg.querySelector('.tx');
  svg.addEventListener('pointerover', e => {
    const r = e.target.closest('.th'); if (!r) return;
    const i = +r.dataset.i;
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    svg.querySelectorAll('.tp').forEach(c => c.classList.toggle('on', +c.dataset.i === i));
  });
  svg.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); svg.querySelectorAll('.tp.on').forEach(c => c.classList.remove('on')); });
}

// ---------- bilgi kutusu (üzerine gel / dokun) ----------
let tip;
function showTip(target, e) {
  if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
  const lines = target.dataset.tip.split('\n');
  tip.innerHTML = `<b>${esc(lines[0])}</b>${lines.slice(1).map(l => `<span>${esc(l)}</span>`).join('')}`;
  tip.classList.add('on');
  const r = target.getBoundingClientRect();
  const tx = e && e.clientX ? e.clientX : r.left + r.width / 2;
  const ty = r.top;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let left = Math.min(window.innerWidth - tw - 8, Math.max(8, tx - tw / 2));
  let top = ty - th - 10;
  if (top < 8) top = r.bottom + 10;
  tip.style.left = left + 'px'; tip.style.top = top + 'px';
}
const hideTip = () => tip && tip.classList.remove('on');

export function mountDash(root, d) {
  const trend = root.querySelector('[data-chart="trend"]');
  if (trend) {
    drawTrend(trend, d.months);
    let last = trend.clientWidth;
    const ro = new ResizeObserver(() => { if (Math.abs(trend.clientWidth - last) > 4) { last = trend.clientWidth; drawTrend(trend, d.months); } });
    ro.observe(trend);
    // sayfa değişince gözlemci bırakılır
    const off = () => { ro.disconnect(); window.removeEventListener('hashchange', off); hideTip(); };
    window.addEventListener('hashchange', off);
  }
  bindTips();
}

// Bilgi kutusu dinleyicileri bir kez, belge düzeyinde kurulur (sayfa her çizildiğinde birikmesin)
let bound = false, touchT;
function bindTips() {
  if (bound) return;
  bound = true;
  document.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const t = e.target.closest?.('[data-tip]');
    if (t) showTip(t, e); else hideTip();
  });
  document.addEventListener('click', e => {
    const t = e.target.closest?.('[data-tip]');
    if (!t || t.closest('a')) return;
    showTip(t, e);
    clearTimeout(touchT);
    touchT = setTimeout(hideTip, 2500);
  });
  window.addEventListener('scroll', hideTip, { passive: true });
}
