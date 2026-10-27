import { SEV, trDate, parseSev, makeItemId, DENOMS, cashTotal, SHIP_ST, hhmm } from './data.js';
import { scoreOf, rating, findings, isRepeat, catScores, infoRows } from './report.js';
import { saveFile, esc, icon, toast } from './ui.js';

// Excel kütüphanesi (~900 KB) yalnızca ilk ihtiyaçta yüklenir.
let xp;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xp) xp = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/xlsx.full.min.js';
    s.onload = () => res(window.XLSX);
    s.onerror = () => { xp = null; rej(new Error('Excel kütüphanesi yüklenemedi')); };
    document.head.appendChild(s);
  });
  return xp;
}

const cap = s => { s = String(s || '').trim(); return s ? s.charAt(0).toLocaleUpperCase('tr') + s.slice(1) : ''; };
const fileSafe = s => String(s || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');

function sheet(X, rows, widths) {
  const ws = X.utils.aoa_to_sheet(rows);
  if (widths) ws['!cols'] = widths.map(w => ({ wch: w }));
  return ws;
}

const durum = a => a.r !== 'nok' ? '' : a.closed ? `Kapandı (${trDate(a.closedAt)})` : a.carried ? 'Sonraki denetime devredildi' : 'Açık';
const sonuc = r => ({ ok: 'Uygun', nok: 'Uygun değil', na: 'Kapsam dışı' })[r] || 'Cevaplanmadı';

const blobOf = (X, wb) => new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })],
  { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

// mode: 'view' uygulama içinde açar; true/'share' paylaşır; false indirir
async function output(X, wb, filename, mode) {
  if (mode === 'view') { viewWorkbook(X, wb, filename, true); return 'viewed'; }
  return saveFile(blobOf(X, wb), filename, mode === true || mode === 'share');
}

// Dışarıdan gelen bir Excel dosyasını (ör. şirketin tablosu) uygulama içinde aç
export async function openWorkbook(file) {
  const X = await loadXLSX();
  const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  viewWorkbook(X, wb, file.name, false);
}

// ---------- uygulama içi Excel görüntüleyici ----------
const colName = n => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const MAX_ROWS = 3000;

function cellText(c) {
  if (!c) return '';
  if (c.v instanceof Date) {
    const d = c.v, hasTime = d.getHours() || d.getMinutes();
    return d.toLocaleDateString('tr-TR') + (hasTime ? ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '');
  }
  if (c.w != null && c.t !== 'n') return c.w;
  if (typeof c.v === 'number') return c.v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  if (typeof c.v === 'boolean') return c.v ? 'Doğru' : 'Yanlış';
  return c.v == null ? '' : String(c.v);
}

function sheetHTML(X, ws) {
  if (!ws || !ws['!ref']) return '<p class="xv-empty">Bu sayfa boş.</p>';
  const rg = X.utils.decode_range(ws['!ref']);
  const cols = ws['!cols'] || [];
  const merges = ws['!merges'] || [];
  const span = new Map(), covered = new Set();
  for (const m of merges) {
    span.set(`${m.s.r},${m.s.c}`, { rs: m.e.r - m.s.r + 1, cs: m.e.c - m.s.c + 1 });
    for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) if (r !== m.s.r || c !== m.s.c) covered.add(`${r},${c}`);
  }
  const lastR = Math.min(rg.e.r, rg.s.r + MAX_ROWS - 1);
  // başlık satırı: ilk 20 satırda, hepsi yazı olan en çok dolu hücreli satır (en az 3)
  let headR = -1, best = 2;
  for (let r = rg.s.r; r <= Math.min(lastR, rg.s.r + 20); r++) {
    let n = 0, allText = true;
    for (let c = rg.s.c; c <= rg.e.c; c++) { const cl = ws[X.utils.encode_cell({ r, c })]; if (cl && cl.v !== '' && cl.v != null) { n++; if (typeof cl.v !== 'string') allText = false; } }
    if (allText && n > best) { best = n; headR = r; }
  }
  const widths = [];
  for (let c = rg.s.c; c <= rg.e.c; c++) widths.push(Math.round(Math.min(440, Math.max(56, (cols[c]?.wch || 12) * 7.4 + 18))));
  const total = 44 + widths.reduce((t, w) => t + w, 0);
  let h = `<table class="xv-g" style="width:${total}px"><colgroup><col style="width:44px">${widths.map(w => `<col style="width:${w}px">`).join('')}</colgroup>`;
  h += `<thead><tr><th class="xv-c"></th>${widths.map((_, i) => `<th>${colName(rg.s.c + i)}</th>`).join('')}</tr></thead><tbody>`;
  for (let r = rg.s.r; r <= lastR; r++) {
    const cls = r === headR ? 'xv-head' : r === rg.s.r && headR !== r ? 'xv-first' : '';
    h += `<tr class="${cls}"><th>${r + 1}</th>`;
    for (let c = rg.s.c; c <= rg.e.c; c++) {
      const k = `${r},${c}`;
      if (covered.has(k)) continue;
      const cl = ws[X.utils.encode_cell({ r, c })];
      const sp = span.get(k);
      const num = cl && cl.t === 'n';
      h += `<td${sp ? ` colspan="${sp.cs}" rowspan="${sp.rs}"` : ''}${num ? ' class="n"' : ''}>${esc(cellText(cl))}</td>`;
    }
    h += '</tr>';
  }
  h += '</tbody></table>';
  if (rg.e.r > lastR) h += `<p class="xv-empty">İlk ${MAX_ROWS} satır gösteriliyor. Tamamı için dosyayı indir.</p>`;
  return h;
}

