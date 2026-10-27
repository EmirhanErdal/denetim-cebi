import { addDays, todayISO } from './data.js';

// Arkadaşına göstermek için örnek veri: 3 şube, son iki ayda 8 denetim. Hepsi demo:true ile işaretli.
export function makeDemo(templates) {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const t = todayISO();
  const branches = [
    { id: 'demo-b1', name: 'Kadıköy Şube', city: 'İstanbul / Kadıköy', manager: 'Murat Kaya', phone: '', freq: 30, demo: true },
    { id: 'demo-b2', name: 'Nilüfer Şube', city: 'Bursa / Nilüfer', manager: 'Selin Aydın', phone: '', freq: 30, planned: addDays(t, 1), demo: true },
    { id: 'demo-b3', name: 'Bornova Aktarma', city: 'İzmir / Bornova', manager: 'Hakan Demir', phone: '', freq: 15, demo: true },
  ];
  const notes = {
    kritik: ['Belge süresi dolmuş, yenilenmesi gerekiyor', 'Kontrol yapılmadığı görüldü', 'Tutanak yok'],
    major: ['Kısmen uygulanıyor', 'Personel bilgilendirilmeli', 'Eksik kayıt var'],
    minor: ['Düzeltilmesi gerekiyor', 'Küçük eksiklik'],
  };
  const tpl = id => templates.find(x => x.id === id) || templates[0];
  const plan = [
    ['demo-b1', 'sube', -48, 0.12], ['demo-b1', 'sube', -20, 0.08], ['demo-b1', 'sube', -2, 0.05],
    ['demo-b2', 'sube', -41, 0.25], ['demo-b2', 'sube', -9, 0.18], ['demo-b2', 'arac', -9, 0.15],
    ['demo-b3', 'aktarma', -33, 0.15], ['demo-b3', 'aktarma', -5, 0.1],
  ];
  const infoFor = id => ({
    sube: { kadro: 8, mevcut: 7, depo: 140 + Math.floor(rnd() * 60), devir: 10 + Math.floor(rnd() * 15) },
    aktarma: { vardiya: 'Gece', mevcut: 42, bekleyen: 300 + Math.floor(rnd() * 200), rampa: 6 },
    arac: { plaka: '16 ABC 284', surucu: 'Emre Şahin', km: 84210, gonderi: 63 },
  })[id] || {};
  const audits = plan.map(([bid, tid, off, p], n) => {
    const T = tpl(tid);
    const date = addDays(t, off);
    const start = new Date(date + 'T09:30:00').getTime() + n * 3600000;
    const answers = {};
    for (const it of T.items) {
      const r = rnd();
      if (r < p) {
        const list = notes[it.sev];
        const due = addDays(date, { kritik: 3, major: 7, minor: 15 }[it.sev]);
        const closed = due < t && rnd() < 0.7;
        answers[it.id] = { r: 'nok', note: list[Math.floor(rnd() * list.length)], due, photos: [],
          ...(closed ? { closed: true, closedAt: addDays(due, -1), closeNote: 'Giderildi, fotoğraf WhatsApp ile alındı' } : {}) };
      } else if (r > 0.97) answers[it.id] = { r: 'na' };
      else answers[it.id] = { r: 'ok' };
    }
    const a = {
      id: 'demo-a' + n, demo: true, branchId: bid, branchName: branches.find(b => b.id === bid).name,
      templateId: T.id, templateName: T.name, fields: T.fields.map(f => ({ ...f })), info: infoFor(T.id),
      date, startedAt: start, finishedAt: start + (55 + Math.floor(rnd() * 40)) * 60000, status: 'tamam',
      auditor: '', items: T.items.map(i => ({ ...i })), answers, summaryNote: '', reportText: null,
    };
    if (T.id === 'sube' && off > -25) {
      a.cash = { counts: { 200: 41, 100: 18, 50: 9, 20: 6, 10: 4, 5: 3 }, other: 12.5, system: off === -2 ? 10577.5 : 10727.5, note: '', at: start };
      a.ships = ['SK41207733', 'SK41207741', 'SK41208010', 'SK41208122', 'SK41208199', 'SK41208204'].map((code, i) =>
        ({ code, st: i === 2 ? 'statu' : i === 4 ? 'hasar' : 'ok', note: i === 4 ? 'Köşesi ezik, tutanak yok' : '', at: start + i * 60000 }));
    }
    return a;
  });
  return { branches, audits };
}
