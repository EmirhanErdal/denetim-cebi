// Denetim içindeki yardımcı araçlar: kasa sayımı, barkodlu gönderi kontrolü, imza, fotoğraf üzerine çizim.
import * as db from './db.js';
import { DENOMS, cashTotal, money, parseMoney, SHIP_ST, shipStats, hhmm } from './data.js';
import { esc, icon, sheet, toast, ask, micBtn, photoSrc, forgetPhoto } from './ui.js';

// ---------- kasa sayımı ----------
export function openCash(audit, onSave) {
  const c = audit.cash || { counts: {}, other: '', system: '', note: '' };
  const w = sheet(`<h2 class="sheet-t">${icon('cash')} Kasa sayımı</h2>
    <p class="sheet-p">Her banknottan kaç adet olduğunu yaz, toplamı uygulama hesaplar.</p>
    <div class="cash">${DENOMS.map(d => `
      <label class="cash-r"><span class="cd">${d} ₺</span>
        <input type="number" inputmode="numeric" min="0" placeholder="0" data-d="${d}" value="${c.counts?.[d] || ''}">
        <span class="cs" data-s="${d}"></span></label>`).join('')}
      <label class="cash-r"><span class="cd">Bozuk / diğer</span>
        <input type="text" inputmode="decimal" placeholder="0,00" data-other value="${c.other ? String(c.other).replace('.', ',') : ''}"><span class="cs"></span></label>
    </div>
    <div class="cash-sum"><span>Sayılan toplam</span><b data-total></b></div>
    <label class="lbl">Sistemde görünen tutar (₺)</label>
    <input type="text" inputmode="decimal" placeholder="ör. 12.450,00" data-sys value="${c.system !== '' && c.system != null ? String(c.system).replace('.', ',') : ''}">
    <div class="cash-diff" data-diff></div>
    <label class="lbl">Not</label>
    <div class="note"><textarea rows="2" data-note placeholder="Farkın nedeni, kasada bulunan diğer belgeler…">${esc(c.note || '')}</textarea>${micBtn()}</div>
    <div class="sheet-btns">${audit.cash ? '<button class="btn ghost danger-t" data-del>Sayımı sil</button>' : '<button class="btn ghost" data-close>Vazgeç</button>'}
    <button class="btn primary" data-ok>${icon('check')} Kaydet</button></div>`, { cls: 'tall' });

  const read = () => {
    const counts = {};
    w.querySelectorAll('[data-d]').forEach(i => { const v = parseInt(i.value, 10); if (v > 0) counts[i.dataset.d] = v; });
    const sysRaw = w.$('[data-sys]').value.trim();
    return { counts, other: parseMoney(w.$('[data-other]').value), system: sysRaw === '' ? '' : parseMoney(sysRaw), note: w.$('[data-note]').value.trim() };
  };
  const calc = () => {
    const cur = read();
    for (const d of DENOMS) w.$(`[data-s="${d}"]`).textContent = cur.counts[d] ? money(cur.counts[d] * d) : '';
    const total = cashTotal(cur);
    w.$('[data-total]').textContent = money(total);
    const el = w.$('[data-diff]');
    if (cur.system === '') { el.innerHTML = ''; el.className = 'cash-diff'; return; }
    const diff = Math.round((total - cur.system) * 100) / 100;
    el.className = 'cash-diff ' + (diff === 0 ? 'ok' : 'bad');
    el.innerHTML = diff === 0 ? `${icon('check')} Kasa sistemle uyumlu`
      : `${icon('alert')} ${diff < 0 ? 'Eksik' : 'Fazla'}: <b>${money(Math.abs(diff))}</b>`;
  };
  w.addEventListener('input', calc);
  calc();
  w.$('[data-ok]').onclick = () => {
    const cur = read();
    audit.cash = { ...cur, at: Date.now() };
    w.close();
    onSave(audit.cash);
  };
  const del = w.$('[data-del]');
  if (del) del.onclick = async () => {
    w.close();
    if (await ask('Kasa sayımı silinsin mi?', '', 'Sil', true)) { delete audit.cash; onSave(null); }
  };
}

export function cashDiff(c) {
  if (!c || c.system === '' || c.system == null) return null;
  return Math.round((cashTotal(c) - c.system) * 100) / 100;
}

// ---------- gönderi kontrolü (barkod) ----------
const BD = 'BarcodeDetector' in window;

