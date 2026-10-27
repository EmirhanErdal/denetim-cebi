import { SEV, trDate, hhmm, diffDays, todayISO, money, cashTotal, shipStats, SHIP_ST, duration } from './data.js';

export const tplId = a => a.templateId || 'sube';

export function scoreOf(audit) {
  let tot = 0, got = 0, ok = 0, nok = 0, na = 0, crit = 0, unans = 0;
  for (const it of audit.items) {
    const a = audit.answers[it.id];
    if (!a || !a.r) { unans++; continue; }
    if (a.r === 'na') { na++; continue; }
    const w = SEV[it.sev].w;
    tot += w;
    if (a.r === 'ok') { got += w; ok++; } else { nok++; if (it.sev === 'kritik') crit++; }
  }
  return { score: tot ? Math.round(got / tot * 100) : null, ok, nok, na, crit, unans, total: audit.items.length };
}

// Başlık bazında puan: hangi alanın zayıf olduğu bir bakışta görünsün
export function catScores(audit) {
  const cats = [...new Set(audit.items.map(i => i.cat))];
  return cats.map(cat => scoreOf({ items: audit.items.filter(i => i.cat === cat), answers: audit.answers }))
    .map((s, i) => ({ cat: cats[i], ...s }));
}

// Kritik bulgu varsa puan ne olursa olsun not "Geliştirilmeli"den yukarı çıkmaz.
export function rating(score, crit = 0) {
  if (score == null) return '—';
  if (crit && score >= 60) return 'Geliştirilmeli';
  if (score >= 90) return 'Çok iyi';
  if (score >= 75) return 'İyi';
  if (score >= 60) return 'Geliştirilmeli';
  return 'Yetersiz';
}

// Aynı şubede, aynı türdeki bir önceki tamamlanmış denetim
export function findPrev(audit, audits) {
  return audits
    .filter(x => x.id !== audit.id && x.branchId === audit.branchId && tplId(x) === tplId(audit) && x.status === 'tamam' &&
      (x.date < audit.date || (x.date === audit.date && (x.startedAt || 0) < (audit.startedAt || 0))))
    .sort((a, b) => (b.date + (b.startedAt || 0)).localeCompare(a.date + (a.startedAt || 0)))[0] || null;
}

export function isRepeat(prev, itemId) {
  return !!(prev && prev.answers[itemId] && prev.answers[itemId].r === 'nok');
}

export function findings(audit) {
  const order = { kritik: 0, major: 1, minor: 2 };
  return audit.items
    .filter(it => audit.answers[it.id]?.r === 'nok')
    .map(it => ({ item: it, ans: audit.answers[it.id] }))
    .sort((a, b) => order[a.item.sev] - order[b.item.sev]);
}

export function infoRows(audit) {
  return (audit.fields || []).map(f => [f.label, audit.info?.[f.k]]).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
}

const sentence = s => {
  s = String(s || '').trim();
  if (!s) return '';
  s = s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);
  return /[.!?]$/.test(s) ? s : s + '.';
};

// "Kadıköy Şube" → "Kadıköy Şubesinde", "Bornova Aktarma" → "Bornova Aktarma biriminde"
function where(name) {
  const n = name.trim();
  if (/şube$/i.test(n)) return n + 'sinde';
  if (/şubesi$/i.test(n)) return n + 'nde';
  if (/müdürlüğü$/i.test(n)) return n + 'nde';
  return n + ' biriminde';
}

function listTR(arr) {
  if (arr.length <= 1) return arr.join('');
  return arr.slice(0, -1).join(', ') + ' ve ' + arr[arr.length - 1];
}

export function cashSentence(c) {
  if (!c) return '';
  const total = cashTotal(c);
  if (c.system === '' || c.system == null) return `Kasa sayımında ${money(total)} nakit sayılmıştır.`;
  const diff = Math.round((total - c.system) * 100) / 100;
  if (diff === 0) return `Kasa sayımı yapılmış; sayılan ${money(total)} tutar sistemdeki tutarla uyumludur.`;
  return `Kasa sayımında sistemde ${money(c.system)} görünürken fiili sayımda ${money(total)} tespit edilmiş, ${money(Math.abs(diff))} ${diff < 0 ? 'eksik' : 'fazla'} fark bulunmuştur.` +
    (c.note ? ' ' + sentence(c.note) : '');
}

