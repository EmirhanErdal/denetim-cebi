import * as db from './db.js';
import {
  SEV, QUICK_NOTES, cloneTemplates, DEFAULT_TEMPLATES, makeItemId, todayISO, addDays, diffDays, mondayOf, trDate, monthLabel,
  rangeLabel, hhmm, duration, MONTHS, money, cashTotal, shipStats, SHIP_ST,
} from './data.js';
import {
  tplId, scoreOf, catScores, rating, findPrev, isRepeat, findings, infoRows, buildReportText, findingsMessage,
  reminderMessage, periodStats, periodText, cashSentence, shipSentence,
} from './report.js';
import * as xl from './excel.js';
import { makeDemo } from './demo.js';
import {
  esc, cap, icon, toast, sheet, ask, pickDate, shareSheet, copy, saveFile, photoSrc, hydratePhotos, storePhotos,
  storeBlob, thumbs, autosize, micBtn, startMic, stopMic,
} from './ui.js';
import { openCash, cashDiff, openShips, signPad, viewPhoto } from './tools.js';

const $app = document.getElementById('app');
const $top = document.getElementById('topbar');
const $tab = document.getElementById('tabbar');

const S = { settings: {}, templates: [], branches: [], audits: [], lastBackup: null };
const cur = {
  audit: null, prev: null, open: new Set(), cats: [], bank: new Map(), report: null,
  actFilter: 'acik', q: '', per: 'ay', month: todayISO().slice(0, 7), week: mondayOf(todayISO()), tplEdit: null,
};

// ---------- küçük yardımcılar ----------
const byName = (a, b) => a.name.localeCompare(b.name, 'tr');
const getAudit = id => S.audits.find(a => a.id === id);
const getBranch = id => S.branches.find(b => b.id === id);
const getTpl = id => S.templates.find(t => t.id === id);
const done = () => S.audits.filter(a => a.status === 'tamam');
const desc = (a, b) => (b.date + (b.startedAt || 0)).localeCompare(a.date + (a.startedAt || 0));
const tplName = a => a.templateName || getTpl(tplId(a))?.name || 'Şube denetimi';
const short = name => String(name || '').replace(/\s*denetimi$/i, '');
const lastAudit = bid => done().filter(a => a.branchId === bid).sort(desc)[0];
const freqOf = b => Number(b.freq) || Number(S.settings.freq) || 30;
const on = k => S.settings[k] !== false; // varsayılanı açık olan ayarlar

function band(score, crit = 0) {
  if (score == null) return 'none';
  if (crit && score >= 60) return 'c';
  return score >= 90 ? 'a' : score >= 75 ? 'b' : score >= 60 ? 'c' : 'd';
}

function dueLabel(due, closed, act) {
  if (closed || !due) return '';
  const d = diffDays(todayISO(), due);
  const cls = d < 0 ? 'late' : d <= 2 ? 'soon' : '';
  const txt = d < 0 ? `${-d} gün gecikti` : d === 0 ? 'Termin bugün' : d <= 2 ? `${d} gün kaldı` : trDate(due);
  return act ? `<button class="due ${cls}" ${act}>${icon('clock')} ${txt}</button>` : `<span class="due ${cls}">${icon('clock')} ${txt}</span>`;
}

// ---------- kayıt ----------
const timers = new Map();
function saveSoon(key, fn, ms = 400) {
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => { timers.delete(key); fn(); }, ms));
}
const saveAudit = a => db.put('audits', a).catch(() => toast('Kaydedilemedi! Telefon hafızası dolu olabilir.'));
const saveSettings = () => db.setKV('settings', S.settings);
const saveTemplates = () => db.setKV('templates', S.templates);
const saveBranch = b => db.put('branches', b);
function flush() {
  for (const [k, t] of timers) { clearTimeout(t); timers.delete(k); }
  if (cur.audit) saveAudit(cur.audit);
  if (cur.report) saveAudit(cur.report.a);
  saveSettings();
}
window.addEventListener('pagehide', flush);
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { flush(); hiddenAt = Date.now(); }
  else if (S.settings.pinHash && hiddenAt && Date.now() - hiddenAt > 3 * 60000) showLock();
});

// ---------- çerçeve ----------
const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#161d2b"/><rect x="9" y="8.5" width="14" height="16" rx="3.5" fill="none" stroke="#fff" stroke-opacity=".92" stroke-width="1.8"/><path d="M13 6.8h6" stroke="#fff" stroke-opacity=".5" stroke-width="2.2" stroke-linecap="round"/><path d="M12.6 16.6l2.5 2.5 4.6-5.2" fill="none" stroke="#ff5b1f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Puan halkası (rapor) ve ilerleme halkası (denetim)
function gauge(score, b) {
  const r = 44, c = 2 * Math.PI * r, len = c * (score ?? 0) / 100;
  return `<div class="gauge"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${r}" class="g-bg"/>
    <circle cx="50" cy="50" r="${r}" class="g-fg g-${b}" stroke-dasharray="${len.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/></svg>
    <div class="g-v"><b>${score ?? '—'}</b><small>/100</small></div></div>`;
}
function miniRing(pct) {
  const r = 18, c = 2 * Math.PI * r;
  return `<div class="mini-ring"><svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="${r}" class="r-bg"/>
    <circle cx="22" cy="22" r="${r}" class="r-fg" stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}"/></svg><span>${Math.round(pct * 100)}%</span></div>`;
}

function top({ title, sub = '', back = null, right = '' }) {
  $top.innerHTML = `${back ? `<a class="tb-back" href="${back}" aria-label="Geri">${icon('back')}</a>` : `<span class="tb-logo">${LOGO}</span>`}
    <div class="tb-title"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${right}`;
}

function setTab(name) {
  $tab.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.tab === name));
  const late = openFindings().filter(x => x.ans.due && x.ans.due < todayISO()).length;
  const b = $tab.querySelector('.badge');
  b.textContent = late; b.hidden = !late;
}