export function openShips(audit, onSave) {
  audit.ships = audit.ships || [];
  let stream = null, running = false, lastCode = '', lastAt = 0;
  const w = sheet(`<h2 class="sheet-t">${icon('barcode')} Gönderi kontrolü</h2>
    <p class="sheet-p">Depodan rastgele gönderiler seç. Barkodu okut ya da numarayı yaz. Sorunlu olanın durumunu değiştir.</p>
    ${BD ? `<button class="btn primary block" data-scan>${icon('camera')} Kamerayla okut</button>
      <div class="scanner" hidden><video playsinline muted></video><span class="scan-line"></span>
      <button class="btn ghost sm" data-stop>Okutmayı bitir</button></div>` : ''}
    <form class="inline-add" data-add>
      <input name="code" placeholder="Gönderi / barkod no" autocomplete="off" autocapitalize="characters">
      <button class="btn ${BD ? 'ghost' : 'primary'}" type="submit">${icon('plus')} Ekle</button>
    </form>
    <div class="ship-sum" data-sum></div>
    <div class="ship-list" data-list></div>
    <div class="sheet-btns"><button class="btn primary" data-close>Tamam</button></div>`, { cls: 'tall', onClose: () => { stop(); onSave(); } });

  const opts = st => Object.entries(SHIP_ST).map(([k, v]) => `<option value="${k}" ${k === st ? 'selected' : ''}>${v}</option>`).join('');
  const draw = () => {
    const st = shipStats(audit.ships);
    w.$('[data-sum]').innerHTML = st.n
      ? `<b>${st.n}</b> gönderi kontrol edildi · ${st.bad ? `<em>${st.bad} sorunlu</em>` : 'hepsi uygun'}`
      : '<span>Henüz gönderi eklenmedi.</span>';
    w.$('[data-list]').innerHTML = [...audit.ships].map((s, i) => ({ s, i })).reverse().map(({ s, i }) => `
      <div class="ship-r ${s.st !== 'ok' ? 'bad' : ''}" data-i="${i}">
        <div class="ship-top"><b class="grow">${esc(s.code)}</b><small>${hhmm(s.at)}</small>
          <button class="icon-btn" data-del aria-label="Sil">${icon('x')}</button></div>
        <select data-st>${opts(s.st)}</select>
        ${s.st !== 'ok' ? `<input data-n placeholder="Not (isteğe bağlı)" value="${esc(s.note || '')}">` : ''}
      </div>`).join('');
  };
  const add = code => {
    code = String(code || '').trim().toUpperCase();
    if (!code) return false;
    if (audit.ships.some(s => s.code === code)) { toast('Bu gönderi zaten listede'); navigator.vibrate?.([30, 60, 30]); return false; }
    audit.ships.push({ code, st: 'ok', note: '', at: Date.now() });
    navigator.vibrate?.(60);
    beep();
    draw();
    onSave();
    return true;
  };

  w.$('[data-add]').onsubmit = e => { e.preventDefault(); if (add(e.target.code.value)) e.target.code.value = ''; };
  w.$('[data-list]').addEventListener('change', e => {
    const r = e.target.closest('[data-i]'); if (!r) return;
    const s = audit.ships[+r.dataset.i];
    if (e.target.matches('[data-st]')) { s.st = e.target.value; draw(); }
    if (e.target.matches('[data-n]')) s.note = e.target.value.trim();
    onSave();
  });
  w.$('[data-list]').addEventListener('click', e => {
    if (!e.target.closest('[data-del]')) return;
    const r = e.target.closest('[data-i]');
    audit.ships.splice(+r.dataset.i, 1);
    draw(); onSave();
  });

  async function start() {
    const box = w.$('.scanner'), video = box.querySelector('video');
    try {
      const formats = await BarcodeDetector.getSupportedFormats();
      const det = new BarcodeDetector({ formats });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = stream;
      await video.play();
      box.hidden = false; w.$('[data-scan]').hidden = true;
      running = true;
      const loop = async () => {
        if (!running) return;
        try {
          const codes = await det.detect(video);
          for (const c of codes) {
            const now = Date.now();
            if (c.rawValue === lastCode && now - lastAt < 2500) continue;
            lastCode = c.rawValue; lastAt = now;
            if (add(c.rawValue)) toast(`Eklendi: ${c.rawValue}`);
          }
        } catch { /* kare okunamadı */ }
        setTimeout(loop, 250);
      };
      loop();
    } catch (e) {
      stop();
      toast(e.name === 'NotAllowedError' ? 'Kamera izni verilmedi' : 'Kamera açılamadı, numarayı elle yaz');
    }
  }
  function stop() {
    running = false;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    const box = w.$('.scanner');
    if (box) { box.hidden = true; w.$('[data-scan]').hidden = false; }
  }
  if (BD) { w.$('[data-scan]').onclick = start; w.$('[data-stop]').onclick = stop; }
  draw();
}

let actx;
function beep() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = 1300; g.gain.value = 0.08;
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + 0.09);
  } catch { /* ses yok */ }
}