export function shipSentence(ships) {
  const st = shipStats(ships);
  if (!st.n) return '';
  if (!st.bad) return `Örneklem olarak ${st.n} gönderi kontrol edilmiş, tamamı uygun bulunmuştur.`;
  const parts = Object.entries(st.by).filter(([k]) => k !== 'ok').map(([k, n]) => `${n} ${SHIP_ST[k].toLocaleLowerCase('tr')}`);
  return `Örneklem olarak ${st.n} gönderi kontrol edilmiş, ${st.bad} gönderide sorun tespit edilmiştir (${parts.join(', ')}).`;
}

// Kural tabanlı rapor metni: yapay zekâ ya da ücretli servis yok, tamamen telefonda üretilir.
export function buildReportText(audit, branch, prev, settings) {
  const s = scoreOf(audit);
  const name = branch?.name || audit.branchName;
  const p = [];
  const saat = audit.startedAt && audit.finishedAt ? ` saat ${hhmm(audit.startedAt)}–${hhmm(audit.finishedAt)} arasında` : '';
  const tur = (audit.templateName || 'saha denetimi').toLocaleLowerCase('tr');

  p.push(`${where(name)} ${trDate(audit.date)} tarihinde${saat} ${tur} gerçekleştirilmiştir. ` +
    `Denetimde ${s.total} madde kontrol edilmiş; ${s.ok} madde uygun, ${s.nok} madde uygun değil olarak değerlendirilmiş` +
    (s.na ? `, ${s.na} madde kapsam dışı bırakılmıştır.` : 'tir.'));

  const info = infoRows(audit);
  if (info.length) p.push('Denetim bilgileri: ' + info.map(([l, v]) => `${l.toLocaleLowerCase('tr')} ${v}`).join(', ') + '.');

  let puan = `Denetim puanı ${s.score ?? '—'}/100 olup genel değerlendirme "${rating(s.score, s.crit)}" düzeyindedir.` +
    (s.crit && s.score >= 75 ? ' Kritik bulgu bulunduğu için değerlendirme puandan bağımsız olarak bu seviyede tutulmuştur.' : '');
  if (prev) {
    const ps = scoreOf(prev).score;
    if (ps != null && s.score != null) {
      const d = s.score - ps;
      puan += d === 0
        ? ` Puan, ${trDate(prev.date)} tarihli bir önceki denetimle aynı kalmıştır.`
        : ` ${trDate(prev.date)} tarihli bir önceki denetime (${ps}/100) göre ${Math.abs(d)} puanlık ${d > 0 ? 'iyileşme' : 'düşüş'} görülmektedir.`;
    }
  }
  p.push(puan);

  const f = findings(audit);
  if (s.crit) {
    const crits = f.filter(x => x.item.sev === 'kritik');
    const minDue = crits.map(x => x.ans.due).filter(Boolean).sort()[0];
    p.push(`Denetimde ${s.crit} adet kritik bulgu tespit edilmiştir. Kritik bulguların${minDue ? ` en geç ${trDate(minDue)} tarihine kadar` : ' öncelikle'} giderilmesi gerekmektedir.`);
  } else if (s.nok) {
    p.push('Kritik seviyede bir bulguya rastlanmamıştır.');
  } else {
    p.push('Denetimde herhangi bir uygunsuzluk tespit edilmemiştir.');
  }

  if (f.length) {
    const byCat = new Map();
    for (const x of f) {
      if (!byCat.has(x.item.cat)) byCat.set(x.item.cat, []);
      byCat.get(x.item.cat).push(x);
    }
    const lines = ['Tespit edilen bulgular:'];
    for (const [cat, list] of byCat) {
      lines.push('');
      lines.push(cat);
      for (const x of list) {
        let l = `• “${x.item.text}” maddesi uygun bulunmamıştır.`;
        if (x.ans.note) l += ' ' + sentence(x.ans.note);
        l += ` (Önem: ${SEV[x.item.sev].label}${x.ans.due ? `, termin: ${trDate(x.ans.due)}` : ''})`;
        if (isRepeat(prev, x.item.id)) l += ' Bu bulgu bir önceki denetimde de tespit edilmiştir.';
        lines.push(l);
      }
    }
    p.push(lines.join('\n'));
  }

  const cs = catScores(audit).filter(c => c.score != null);
  const clean = cs.filter(c => c.nok === 0).map(c => c.cat);
  if (clean.length && f.length) p.push(`${listTR(clean)} başlık${clean.length > 1 ? 'larında' : 'ında'} tüm maddeler uygun bulunmuştur.`);
  const weak = cs.filter(c => c.nok).sort((a, b) => a.score - b.score)[0];
  if (weak && cs.length > 1 && weak.score < 80) p.push(`En düşük puanlı başlık ${weak.cat} (${weak.score}/100) olup bu alana öncelik verilmesi önerilir.`);

  const extra = [cashSentence(audit.cash), shipSentence(audit.ships)].filter(Boolean);
  if (extra.length) p.push(extra.join(' '));

  if (prev) {
    const prevF = findings(prev);
    if (prevF.length) {
      const still = prevF.filter(x => audit.answers[x.item.id]?.r === 'nok').length;
      const fixed = prevF.filter(x => audit.answers[x.item.id]?.r === 'ok').length;
      if (fixed === prevF.length) p.push(`Bir önceki denetimde tespit edilen ${prevF.length} bulgunun tamamının giderildiği görülmüştür.`);
      else p.push(`Bir önceki denetimde tespit edilen ${prevF.length} bulgudan ${fixed} tanesinin giderildiği` +
        (still ? `, ${still} tanesinin ise devam ettiği görülmüştür.` : ' görülmüştür.'));
    }
  }

  if (audit.summaryNote?.trim()) p.push('Denetçi değerlendirmesi: ' + sentence(audit.summaryNote));
  if (f.length) p.push('Bulguların belirtilen termin tarihlerine kadar giderilmesi ve giderildiğine dair fotoğraflı bilgi verilmesi rica olunur.');

  const by = [settings?.auditor, settings?.title].filter(Boolean).join(', ');
  if (by) p.push(by);
  return p.join('\n\n');
}