function viewWorkbook(X, wb, filename, canSave) {
  const el = document.createElement('div');
  el.className = 'xv';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', filename);
  el.innerHTML = `<div class="xv-in">
    <header class="xv-h">
      <span class="xv-ic">${icon('table')}</span>
      <div class="xv-t"><b>${esc(filename)}</b><small>${wb.SheetNames.length} sayfa</small></div>
      ${canSave ? `<button class="btn ghost sm" data-dl>${icon('download')}<span>İndir</span></button>
      <button class="btn ghost sm" data-sh>${icon('share')}<span>Paylaş</span></button>` : ''}
      <button class="tb-act" data-x aria-label="Kapat">${icon('x')}</button>
    </header>
    <nav class="xv-tabs">${wb.SheetNames.map((n, i) => `<button class="${i ? '' : 'on'}" data-s="${i}">${esc(n)}</button>`).join('')}</nav>
    <div class="xv-body"></div>
  </div>`;
  document.body.appendChild(el);
  document.body.classList.add('xv-open');
  const body = el.querySelector('.xv-body');
  const show = i => {
    body.innerHTML = sheetHTML(X, wb.Sheets[wb.SheetNames[i]]);
    body.scrollTo(0, 0);
    el.querySelectorAll('[data-s]').forEach(b => b.classList.toggle('on', +b.dataset.s === i));
  };
  show(0);
  requestAnimationFrame(() => el.classList.add('in'));
  const close = () => {
    el.classList.remove('in');
    document.body.classList.remove('xv-open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => el.remove(), 200);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.addEventListener('click', async e => {
    const s = e.target.closest('[data-s]');
    if (s) show(+s.dataset.s);
    if (e.target.closest('[data-x]')) close();
    if (e.target.closest('[data-dl]')) { await saveFile(blobOf(X, wb), filename, false); toast('Excel indirildi'); }
    if (e.target.closest('[data-sh]')) {
      const r = await saveFile(blobOf(X, wb), filename, true);
      if (r === 'downloaded') toast('Paylaşım desteklenmiyor, dosya indirildi');
    }
  });
}

function cashRows(c) {
  const rows = [['Kupür', 'Adet', 'Tutar']];
  for (const d of DENOMS) if (c.counts?.[d]) rows.push([`${d} ₺`, c.counts[d], d * c.counts[d]]);
  if (c.other) rows.push(['Bozuk / diğer', '', c.other]);
  const total = cashTotal(c);
  rows.push([], ['Sayılan toplam', '', total]);
  if (c.system !== '' && c.system != null) rows.push(['Sistemdeki tutar', '', c.system], ['Fark', '', Math.round((total - c.system) * 100) / 100]);
  if (c.note) rows.push([], ['Not', c.note]);
  return rows;
}

