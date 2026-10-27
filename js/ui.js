// Ekranların ortak parçaları: simgeler, alt pencere, bildirim, paylaşma, fotoğraf, sesli not.
import * as db from './db.js';
import { trDate, hhmm, todayISO } from './data.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const cap = s => { s = String(s || '').trim(); return s ? s.charAt(0).toLocaleUpperCase('tr') + s.slice(1) : ''; };

const I = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  minus: '<path d="M6 12h12"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v1.5a3 3 0 01-5.3 1.9 3 3 0 01-5.4 0A3 3 0 014 10.5z"/><path d="M5 12.5V20h14v-7.5"/>',
  chart: '<path d="M5 20V11M11 20V5M17 20v-6M3 20h18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  bell: '<path d="M6 16v-5a6 6 0 0112 0v5l2 2H4z"/><path d="M10 21h4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 21h14"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>',
  barcode: '<path d="M4 5v14M7 5v14M11 5v14M14 5v14M18 5v14M20 5v14"/>',
  pen: '<path d="M3 21c3-1 5-4 7-4s1 3 4 3 4-3 7-3"/><path d="M14 4l3 3-7 7H7v-3z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17v.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
};
export const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[n] || ''}</svg>`;

let toastT;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- alt pencere ----------
export function sheet(html, { onClose, cls = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet ${cls}" role="dialog" aria-modal="true"><div class="sheet-grip"></div>${html}</div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    wrap.classList.remove('in');
    setTimeout(() => wrap.remove(), 220);
    onClose && onClose();
  };
  wrap.addEventListener('click', e => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
    const m = e.target.closest('[data-act="mic"]');
    if (m) startMic(m);
  });
  wrap.close = close;
  wrap.$ = sel => wrap.querySelector(sel);
  return wrap;
}

export function ask(title, body, okLabel = 'Tamam', danger = false) {
  return new Promise(res => {
    const w = sheet(`<h2 class="sheet-t">${esc(title)}</h2>${body ? `<p class="sheet-p">${esc(body)}</p>` : ''}
      <div class="sheet-btns"><button class="btn ghost" data-close>Vazgeç</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button></div>`, { onClose: () => res(false) });
    w.$('[data-ok]').onclick = () => { res(true); w.close(); };
  });
}

export function pickDate(title, value, { clearLabel } = {}) {
  return new Promise(res => {
    const w = sheet(`<h2 class="sheet-t">${esc(title)}</h2>
      <input type="date" data-d value="${value || todayISO()}">
      <div class="sheet-btns">${clearLabel ? `<button class="btn ghost" data-clear>${esc(clearLabel)}</button>` : '<button class="btn ghost" data-close>Vazgeç</button>'}
      <button class="btn primary" data-ok>Kaydet</button></div>`, { onClose: () => res(undefined) });
    w.$('[data-ok]').onclick = () => { res(w.$('[data-d]').value || undefined); w.close(); };
    const c = w.$('[data-clear]');
    if (c) c.onclick = () => { res(null); w.close(); };
  });
}

// ---------- paylaşma ----------
export function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  return d;
}

export function shareSheet(text, title, branch) {
  const num = waNumber(branch?.phone);
  const w = sheet(`<h2 class="sheet-t">${esc(title)}</h2>
    <pre class="msg-preview">${esc(text)}</pre>
    <div class="sheet-list">
      ${num ? `<button class="row-btn" data-wa="${num}">${icon('chat')}<span><b>WhatsApp: ${esc(branch.manager || branch.name)}</b><small>Doğrudan şube sorumlusuna gönder</small></span></button>` : ''}
      <button class="row-btn" data-share>${icon('share')}<span><b>Paylaş…</b><small>WhatsApp, e-posta, SMS</small></span></button>
      <button class="row-btn" data-copy>${icon('copy')}<span><b>Metni kopyala</b><small>İstediğin yere yapıştır</small></span></button>
    </div>
    ${!num && branch ? `<p class="hint">İpucu: Şubeye sorumlunun telefonunu eklersen mesaj tek dokunuşla ona gider.</p>` : ''}`);
  const wa = w.$('[data-wa]');
  if (wa) wa.onclick = () => { window.open(`https://wa.me/${wa.dataset.wa}?text=${encodeURIComponent(text)}`, '_blank'); w.close(); };
  w.$('[data-share]').onclick = async () => {
    if (navigator.share) {
      try { await navigator.share({ title, text }); w.close(); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
    w.close();
  };
  w.$('[data-copy]').onclick = async () => { await copy(text); w.close(); };
}

export async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = document.createElement('textarea');
    t.value = text; document.body.appendChild(t); t.select();
    document.execCommand('copy'); t.remove();
  }
  toast('Kopyalandı');
}

