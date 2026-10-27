import { SEV, trDate, parseSev, makeItemId, DENOMS, cashTotal, SHIP_ST, hhmm } from './data.js';
import { scoreOf, rating, findings, isRepeat, catScores, infoRows } from './report.js';
import { saveFile } from './ui.js';

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

async function output(X, wb, filename, share) {
  const buf = X.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return saveFile(blob, filename, share);
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
export async function exportAll(audits, branches) {
  const X = await loadXLSX();
  const wb = X.utils.book_new();
  auditSheets(X, wb, audits.filter(a => a.status === 'tamam').sort((a, b) => a.date.localeCompare(b.date)), branches);
  const b = [['Şube / birim', 'Bölge', 'Sorumlu', 'Telefon', 'Denetim sıklığı (gün)', 'Planlanan denetim']]
    .concat(branches.map(x => [x.name, x.city || '', x.manager || '', x.phone || '', x.freq || '', trDate(x.planned)]));
  X.utils.book_append_sheet(wb, sheet(X, b, [26, 18, 20, 16, 12, 14]), 'Şubeler');
  return output(X, wb, `Denetim_Tum_Kayitlar_${new Date().toISOString().slice(0, 10)}.xlsx`, false);
}

export async function exportChecklist(tpl) {
  const X = await loadXLSX();
  const wb = X.utils.book_new();
  const rows = [['Kategori', 'Madde', 'Önem']].concat(tpl.items.map(i => [i.cat, i.text, SEV[i.sev].label]));
  X.utils.book_append_sheet(wb, sheet(X, rows, [26, 60, 10]), 'Kontrol Listesi');
  return output(X, wb, `Kontrol_Listesi_${fileSafe(tpl.name)}.xlsx`, false);
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