export async function exportAudit(audit, branch, prev, settings, reportText, share) {
  const X = await loadXLSX();
  const s = scoreOf(audit);
  const wb = X.utils.book_new();
  const info = infoRows(audit);
  const head = [
    [(audit.templateName || 'Saha denetimi').toLocaleUpperCase('tr') + ' FORMU'],
    [],
    ['Şube / birim', branch?.name || audit.branchName, '', 'Tarih', trDate(audit.date) + (audit.startedAt ? ` ${hhmm(audit.startedAt)}–${hhmm(audit.finishedAt)}` : '')],
    ['Bölge', branch?.city || '', '', 'Puan', s.score ?? ''],
    ['Şube sorumlusu', branch?.manager || '', '', 'Sonuç', rating(s.score, s.crit)],
    ['Denetçi', settings.auditor || audit.auditor || '', '', 'Bulgu / kritik', `${s.nok} / ${s.crit}`],
  ];
  for (let i = 0; i < info.length; i += 2) head.push([info[i][0], info[i][1], '', info[i + 1]?.[0] || '', info[i + 1]?.[1] ?? '']);
  if (audit.geo) head.push(['Konum', `${audit.geo.lat.toFixed(5)}, ${audit.geo.lng.toFixed(5)} (±${Math.round(audit.geo.acc)} m)`]);
  head.push([]);
  const hr = head.length;
  head.push(['No', 'Kategori', 'Kontrol maddesi', 'Önem', 'Sonuç', 'Açıklama', 'Termin', 'Durum', 'Tekrar', 'Foto']);
  const rows = audit.items.map((it, i) => {
    const a = audit.answers[it.id] || {};
    return [i + 1, it.cat, it.text, SEV[it.sev].label, sonuc(a.r), cap(a.note), a.r === 'nok' ? trDate(a.due) : '',
      durum(a), a.r === 'nok' && isRepeat(prev, it.id) ? 'Evet' : '', (a.photos || []).length || ''];
  });
  const ws = sheet(X, head.concat(rows), [5, 22, 46, 9, 13, 40, 11, 18, 7, 6]);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
  ws['!autofilter'] = { ref: `A${hr + 1}:J${hr + 1 + rows.length}` };
  X.utils.book_append_sheet(wb, ws, 'Denetim Formu');

  const f = findings(audit);
  const fr = [['No', 'Kategori', 'Bulgu', 'Önem', 'Açıklama', 'Termin', 'Durum', 'Tekrar']]
    .concat(f.map((x, i) => [i + 1, x.item.cat, x.item.text, SEV[x.item.sev].label, cap(x.ans.note), trDate(x.ans.due), durum(x.ans), isRepeat(prev, x.item.id) ? 'Evet' : '']));
  X.utils.book_append_sheet(wb, sheet(X, fr, [5, 22, 46, 9, 40, 11, 18, 7]), 'Bulgular');

  const cr = [['Başlık', 'Puan', 'Uygun', 'Uygun değil', 'Kapsam dışı']].concat(catScores(audit).map(c => [c.cat, c.score ?? '', c.ok, c.nok, c.na]));
  X.utils.book_append_sheet(wb, sheet(X, cr, [30, 8, 8, 12, 12]), 'Başlık Puanları');

  if (audit.cash) X.utils.book_append_sheet(wb, sheet(X, cashRows(audit.cash), [18, 10, 14]), 'Kasa Sayımı');
  if (audit.ships?.length) {
    const sr = [['No', 'Gönderi', 'Durum', 'Not', 'Saat']].concat(audit.ships.map((x, i) => [i + 1, x.code, SHIP_ST[x.st], x.note || '', hhmm(x.at)]));
    X.utils.book_append_sheet(wb, sheet(X, sr, [5, 24, 24, 34, 8]), 'Gönderi Kontrolü');
  }
  X.utils.book_append_sheet(wb, sheet(X, reportText.split('\n').map(l => [l]), [120]), 'Rapor');
  return output(X, wb, `Denetim_${fileSafe(branch?.name || audit.branchName)}_${audit.date}.xlsx`, share);
}

function auditSheets(X, wb, list, branches) {
  const bname = a => branches.find(b => b.id === a.branchId)?.name || a.branchName;
  const bcity = a => branches.find(b => b.id === a.branchId)?.city || '';
  const d = [['Tarih', 'Şube / birim', 'Bölge', 'Tür', 'Denetçi', 'Puan', 'Sonuç', 'Uygun', 'Uygun değil', 'Kritik', 'Kapsam dışı', 'Süre (dk)', 'Kasa farkı', 'Kontrol edilen gönderi', 'Sorunlu gönderi']]
    .concat(list.map(a => {
      const s = scoreOf(a);
      const diff = a.cash && a.cash.system !== '' && a.cash.system != null ? Math.round((cashTotal(a.cash) - a.cash.system) * 100) / 100 : '';
      return [trDate(a.date), bname(a), bcity(a), a.templateName || 'Şube denetimi', a.auditor || '', s.score ?? '', rating(s.score, s.crit), s.ok, s.nok, s.crit, s.na,
        a.startedAt && a.finishedAt ? Math.round((a.finishedAt - a.startedAt) / 60000) : '', diff,
        a.ships?.length || '', a.ships ? a.ships.filter(x => x.st !== 'ok').length || '' : ''];
    }));
  X.utils.book_append_sheet(wb, sheet(X, d, [11, 24, 16, 22, 18, 7, 14, 8, 11, 7, 11, 9, 11, 12, 12]), 'Denetimler');

  const f = [['Tarih', 'Şube / birim', 'Tür', 'Kategori', 'Bulgu', 'Önem', 'Açıklama', 'Termin', 'Durum', 'Kapanış notu']];
  for (const a of list) for (const x of findings(a)) {
    f.push([trDate(a.date), bname(a), a.templateName || 'Şube denetimi', x.item.cat, x.item.text, SEV[x.item.sev].label, cap(x.ans.note), trDate(x.ans.due), durum(x.ans), x.ans.closeNote || '']);
  }
  X.utils.book_append_sheet(wb, sheet(X, f, [11, 24, 20, 22, 46, 9, 40, 11, 18, 30]), 'Bulgular');

  const g = [['Tarih', 'Şube / birim', 'Gönderi', 'Durum', 'Not']];
  for (const a of list) for (const x of a.ships || []) g.push([trDate(a.date), bname(a), x.code, SHIP_ST[x.st], x.note || '']);
  if (g.length > 1) X.utils.book_append_sheet(wb, sheet(X, g, [11, 24, 24, 24, 34]), 'Gönderiler');
}

