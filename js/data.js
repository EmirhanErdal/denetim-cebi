// Önem seviyeleri: puan ağırlığı ve varsayılan termin (gün)
export const SEV = {
  kritik: { label: 'Kritik', w: 5, days: 3 },
  major: { label: 'Önemli', w: 2, days: 7 },
  minor: { label: 'Düşük', w: 1, days: 15 },
};

export function parseSev(v) {
  const s = String(v || '').toLocaleLowerCase('tr').trim();
  if (/kritik|yüksek|critical|3/.test(s)) return 'kritik';
  if (/önemli|orta|major|2/.test(s)) return 'major';
  return 'minor';
}

// Aynı kategori + madde metni her zaman aynı kimliği alır; tekrar eden bulgular böyle yakalanır.
export function makeItemId(cat, text) {
  const str = (cat + '|' + text).toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'm' + (h >>> 0).toString(36);
}

const build = raw => raw.flatMap(([cat, items]) => items.map(([text, sev]) => ({ id: makeItemId(cat, text), cat, text, sev })));

const SUBE = [
  ['Şube Genel Düzen', [
    ['Tabela ve cephe temiz, sağlam ve görünür', 'minor'],
    ['Müşteri karşılama alanı temiz ve düzenli', 'minor'],
    ['Fiyat listesi ve bilgilendirme afişleri görünür yerde', 'minor'],
    ['Çalışma saatleri kapıda asılı', 'minor'],
  ]],
  ['İş Güvenliği', [
    ['Yangın tüpleri yerinde ve dolum süresi geçerli', 'kritik'],
    ['Acil çıkışlar açık, işaretli ve önü kapalı değil', 'kritik'],
    ['İlk yardım dolabı eksiksiz', 'major'],
    ['Elektrik panoları kapalı ve güvenli', 'major'],
    ['Personel koruyucu ekipman kullanıyor (eldiven, iş ayakkabısı)', 'major'],
  ]],
  ['Kargo Kabul ve Ambalaj', [
    ['Kabulde ölçü ve ağırlık doğru giriliyor', 'major'],
    ['Ambalajı uygunsuz gönderi kabul edilmiyor', 'major'],
    ['Yasaklı madde kontrolü yapılıyor', 'kritik'],
    ['Barkodlar okunur ve doğru yere yapıştırılmış', 'minor'],
  ]],
  ['Depo ve Ayrıştırma', [
    ['Gönderiler zeminde değil, raf veya palet üzerinde', 'major'],
    ['Hasarlı gönderiler ayrı alanda ve tutanaklı', 'major'],
    ['Devir gönderileri etiketli ve sistemde kayıtlı', 'major'],
    ['Kırılacak ve özel gönderiler ayrı tutuluyor', 'minor'],
    ['Depo alanı yetkisiz girişe kapalı', 'kritik'],
    ['Güvenlik kameraları çalışıyor ve kayıt alıyor', 'major'],
  ]],
  ['Dağıtım ve Teslimat', [
    ['Dağıtım öncesi el terminali okutmaları yapılıyor', 'major'],
    ['Teslim edilemeyen gönderilere doğru neden kodu girilmiş', 'major'],
    ['İade ve devir süreleri aşılmamış', 'major'],
    ['Teslimatta imza veya teslim kanıtı alınıyor', 'kritik'],
  ]],
  ['Araç ve Filo', [
    ['Ruhsat, sigorta ve muayene belgeleri geçerli', 'kritik'],
    ['Araç içi temiz, yük sabitlenmiş', 'minor'],
    ['Araç hasar kaydı güncel', 'minor'],
    ['Araç takip cihazı çalışıyor', 'major'],
  ]],
  ['Kasa ve Tahsilat', [
    ['Gün sonu kasa sayımı sistemle uyumlu', 'kritik'],
    ['Kapıda ödeme tahsilatları zamanında yatırılmış', 'kritik'],
    ['Fiş ve makbuzlar düzenli kesiliyor', 'major'],
    ['Kasa kilitli, anahtar yetkilide', 'major'],
  ]],
  ['Personel', [
    ['Kıyafet ve kimlik kartı eksiksiz', 'minor'],
    ['Müşteriye karşı tutum ve iletişim uygun', 'major'],
    ['Zorunlu eğitimler güncel', 'major'],
    ['Vardiya ve puantaj kaydı düzenli', 'minor'],
  ]],
  ['Bilgi Güvenliği (KVKK)', [
    ['Müşteri belgeleri ve listeler açıkta değil', 'kritik'],
    ['Bilgisayarlar şifreli, açık oturum bırakılmamış', 'major'],
    ['Teslim tutanakları kilitli dolapta saklanıyor', 'major'],
  ]],
];