export async function saveFile(blob, name, share) {
  const file = new File([blob], name, { type: blob.type });
  if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancel'; }
  }
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
  return 'downloaded';
}

// ---------- fotoğraf ----------
const photoURL = new Map();
export async function photoSrc(id) {
  if (photoURL.has(id)) return photoURL.get(id);
  const p = await db.get('photos', id);
  if (!p) return '';
  const u = URL.createObjectURL(p.blob);
  photoURL.set(id, u);
  return u;
}
export function forgetPhoto(id) {
  const u = photoURL.get(id);
  if (u) { URL.revokeObjectURL(u); photoURL.delete(id); }
}
export function hydratePhotos(root) {
  root.querySelectorAll('img[data-ph]').forEach(async img => { img.src = await photoSrc(img.dataset.ph); });
}

async function loadBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im); im.onerror = rej;
      im.src = URL.createObjectURL(file);
    });
  }
}

// Küçültür ve isteğe bağlı olarak alt köşeye "tarih saat · şube" damgası basar (kanıt değeri için).
export async function compress(file, stamp) {
  const MAX = 1600;
  const bmp = await loadBitmap(file);
  const r = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
  const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0, c.width, c.height);
  if (stamp) {
    const when = new Date(file.lastModified || Date.now());
    const text = `${trDate(todayISO(when))} ${hhmm(when)} · ${stamp}`;
    const fs = Math.max(14, Math.round(c.width * 0.028));
    g.font = `600 ${fs}px system-ui, sans-serif`;
    const pad = Math.round(fs * 0.5);
    const tw = g.measureText(text).width;
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.fillRect(0, c.height - fs - pad * 2, tw + pad * 2, fs + pad * 2);
    g.fillStyle = '#fff';
    g.textBaseline = 'middle';
    g.fillText(text, pad, c.height - pad - fs / 2);
  }
  return new Promise(res => c.toBlob(b => res(b || file), 'image/jpeg', 0.72));
}

export async function storePhotos(files, auditId, stamp) {
  const ids = [];
  for (const f of files) {
    const blob = await compress(f, stamp);
    const id = db.uid();
    await db.put('photos', { id, auditId, blob });
    ids.push(id);
  }
  return ids;
}

export async function storeBlob(blob, auditId) {
  const id = db.uid();
  await db.put('photos', { id, auditId, blob });
  return id;
}

export function thumbs(ids, act = 'viewPhoto') {
  return (ids || []).map(id => `<button class="thumb" type="button" data-act="${act}" data-ph="${id}" aria-label="Fotoğrafı aç"><img data-ph="${id}" alt=""></button>`).join('');
}

export function autosize(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 4 + 'px'; };
  fit(); ta.addEventListener('input', fit);
}

// ---------- sesli not (tarayıcının kendi ücretsiz ses tanıması) ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
export const micBtn = () => SR ? `<button class="mic" type="button" data-act="mic" aria-label="Sesle yaz">${icon('mic')}</button>` : '';
export function stopMic() { if (rec) rec.stop(); }
export function startMic(btn) {
  const ta = btn.parentElement.querySelector('textarea, input');
  if (rec) { rec.stop(); return; }
  rec = new SR();
  rec.lang = 'tr-TR';
  rec.interimResults = false;
  rec.continuous = false;
  btn.classList.add('live');
  rec.onresult = e => {
    const t = Array.from(e.results).map(r => r[0].transcript).join(' ').trim();
    if (!t) return;
    ta.value = (ta.value.trim() ? ta.value.trim() + ' ' : '') + t;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
  rec.onerror = e => toast(e.error === 'not-allowed' ? 'Mikrofon izni verilmedi' : e.error === 'network' ? 'Sesli yazma için internet gerekiyor' : 'Ses anlaşılamadı, tekrar dene');
  rec.onend = () => { btn.classList.remove('live'); rec = null; };
  try { rec.start(); toast('Dinliyorum… konuş'); } catch { rec = null; btn.classList.remove('live'); }
}