const routes = [
  [/^#\/denetim\/(.+)$/, viewAudit, null],
  [/^#\/rapor\/(.+)$/, viewReport, null],
  [/^#\/bulgular$/, viewActions, 'bulgular'],
  [/^#\/subeler$/, viewBranches, 'subeler'],
  [/^#\/sube\/(.+)$/, viewBranch, 'subeler'],
  [/^#\/ozet$/, viewSummary, 'ozet'],
  [/^#\/ayarlar$/, viewSettings, 'ayarlar'],
  [/^#\/liste$/, viewChecklist, 'ayarlar'],
  [/^#\/yardim$/, viewHelp, 'ayarlar'],
];

function render() {
  stopMic();
  flush();
  const h = location.hash || '#/';
  let fn = viewHome, tab = 'home', m = [];
  for (const [re, f, t] of routes) { const mm = h.match(re); if (mm) { fn = f; tab = t; m = mm.slice(1); break; } }
  document.body.classList.toggle('no-tab', tab === null);
  if (fn !== viewAudit) cur.audit = null;
  if (fn !== viewReport) cur.report = null;
  $app.className = '';
  fn(...m.map(decodeURIComponent));
  setTab(tab);
  if (!render.keepScroll) window.scrollTo(0, 0);
  render.keepScroll = false;
}
const rerender = () => { render.keepScroll = true; render(); };
window.addEventListener('hashchange', render);

// ---------- olay dağıtımı ----------
const A = {}; // tıklama eylemleri
const F = {}; // alan değişiklikleri (input/change)
for (const root of [$app, $top]) {
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (t && A[t.dataset.act]) { e.preventDefault(); A[t.dataset.act](t, e); }
  });
}
for (const ev of ['input', 'change']) {
  $app.addEventListener(ev, e => {
    const f = e.target.dataset.field;
    if (f && F[f]) F[f](e.target, ev);
  });
}
A.mic = btn => startMic(btn);

// ============ ANA SAYFA ============
function todoList() {
  const t = todayISO();
  const out = [];
  for (const b of S.branches) {
    const last = lastAudit(b.id);
    const since = last ? diffDays(last.date, t) : null;
    let reason = null, pri = 9, cls = '';
    if (b.planned) {
      const d = diffDays(t, b.planned);
      if (d < 0) { reason = `Planlanan tarih ${-d} gün geçti`; pri = 0; cls = 'late'; }
      else if (d === 0) { reason = 'Bugün planlı'; pri = 1; cls = 'soon'; }
      else if (d <= 7) { reason = d === 1 ? 'Yarın planlı' : `${trDate(b.planned)} planlı`; pri = 3; }
    }
    if (!reason && since != null && since >= freqOf(b)) { reason = `Son denetimden ${since} gün geçti`; pri = 2; cls = 'late'; }
    if (!reason && since == null) { reason = 'Henüz denetlenmedi'; pri = 4; }
    if (reason) out.push({ b, reason, cls, sort: pri * 10000 - (since || 0) });
  }
  return out.sort((a, b) => a.sort - b.sort);
}

function viewHome() {
  top({ title: 'Denetim Cebi', sub: S.settings.company || 'Saha denetim asistanı' });
  const t = todayISO();
  const drafts = S.audits.filter(a => a.status === 'taslak').sort(desc);
  const open = openFindings();
  const late = open.filter(x => x.ans.due && x.ans.due < t);
  const soon = open.filter(x => x.ans.due && x.ans.due >= t && diffDays(t, x.ans.due) <= 2);
  const st = periodStats(t.slice(0, 7) + '-01', t, S.audits, S.branches);
  const recent = done().sort(desc).slice(0, 5);
  const todo = todoList().slice(0, 4);
  const d = new Date();
  const name = (S.settings.auditor || '').split(' ')[0];
  const empty = !S.audits.length && !S.branches.length;

  const next = todo[0];
  $app.className = 'v-home';
  $app.innerHTML = `
    <div class="dcol dmain">
    <section class="hero o1">
      <div class="hero-top"><p class="hero-d">${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${d.toLocaleDateString('tr-TR', { weekday: 'long' })}</p>
        ${late.length ? `<a class="hero-alert" href="#/bulgular" data-f="gecikmis">${late.length} geciken bulgu</a>` : ''}</div>
      <h2>${name ? `Merhaba, ${esc(name)}` : 'Merhaba'}</h2>
      <p class="hero-s">${drafts.length ? `<b>${drafts.length} yarım kalan</b> denetimin var.`
        : next ? `Sıradaki: <b>${esc(next.b.name)}</b> · ${esc(next.reason.toLocaleLowerCase('tr'))}`
        : empty ? 'İlk denetimini başlatmaya hazırsın.' : 'Bugün sahadaki işlerin seni bekliyor.'}</p>
      <button class="btn accent xl block" data-act="newAudit">${icon('play')} Yeni denetim başlat</button>
    </section>
    ${empty ? `
      <section class="card intro o3">
        <h3>Nasıl çalışır?</h3>
        <ol class="steps">
          <li><b>Şubede</b> kontrol listesini telefondan işaretle. Uygunsuz maddeye fotoğraf çek, notu sesle söyle.</li>
          <li><b>Kasayı say, gönderileri okut.</b> Kasa farkı ve sorunlu gönderiler rapora kendiliğinden girer.</li>
          <li><b>Bitir'e bas.</b> Rapor metni, PDF ve Excel hazırlanır. Şube sorumlusu ekrana imza atar.</li>
          <li><b>Bulgular</b> termin tarihleriyle takibe girer. Hatırlatmayı WhatsApp'tan tek dokunuşla gönderirsin.</li>
          <li><b>Hafta ve ay sonunda</b> faaliyet raporu ile şube sıralaması hazırdır.</li>
        </ol>
        <p class="hint">Bütün veriler yalnızca bu cihazda saklanır. Hiçbir sunucuya gitmez.</p>
        <button class="btn ghost block" data-act="loadDemo">${icon('refresh')} Örnek veriyle dene</button>
      </section>` : ''}
    ${!empty ? `<div class="tiles o5">
      <a class="tile" href="#/ozet"><small>Bu ay denetim</small><b>${st.list.length}</b></a>
      <a class="tile" href="#/ozet"><small>Ortalama puan</small><b>${st.avg ?? '—'}</b></a>
      <a class="tile" href="#/bulgular" data-f="acik"><small>Açık bulgu</small><b>${open.length}</b></a>
      <a class="tile ${late.length ? 'warn' : ''}" href="#/bulgular" data-f="gecikmis"><small>Termini geçen</small><b>${late.length}</b></a>
    </div>` : ''}
    ${recent.length ? `<section class="blk o8"><h3 class="sec-t">Son denetimler</h3><div class="list">${recent.map(auditRow).join('')}</div></section>` : ''}
    </div>
    <div class="dcol dside">
    ${backupNag()}
    ${drafts.length ? `<section class="blk o4"><h3 class="sec-t">Yarım kalan denetimler</h3>
      <div class="list">${drafts.map(a => { const s = scoreOf(a); const pct = Math.round((s.total - s.unans) / s.total * 100);
        return `<a class="card row draft" href="#/denetim/${a.id}"><div class="grow"><b>${esc(a.branchName)}</b><small>${esc(short(tplName(a)))} · ${trDate(a.date)} · ${s.total - s.unans}/${s.total} madde</small>
        <div class="bar"><i style="width:${pct}%"></i></div></div>${icon('chevron')}</a>`; }).join('')}</div></section>` : ''}
    ${soon.length ? `<a class="card row note-soon o6" href="#/bulgular" data-f="acik">${icon('bell')}<div class="grow"><b>${soon.length} bulgunun termini 2 gün içinde</b><small>Şubeye hatırlatma göndermek için dokun</small></div>${icon('chevron')}</a>` : ''}
    ${todo.length ? `<section class="blk o7"><h3 class="sec-t">Sıradaki şubeler</h3><div class="card todo">${todo.map(x => `
      <div class="todo-r"><div class="grow"><b>${esc(x.b.name)}</b><small class="${x.cls}">${esc(x.reason)}</small></div>
      <button class="btn ghost sm" data-act="newAudit" data-branch="${x.b.id}">${icon('play')} Başla</button></div>`).join('')}</div></section>` : ''}
    </div>
  `;
  const side = $app.querySelector('.dside');
  if (!side.children.length) { side.remove(); $app.classList.add('one'); }
  $app.querySelectorAll('[data-f]').forEach(el => el.addEventListener('click', () => { cur.actFilter = el.dataset.f; }));
}

function auditRow(a) {
  const s = scoreOf(a);
  return `<a class="card row" href="#/rapor/${a.id}">
    <span class="score-dot b-${band(s.score, s.crit)}">${s.score ?? '—'}</span>
    <div class="grow"><b>${esc(getBranch(a.branchId)?.name || a.branchName)}</b><small>${trDate(a.date)} · ${esc(short(tplName(a)))} · ${s.nok} bulgu${s.crit ? ` · <em class="crit">${s.crit} kritik</em>` : ''}</small></div>${icon('chevron')}</a>`;
}

function backupNag() {
  const n = done().filter(a => !a.demo).length;
  const last = S.lastBackup;
  if (!n || (last && diffDays(last, todayISO()) < 7)) return '';
  return `<a class="card row nag o2" href="#/ayarlar">${icon('download')}<div class="grow"><b>Yedek almayı unutma</b><small>${last ? `Son yedek: ${trDate(last)}` : 'Henüz hiç yedek alınmadı'}. Telefon değişir ya da tarayıcı verisi silinirse kayıtlar kaybolur.</small></div>${icon('chevron')}</a>`;
}

A.loadDemo = async () => {
  const { branches, audits } = makeDemo(S.templates);
  await db.putMany('branches', branches);
  await db.putMany('audits', audits);
  for (const b of branches) if (!getBranch(b.id)) S.branches.push(b);
  for (const a of audits) if (!getAudit(a.id)) S.audits.push(a);
  for (const a of [...audits].sort((p, q) => p.date.localeCompare(q.date))) await reconcile(a);
  toast('Örnek veriler yüklendi');
  render();
};

function onboarding() {
  const w = sheet(`<h2 class="sheet-t">Hoş geldin 👋</h2>
    <p class="sheet-p">Raporlarda ve mesajlarda görünmesi için adını yaz. Sonra Ayarlar'dan değiştirebilirsin.</p>
    <form class="form" data-f>
      <label class="lbl">Adın soyadın</label><input name="auditor" autocomplete="name">
      <label class="lbl">Unvanın</label><input name="title" placeholder="ör. Bölge Denetim Sorumlusu">
      <div class="sheet-btns"><button type="button" class="btn ghost" data-close>Sonra</button><button class="btn primary" type="submit">Kaydet</button></div>
    </form>`, { onClose: () => { S.settings.onboarded = true; saveSettings(); } });
  w.$('[data-f]').onsubmit = e => {
    e.preventDefault();
    S.settings.auditor = e.target.auditor.value.trim();
    S.settings.title = e.target.title.value.trim();
    w.close();
    rerender();
  };
}

// ---------- yeni denetim ----------
A.newAudit = btn => pickBranch(btn.dataset.branch);

function tplChips(sel) {
  if (S.templates.length < 2) return '';
  return `<p class="lbl">Denetim türü</p><div class="chips wrap" data-tpls>${S.templates.map(t =>
    `<button type="button" class="chip ${t.id === sel ? 'on' : ''}" data-t="${t.id}">${esc(short(t.name))}</button>`).join('')}</div>`;
}
function bindTplChips(w, get, set) {
  w.querySelectorAll('[data-t]').forEach(c => c.onclick = () => {
    set(c.dataset.t);
    w.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === c));
  });
}

function pickBranch(preset) {
  let sel = getTpl(S.settings.lastTpl) ? S.settings.lastTpl : S.templates[0].id;
  if (preset) {
    const b = getBranch(preset);
    if (S.templates.length < 2) return startAudit(b, S.templates[0]);
    const w = sheet(`<h2 class="sheet-t">${esc(b.name)}</h2><div class="sheet-list">${S.templates.map(t =>
      `<button class="row-btn" data-tp="${t.id}">${icon('list')}<span><b>${esc(t.name)}</b><small>${t.items.length} madde</small></span></button>`).join('')}</div>`);
    w.querySelectorAll('[data-tp]').forEach(x => x.onclick = () => { w.close(); startAudit(b, getTpl(x.dataset.tp)); });
    return;
  }
  const list = [...S.branches].sort(byName);
  const w = sheet(`<h2 class="sheet-t">Yeni denetim</h2>
    ${tplChips(sel)}
    <p class="lbl">Hangi şubedesin?</p>
    ${list.length > 4 ? `<input class="search" type="search" placeholder="Şube ara" data-q>` : ''}
    <div class="sheet-list" data-list>${list.map(b => {
      const last = lastAudit(b.id);
      return `<button class="row-btn" data-b="${b.id}" data-n="${esc(b.name.toLocaleLowerCase('tr'))}">${icon('store')}<span><b>${esc(b.name)}</b><small>${esc(b.city || '')}${last ? `${b.city ? ' · ' : ''}son denetim ${trDate(last.date)}` : ''}</small></span></button>`;
    }).join('')}</div>
    <form class="inline-add" data-add>
      <input name="name" placeholder="Yeni şube adı" autocomplete="off">
      <button class="btn primary" type="submit">${icon('plus')} Ekle ve başla</button>
    </form>`);
  bindTplChips(w, () => sel, v => { sel = v; });
  const q = w.$('[data-q]');
  if (q) q.oninput = () => {
    const v = q.value.toLocaleLowerCase('tr').trim();
    w.querySelectorAll('[data-b]').forEach(b => { b.hidden = v && !b.dataset.n.includes(v); });
  };
  w.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { w.close(); startAudit(getBranch(b.dataset.b), getTpl(sel)); });
  w.$('[data-add]').onsubmit = async e => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    const b = { id: db.uid(), name, city: '', manager: '', phone: '' };
    S.branches.push(b);
    await saveBranch(b);
    w.close();
    startAudit(b, getTpl(sel));
  };
}

async function startAudit(branch, tpl) {
  if (!branch || !tpl) return;
  const draft = S.audits.find(a => a.status === 'taslak' && a.branchId === branch.id && tplId(a) === tpl.id);
  if (draft) {
    const cont = await ask('Yarım kalan denetim var', `${branch.name} için ${trDate(draft.date)} tarihli denetime devam etmek ister misin?`, 'Devam et');
    if (cont) { location.hash = '#/denetim/' + draft.id; return; }
  }
  if (!tpl.items.length) { toast('Bu türün kontrol listesi boş. Ayarlar\'dan madde ekle.'); return; }
  S.settings.lastTpl = tpl.id; saveSettings();
  const a = {
    id: db.uid(), branchId: branch.id, branchName: branch.name, templateId: tpl.id, templateName: tpl.name,
    fields: (tpl.fields || []).map(f => ({ ...f })), info: {},
    date: todayISO(), startedAt: Date.now(), finishedAt: null, status: 'taslak', auditor: S.settings.auditor || '',
    items: tpl.items.map(i => ({ ...i })), answers: {}, summaryNote: '', reportText: null, ships: [],
  };
  S.audits.push(a);
  await saveAudit(a);
  captureGeo(a);
  cur.open = new Set();
  location.hash = '#/denetim/' + a.id;
}

function captureGeo(a) {
  if (!on('geo') || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(p => {
    a.geo = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() };
    saveAudit(a);
  }, () => {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 120000 });
}

// ============ DENETİM EKRANI ============
function buildBank(a) {
  // Bu maddeye daha önce yazılmış notlar: en sık kullanılanlar hızlı not olarak önerilir
  const m = new Map();
  for (const x of S.audits) {
    if (x.id === a.id) continue;
    for (const [id, ans] of Object.entries(x.answers)) {
      if (ans.r !== 'nok' || !ans.note) continue;
      const n = cap(ans.note);
      if (n.length > 50) continue;
      const e = m.get(id) || new Map();
      e.set(n, (e.get(n) || 0) + 1);
      m.set(id, e);
    }
  }
  return m;
}
function quickNotes(id) {
  const learned = [...(cur.bank.get(id) || new Map()).entries()].sort((p, q) => q[1] - p[1]).map(e => e[0]).slice(0, 3);
  return [...learned, ...QUICK_NOTES.filter(n => !learned.includes(n))].slice(0, 7);
}

function viewAudit(id) {
  const a = getAudit(id);
  if (!a) return notFound();
  if (a.status === 'tamam') { location.replace('#/rapor/' + id); return; }
  if (cur.audit !== a) { cur.open = new Set(); cur.bank = buildBank(a); cur.focus = null; }
  cur.audit = a;
  cur.prev = findPrev(a, S.audits);
  const cats = new Map();
  for (const it of a.items) { if (!cats.has(it.cat)) cats.set(it.cat, []); cats.get(it.cat).push(it); }
  cur.cats = [...cats.entries()];
  auditTop(a);

  const openPrev = openFindings().filter(x => x.audit.branchId === a.branchId && tplId(x.audit) === tplId(a));
  $app.className = 'v-audit';
  $app.innerHTML = `
    <div class="prog" id="prog">${progHTML(a)}</div>
    <div class="aud">
    <aside class="cat-nav" aria-label="Başlıklar">
      <p class="cn-t">Başlıklar</p>
      ${cur.cats.map(([cat, items], ci) => `<button class="cn-r" data-act="jumpTo" data-to="cat-${ci}"><span>${esc(cat)}</span><em data-navn="${ci}">${navCount(a, items)}</em></button>`).join('')}
      <button class="cn-r" data-act="jumpTo" data-to="tools"><span>Ek kontroller</span>${icon('cash')}</button>
      <button class="cn-r" data-act="jumpTo" data-to="gen"><span>Genel değerlendirme</span>${icon('edit')}</button>
      <button class="btn primary block cn-finish" data-act="finish">${icon('check')} Bitir ve raporla</button>
      <div class="kb-hint"><p><b>Klavye</b></p>
        <p><kbd>↑</kbd><kbd>↓</kbd> madde seç</p><p><kbd>1</kbd> uygun · <kbd>2</kbd> değil · <kbd>3</kbd> yok</p><p><kbd>Enter</kbd> not yaz · <kbd>Esc</kbd> geri</p></div>
    </aside>
    <div class="aud-main">
    ${openPrev.length ? `<p class="card row warnline">${icon('alert')}<span class="grow">Bu şubede önceki denetimlerden <b>${openPrev.length} açık bulgu</b> var. İlgili maddeler <em>turuncu</em> işaretli. Uygun bulursan kendiliğinden kapanır.</span></p>` : ''}
    ${(a.fields || []).length ? `<section class="card pad">
      <header class="card-h"><h3>Denetim bilgileri</h3><small class="muted">isteğe bağlı</small></header>
      <div class="info-grid">${a.fields.map(f => `<label><span>${esc(f.label)}</span>
        <input data-field="info" data-k="${f.k}" ${f.type === 'num' ? 'type="number" inputmode="numeric"' : 'autocomplete="off"'} value="${esc(a.info?.[f.k] ?? '')}"></label>`).join('')}</div>
    </section>` : ''}
    ${cur.cats.map(([cat, items], ci) => `
      <section class="cat" id="cat-${ci}">
        <header class="cat-h"><h2>${esc(cat)}</h2><span class="cat-n" data-catn="${ci}">${catCount(a, items)}</span></header>
        ${items.map(it => itemHTML(a, it)).join('')}
        <button class="btn ghost sm cat-ok" data-act="catOk" data-cat="${ci}">${icon('check')} Kalanları “uygun” işaretle</button>
      </section>`).join('')}
    <section class="cat" id="tools">${toolsHTML(a)}</section>
    <section class="cat general" id="gen">
      <header class="cat-h"><h2>Genel değerlendirme</h2></header>
      <div class="card pad">
        <label class="lbl">Denetçi notu (rapora eklenir)</label>
        <div class="note"><textarea data-field="summary" rows="3" placeholder="Genel izlenim, şube sorumlusuyla konuşulanlar…">${esc(a.summaryNote)}</textarea>${micBtn()}</div>
        <label class="lbl">Denetim tarihi</label>
        <input type="date" data-field="date" value="${a.date}">
      </div>
    </section>
    <div class="finishbar"><button class="btn primary xl block" data-act="finish">${icon('check')} Denetimi bitir ve raporla</button></div>
    <button class="btn link danger-t block" data-act="discard">Bu denetimi sil</button>
    </div></div>
  `;
  hydratePhotos($app);
  if (cur.focus) document.getElementById('it-' + cur.focus)?.classList.add('kb');
}

function navCount(a, items) {
  const n = items.filter(i => a.answers[i.id]?.r).length;
  const bad = items.filter(i => a.answers[i.id]?.r === 'nok').length;
  return `${bad ? `<i>${bad}</i>` : ''}${n}/${items.length}`;
}
A.jumpTo = btn => {
  const el = document.getElementById(btn.dataset.to);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ---------- klavye: bilgisayarda hızlı denetim (↑↓ seç, 1/2/3 cevap, Enter not, Esc geri) ----------
function setFocus(id, scroll = true) {
  if (!id) return;
  document.querySelector('.item.kb')?.classList.remove('kb');
  cur.focus = id;
  const el = document.getElementById('it-' + id);
  if (!el) return;
  el.classList.add('kb');
  if (scroll) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
document.addEventListener('keydown', e => {
  if (!cur.audit || document.querySelector('.sheet-wrap, .lock')) return;
  const t = e.target;
  if (t.matches?.('input, textarea, select')) {
    if (e.key === 'Escape') { t.blur(); const it = t.closest('.item'); if (it) setFocus(it.dataset.item, false); }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const ids = cur.audit.items.map(i => i.id);
  const i = ids.indexOf(cur.focus);
  const k = e.key;
  if (k === 'ArrowDown' || k === 'j') { e.preventDefault(); setFocus(ids[Math.min(ids.length - 1, i + 1)]); }
  else if (k === 'ArrowUp' || k === 'k') { e.preventDefault(); setFocus(ids[Math.max(0, i - 1)]); }
  else if (i >= 0 && (k === '1' || k === '2' || k === '3')) {
    e.preventDefault();
    const r = { 1: 'ok', 2: 'nok', 3: 'na' }[k];
    if (cur.audit.answers[cur.focus]?.r !== r) document.querySelector(`#it-${cur.focus} [data-r="${r}"]`).click();
    if (r === 'nok') document.querySelector(`#it-${cur.focus} textarea`)?.focus();
    else if (i < ids.length - 1) setFocus(ids[i + 1]);
  } else if (i >= 0 && k === 'Enter') {
    e.preventDefault();
    if (!document.querySelector(`#it-${cur.focus} textarea`)) { cur.open.add(cur.focus); refreshItem(cur.focus); }
    document.querySelector(`#it-${cur.focus} textarea`)?.focus();
  }
});
$app.addEventListener('click', e => {
  const it = cur.audit && e.target.closest('.item');
  if (it) setFocus(it.dataset.item, false);
});

function auditTop(a) {
  top({ title: getBranch(a.branchId)?.name || a.branchName, sub: `${short(tplName(a))} · ${trDate(a.date)}`, back: '#/',
    right: `<button class="tb-act" data-act="jump" aria-label="Başlıklar">${icon('list')}</button>` });
}

function toolsHTML(a) {
  const diff = cashDiff(a.cash);
  const ss = shipStats(a.ships);
  const cashTxt = !a.cash ? 'Sayım yapılmadı · dokun ve başla'
    : diff == null ? `${money(cashTotal(a.cash))} sayıldı` : diff === 0 ? `${money(cashTotal(a.cash))} · sistemle uyumlu` : `${diff < 0 ? 'Eksik' : 'Fazla'} ${money(Math.abs(diff))}`;
  const shipTxt = !ss.n ? 'Barkod okut ya da numara yaz' : `${ss.n} gönderi · ${ss.bad ? `${ss.bad} sorunlu` : 'hepsi uygun'}`;
  return `<header class="cat-h"><h2>Ek kontroller</h2><span class="cat-n">isteğe bağlı</span></header>
    <button class="card row tool ${a.cash ? (diff ? 'bad' : 'good') : ''}" data-act="cash">${icon('cash')}<div class="grow"><b>Kasa sayımı</b><small>${cashTxt}</small></div>${icon('chevron')}</button>
    <button class="card row tool ${ss.n ? (ss.bad ? 'bad' : 'good') : ''}" data-act="ships">${icon('barcode')}<div class="grow"><b>Gönderi kontrolü</b><small>${shipTxt}</small></div>${icon('chevron')}</button>`;
}

function catCount(a, items) {
  const n = items.filter(i => a.answers[i.id]?.r).length;
  const bad = items.filter(i => a.answers[i.id]?.r === 'nok').length;
  return `${n}/${items.length}${bad ? ` · <em>${bad} bulgu</em>` : ''}`;
}

function progHTML(a) {
  const s = scoreOf(a);
  const answered = s.total - s.unans;
  return `<div class="prog-row">${miniRing(answered / s.total)}
    <div class="prog-t"><b>${answered} / ${s.total} madde</b>
      <small>${s.ok} uygun · ${s.nok ? `<em>${s.nok} bulgu</em>` : '0 bulgu'}${s.crit ? ` · <em>${s.crit} kritik</em>` : ''}</small></div>
    <span class="live-score b-${band(s.score, s.crit)}">${s.score ?? '—'}<small>puan</small></span></div>`;
}

function itemHTML(a, it) {
  const ans = a.answers[it.id] || {};
  const open = cur.open.has(it.id) || ans.r === 'nok';
  const pa = cur.prev?.answers[it.id];
  const rep = isRepeat(cur.prev, it.id) && !pa.closed;
  const seg = (r, label, ic) => `<button class="s-${r} ${ans.r === r ? 'on' : ''}" data-act="ans" data-r="${r}" aria-pressed="${ans.r === r}">${icon(ic)}<span>${label}</span></button>`;
  const has = (ans.note || (ans.photos || []).length) && !open;
  return `<article class="item ${ans.r ? 'r-' + ans.r : ''} ${rep ? 'rep' : ''} ${cur.focus === it.id ? 'kb' : ''}" id="it-${it.id}" data-item="${it.id}">
    <div class="item-top"><p class="item-text">${esc(it.text)}</p><span class="sev sev-${it.sev}">${SEV[it.sev].label}</span></div>
    ${rep ? `<p class="prevflag">${icon('alert')} Önceki denetimde uygun değildi${pa.note ? `: “${esc(pa.note)}”` : ''}</p>` : ''}
    <div class="seg">${seg('ok', 'Uygun', 'check')}${seg('nok', 'Uygun değil', 'x')}${seg('na', 'Yok', 'minus')}</div>
    ${open ? `<div class="detail">
        <div class="note"><textarea data-field="note" rows="2" placeholder="${ans.r === 'nok' ? 'Ne gördün? Mikrofona söyleyebilirsin' : 'Not (isteğe bağlı)'}">${esc(ans.note)}</textarea>${micBtn()}</div>
        ${ans.r === 'nok' ? `<div class="qn">${quickNotes(it.id).map(n => `<button type="button" class="qn-c" data-act="qn" data-t="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
        <div class="photos">${thumbs(ans.photos)}
          <label class="addph">${icon('camera')}<span>Çek</span><input type="file" accept="image/*" capture="environment" data-field="photo" hidden></label>
          <label class="addph">${icon('image')}<span>Galeri</span><input type="file" accept="image/*" multiple data-field="photo" hidden></label>
        </div>
        ${ans.r === 'nok' ? `<label class="due-in">Termin <input type="date" data-field="due" value="${ans.due || ''}"></label>` : ''}
      </div>`
      : `<button class="more" data-act="openItem">${icon('plus')} ${has ? 'Not ve fotoğraf var' : 'Not / fotoğraf ekle'}</button>`}
  </article>`;
}

function refreshItem(id) {
  const el = document.getElementById('it-' + id);
  if (!el) return null;
  const it = cur.audit.items.find(i => i.id === id);
  el.outerHTML = itemHTML(cur.audit, it);
  const nw = document.getElementById('it-' + id);
  hydratePhotos(nw);
  const ci = cur.cats.findIndex(([c]) => c === it.cat);
  const n = $app.querySelector(`[data-catn="${ci}"]`);
  if (n) n.innerHTML = catCount(cur.audit, cur.cats[ci][1]);
  const nv = $app.querySelector(`[data-navn="${ci}"]`);
  if (nv) nv.innerHTML = navCount(cur.audit, cur.cats[ci][1]);
  document.getElementById('prog').innerHTML = progHTML(cur.audit);
  return nw;
}

const itemOf = el => {
  const card = el.closest('.item');
  const id = card.dataset.item;
  const a = cur.audit;
  return { id, a, it: a.items.find(i => i.id === id), ans: a.answers[id] || (a.answers[id] = {}) };
};

function setAnswer(a, it, r, note) {
  const ans = a.answers[it.id] || (a.answers[it.id] = {});
  ans.r = r;
  if (r === 'nok') { if (!ans.due) ans.due = addDays(a.date, SEV[it.sev].days); cur.open.add(it.id); }
  if (note) ans.note = ans.note ? `${ans.note}. ${note}` : note;
  return ans;
}

A.ans = btn => {
  const { id, a, it, ans } = itemOf(btn);
  const r = btn.dataset.r;
  if (ans.r === r) ans.r = null; else setAnswer(a, it, r);
  if (ans.r !== 'nok' && !ans.note && !(ans.photos || []).length) cur.open.delete(id);
  saveAudit(a);
  const el = refreshItem(id);
  navigator.vibrate?.(12);
  if (ans.r === 'nok') el.querySelector('textarea')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
};
A.qn = btn => {
  const { a, ans } = itemOf(btn);
  const ta = btn.closest('.item').querySelector('textarea');
  const t = btn.dataset.t;
  const curV = ta.value.trim();
  if (curV.toLocaleLowerCase('tr').includes(t.toLocaleLowerCase('tr'))) return;
  ta.value = curV ? `${curV.replace(/[.,]$/, '')}, ${t.toLocaleLowerCase('tr')}` : t;
  ans.note = ta.value;
  saveAudit(a);
  btn.classList.add('used');
};
A.openItem = btn => { const { id } = itemOf(btn); cur.open.add(id); refreshItem(id); };
A.catOk = btn => {
  const a = cur.audit;
  const [, items] = cur.cats[+btn.dataset.cat];
  let n = 0;
  for (const it of items) {
    const ans = a.answers[it.id] || (a.answers[it.id] = {});
    if (!ans.r) { ans.r = 'ok'; n++; refreshItem(it.id); }
  }
  saveAudit(a);
  toast(n ? `${n} madde uygun işaretlendi` : 'Bu başlıkta boş madde yok');
};
A.viewPhoto = btn => {
  const ph = btn.dataset.ph;
  const card = btn.closest('.item');
  if (!card || !cur.audit) return viewPhoto(ph);
  const { id, a, ans } = itemOf(btn);
  viewPhoto(ph, {
    onDelete: async () => { ans.photos = ans.photos.filter(p => p !== ph); await db.del('photos', ph); saveAudit(a); refreshItem(id); },
    onChange: () => refreshItem(id),
  });
};
A.jump = () => {
  const a = cur.audit;
  const w = sheet(`<h2 class="sheet-t">Başlığa git</h2><div class="sheet-list">${cur.cats.map(([cat, items], ci) =>
    `<button class="row-btn" data-ci="cat-${ci}">${icon('list')}<span><b>${esc(cat)}</b><small>${catCount(a, items).replace(/<[^>]+>/g, '')}</small></span></button>`).join('')}
    <button class="row-btn" data-ci="tools">${icon('cash')}<span><b>Ek kontroller</b><small>Kasa sayımı, gönderi kontrolü</small></span></button></div>`);
  w.querySelectorAll('[data-ci]').forEach(b => b.onclick = () => {
    w.close();
    document.getElementById(b.dataset.ci).scrollIntoView({ behavior: 'smooth' });
  });
};

F.note = el => { const { a, ans } = itemOf(el); ans.note = el.value; saveSoon('audit', () => saveAudit(a)); };
F.due = (el, ev) => { if (ev !== 'change') return; const { a, ans } = itemOf(el); ans.due = el.value; saveAudit(a); };
F.photo = async (el, ev) => {
  if (ev !== 'change' || !el.files.length) return;
  const { id, a, ans } = itemOf(el);
  toast('Fotoğraf ekleniyor…');
  const ids = await storePhotos([...el.files], a.id, on('stamp') ? a.branchName : null);
  ans.photos = (ans.photos || []).concat(ids);
  cur.open.add(id);
  await saveAudit(a);
  refreshItem(id);
  toast(ids.length > 1 ? `${ids.length} fotoğraf eklendi` : 'Fotoğraf eklendi');
};
F.info = el => { const a = cur.audit; a.info = a.info || {}; a.info[el.dataset.k] = el.value; saveSoon('audit', () => saveAudit(a)); };
F.summary = el => { cur.audit.summaryNote = el.value; saveSoon('audit', () => saveAudit(cur.audit)); };
F.date = (el, ev) => {
  if (ev !== 'change' || !el.value) return;
  cur.audit.date = el.value; saveAudit(cur.audit);
  auditTop(cur.audit);
};

// ---------- ek kontroller (denetim ve rapor ekranında ortak) ----------
const toolAudit = () => cur.audit || cur.report?.a;
function afterTool() {
  const a = toolAudit();
  saveAudit(a);
  if (cur.audit) { const t = document.getElementById('tools'); if (t) t.innerHTML = toolsHTML(a); }
  else if (cur.report) rerender();
}
A.cash = () => {
  const a = toolAudit();
  openCash(a, c => {
    // kasa farkı varsa ilgili madde kendiliğinden işaretlenir
    const it = a.items.find(i => /kasa/i.test(i.text) && /sayım/i.test(i.text));
    const diff = cashDiff(c);
    if (it && diff != null && cur.audit) {
      const ans = a.answers[it.id] || {};
      if (diff !== 0 && ans.r !== 'nok') {
        setAnswer(a, it, 'nok', `Kasa ${diff < 0 ? 'eksiği' : 'fazlası'} ${money(Math.abs(diff))}`);
        refreshItem(it.id);
        toast('Kasa maddesi “uygun değil” işaretlendi');
      } else if (diff === 0 && !ans.r) { setAnswer(a, it, 'ok'); refreshItem(it.id); }
    }
    afterTool();
  });
};
A.ships = () => openShips(toolAudit(), afterTool);

A.finish = async () => {
  const a = cur.audit;
  const s = scoreOf(a);
  if (s.unans) {
    const ok = await ask(`${s.unans} madde cevaplanmadı`, 'Cevaplanmayan maddeler “kapsam dışı” sayılacak.', 'Yine de bitir');
    if (!ok) {
      const first = a.items.find(i => !a.answers[i.id]?.r);
      const el = document.getElementById('it-' + first.id);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400);
      return;
    }
    for (const it of a.items) {
      const ans = a.answers[it.id] || (a.answers[it.id] = {});
      if (!ans.r) ans.r = 'na';
    }
  }
  a.status = 'tamam';
  a.finishedAt = Date.now();
  a.reportText = null;
  a.auditor = S.settings.auditor || a.auditor;
  if (S.settings.signPh) a.sign = { ...(a.sign || {}), auditor: { ph: S.settings.signPh, name: S.settings.auditor || '' } };
  await saveAudit(a);
  const b = getBranch(a.branchId);
  if (b?.planned && Math.abs(diffDays(a.date, b.planned)) <= 7) { delete b.planned; await saveBranch(b); }
  const auto = await reconcile(a);
  location.hash = '#/rapor/' + a.id;
  if (auto) setTimeout(() => toast(`Önceki ${auto} bulgu uygun bulunduğu için kapatıldı`), 300);
};

// Önceki denetimlerden açık kalan bulgu bu denetimde uygun çıktıysa kendiliğinden kapanır;
// yine uygunsuz çıktıysa takip yeni denetimdeki bulguya devredilir.
async function reconcile(a) {
  let auto = 0;
  for (const x of openFindings()) {
    if (x.audit.id === a.id || x.audit.branchId !== a.branchId || tplId(x.audit) !== tplId(a) || x.audit.date > a.date) continue;
    const r = a.answers[x.item.id]?.r;
    if (r === 'nok') { x.ans.carried = a.id; await saveAudit(x.audit); continue; }
    if (r !== 'ok') continue;
    Object.assign(x.ans, { closed: true, closedAt: a.date, closeNote: `${trDate(a.date)} denetiminde uygun bulundu` });
    await saveAudit(x.audit);
    auto++;
  }
  return auto;
}

A.discard = async () => {
  if (!await ask('Denetim silinsin mi?', 'Bu denetimdeki bütün cevaplar ve fotoğraflar silinir.', 'Sil', true)) return;
  await deleteAudit(cur.audit);
  location.hash = '#/';
};

async function deleteAudit(a) {
  const ph = Object.values(a.answers).flatMap(x => (x.photos || []).concat(x.closePhotos || []));
  if (a.sign?.manager?.ph) ph.push(a.sign.manager.ph);
  await db.delMany('photos', ph);
  await db.del('audits', a.id);
  S.audits = S.audits.filter(x => x.id !== a.id);
  if (cur.audit === a) cur.audit = null;
}

// ============ RAPOR ============
function viewReport(id) {
  const a = getAudit(id);
  if (!a) return notFound();
  if (a.status !== 'tamam') { location.replace('#/denetim/' + id); return; }
  const br = getBranch(a.branchId);
  const prev = findPrev(a, S.audits);
  cur.report = { a, br, prev };
  const s = scoreOf(a);
  const text = reportTextOf(cur.report);
  const f = findings(a);
  const ps = prev ? scoreOf(prev).score : null;
  const diff = ps != null && s.score != null ? s.score - ps : null;
  const mins = a.startedAt && a.finishedAt ? Math.round((a.finishedAt - a.startedAt) / 60000) : null;
  const cs = catScores(a);
  const info = infoRows(a);
  const cd = cashDiff(a.cash), ss = shipStats(a.ships);
  const mgr = a.sign?.manager, me = a.sign?.auditor;
  top({ title: br?.name || a.branchName, sub: `${short(tplName(a))} · ${trDate(a.date)}`, back: '#/' });

  $app.className = 'v-report';
  $app.innerHTML = `
    <div class="dcol dmain">
    <section class="scorecard o1">
      ${gauge(s.score, band(s.score, s.crit))}
      <div class="sc-info"><p class="sc-rate"><i class="b-${band(s.score, s.crit)}"></i>${rating(s.score, s.crit)}</p>
        <p>${s.ok} uygun · ${s.nok} bulgu${s.crit ? ` · <b>${s.crit} kritik</b>` : ''}${s.na ? ` · ${s.na} kapsam dışı` : ''}</p>
        ${diff != null ? `<p class="sc-diff"><b class="${diff > 0 ? 'sc-up' : diff < 0 ? 'sc-down' : ''}">${diff > 0 ? '▲' : diff < 0 ? '▼' : '='} ${diff ? Math.abs(diff) + ' puan' : 'değişmedi'}</b> <span>önceki ${ps} · ${trDate(prev.date)}</span></p>` : '<p class="sc-diff"><span>Bu şubenin bu türdeki ilk denetimi</span></p>'}
        <p class="sc-diff"><span>${mins ? `${hhmm(a.startedAt)}–${hhmm(a.finishedAt)} · ${duration(mins)}` : ''}${a.geo ? `${mins ? ' · ' : ''}<a href="https://maps.google.com/?q=${a.geo.lat},${a.geo.lng}" target="_blank" rel="noopener">konum</a>` : ''}</span></p>
      </div>
    </section>
    <section class="card pad o4">
      <header class="card-h"><h3>Rapor metni</h3>
        <button class="btn link sm" data-act="copyReport">${icon('copy')} Kopyala</button>
        <button class="btn link sm" data-act="regen">${icon('refresh')} Yenile</button></header>
      <textarea class="report-text" data-field="report">${esc(text)}</textarea>
      <p class="hint">Metin otomatik yazıldı. İstediğin gibi düzeltebilirsin, PDF ve Excel bu hâlini kullanır.</p>
    </section>
    <section class="card pad o7">
      <header class="card-h"><h3>Bulgular (${f.length})</h3></header>
      ${f.length ? `<div class="flist">${f.map((x, i) => `
        <div class="fitem ${x.ans.closed ? 'closed' : ''}">
          <div class="fnum">${i + 1}</div>
          <div class="grow"><p><b>${esc(x.item.text)}</b></p>
            <p class="meta"><span class="sev sev-${x.item.sev}">${SEV[x.item.sev].label}</span> ${esc(x.item.cat)}${isRepeat(prev, x.item.id) ? ' · <em class="rep-t">tekrar</em>' : ''}</p>
            ${x.ans.note ? `<p class="fnote">${esc(cap(x.ans.note))}</p>` : ''}
            ${(x.ans.photos || []).length ? `<div class="photos">${thumbs(x.ans.photos)}</div>` : ''}
            <p class="meta">${x.ans.closed ? `<span class="due ok">${icon('check')} Kapandı ${trDate(x.ans.closedAt)}</span>`
              : x.ans.carried ? `<a class="due soon" href="#/rapor/${x.ans.carried}">Sonraki denetimde yine tespit edildi</a>` : dueLabel(x.ans.due)}</p>
          </div></div>`).join('')}</div>` : '<p class="empty-s">Uygunsuzluk yok. Tebrikler şubeye!</p>'}
    </section>
    <div class="row-gap o8">
      <button class="btn ghost" data-act="reopen">${icon('edit')} Denetimi düzenle</button>
      <button class="btn ghost danger-t" data-act="delAudit">${icon('trash')} Sil</button>
    </div>
    </div>
    <div class="dcol dside">
    <div class="actgrid o2">
      <button class="act" data-act="print">${icon('printer')}<span>PDF / Yazdır</span></button>
      <button class="act" data-act="xlsx">${icon('table')}<span>Excel'i aç</span></button>
      <button class="act" data-act="sendFindings">${icon('chat')}<span>Şubeye gönder</span></button>
      <button class="act" data-act="xlsxShare">${icon('share')}<span>Excel'i paylaş</span></button>
    </div>
    <section class="card pad o3">
      <header class="card-h"><h3>İmzalar</h3><small class="muted">PDF'te görünür</small></header>
      <div class="signs">
        <button class="sign-box" data-act="signMgr">${mgr ? `<img data-ph="${mgr.ph}" alt="">` : `<span class="sign-empty">${icon('pen')} İmza al</span>`}
          <small>Şube sorumlusu</small><b>${esc(mgr?.name || br?.manager || '—')}</b></button>
        <button class="sign-box" data-act="signMe">${me ? `<img data-ph="${me.ph}" alt="">` : `<span class="sign-empty">${icon('pen')} İmzamı ekle</span>`}
          <small>Denetçi</small><b>${esc(me?.name || S.settings.auditor || '—')}</b></button>
      </div>
    </section>
    <section class="card pad o5">
      <header class="card-h"><h3>Başlık puanları</h3></header>
      <div class="cs-list">${cs.map(c => `<div class="cs-r"><span class="cs-n">${esc(c.cat)}${c.nok ? ` <em>${c.nok}</em>` : ''}</span>
        <span class="rb"><i class="b-${band(c.score, c.crit)}" style="width:${c.score ?? 0}%"></i></span><b>${c.score ?? '—'}</b></div>`).join('')}</div>
    </section>
    ${info.length || a.cash || ss.n ? `<section class="card pad o6">
      <header class="card-h"><h3>Denetim bilgileri ve ek kontroller</h3></header>
      ${info.length ? `<div class="kv">${info.map(([l, v]) => `<p><span>${esc(l)}</span><b>${esc(v)}</b></p>`).join('')}</div>` : ''}
      ${a.cash ? `<button class="card row tool ${cd ? 'bad' : 'good'}" data-act="cash">${icon('cash')}<div class="grow"><b>Kasa sayımı</b><small>${esc(cashSentence(a.cash))}</small></div>${icon('chevron')}</button>` : ''}
      ${ss.n ? `<button class="card row tool ${ss.bad ? 'bad' : 'good'}" data-act="ships">${icon('barcode')}<div class="grow"><b>Gönderi kontrolü</b><small>${esc(shipSentence(a.ships))}</small></div>${icon('chevron')}</button>` : ''}
    </section>` : ''}
    </div>`;
  autosize($app.querySelector('.report-text'));
  hydratePhotos($app);
}

const reportTextOf = ({ a, br, prev }) => a.reportText ?? buildReportText(a, br, prev, S.settings);

F.report = el => { const a = cur.report.a; a.reportText = el.value; saveSoon('report', () => saveAudit(a)); };
A.regen = async () => {
  const { a } = cur.report;
  if (a.reportText != null && !await ask('Metin yeniden yazılsın mı?', 'Elle yaptığın düzeltmeler silinir.', 'Yeniden oluştur')) return;
  a.reportText = null; await saveAudit(a); rerender();
};
A.copyReport = () => copy(reportTextOf(cur.report));
A.xlsx = async () => {
  const { a, br, prev } = cur.report;
  try { await xl.exportAudit(a, br, prev, S.settings, reportTextOf(cur.report), 'view'); }
  catch (e) { toast(e.message); }
};
A.xlsxShare = async () => {
  const { a, br, prev } = cur.report;
  try { const r = await xl.exportAudit(a, br, prev, S.settings, reportTextOf(cur.report), true); if (r === 'downloaded') toast('Paylaşım desteklenmiyor, dosya indirildi'); }
  catch (e) { toast(e.message); }
};
A.sendFindings = () => {
  const { a, br } = cur.report;
  shareSheet(findingsMessage(a, br, S.settings), 'Bulguları şubeye gönder', br);
};
A.signMgr = async () => {
  const { a, br } = cur.report;
  const r = await signPad('Şube sorumlusu imzası', a.sign?.manager?.name || br?.manager || '');
  if (!r) return;
  if (a.sign?.manager?.ph) await db.del('photos', a.sign.manager.ph);
  a.sign = { ...(a.sign || {}), manager: { ph: await storeBlob(r.blob, a.id), name: r.name, at: Date.now() } };
  if (br && r.name && !br.manager) { br.manager = r.name; saveBranch(br); }
  await saveAudit(a);
  toast('İmza kaydedildi');
  rerender();
};
A.signMe = async () => {
  const { a } = cur.report;
  let ph = S.settings.signPh;
  if (!ph || a.sign?.auditor?.ph === ph) {
    const r = await signPad('Denetçi imzan', S.settings.auditor || '');
    if (!r) return;
    ph = await storeBlob(r.blob, 'settings');
    S.settings.signPh = ph;
    if (r.name) S.settings.auditor = r.name;
    await saveSettings();
  }
  a.sign = { ...(a.sign || {}), auditor: { ph, name: S.settings.auditor || '' } };
  await saveAudit(a);
  toast('İmzan bu rapora eklendi, sonraki raporlara kendiliğinden eklenecek');
  rerender();
};
A.reopen = async () => {
  const { a } = cur.report;
  a.status = 'taslak'; a.finishedAt = null;
  await saveAudit(a);
  location.hash = '#/denetim/' + a.id;
};
A.delAudit = async () => {
  if (!await ask('Denetim silinsin mi?', 'Rapor, bulgular ve fotoğraflar kalıcı olarak silinir.', 'Sil', true)) return;
  await deleteAudit(cur.report.a);
  toast('Denetim silindi');
  location.hash = '#/';
};

A.print = async () => {
  const { a, br, prev } = cur.report;
  const s = scoreOf(a);
  const text = reportTextOf(cur.report);
  const f = findings(a);
  const info = infoRows(a);
  const root = document.getElementById('print-root');
  const paras = text.split(/\n{2,}/).map(p => {
    const lines = p.split('\n');
    if (!lines.some(l => l.startsWith('•'))) return `<p>${esc(p).replace(/\n/g, '<br>')}</p>`;
    let out = '', inList = false;
    for (const l of lines) {
      if (!l.trim()) continue;
      if (l.startsWith('•')) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${esc(l.slice(1).trim())}</li>`; }
      else { if (inList) { out += '</ul>'; inList = false; } out += `<h4>${esc(l)}</h4>`; }
    }
    return out + (inList ? '</ul>' : '');
  }).join('');
  const meta = [
    ['Şube / birim', br?.name || a.branchName], ['Tarih', `${trDate(a.date)}${a.startedAt ? ` · ${hhmm(a.startedAt)}–${hhmm(a.finishedAt)}` : ''}`],
    ['Bölge', br?.city || ''], ['Denetçi', S.settings.auditor || a.auditor || ''],
    ['Şube sorumlusu', a.sign?.manager?.name || br?.manager || ''], ['Sonuç', `${s.ok} uygun · ${s.nok} bulgu · ${s.crit} kritik`],
    ...info, ...(a.geo ? [['Konum', `${a.geo.lat.toFixed(5)}, ${a.geo.lng.toFixed(5)} (±${Math.round(a.geo.acc)} m)`]] : []),
  ];
  const metaRows = [];
  for (let i = 0; i < meta.length; i += 2) metaRows.push(`<tr><th>${esc(meta[i][0])}</th><td>${esc(meta[i][1])}</td>${meta[i + 1] ? `<th>${esc(meta[i + 1][0])}</th><td>${esc(meta[i + 1][1])}</td>` : '<th></th><td></td>'}</tr>`);
  const withPh = f.map((x, i) => ({ ...x, n: i + 1 })).filter(x => (x.ans.photos || []).length);
  const bad = (a.ships || []).filter(x => x.st !== 'ok');
  const sg = (who, label, name) => `<div><span>${label}</span><b>${esc(name) || '&nbsp;'}</b>${who?.ph ? `<img data-ph="${who.ph}" alt="">` : '<i>İmza</i>'}</div>`;
  root.innerHTML = `<div class="pr">
    <header class="pr-h"><div><h1>${esc(tplName(a))} raporu</h1><p>${esc(S.settings.company || '')}</p></div>
      <div class="pr-score b-${band(s.score, s.crit)}"><b>${s.score ?? '—'}</b><small>/100</small><span>${rating(s.score, s.crit)}</span></div></header>
    <table class="pr-meta">${metaRows.join('')}</table>
    <div class="pr-text">${paras}</div>
    <h2>Başlık puanları</h2>
    <table class="pr-f pr-cs"><thead><tr><th>Başlık</th><th>Uygun</th><th>Uygun değil</th><th>Puan</th></tr></thead><tbody>
      ${catScores(a).map(c => `<tr><td>${esc(c.cat)}</td><td>${c.ok}</td><td>${c.nok}</td><td><b>${c.score ?? '—'}</b></td></tr>`).join('')}</tbody></table>
    ${f.length ? `<h2>Bulgu listesi</h2><table class="pr-f"><thead><tr><th>No</th><th>Bulgu</th><th>Önem</th><th>Açıklama</th><th>Termin</th></tr></thead><tbody>
      ${f.map((x, i) => `<tr><td>${i + 1}</td><td><b>${esc(x.item.text)}</b><br><small>${esc(x.item.cat)}${isRepeat(prev, x.item.id) ? ' · tekrar' : ''}</small></td><td>${SEV[x.item.sev].label}</td><td>${esc(cap(x.ans.note))}</td><td>${x.ans.closed ? 'Kapandı' : trDate(x.ans.due)}</td></tr>`).join('')}
    </tbody></table>` : ''}
    ${a.cash ? `<h2>Kasa sayımı</h2><p>${esc(cashSentence(a.cash))}</p>` : ''}
    ${a.ships?.length ? `<h2>Gönderi kontrolü</h2><p>${esc(shipSentence(a.ships))}</p>
      ${bad.length ? `<table class="pr-f"><thead><tr><th>Gönderi</th><th>Durum</th><th>Not</th></tr></thead><tbody>${bad.map(x => `<tr><td>${esc(x.code)}</td><td>${SHIP_ST[x.st]}</td><td>${esc(x.note || '')}</td></tr>`).join('')}</tbody></table>` : ''}` : ''}
    ${withPh.length ? `<h2>Fotoğraflar</h2><div class="pr-ph">${withPh.flatMap(x => x.ans.photos.map(p => `<figure><img data-ph="${p}" alt=""><figcaption>Bulgu ${x.n}: ${esc(x.item.text)}</figcaption></figure>`)).join('')}</div>` : ''}
    <div class="pr-sign">${sg(a.sign?.auditor, 'Denetçi', S.settings.auditor || a.auditor)}${sg(a.sign?.manager, 'Şube sorumlusu', a.sign?.manager?.name || br?.manager)}</div>
  </div>`;
  await Promise.all([...root.querySelectorAll('img[data-ph]')].map(async img => {
    img.src = await photoSrc(img.dataset.ph);
    await img.decode().catch(() => {});
  }));
  const old = document.title;
  document.title = `Denetim_${(br?.name || a.branchName).replace(/\s+/g, '_')}_${a.date}`;
  window.print();
  setTimeout(() => { document.title = old; }, 1000);
};

// ============ BULGULAR (takip) ============
function allFindings() {
  return done().flatMap(a => findings(a).map(x => ({ ...x, audit: a })));
}
// "carried": aynı madde sonraki denetimde yine uygunsuz çıktı, takip oradaki bulguda sürüyor
function openFindings() { return allFindings().filter(x => !x.ans.closed && !x.ans.carried); }

function viewActions() {
  $app.className = 'v-actions';
  top({ title: 'Bulgu takibi', sub: 'Termin ve kapanış durumu' });
  const t = todayISO();
  const open = openFindings();
  const groups = {
    acik: open,
    gecikmis: open.filter(x => x.ans.due && x.ans.due < t),
    kapandi: allFindings().filter(x => x.ans.closed).sort((p, q) => (q.ans.closedAt || '').localeCompare(p.ans.closedAt || '')),
  };
  const list = groups[cur.actFilter];
  const byB = new Map();
  for (const x of list) {
    const k = x.audit.branchId;
    if (!byB.has(k)) byB.set(k, []);
    byB.get(k).push(x);
  }
  const sorted = [...byB.entries()].map(([bid, xs]) => [bid, cur.actFilter === 'kapandi' ? xs : xs.sort((p, q) => (p.ans.due || '9').localeCompare(q.ans.due || '9'))])
    .sort((p, q) => (p[1][0].ans.due || '9').localeCompare(q[1][0].ans.due || '9'));
  const chip = (k, l) => `<button class="chip ${cur.actFilter === k ? 'on' : ''} ${k === 'gecikmis' && groups[k].length ? 'warn' : ''}" data-act="actFilter" data-f="${k}">${l} <b>${groups[k].length}</b></button>`;
  const key = x => `${x.item.text} ${x.ans.note || ''} ${x.item.cat} ${getBranch(x.audit.branchId)?.name || x.audit.branchName}`.toLocaleLowerCase('tr');

  $app.innerHTML = `
    <div class="chips">${chip('acik', 'Açık')}${chip('gecikmis', 'Termini geçen')}${chip('kapandi', 'Kapanan')}</div>
    ${list.length > 3 || cur.q ? `<label class="search-w">${icon('search')}<input type="search" data-field="q" placeholder="Bulgu, şube ya da not ara" value="${esc(cur.q)}"></label>` : ''}
    ${!list.length ? `<div class="empty">${icon('flag')}<p>${cur.actFilter === 'kapandi' ? 'Henüz kapanan bulgu yok.' : cur.actFilter === 'gecikmis' ? 'Termini geçen bulgu yok. Harika!' : 'Açık bulgu yok.'}</p></div>` : ''}
    <p class="empty-s" data-none hidden>Aramayla eşleşen bulgu yok.</p>
    ${sorted.map(([bid, xs]) => {
      const name = getBranch(bid)?.name || xs[0].audit.branchName;
      return `<section class="grp">
        <header class="grp-h"><h3><a href="#/sube/${bid}">${esc(name)}</a></h3>
          ${cur.actFilter !== 'kapandi' ? `<button class="btn link sm" data-act="remind" data-b="${bid}">${icon('bell')} Hatırlat</button>` : ''}</header>
        ${xs.map(x => `<div class="card fcard ${x.ans.closed ? 'closed' : ''}" data-s="${esc(key(x))}">
          <div class="item-top"><p class="item-text">${esc(x.item.text)}</p><span class="sev sev-${x.item.sev}">${SEV[x.item.sev].label}</span></div>
          ${x.ans.note ? `<p class="fnote">${esc(cap(x.ans.note))}</p>` : ''}
          ${(x.ans.photos || []).length ? `<div class="photos">${thumbs(x.ans.photos)}</div>` : ''}
          ${x.ans.closed ? `<p class="fnote ok">${icon('check')} ${trDate(x.ans.closedAt)}: ${esc(x.ans.closeNote || 'Kapatıldı')}</p>${(x.ans.closePhotos || []).length ? `<div class="photos">${thumbs(x.ans.closePhotos)}</div>` : ''}` : ''}
          <div class="fcard-b"><span class="meta">${dueLabel(x.ans.due, x.ans.closed, `data-act="editDue" data-a="${x.audit.id}" data-i="${x.item.id}"`)} <a href="#/rapor/${x.audit.id}">${trDate(x.audit.date)} denetimi</a></span>
            ${x.ans.closed
              ? `<button class="btn ghost sm" data-act="reopenF" data-a="${x.audit.id}" data-i="${x.item.id}">Yeniden aç</button>`
              : `<button class="btn primary sm" data-act="closeF" data-a="${x.audit.id}" data-i="${x.item.id}">${icon('check')} Kapat</button>`}
          </div></div>`).join('')}
      </section>`;
    }).join('')}`;
  applySearch();
  hydratePhotos($app);
}
function applySearch() {
  const v = cur.q.toLocaleLowerCase('tr').trim();
  let any = false;
  $app.querySelectorAll('.grp').forEach(g => {
    let n = 0;
    g.querySelectorAll('[data-s]').forEach(c => { const hit = !v || c.dataset.s.includes(v); c.hidden = !hit; if (hit) n++; });
    g.hidden = !n; if (n) any = true;
  });
  const none = $app.querySelector('[data-none]');
  if (none) none.hidden = any || !v;
}
F.q = el => { cur.q = el.value; applySearch(); };

A.actFilter = btn => { cur.actFilter = btn.dataset.f; rerender(); };
A.remind = btn => {
  const bid = btn.dataset.b;
  const br = getBranch(bid);
  const list = openFindings().filter(x => x.audit.branchId === bid);
  if (!list.length) { toast('Bu şubede açık bulgu yok'); return; }
  shareSheet(reminderMessage(br?.name || list[0].audit.branchName, list, S.settings), 'Hatırlatma gönder', br);
};
A.editDue = async btn => {
  const a = getAudit(btn.dataset.a);
  const ans = a.answers[btn.dataset.i];
  const v = await pickDate('Termini değiştir', ans.due);
  if (!v) return;
  ans.due = v;
  await saveAudit(a);
  toast('Termin güncellendi');
  rerender();
};
A.closeF = btn => {
  const a = getAudit(btn.dataset.a);
  const ans = a.answers[btn.dataset.i];
  const it = a.items.find(i => i.id === btn.dataset.i);
  let photos = [];
  const w = sheet(`<h2 class="sheet-t">Bulguyu kapat</h2><p class="sheet-p">${esc(it.text)}</p>
    <label class="lbl">Nasıl giderildi?</label>
    <div class="note"><textarea rows="2" data-cn placeholder="ör. Tüpler yenilendi, fotoğraf şubeden geldi"></textarea>${micBtn()}</div>
    <div class="photos" data-ph-list><label class="addph">${icon('image')}<span>Kanıt foto</span><input type="file" accept="image/*" multiple hidden data-cf></label></div>
    <label class="lbl">Kapanış tarihi</label><input type="date" data-cd value="${todayISO()}">
    <div class="sheet-btns"><button class="btn ghost" data-close>Vazgeç</button><button class="btn primary" data-ok>${icon('check')} Kapat</button></div>`);
  w.$('[data-cf]').onchange = async e => {
    const ids = await storePhotos([...e.target.files], a.id, null);
    photos = photos.concat(ids);
    const box = w.$('[data-ph-list]');
    box.insertAdjacentHTML('afterbegin', ids.map(id => `<span class="thumb"><img data-ph="${id}" alt=""></span>`).join(''));
    hydratePhotos(box);
  };
  w.$('[data-ok]').onclick = async () => {
    ans.closed = true;
    ans.closedAt = w.$('[data-cd]').value || todayISO();
    ans.closeNote = w.$('[data-cn]').value.trim();
    ans.closePhotos = (ans.closePhotos || []).concat(photos);
    await saveAudit(a);
    w.close();
    toast('Bulgu kapatıldı');
    rerender();
  };
};
A.reopenF = async btn => {
  const a = getAudit(btn.dataset.a);
  const ans = a.answers[btn.dataset.i];
  ans.closed = false; delete ans.closedAt;
  await saveAudit(a);
  rerender();
};

// ============ ŞUBELER ============
function viewBranches() {
  $app.className = 'v-branches';
  top({ title: 'Şubeler', sub: `${S.branches.length} şube / birim`, right: `<button class="tb-act" data-act="addBranch" aria-label="Şube ekle">${icon('plus')}</button>` });
  const open = openFindings();
  const list = [...S.branches].sort(byName);
  const todo = new Map(todoList().map(x => [x.b.id, x]));
  $app.innerHTML = list.length ? `
    ${list.length > 5 ? `<label class="search-w">${icon('search')}<input type="search" data-bq placeholder="Şube ara"></label>` : ''}
    <div class="list">${list.map(b => {
      const last = lastAudit(b.id);
      const sc = last ? scoreOf(last) : {};
      const o = open.filter(x => x.audit.branchId === b.id).length;
      const td = todo.get(b.id);
      return `<a class="card row" href="#/sube/${b.id}" data-n="${esc(b.name.toLocaleLowerCase('tr'))}"><span class="score-dot b-${band(sc.score, sc.crit)}">${sc.score ?? '—'}</span>
        <div class="grow"><b>${esc(b.name)}</b><small>${[b.city, last ? `son: ${trDate(last.date)}` : ''].filter(Boolean).map(esc).join(' · ')}</small>
        ${td ? `<small class="${td.cls}">${esc(td.reason)}</small>` : ''}</div>
        ${o ? `<span class="pill nok">${o} açık</span>` : ''}${icon('chevron')}</a>`;
    }).join('')}</div>` : `<div class="empty">${icon('store')}<p>Henüz şube yok. Sağ üstteki + ile ekle ya da denetim başlatırken ekle.</p>
    <button class="btn primary" data-act="addBranch">${icon('plus')} Şube ekle</button></div>`;
  const q = $app.querySelector('[data-bq]');
  if (q) q.oninput = () => {
    const v = q.value.toLocaleLowerCase('tr').trim();
    $app.querySelectorAll('[data-n]').forEach(r => { r.hidden = v && !r.dataset.n.includes(v); });
  };
}

A.addBranch = () => branchForm();
A.editBranch = btn => branchForm(getBranch(btn.dataset.b));

function branchForm(b) {
  const w = sheet(`<h2 class="sheet-t">${b ? 'Şubeyi düzenle' : 'Yeni şube'}</h2>
    <form class="form" data-f>
      <label class="lbl">Şube / birim adı *</label><input name="name" required value="${esc(b?.name)}" autocomplete="off">
      <label class="lbl">İl / ilçe</label><input name="city" value="${esc(b?.city)}" autocomplete="off">
      <label class="lbl">Şube sorumlusu</label><input name="manager" value="${esc(b?.manager)}" autocomplete="off">
      <label class="lbl">Sorumlunun telefonu (WhatsApp için)</label><input name="phone" type="tel" inputmode="tel" placeholder="05xx xxx xx xx" value="${esc(b?.phone)}">
      <label class="lbl">Kaç günde bir denetlenmeli?</label><input name="freq" type="number" inputmode="numeric" min="1" placeholder="${Number(S.settings.freq) || 30} (varsayılan)" value="${esc(b?.freq || '')}">
      <div class="sheet-btns">${b ? `<button type="button" class="btn ghost danger-t" data-del>${icon('trash')} Sil</button>` : '<button type="button" class="btn ghost" data-close>Vazgeç</button>'}
      <button class="btn primary" type="submit">Kaydet</button></div>
    </form>`);
  w.$('[data-f]').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const o = b || { id: db.uid() };
    for (const k of ['name', 'city', 'manager', 'phone']) o[k] = String(fd.get(k) || '').trim();
    o.freq = Number(fd.get('freq')) || '';
    if (!b) S.branches.push(o);
    await saveBranch(o);
    // şube adı değiştiyse kayıtlardaki ad da güncellenir
    for (const a of S.audits.filter(a => a.branchId === o.id && a.branchName !== o.name)) { a.branchName = o.name; saveAudit(a); }
    w.close();
    toast('Kaydedildi');
    rerender();
  };
  const d = w.$('[data-del]');
  if (d) d.onclick = async () => {
    const n = S.audits.filter(a => a.branchId === b.id).length;
    w.close();
    if (!await ask(`${b.name} silinsin mi?`, n ? `Bu şubenin ${n} denetimi de silinir.` : '', 'Sil', true)) return;
    for (const a of S.audits.filter(a => a.branchId === b.id)) await deleteAudit(a);
    await db.del('branches', b.id);
    S.branches = S.branches.filter(x => x.id !== b.id);
    location.hash = '#/subeler';
  };
}

function viewBranch(id) {
  $app.className = 'v-branch';
  const b = getBranch(id);
  if (!b) return notFound();
  const list = done().filter(a => a.branchId === id).sort(desc);
  const open = openFindings().filter(x => x.audit.branchId === id);
  top({ title: b.name, sub: b.city || 'Şube', back: '#/subeler', right: `<button class="tb-act" data-act="editBranch" data-b="${id}" aria-label="Düzenle">${icon('edit')}</button>` });
  const last = list[0];
  const since = last ? diffDays(last.date, todayISO()) : null;
  const byTpl = new Map();
  for (const a of list) { const k = tplId(a); if (!byTpl.has(k)) byTpl.set(k, []); byTpl.get(k).push(a); }
  const freq = new Map();
  for (const a of list) for (const x of findings(a)) { const e = freq.get(x.item.id) || { item: x.item, n: 0 }; e.n++; freq.set(x.item.id, e); }
  const chronic = [...freq.values()].filter(e => e.n > 1).sort((p, q) => q.n - p.n).slice(0, 5);

  $app.innerHTML = `
    <section class="card pad kv">
      ${b.manager ? `<p><span>Sorumlu</span><b>${esc(b.manager)}</b></p>` : ''}
      ${b.phone ? `<p><span>Telefon</span><a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></p>` : ''}
      <p><span>Son denetim</span><b>${last ? `${trDate(last.date)} (${since} gün önce)` : '—'}</b></p>
      <p><span>Denetim sıklığı</span><b>${freqOf(b)} günde bir</b></p>
      <p><span>Planlanan</span><b>${b.planned ? trDate(b.planned) : '—'}</b></p>
      <p><span>Açık bulgu</span><b>${open.length}</b></p>
    </section>
    <div class="row-gap">
      <button class="btn primary grow" data-act="newAudit" data-branch="${id}">${icon('play')} Denetime başla</button>
      <button class="btn ghost" data-act="plan" data-b="${id}">${icon('calendar')} Planla</button>
      ${open.length ? `<button class="btn ghost" data-act="remind" data-b="${id}">${icon('bell')} Hatırlat</button>` : ''}
    </div>
    ${[...byTpl.entries()].map(([k, as]) => {
      const pts = as.slice(0, 8).reverse().map(a => ({ s: scoreOf(a).score, d: a.date })).filter(p => p.s != null);
      return pts.length > 1 ? `<section class="card pad"><header class="card-h"><h3>Puan gidişatı · ${esc(short(tplName(as[0])))}</h3></header>${spark(pts)}</section>` : '';
    }).join('')}
    ${chronic.length ? `<section class="card pad"><header class="card-h"><h3>Sürekli tekrar eden bulgular</h3></header>
      <ul class="plain">${chronic.map(e => `<li><span class="cnt">${e.n}×</span>${esc(e.item.text)}</li>`).join('')}</ul></section>` : ''}
    <h3 class="sec-t">Denetimler</h3>
    ${list.length ? `<div class="list">${list.map(auditRow).join('')}</div>` : '<p class="empty-s">Bu şube henüz denetlenmedi.</p>'}`;
}

A.plan = async btn => {
  const b = getBranch(btn.dataset.b);
  const v = await pickDate(`${b.name} için denetim planla`, b.planned || addDays(todayISO(), 1), { clearLabel: b.planned ? 'Planı kaldır' : null });
  if (v === undefined) return;
  if (v === null) delete b.planned; else b.planned = v;
  await saveBranch(b);
  toast(v ? `${trDate(v)} için planlandı` : 'Plan kaldırıldı');
  rerender();
};

function spark(pts) {
  const W = 320, H = 110, P = 22;
  const x = i => P + i * (W - 2 * P) / (pts.length - 1);
  const y = s => H - P - (s / 100) * (H - 2 * P);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.s).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Puan gidişatı">
    <line x1="${P}" x2="${W - P}" y1="${y(75)}" y2="${y(75)}" class="sp-ref"/><text x="${W - P}" y="${y(75) - 4}" class="sp-ref-t" text-anchor="end">75</text>
    <path d="${path}" class="sp-line"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.s)}" r="4" class="sp-dot"/><text x="${x(i)}" y="${y(p.s) - 9}" text-anchor="middle" class="sp-v">${p.s}</text><text x="${x(i)}" y="${H - 4}" text-anchor="middle" class="sp-d">${trDate(p.d).slice(0, 5)}</text>`).join('')}
  </svg>`;
}

// ============ ÖZET (hafta / ay) ============
function period() {
  if (cur.per === 'hafta') {
    const from = cur.week, to = addDays(from, 6);
    return { from, to, label: rangeLabel(from, to), weekly: true };
  }
  const [y, m] = cur.month.split('-').map(Number);
  return { from: `${cur.month}-01`, to: todayISO(new Date(y, m, 0)), label: monthLabel(cur.month), weekly: false };
}

function viewSummary() {
  const pr = period();
  top({ title: pr.weekly ? 'Haftalık faaliyet' : 'Aylık özet', sub: pr.label });
  const st = periodStats(pr.from, pr.to, S.audits, S.branches);
  cur.periodStats = st; cur.periodLabel = pr.label;
  $app.className = 'v-summary';
  $app.innerHTML = `
    <div class="sum-bar">
    <div class="seg two">
      <button class="${cur.per === 'hafta' ? 'on' : ''}" data-act="per" data-p="hafta">Hafta</button>
      <button class="${cur.per === 'ay' ? 'on' : ''}" data-act="per" data-p="ay">Ay</button>
    </div>
    <div class="month-pick">
      <button class="btn ghost sm" data-act="mon" data-d="-1" aria-label="Önceki">${icon('back')}</button>
      ${pr.weekly ? `<b class="grow center">${esc(pr.label)}</b>` : `<input type="month" data-field="month" value="${cur.month}">`}
      <button class="btn ghost sm" data-act="mon" data-d="1" aria-label="Sonraki">${icon('chevron')}</button>
    </div>
    </div>
    <div class="tiles">
      <div class="tile"><small>Denetim</small><b>${st.list.length}</b></div>
      <div class="tile"><small>Ortalama puan</small><b>${st.avg ?? '—'}</b></div>
      <div class="tile"><small>Bulgu / kritik</small><b>${st.nok}<span class="tile-s"> / ${st.crit}</span></b></div>
      <div class="tile"><small>Kapatılan bulgu</small><b>${st.closedInPeriod}</b></div>
    </div>
    ${st.list.length ? `<div class="v-cols"><div class="dcol dmain">
    <section class="card pad"><header class="card-h"><h3>Yöneticiye ${pr.weekly ? 'haftalık rapor' : 'aylık özet'}</h3><button class="btn link sm" data-act="copyPeriod">${icon('copy')} Kopyala</button></header>
      <textarea class="report-text" data-period-text>${esc(periodText(pr.label, st, S.settings, pr.weekly))}</textarea>
      <div class="row-gap"><button class="btn ghost" data-act="sharePeriod">${icon('chat')} Mesajla gönder</button></div></section>
    </div><div class="dcol dside">
    <div class="actgrid two">
      <button class="act" data-act="periodXlsx">${icon('table')}<span>Excel'i aç</span></button>
      <button class="act" data-act="periodXlsxShare">${icon('share')}<span>Excel'i paylaş</span></button>
    </div>
    <section class="card pad"><header class="card-h"><h3>Şube sıralaması</h3></header>
      <div class="rank">${st.ranking.map((r, i) => `<a class="rank-r" href="#/sube/${r.id}"><span class="rk">${i + 1}</span><span class="rn">${esc(r.name)}<small>${r.n} denetim · ${r.nok} bulgu</small></span>
        <span class="rb"><i class="b-${band(r.avg, r.crit)}" style="width:${r.avg || 0}%"></i></span><b class="rv">${r.avg ?? '—'}</b></a>`).join('')}</div>
    </section>
    ${st.top.length ? `<section class="card pad"><header class="card-h"><h3>En sık bulgular</h3></header>
      <ul class="plain">${st.top.map(e => `<li><span class="cnt">${e.n}×</span>${esc(e.item.text)}<small> · ${e.branches.size} şube</small></li>`).join('')}</ul></section>` : ''}</div></div>`
    : `<div class="empty">${icon('chart')}<p>${esc(pr.label)} döneminde tamamlanmış denetim yok.</p></div>`}`;
  const ta = $app.querySelector('[data-period-text]');
  if (ta) autosize(ta);
}
A.per = btn => { cur.per = btn.dataset.p; rerender(); };
F.month = (el, ev) => { if (ev === 'change' && el.value) { cur.month = el.value; rerender(); } };
A.mon = btn => {
  const d = Number(btn.dataset.d);
  if (cur.per === 'hafta') cur.week = addDays(cur.week, 7 * d);
  else {
    const [y, m] = cur.month.split('-').map(Number);
    const n = new Date(y, m - 1 + d, 1);
    cur.month = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  }
  rerender();
};
A.copyPeriod = () => copy($app.querySelector('[data-period-text]').value);
A.sharePeriod = () => shareSheet($app.querySelector('[data-period-text]').value, cur.per === 'hafta' ? 'Haftalık raporu gönder' : 'Aylık özeti gönder');
A.periodXlsx = async () => { try { await xl.exportPeriod(cur.periodLabel, cur.periodStats, S.branches, 'view'); } catch (e) { toast(e.message); } };
A.periodXlsxShare = async () => { try { await xl.exportPeriod(cur.periodLabel, cur.periodStats, S.branches, true); } catch (e) { toast(e.message); } };

// ============ AYARLAR ============
const toggle = (k, label, sub, def = true) => `<label class="sw"><span class="grow"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span>
  <input type="checkbox" data-field="tog" data-k="${k}" ${(def ? S.settings[k] !== false : !!S.settings[k]) ? 'checked' : ''}><i></i></label>`;

async function viewSettings() {
  $app.className = 'v-settings';
  top({ title: 'Ayarlar' });
  const hasDemo = S.audits.some(a => a.demo) || S.branches.some(b => b.demo);
  let usage = '';
  try { const e = await navigator.storage.estimate(); usage = `${(e.usage / 1048576).toFixed(1)} MB kullanılıyor`; } catch { /* desteklenmiyor */ }
  if (!location.hash.startsWith('#/ayarlar')) return;
  const items = S.templates.reduce((t, x) => t + x.items.length, 0);
  $app.innerHTML = `
    <section class="card pad">
      <header class="card-h"><h3>Raporlarda görünecek bilgiler</h3></header>
      <label class="lbl">Adın soyadın</label><input data-field="set" data-k="auditor" value="${esc(S.settings.auditor)}" autocomplete="name">
      <label class="lbl">Unvanın</label><input data-field="set" data-k="title" value="${esc(S.settings.title)}" placeholder="ör. Bölge Denetim Sorumlusu">
      <label class="lbl">Firma / birim adı</label><input data-field="set" data-k="company" value="${esc(S.settings.company)}" placeholder="Rapor başlığında yazar">
      <label class="lbl">İmzan</label>
      <button class="sign-box wide" data-act="mySign">${S.settings.signPh ? `<img data-ph="${S.settings.signPh}" alt="">` : `<span class="sign-empty">${icon('pen')} İmzanı çiz, her raporun PDF'ine eklensin</span>`}</button>
    </section>
    <a class="card row" href="#/liste">${icon('list')}<div class="grow"><b>Denetim türleri ve kontrol listeleri</b><small>${S.templates.length} tür · ${items} madde · kendi Excel'inden yükle</small></div>${icon('chevron')}</a>
    <section class="card pad">
      <header class="card-h"><h3>Görünüm</h3><small class="muted">${themeOf() === 'auto' ? 'telefonun ayarına uyar' : themeOf() === 'dark' ? 'hep koyu' : 'hep açık'}</small></header>
      <div class="seg three" role="group" aria-label="Tema">${[['auto', 'Otomatik', 'phone'], ['light', 'Açık', 'sun'], ['dark', 'Koyu', 'moon']].map(([k, l, ic]) =>
        `<button class="${themeOf() === k ? 'on' : ''}" data-act="theme" data-t="${k}" aria-pressed="${themeOf() === k}">${icon(ic)}<span>${l}</span></button>`).join('')}</div>
    </section>
    <section class="card pad set-list">
      <header class="card-h"><h3>Çalışma şekli</h3></header>
      ${toggle('stamp', 'Fotoğraflara tarih ve şube damgası', 'Fotoğrafın köşesine kanıt olarak yazılır')}
      ${toggle('geo', 'Denetim başında konumu kaydet', 'Şubede bulunduğunun kanıtı, raporda görünür')}
      ${toggle('big', 'Büyük yazı', 'Güneş altında ve küçük ekranda daha rahat okunur', false)}
      <label class="sw"><span class="grow"><b>Varsayılan denetim sıklığı</b><small>Bu kadar gün geçen şube ana sayfada hatırlatılır</small></span>
        <input class="num-in" type="number" inputmode="numeric" min="1" data-field="set" data-k="freq" value="${esc(S.settings.freq || 30)}"></label>
      <button class="sw" data-act="pin"><span class="grow"><b>Uygulama kilidi</b><small>${S.settings.pinHash ? 'Açık · açarken PIN sorulur' : 'Kapalı · telefonu başkası kullanıyorsa aç'}</small></span>${icon('lock')}</button>
    </section>
    <section class="card pad">
      <header class="card-h"><h3>Yedek ve dışa aktarma</h3></header>
      <p class="hint">Veriler yalnızca bu telefonda durur. Yedek dosyasını kendine e-postayla gönder ya da Drive'a koy. Yeni telefonda “Yedeği geri yükle” ile her şey geri gelir.</p>
      <p class="hint">${S.lastBackup ? `Son yedek: <b>${trDate(S.lastBackup)}</b>` : 'Henüz yedek alınmadı.'}${usage ? ` · ${usage}` : ''}</p>
      <div class="row-gap">
        <button class="btn primary grow" data-act="backup">${icon('download')} Yedek al</button>
        <label class="btn ghost grow">${icon('upload')} Yedeği geri yükle<input type="file" accept=".json,application/json" data-field="restore" hidden></label>
      </div>
      <div class="row-gap mt"><button class="btn ghost grow" data-act="exportAll">${icon('table')} Bütün kayıtları Excel'de aç</button>
        <label class="btn ghost grow">${icon('upload')} Excel dosyası aç<input type="file" accept=".xlsx,.xls,.csv,.ods" data-field="xlsOpen" hidden></label></div>
    </section>
    <a class="card row" href="#/yardim">${icon('help')}<div class="grow"><b>Nasıl kullanılır?</b><small>Kısa kullanım rehberi</small></div>${icon('chevron')}</a>
    <section class="card pad">
      <header class="card-h"><h3>Örnek veriler</h3></header>
      <div class="row-gap">${hasDemo
        ? `<button class="btn ghost grow" data-act="removeDemo">${icon('trash')} Örnek verileri kaldır</button>`
        : `<button class="btn ghost grow" data-act="loadDemo">${icon('refresh')} Örnek veri yükle</button>`}</div>
    </section>
    <section class="card pad">
      <header class="card-h"><h3>Uygulamayı telefona kur</h3></header>
      <p class="hint">Chrome menüsünden (⋮) <b>“Ana ekrana ekle”</b> ya da <b>“Uygulamayı yükle”</b> seç. İkon ana ekrana gelir, internet olmadan da açılır.</p>
    </section>
    <button class="btn link danger-t block" data-act="wipe">Bütün verileri sil</button>
    <p class="foot">Denetim Cebi · ücretsiz · veriler cihazda kalır</p>`;
  hydratePhotos($app);
}
F.set = el => { S.settings[el.dataset.k] = el.value; saveSoon('settings', saveSettings); };

// ---------- tema: otomatik (telefona uyar) / açık / koyu ----------
const themeOf = () => (S.settings.theme === 'light' || S.settings.theme === 'dark') ? S.settings.theme : 'auto';
function applyTheme() {
  const t = themeOf();
  const root = document.documentElement;
  if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
  // açılışta yanıp sönmesin diye index.html bu kopyayı ilk anda okur
  try { if (t === 'auto') localStorage.removeItem('dc-theme'); else localStorage.setItem('dc-theme', t); } catch { /* depolama kapalı */ }
  const [light, dark] = document.querySelectorAll('meta[name="theme-color"]');
  if (!light || !dark) return;
  if (t === 'auto') { light.media = '(prefers-color-scheme: light)'; dark.media = '(prefers-color-scheme: dark)'; }
  else { light.media = t === 'light' ? 'all' : 'not all'; dark.media = t === 'dark' ? 'all' : 'not all'; }
}
A.theme = btn => {
  S.settings.theme = btn.dataset.t;
  saveSettings();
  applyTheme();
  rerender();
};
F.tog = el => {
  S.settings[el.dataset.k] = el.checked;
  saveSettings();
  if (el.dataset.k === 'big') document.body.classList.toggle('big', el.checked);
};
A.mySign = async () => {
  const r = await signPad('İmzan', S.settings.auditor || '');
  if (!r) return;
  S.settings.signPh = await storeBlob(r.blob, 'settings'); // eski imza, eski raporlarda kalsın diye silinmez
  if (r.name) S.settings.auditor = r.name;
  await saveSettings();
  toast('İmzan kaydedildi');
  rerender();
};
A.exportAll = async () => { try { await xl.exportAll(S.audits, S.branches, 'view'); } catch (e) { toast(e.message); } };
F.xlsOpen = async (el, ev) => {
  if (ev !== 'change' || !el.files[0]) return;
  try { await xl.openWorkbook(el.files[0]); } catch { toast('Bu dosya açılamadı'); }
  el.value = '';
};

async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('denetim-cebi:' + s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
A.pin = async () => {
  if (S.settings.pinHash) {
    if (!await ask('Uygulama kilidi kaldırılsın mı?', '', 'Kaldır', true)) return;
    delete S.settings.pinHash; await saveSettings(); toast('Kilit kaldırıldı'); rerender(); return;
  }
  const w = sheet(`<h2 class="sheet-t">${icon('lock')} PIN belirle</h2>
    <p class="sheet-p">4–8 haneli bir sayı seç. Unutursan verileri silmeden açmanın yolu yok, o yüzden önce yedek al.</p>
    <form class="form" data-f>
      <label class="lbl">PIN</label><input name="a" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required autocomplete="off">
      <label class="lbl">PIN (tekrar)</label><input name="b" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required autocomplete="off">
      <div class="sheet-btns"><button type="button" class="btn ghost" data-close>Vazgeç</button><button class="btn primary" type="submit">Kilidi aç</button></div>
    </form>`);
  w.$('[data-f]').onsubmit = async e => {
    e.preventDefault();
    if (e.target.a.value !== e.target.b.value) { toast('İki PIN aynı değil'); return; }
    S.settings.pinHash = await sha(e.target.a.value);
    S.settings.pinLen = e.target.a.value.length;
    await saveSettings();
    w.close(); toast('Kilit açıldı'); rerender();
  };
};

function showLock() {
  return new Promise(res => {
    if (document.querySelector('.lock')) return;
    const el = document.createElement('div');
    el.className = 'lock';
    el.innerHTML = `<div class="lock-in"><span class="tb-logo">${LOGO}</span><h2>Denetim Cebi</h2><p>PIN kodunu gir</p>
      <input type="password" inputmode="numeric" autocomplete="off" maxlength="8" aria-label="PIN">
      <p class="lock-err" hidden>PIN yanlış</p>
      <button class="btn link" data-forgot>PIN'i unuttum</button></div>`;
    document.body.appendChild(el);
    const inp = el.querySelector('input');
    setTimeout(() => inp.focus(), 50);
    inp.oninput = async () => {
      el.querySelector('.lock-err').hidden = true;
      if (inp.value.length < 4) return;
      if (await sha(inp.value) === S.settings.pinHash) { el.remove(); res(); }
      else if (inp.value.length >= (S.settings.pinLen || 8)) { el.querySelector('.lock-err').hidden = false; inp.value = ''; navigator.vibrate?.(80); }
    };
    inp.onkeydown = async e => {
      if (e.key === 'Enter' && await sha(inp.value) !== S.settings.pinHash) { el.querySelector('.lock-err').hidden = false; inp.value = ''; }
    };
    el.querySelector('[data-forgot]').onclick = async () => {
      if (!await ask('Bütün veriler silinsin mi?', 'PIN olmadan açmanın tek yolu verileri silmek. Yedeğin varsa sonra geri yükleyebilirsin.', 'Sil ve aç', true)) return;
      for (const s of ['kv', 'branches', 'audits', 'photos']) await db.clear(s);
      location.hash = '#/'; location.reload();
    };
  });
}

A.backup = async () => {
  toast('Yedek hazırlanıyor…');
  const photos = await db.all('photos');
  const toData = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
  const data = {
    app: 'denetim-cebi', version: 2, exportedAt: new Date().toISOString(),
    settings: S.settings, templates: S.templates, branches: S.branches, audits: S.audits,
    photos: await Promise.all(photos.map(async p => ({ id: p.id, auditId: p.auditId, data: await toData(p.blob) }))),
  };
  const r = await saveFile(new Blob([JSON.stringify(data)], { type: 'application/json' }), `DenetimCebi_Yedek_${todayISO()}.json`, true);
  if (r === 'cancel') return;
  S.lastBackup = todayISO();
  await db.setKV('lastBackup', S.lastBackup);
  toast('Yedek alındı');
  rerender();
};

F.restore = async (el, ev) => {
  if (ev !== 'change' || !el.files[0]) return;
  let data;
  try { data = JSON.parse(await el.files[0].text()); } catch { toast('Dosya okunamadı'); return; }
  if (data.app !== 'denetim-cebi') { toast('Bu bir Denetim Cebi yedeği değil'); return; }
  if (!await ask('Yedek geri yüklensin mi?', `${data.audits.length} denetim, ${data.branches.length} şube. Aynı kayıtlar yedektekiyle değiştirilir, diğerleri korunur.`, 'Geri yükle')) return;
  const photos = await Promise.all(data.photos.map(async p => ({ id: p.id, auditId: p.auditId, blob: await (await fetch(p.data)).blob() })));
  await db.putMany('photos', photos);
  await db.putMany('branches', data.branches);
  await db.putMany('audits', data.audits);
  if (data.templates?.length) { S.templates = data.templates; await saveTemplates(); }
  else if (data.checklist?.length) { S.templates[0].items = data.checklist; await saveTemplates(); }
  if (data.settings) { S.settings = { ...S.settings, ...data.settings }; await saveSettings(); applyTheme(); }
  S.branches = await db.all('branches');
  S.audits = await db.all('audits');
  toast('Yedek geri yüklendi');
  render();
};

A.removeDemo = async () => {
  const b = S.branches.filter(x => x.demo);
  const bids = new Set(b.map(x => x.id));
  for (const a of S.audits.filter(x => x.demo || bids.has(x.branchId))) await deleteAudit(a);
  await db.delMany('branches', b.map(x => x.id));
  S.branches = S.branches.filter(x => !x.demo);
  toast('Örnek veriler kaldırıldı');
  rerender();
};

A.wipe = async () => {
  if (!await ask('Bütün veriler silinsin mi?', 'Şubeler, denetimler, fotoğraflar ve ayarlar kalıcı olarak silinir. Önce yedek almanı öneririm.', 'Hepsini sil', true)) return;
  for (const s of ['kv', 'branches', 'audits', 'photos']) await db.clear(s);
  location.hash = '#/';
  location.reload();
};

function viewHelp() {
  $app.className = 'v-help';
  top({ title: 'Nasıl kullanılır?', back: '#/ayarlar' });
  const sec = (ic, t, body) => `<section class="card pad help"><h3>${icon(ic)} ${t}</h3>${body}</section>`;
  $app.innerHTML = `
    ${sec('play', 'Denetime başla', `<p>Ana sayfada <b>Yeni denetim başlat</b>'a bas. Denetim türünü (şube, aktarma, araç) ve şubeyi seç. Liste hazır gelir.</p>`)}
    ${sec('check', 'Maddeleri işaretle', `<p>Her madde için <b>Uygun</b>, <b>Uygun değil</b> ya da <b>Yok</b> seç. Başlıkta sorun yoksa <b>Kalanları uygun işaretle</b> ile bir dokunuşta geç.</p>
      <p>Uygun değilse fotoğraf çek, notu mikrofona söyle ya da hazır notlardan seç. Termin kendiliğinden gelir, istersen değiştir.</p>
      <p>Turuncu çerçeveli maddeler önceki denetimde sorunluydu. Şimdi uygunsa, eski bulgu kendiliğinden kapanır.</p>`)}
    ${sec('cash', 'Kasa ve gönderi kontrolü', `<p>Listenin altındaki <b>Ek kontroller</b> bölümünde kasayı say: banknot adetlerini ve sistemdeki tutarı yaz, fark hesaplanır. Fark varsa kasa maddesi kendiliğinden işaretlenir.</p>
      <p><b>Gönderi kontrolü</b> ile depodan rastgele gönderilerin barkodunu kamerayla okut. Sorunlu olanın durumunu seç.</p>`)}
    ${sec('printer', 'Bitir ve raporla', `<p><b>Denetimi bitir</b>'e bas. Puan, rapor metni ve başlık puanları hazırlanır. Şube sorumlusu <b>İmza al</b> ile ekrana imza atar.</p>
      <p><b>PDF / Yazdır</b> → açılan pencerede “PDF olarak kaydet”. <b>Excel'i aç</b> tabloyu uygulamanın içinde gösterir, oradan indirir ya da paylaşırsın. Ayarlar'dan dışarıdan gelen bir Excel dosyasını da açabilirsin. <b>Şubeye gönder</b> bulguları WhatsApp'tan yollar.</p>`)}
    ${sec('flag', 'Bulgu takibi', `<p><b>Bulgular</b> sekmesinde açık bulgular termin sırasıyla durur. Termini geçenler kırmızıdır. <b>Hatırlat</b> şubeye hazır mesaj gönderir, <b>Kapat</b> bulguyu kanıt fotoğrafıyla kapatır. Tarihe dokunarak termini değiştirebilirsin.</p>`)}
    ${sec('calendar', 'Plan ve hatırlatma', `<p>Şube sayfasında <b>Planla</b> ile denetim günü seç. Ana sayfadaki <b>Sıradaki şubeler</b>, planlananları ve uzun süredir denetlenmeyenleri gösterir.</p>`)}
    ${sec('chart', 'Haftalık ve aylık rapor', `<p><b>Özet</b> sekmesinde hafta ya da ay seç. Yöneticiye gidecek faaliyet metni, şube sıralaması ve Excel hazırdır.</p>`)}
    ${sec('download', 'Yedek', `<p>Veriler yalnızca bu telefonda. Haftada bir <b>Ayarlar → Yedek al</b> yap ve dosyayı kendine gönder.</p>`)}`;
}

// ---------- denetim türleri ve kontrol listesi düzenleyici ----------
function viewChecklist() {
  $app.className = 'v-list';
  if (!getTpl(cur.tplEdit)) cur.tplEdit = S.templates[0].id;
  const T = getTpl(cur.tplEdit);
  top({ title: 'Kontrol listeleri', sub: `${S.templates.length} denetim türü`, back: '#/ayarlar' });
  const cats = [...new Set(T.items.map(i => i.cat))];
  const isDefault = DEFAULT_TEMPLATES.some(d => d.id === T.id);
  $app.innerHTML = `
    <div class="chips wrap">${S.templates.map(t => `<button class="chip ${t.id === T.id ? 'on' : ''}" data-act="tplSel" data-t="${t.id}">${esc(short(t.name))}</button>`).join('')}
      <button class="chip" data-act="tplNew">${icon('plus')} Yeni tür</button></div>
    <section class="card pad">
      <header class="card-h"><h3>${esc(T.name)}</h3><button class="btn link sm" data-act="tplRename">${icon('edit')} Ad</button></header>
      <p class="hint">${T.items.length} madde · ${cats.length} başlık. Değişiklikler <b>yeni başlayan</b> denetimlerde geçerli olur, eski raporlar bozulmaz.
      Şirketin listesi Excel'deyse “Kategori, Madde, Önem” sütunlarıyla yükle.</p>
      <div class="actgrid two mt">
        <label class="act">${icon('upload')}<span>Excel'den yükle</span><input type="file" accept=".xlsx,.xls,.csv" data-field="clImport" hidden></label>
        <button class="act" data-act="clExport">${icon('table')}<span>Excel'de aç</span></button>
      </div>
    </section>
    <section class="cat">
      <header class="cat-h"><h2>Başta doldurulan bilgiler</h2></header>
      <div class="card">${(T.fields || []).map((f, i) => `<button class="cl-row" data-act="fieldEdit" data-i="${i}"><span class="grow">${esc(f.label)}</span><span class="sev sev-minor">${f.type === 'num' ? 'Sayı' : 'Yazı'}</span></button>`).join('')}
        <button class="cl-row add" data-act="fieldAdd">${icon('plus')} Bilgi alanı ekle</button></div>
    </section>
    ${cats.map(cat => `<section class="cat">
      <header class="cat-h"><h2>${esc(cat)}</h2><button class="btn link sm" data-act="clRenameCat" data-cat="${esc(cat)}">${icon('edit')}</button></header>
      <div class="card">${T.items.filter(i => i.cat === cat).map(i => `
        <button class="cl-row" data-act="clEdit" data-id="${i.id}"><span class="grow">${esc(i.text)}</span><span class="sev sev-${i.sev}">${SEV[i.sev].label}</span></button>`).join('')}
        <button class="cl-row add" data-act="clAdd" data-cat="${esc(cat)}">${icon('plus')} Madde ekle</button>
      </div></section>`).join('')}
    <div class="row-gap">
      <button class="btn ghost grow" data-act="clAddCat">${icon('plus')} Yeni başlık</button>
      ${isDefault ? `<button class="btn ghost grow" data-act="clReset">${icon('refresh')} Hazır listeye dön</button>` : ''}
    </div>
    ${S.templates.length > 1 ? `<button class="btn link danger-t block" data-act="tplDel">Bu denetim türünü sil</button>` : ''}`;
}
const curTpl = () => getTpl(cur.tplEdit);
const saveTplAnd = async () => { await saveTemplates(); rerender(); };

A.tplSel = btn => { cur.tplEdit = btn.dataset.t; rerender(); };
A.tplNew = () => {
  const w = sheet(`<h2 class="sheet-t">Yeni denetim türü</h2><form class="form" data-f>
    <label class="lbl">Adı</label><input name="name" required placeholder="ör. Kasa denetimi" autocomplete="off">
    <label class="lbl">Başlangıç</label>
    <select name="from"><option value="">Boş liste</option>${S.templates.map(t => `<option value="${t.id}">${esc(t.name)} listesini kopyala</option>`).join('')}</select>
    <div class="sheet-btns"><button type="button" class="btn ghost" data-close>Vazgeç</button><button class="btn primary" type="submit">Oluştur</button></div></form>`);
  w.$('[data-f]').onsubmit = async e => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    const src = getTpl(e.target.from.value);
    const t = { id: 't' + db.uid(), name, items: src ? JSON.parse(JSON.stringify(src.items)) : [], fields: src ? JSON.parse(JSON.stringify(src.fields || [])) : [] };
    if (!t.items.length) t.items.push({ id: makeItemId('Genel', 'İlk kontrol maddesi'), cat: 'Genel', text: 'İlk kontrol maddesi', sev: 'major' });
    S.templates.push(t);
    cur.tplEdit = t.id;
    w.close();
    saveTplAnd();
  };
};
A.tplRename = () => {
  const T = curTpl();
  const w = sheet(`<h2 class="sheet-t">Türün adı</h2><form class="form" data-f><input name="n" required value="${esc(T.name)}" autocomplete="off">
    <div class="sheet-btns"><button type="button" class="btn ghost" data-close>Vazgeç</button><button class="btn primary" type="submit">Kaydet</button></div></form>`);
  w.$('[data-f]').onsubmit = e => { e.preventDefault(); const n = e.target.n.value.trim(); if (n) { T.name = n; w.close(); saveTplAnd(); } };
};
A.tplDel = async () => {
  const T = curTpl();
  if (!await ask(`“${T.name}” silinsin mi?`, 'Bu türle yapılmış eski denetimler ve raporlar silinmez.', 'Sil', true)) return;
  S.templates = S.templates.filter(t => t !== T);
  cur.tplEdit = S.templates[0].id;
  saveTplAnd();
};

function fieldForm(f) {
  const T = curTpl();
  const w = sheet(`<h2 class="sheet-t">${f ? 'Bilgi alanı' : 'Yeni bilgi alanı'}</h2>
    <p class="sheet-p">Denetimin başında doldurulan kısa bilgiler: personel sayısı, plaka, vardiya gibi.</p>
    <form class="form" data-f>
      <label class="lbl">Alan adı</label><input name="label" required value="${esc(f?.label)}" autocomplete="off">
      <div class="seg two sev-pick">${[['num', 'Sayı'], ['text', 'Yazı']].map(([k, l]) => `<label><input type="radio" name="type" value="${k}" ${(f?.type || 'num') === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <div class="sheet-btns">${f ? `<button type="button" class="btn ghost danger-t" data-del>${icon('trash')} Sil</button>` : '<button type="button" class="btn ghost" data-close>Vazgeç</button>'}
      <button class="btn primary" type="submit">Kaydet</button></div></form>`);
  w.$('[data-f]').onsubmit = e => {
    e.preventDefault();
    const label = e.target.label.value.trim(), type = new FormData(e.target).get('type');
    if (!label) return;
    T.fields = T.fields || [];
    if (f) Object.assign(f, { label, type }); else T.fields.push({ k: 'f' + db.uid(), label, type });
    w.close(); saveTplAnd();
  };
  const d = w.$('[data-del]');
  if (d) d.onclick = () => { T.fields = T.fields.filter(x => x !== f); w.close(); saveTplAnd(); };
}
A.fieldAdd = () => fieldForm(null);
A.fieldEdit = btn => fieldForm(curTpl().fields[+btn.dataset.i]);

function itemForm(item, cat) {
  const T = curTpl();
  const cats = [...new Set(T.items.map(i => i.cat))];
  const w = sheet(`<h2 class="sheet-t">${item ? 'Maddeyi düzenle' : 'Yeni madde'}</h2>
    <form class="form" data-f>
      <label class="lbl">Kontrol maddesi</label><textarea name="text" rows="3" required>${esc(item?.text)}</textarea>
      <label class="lbl">Başlık</label><select name="cat">${cats.map(c => `<option ${c === (item?.cat || cat) ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <label class="lbl">Önem</label>
      <div class="seg sev-pick">${Object.entries(SEV).map(([k, v]) => `<label><input type="radio" name="sev" value="${k}" ${k === (item?.sev || 'major') ? 'checked' : ''}><span>${v.label}<small>${v.days} gün termin</small></span></label>`).join('')}</div>
      <div class="sheet-btns">${item ? `<button type="button" class="btn ghost danger-t" data-del>${icon('trash')} Sil</button>` : '<button type="button" class="btn ghost" data-close>Vazgeç</button>'}
      <button class="btn primary" type="submit">Kaydet</button></div>
    </form>`);
  w.$('[data-f]').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const text = String(fd.get('text')).trim(), c = String(fd.get('cat')), sev = String(fd.get('sev'));
    if (!text) return;
    if (item) Object.assign(item, { text, cat: c, sev }); // kimlik değişmez, tekrar bulgu takibi bozulmaz
    else {
      const last = T.items.map(i => i.cat).lastIndexOf(c);
      T.items.splice(last + 1, 0, { id: makeItemId(c, text), cat: c, text, sev });
    }
    w.close(); saveTplAnd();
  };
  const d = w.$('[data-del]');
  if (d) d.onclick = () => { T.items = T.items.filter(i => i !== item); w.close(); saveTplAnd(); };
}
A.clEdit = btn => itemForm(curTpl().items.find(i => i.id === btn.dataset.id));
A.clAdd = btn => itemForm(null, btn.dataset.cat);
A.clAddCat = () => {
  const w = sheet(`<h2 class="sheet-t">Yeni başlık</h2><form class="form" data-f>
    <label class="lbl">Başlık adı</label><input name="cat" required autocomplete="off">
    <label class="lbl">İlk madde</label><textarea name="text" rows="2" required></textarea>
    <div class="sheet-btns"><button type="button" class="btn ghost" data-close>Vazgeç</button><button class="btn primary" type="submit">Ekle</button></div></form>`);
  w.$('[data-f]').onsubmit = e => {
    e.preventDefault();
    const cat = e.target.cat.value.trim(), text = e.target.text.value.trim();
    if (!cat || !text) return;
    curTpl().items.push({ id: makeItemId(cat, text), cat, text, sev: 'major' });
    w.close(); saveTplAnd();
  };
};
A.clRenameCat = btn => {
  const old = btn.dataset.cat;
  const w = sheet(`<h2 class="sheet-t">Başlığı değiştir</h2><form class="form" data-f>
    <input name="cat" required value="${esc(old)}" autocomplete="off">
    <div class="sheet-btns"><button type="button" class="btn ghost" data-close>Vazgeç</button><button class="btn primary" type="submit">Kaydet</button></div></form>`);
  w.$('[data-f]').onsubmit = e => {
    e.preventDefault();
    const n = e.target.cat.value.trim();
    if (!n) return;
    for (const i of curTpl().items) if (i.cat === old) i.cat = n;
    w.close(); saveTplAnd();
  };
};
A.clReset = async () => {
  const T = curTpl();
  if (!await ask('Hazır listeye dönülsün mü?', 'Bu türde yaptığın değişiklikler silinir ve hazır liste gelir.', 'Hazır listeye dön', true)) return;
  const d = cloneTemplates().find(x => x.id === T.id);
  T.items = d.items; T.fields = d.fields; T.name = d.name;
  saveTplAnd();
};
A.clExport = async () => { try { await xl.exportChecklist(curTpl(), 'view'); } catch (e) { toast(e.message); } };
F.clImport = async (el, ev) => {
  if (ev !== 'change' || !el.files[0]) return;
  try {
    const items = await xl.importChecklist(el.files[0]);
    const cats = new Set(items.map(i => i.cat)).size;
    if (!await ask(`${items.length} madde bulundu (${cats} başlık)`, `“${curTpl().name}” listesi bununla değiştirilsin mi?`, 'Listeyi değiştir')) return;
    curTpl().items = items;
    toast('Kontrol listesi yüklendi');
    saveTplAnd();
  } catch (e) { toast(e.message); }
  el.value = '';
};

function notFound() {
  top({ title: 'Bulunamadı', back: '#/' });
  $app.innerHTML = `<div class="empty">${icon('alert')}<p>Bu kayıt bulunamadı. Silinmiş olabilir.</p><a class="btn primary" href="#/">Ana sayfa</a></div>`;
}

// ---------- başlat ----------
async function boot() {
  try {
    S.settings = await db.getKV('settings', { auditor: '', title: '', company: '' });
    let tpls = await db.getKV('templates', null);
    if (!tpls) {
      // ilk sürümden geçiş: tek liste "Şube denetimi" türüne taşınır
      tpls = cloneTemplates();
      const old = await db.getKV('checklist', null);
      if (old?.length) tpls[0].items = old;
      await db.setKV('templates', tpls);
    }
    S.templates = tpls;
    S.lastBackup = await db.getKV('lastBackup', null);
    S.branches = await db.all('branches');
    S.audits = await db.all('audits');
  } catch {
    $app.innerHTML = '<div class="empty"><p>Bu tarayıcı veri saklamaya izin vermiyor. Gizli sekmede olabilirsin; normal sekmede aç.</p></div>';
    return;
  }
  document.body.classList.toggle('big', !!S.settings.big);
  applyTheme();
  // bilgisayardaki kenar menü: logo ve "Yeni denetim" düğmesi
  const sl = document.querySelector('.side-logo');
  if (sl) sl.innerHTML = LOGO;
  $tab.addEventListener('click', e => { if (e.target.closest('[data-side-new]')) pickBranch(); });
  if (S.settings.pinHash) await showLock();
  render();
  if (!S.settings.onboarded && !S.settings.auditor && !S.audits.length) setTimeout(onboarding, 400);
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