const AKTARMA = [
  ['Güvenlik ve Giriş', [
    ['Giriş-çıkışta kimlik veya kart kontrolü yapılıyor', 'kritik'],
    ['Güvenlik kameraları çalışıyor ve kayıt alıyor', 'kritik'],
    ['Ziyaretçi kayıt defteri tutuluyor', 'major'],
    ['Araç giriş-çıkış saatleri kayıt altında', 'major'],
  ]],
  ['İş Güvenliği', [
    ['Yangın tüpleri yerinde ve dolum süresi geçerli', 'kritik'],
    ['Acil çıkışlar açık ve işaretli', 'kritik'],
    ['Forklift ve transpalet operatörleri yetkili', 'kritik'],
    ['Bant ve hat acil durdurma butonları çalışıyor', 'kritik'],
    ['Personel yelek, eldiven ve iş ayakkabısı kullanıyor', 'major'],
    ['Yaya ve araç yolları işaretli', 'major'],
  ]],
  ['Ayrıştırma ve Hat', [
    ['Gönderiler hatta doğru yöne ayrıştırılıyor', 'major'],
    ['Okutulmadan geçen gönderi yok', 'major'],
    ['Hat sonunda biriken veya bekleyen gönderi yok', 'major'],
    ['Hasarlı gönderiler ayrılıp tutanakla kayda alınıyor', 'major'],
    ['Kırılacak gönderiler elle taşınıyor', 'minor'],
  ]],
  ['Yükleme ve Sevkiyat', [
    ['Araçlar plana uygun saatte yükleniyor', 'major'],
    ['Araç kapıları mühürleniyor, mühür numarası kayıtlı', 'kritik'],
    ['Yük sabitleme ve istif kurallara uygun', 'major'],
    ['Rampada bekleme süresi makul', 'minor'],
  ]],
  ['Depo ve Düzen', [
    ['Zemin temiz, gönderiler zeminde değil', 'minor'],
    ['Devir ve bekleyen gönderi alanı etiketli', 'major'],
    ['Değerli gönderi kafesi kilitli', 'kritik'],
    ['Aydınlatma yeterli', 'minor'],
  ]],
  ['Personel ve Vardiya', [
    ['Vardiya devir teslim kaydı tutuluyor', 'major'],
    ['Personel sayısı vardiya planına uygun', 'major'],
    ['Taşeron personel kayıtları güncel', 'major'],
    ['Personel kimlik kartını takıyor', 'minor'],
  ]],
  ['Bilgi Güvenliği (KVKK)', [
    ['Gönderi listeleri ve tutanaklar açıkta değil', 'kritik'],
    ['Bilgisayar oturumları kilitli', 'major'],
  ]],
];

const ARAC = [
  ['Belgeler', [
    ['Ruhsat araçta', 'kritik'],
    ['Trafik sigortası geçerli', 'kritik'],
    ['Muayene tarihi geçerli', 'kritik'],
    ['Sürücü ehliyeti ve SRC belgesi geçerli', 'kritik'],
    ['Psikoteknik belgesi geçerli', 'major'],
  ]],
  ['Araç Durumu', [
    ['Lastikler uygun (diş derinliği, basınç)', 'kritik'],
    ['Farlar, stop ve sinyal lambaları çalışıyor', 'major'],
    ['Yeni hasar yok ya da kayda geçmiş', 'major'],
    ['Yangın tüpü ve ilk yardım çantası var', 'major'],
    ['Takip cihazı çalışıyor', 'major'],
    ['Araç içi ve dışı temiz, firma görselleri sağlam', 'minor'],
  ]],
  ['Yük ve Gönderi', [
    ['Yük alanı kilitli', 'kritik'],
    ['Araçtaki gönderiler sistemdeki listeyle uyumlu', 'kritik'],
    ['Gönderiler düzenli istiflenmiş ve sabitlenmiş', 'major'],
    ['Kişisel eşya yük alanında değil', 'minor'],
  ]],
  ['El Terminali', [
    ['El terminali çalışıyor, şarjı yeterli', 'major'],
    ['Teslimatlar anında okutuluyor', 'major'],
    ['Teslim kanıtı (imza veya fotoğraf) alınıyor', 'kritik'],
  ]],
  ['Kurye ve Tahsilat', [
    ['Üzerindeki nakit tahsilat limit içinde', 'kritik'],
    ['POS cihazı çalışıyor', 'major'],
    ['Trafik kurallarına uyuyor (emniyet kemeri, telefon)', 'kritik'],
    ['Müşteriyle iletişim uygun', 'major'],
    ['Kıyafet ve kimlik kartı eksiksiz', 'minor'],
  ]],
];