// Şube sorumlusuna mesajla gidecek kısa bulgu listesi (WhatsApp biçimi)
export function findingsMessage(audit, branch, settings) {
  const s = scoreOf(audit);
  const f = findings(audit);
  const out = [`*Denetim bulguları: ${branch?.name || audit.branchName}*`, `Tarih: ${trDate(audit.date)} · Puan: ${s.score ?? '—'}/100`, ''];
  if (!f.length) out.push('Denetimde uygunsuzluk tespit edilmemiştir. Teşekkürler.');
  f.forEach((x, i) => {
    out.push(`${i + 1}) ${x.item.sev === 'kritik' ? '[KRİTİK] ' : ''}${x.item.text}`);
    if (x.ans.note) out.push(`   Not: ${x.ans.note}`);
    if (x.ans.due) out.push(`   Termin: ${trDate(x.ans.due)}`);
  });
  const c = cashSentence(audit.cash), g = shipSentence(audit.ships);
  if (c || g) { out.push(''); if (c) out.push(c); if (g) out.push(g); }
  if (f.length) { out.push(''); out.push('Giderilen bulgular için fotoğraflı dönüş rica olunur.'); }
  if (settings?.auditor) out.push(settings.auditor);
  return out.join('\n');
}

export function reminderMessage(branchName, list, settings) {
  const today = todayISO();
  const out = [`*Açık denetim bulguları: ${branchName}*`, ''];
  list.forEach((x, i) => {
    const d = x.ans.due ? diffDays(today, x.ans.due) : null;
    const when = d == null ? '' : d < 0 ? ` (termin ${-d} gün geçti)` : d === 0 ? ' (termin bugün)' : ` (${d} gün kaldı)`;
    out.push(`${i + 1}) ${x.item.text}${when}`);
    if (x.ans.note) out.push(`   Not: ${x.ans.note}`);
  });
  out.push('');
  out.push('Durum hakkında bilgi verebilir misiniz? Giderilenler için fotoğraf rica ederim.');
  if (settings?.auditor) out.push(settings.auditor);
  return out.join('\n');
}