// ---------- imza ----------
export function signPad(title, name = '', askName = true) {
  return new Promise(res => {
    let done = false;
    const w = sheet(`<h2 class="sheet-t">${icon('pen')} ${esc(title)}</h2>
      ${askName ? `<label class="lbl">Ad soyad</label><input data-name value="${esc(name)}" autocomplete="off">` : ''}
      <p class="sheet-p">Aşağıdaki alana parmağınla imza at.</p>
      <canvas class="sign-pad"></canvas>
      <div class="sheet-btns"><button class="btn ghost" data-clear>${icon('undo')} Temizle</button><button class="btn primary" data-ok>${icon('check')} Kaydet</button></div>`,
      { onClose: () => { if (!done) res(null); } });
    const cv = w.$('canvas');
    const dpr = window.devicePixelRatio || 1;
    const setup = () => {
      const r = cv.getBoundingClientRect();
      cv.width = r.width * dpr; cv.height = r.height * dpr;
      const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      g.lineWidth = 2.6 * dpr; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111';
    };
    requestAnimationFrame(setup);
    let drawing = false, empty = true, last;
    const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]; };
    cv.addEventListener('pointerdown', e => { drawing = true; last = pos(e); cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      if (!drawing) return;
      const g = cv.getContext('2d'), p = pos(e);
      g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke();
      last = p; empty = false;
    });
    cv.addEventListener('pointerup', () => { drawing = false; });
    w.$('[data-clear]').onclick = () => { setup(); empty = true; };
    w.$('[data-ok]').onclick = () => {
      if (empty) { toast('Önce imza at'); return; }
      const nm = w.$('[data-name]')?.value.trim() ?? name;
      cv.toBlob(b => { done = true; res({ blob: b, name: nm }); w.close(); }, 'image/png');
    };
  });
}

// ---------- fotoğraf görüntüleme ve üzerine çizim ----------
export async function viewPhoto(id, { onDelete, onChange } = {}) {
  const src = await photoSrc(id);
  const w = sheet(`<div class="ph-stage"><img class="ph-big" src="${src}" alt=""></div>
    <div class="sheet-btns">
      ${onChange ? `<button class="btn ghost" data-draw>${icon('pen')} Üzerine çiz</button>` : ''}
      ${onDelete ? `<button class="btn ghost danger-t" data-del>${icon('trash')} Sil</button>` : ''}
      <button class="btn primary" data-close>Kapat</button></div>`);
  const d = w.$('[data-del]');
  if (d) d.onclick = async () => { w.close(); if (await ask('Fotoğraf silinsin mi?', '', 'Sil', true)) onDelete(); };
  const dr = w.$('[data-draw]');
  if (dr) dr.onclick = () => { w.close(); drawOn(id, onChange); };
}

async function drawOn(id, onChange) {
  const p = await db.get('photos', id);
  const bmp = await createImageBitmap(p.blob);
  const w = sheet(`<h2 class="sheet-t">Sorunlu yeri işaretle</h2>
    <div class="ph-stage"><canvas class="ph-draw"></canvas></div>
    <div class="sheet-btns"><button class="btn ghost" data-undo>${icon('undo')} Geri al</button>
    <button class="btn ghost" data-close>Vazgeç</button><button class="btn primary" data-ok>${icon('check')} Kaydet</button></div>`);
  const cv = w.$('canvas');
  cv.width = bmp.width; cv.height = bmp.height;
  const g = cv.getContext('2d');
  g.drawImage(bmp, 0, 0);
  g.strokeStyle = '#ff2d2d'; g.lineWidth = Math.max(5, cv.width / 140); g.lineCap = 'round'; g.lineJoin = 'round';
  const strokes = [];
  let curS = null;
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  const redraw = () => {
    g.drawImage(bmp, 0, 0);
    for (const s of strokes) { g.beginPath(); g.moveTo(...s[0]); for (const q of s.slice(1)) g.lineTo(...q); g.stroke(); }
  };
  cv.addEventListener('pointerdown', e => { curS = [pos(e)]; strokes.push(curS); cv.setPointerCapture(e.pointerId); e.preventDefault(); });
  cv.addEventListener('pointermove', e => {
    if (!curS) return;
    const q = pos(e), l = curS[curS.length - 1];
    curS.push(q);
    g.beginPath(); g.moveTo(...l); g.lineTo(...q); g.stroke();
  });
  cv.addEventListener('pointerup', () => { curS = null; });
  w.$('[data-undo]').onclick = () => { strokes.pop(); redraw(); };
  w.$('[data-ok]').onclick = () => {
    cv.toBlob(async b => {
      await db.put('photos', { ...p, blob: b });
      forgetPhoto(id);
      w.close();
      toast('Fotoğraf kaydedildi');
      onChange();
    }, 'image/jpeg', 0.8);
  };
}