// Her denetim türünün kendi listesi ve başta doldurulan bilgi alanları var.
export const DEFAULT_TEMPLATES = [
  {
    id: 'sube', name: 'Şube denetimi', items: build(SUBE),
    fields: [
      { k: 'kadro', label: 'Kadrodaki personel', type: 'num' },
      { k: 'mevcut', label: 'Mevcut personel', type: 'num' },
      { k: 'depo', label: 'Depodaki gönderi', type: 'num' },
      { k: 'devir', label: 'Devir gönderi', type: 'num' },
    ],
  },
  {
    id: 'aktarma', name: 'Aktarma merkezi denetimi', items: build(AKTARMA),
    fields: [
      { k: 'vardiya', label: 'Vardiya', type: 'text' },
      { k: 'mevcut', label: 'Mevcut personel', type: 'num' },
      { k: 'bekleyen', label: 'Bekleyen gönderi', type: 'num' },
      { k: 'rampa', label: 'Rampadaki araç', type: 'num' },
    ],
  },
  {
    id: 'arac', name: 'Araç ve kurye denetimi', items: build(ARAC),
    fields: [
      { k: 'plaka', label: 'Plaka', type: 'text' },
      { k: 'surucu', label: 'Sürücü / kurye', type: 'text' },
      { k: 'km', label: 'Kilometre', type: 'num' },
      { k: 'gonderi', label: 'Araçtaki gönderi', type: 'num' },
    ],
  },
];
export const cloneTemplates = () => JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));

// Uygunsuz maddeye tek dokunuşla eklenen hazır notlar
export const QUICK_NOTES = ['Eksik', 'Hiç yok', 'Süresi geçmiş', 'Düzensiz', 'Kayıt tutulmuyor', 'Yerinde düzeltildi', 'Personel bilgilendirildi'];

// ---- tarih yardımcıları (yerel saat) ----
export function todayISO(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return todayISO(new Date(y, m - 1, d + n));
}
export function diffDays(a, b) { // b - a
  const t = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
}
export function mondayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return addDays(iso, -wd);
}
export function trDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}
export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
export function rangeLabel(from, to) {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${MONTHS[m2 - 1]} ${y2}`;
  if (y1 === y2) return `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
  return `${trDate(from)} – ${trDate(to)}`;
}
export function hhmm(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}
export function duration(mins) {
  if (!mins) return '0 dk';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h} sa${m ? ` ${m} dk` : ''}` : `${m} dk`;
}
export const money = n => (Number(n) || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
export function parseMoney(v) {
  let s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// ---- kasa ve gönderi kontrolü ----
export const DENOMS = [200, 100, 50, 20, 10, 5, 1];
export function cashTotal(c) {
  if (!c) return 0;
  return DENOMS.reduce((t, d) => t + d * (Number(c.counts?.[d]) || 0), 0) + (Number(c.other) || 0);
}
export const SHIP_ST = {
  ok: 'Uygun', hasar: 'Hasarlı', statu: 'Yanlış statü', bekleyen: 'Süresi geçmiş / bekleyen',
  etiket: 'Etiket / adres hatası', yok: 'Bulunamadı',
};
export function shipStats(ships) {
  const list = ships || [];
  const by = {};
  for (const s of list) by[s.st] = (by[s.st] || 0) + 1;
  return { n: list.length, bad: list.filter(s => s.st !== 'ok').length, by };
}