// Bir tarih aralığının (hafta ya da ay) özeti
export function periodStats(from, to, audits, branches) {
  const inR = d => d && d >= from && d <= to;
  const list = audits.filter(a => a.status === 'tamam' && inR(a.date));
  const scores = list.map(a => scoreOf(a).score).filter(v => v != null);
  const avg = scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null;
  let nok = 0, crit = 0, closed = 0, mins = 0;
  const freq = new Map();
  for (const a of list) {
    if (a.startedAt && a.finishedAt) mins += Math.round((a.finishedAt - a.startedAt) / 60000);
    for (const x of findings(a)) {
      nok++;
      if (x.item.sev === 'kritik') crit++;
      if (x.ans.closed) closed++;
      const e = freq.get(x.item.id) || { item: x.item, n: 0, branches: new Set() };
      e.n++; e.branches.add(a.branchName);
      freq.set(x.item.id, e);
    }
  }
  // bu dönemde kapatılan (hangi denetimden olursa olsun)
  let closedInPeriod = 0;
  for (const a of audits) if (a.status === 'tamam') for (const x of findings(a)) if (x.ans.closed && inR(x.ans.closedAt)) closedInPeriod++;
  const byBranch = new Map();
  for (const a of list) {
    const e = byBranch.get(a.branchId) || { name: a.branchName, scores: [], n: 0, nok: 0, crit: 0 };
    const s = scoreOf(a);
    e.n++; e.nok += s.nok; e.crit += s.crit;
    if (s.score != null) e.scores.push(s.score);
    byBranch.set(a.branchId, e);
  }
  const ranking = [...byBranch.entries()].map(([id, e]) => ({
    id, name: branches.find(b => b.id === id)?.name || e.name, n: e.n, nok: e.nok, crit: e.crit,
    avg: e.scores.length ? Math.round(e.scores.reduce((x, y) => x + y, 0) / e.scores.length) : null,
  })).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  const top = [...freq.values()].sort((a, b) => b.n - a.n).slice(0, 5);
  const ships = list.reduce((t, a) => t + (a.ships?.length || 0), 0);
  const cash = list.filter(a => a.cash).length;
  return { from, to, list, avg, nok, crit, closed, closedInPeriod, ranking, top, mins, ships, cash };
}

export function periodText(label, st, settings, weekly) {
  if (!st.list.length) return `${label} döneminde tamamlanmış denetim bulunmamaktadır.`;
  const p = [];
  p.push(`${label} ${weekly ? 'haftasında' : 'döneminde'} ${st.ranking.length} birimde toplam ${st.list.length} saha denetimi yapılmıştır` +
    (st.mins ? `; toplam denetim süresi ${duration(st.mins)}` : '') + `. Ortalama denetim puanı ${st.avg ?? '—'}/100'dür.`);
  p.push(`Denetimlerde ${st.nok} bulgu tespit edilmiş, bunların ${st.crit} tanesi kritik seviyededir. ` +
    `Bu dönemde toplam ${st.closedInPeriod} bulgu kapatılmıştır.`);
  if (st.ships || st.cash) p.push([st.cash ? `${st.cash} denetimde kasa sayımı` : '', st.ships ? `${st.ships} gönderide örneklem kontrolü` : ''].filter(Boolean).join(' ve ') + ' yapılmıştır.');
  const r = st.ranking.filter(x => x.avg != null);
  if (weekly) p.push('Ziyaret edilen birimler: ' + st.ranking.map(x => `${x.name} (${x.avg ?? '—'})`).join(', ') + '.');
  else if (r.length > 1) p.push(`En yüksek puanı ${r[0].name} (${r[0].avg}), en düşük puanı ${r[r.length - 1].name} (${r[r.length - 1].avg}) almıştır.`);
  const rep = st.top.filter(x => x.n > 1);
  if (rep.length) p.push('En sık tekrarlanan bulgular:\n' + rep.map(x => `• ${x.item.text} (${x.n} kez, ${x.branches.size} birim)`).join('\n'));
  if (settings?.auditor) p.push([settings.auditor, settings.title].filter(Boolean).join(', '));
  return p.join('\n\n');
}