export async function exportPeriod(label, st, branches, share) {
  const X = await loadXLSX();
  const wb = X.utils.book_new();
  auditSheets(X, wb, [...st.list].sort((a, b) => a.date.localeCompare(b.date)), branches);
  const r = [['Sıra', 'Şube / birim', 'Denetim sayısı', 'Ortalama puan', 'Bulgu', 'Kritik']]
    .concat(st.ranking.map((x, i) => [i + 1, x.name, x.n, x.avg ?? '', x.nok, x.crit]));
  X.utils.book_append_sheet(wb, sheet(X, r, [6, 26, 14, 14, 8, 8]), 'Sıralama');
  return output(X, wb, `Denetim_Ozeti_${fileSafe(label)}.xlsx`, share);
}

// Bütün kayıtlar tek dosyada (yedek değil, okumak ve paylaşmak için)
export async function exportAll(audits, branches, mode = false) {
  const X = await loadXLSX();
  const wb = X.utils.book_new();
  auditSheets(X, wb, audits.filter(a => a.status === 'tamam').sort((a, b) => a.date.localeCompare(b.date)), branches);
  const b = [['Şube / birim', 'Bölge', 'Sorumlu', 'Telefon', 'Denetim sıklığı (gün)', 'Planlanan denetim']]
    .concat(branches.map(x => [x.name, x.city || '', x.manager || '', x.phone || '', x.freq || '', trDate(x.planned)]));
  X.utils.book_append_sheet(wb, sheet(X, b, [26, 18, 20, 16, 12, 14]), 'Şubeler');
  return output(X, wb, `Denetim_Tum_Kayitlar_${new Date().toISOString().slice(0, 10)}.xlsx`, mode);
}

export async function exportChecklist(tpl, mode = false) {
  const X = await loadXLSX();
  const wb = X.utils.book_new();
  const rows = [['Kategori', 'Madde', 'Önem']].concat(tpl.items.map(i => [i.cat, i.text, SEV[i.sev].label]));
  X.utils.book_append_sheet(wb, sheet(X, rows, [26, 60, 10]), 'Kontrol Listesi');
  return output(X, wb, `Kontrol_Listesi_${fileSafe(tpl.name)}.xlsx`, mode);
}

// Kendi Excel'indeki listeyi içeri al: "Kategori", "Madde" (zorunlu) ve "Önem" (isteğe bağlı) sütunları aranır.
export async function importChecklist(file) {
  const X = await loadXLSX();
  const wb = X.read(await file.arrayBuffer(), { type: 'array' });
  const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const low = v => String(v).toLocaleLowerCase('tr').trim();
  let hi = -1, ci = -1, ti = -1, si = -1;
  // önce hem madde hem kategori sütunu olan satırı ara, bulunamazsa yalnız madde sütunu olanı
  for (const strict of [true, false]) {
    for (let r = 0; r < Math.min(rows.length, 15) && hi < 0; r++) {
      const row = rows[r].map(low);
      const t = row.findIndex(v => /madde|soru|kontrol/.test(v) && v.length < 30);
      const c = row.findIndex(v => /kategori|başlık|bölüm|alan/.test(v) && v.length < 30);
      if (t >= 0 && (c >= 0 || !strict)) {
        hi = r; ti = t; ci = c;
        si = row.findIndex(v => /önem|seviye|derece|risk/.test(v));
      }
    }
    if (hi >= 0) break;
  }
  if (hi < 0) throw new Error('Başlık satırında "Madde" sütunu bulunamadı.');
  const items = [];
  let lastCat = 'Genel';
  for (const row of rows.slice(hi + 1)) {
    const text = String(row[ti] || '').trim();
    const cat = ci >= 0 && String(row[ci]).trim() ? String(row[ci]).trim() : lastCat;
    lastCat = cat;
    if (!text) continue;
    const id = makeItemId(cat, text);
    if (items.some(i => i.id === id)) continue;
    items.push({ id, cat, text, sev: si >= 0 ? parseSev(row[si]) : 'major' });
  }
  if (!items.length) throw new Error('Dosyada madde bulunamadı.');
  return items;
}
