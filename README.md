# Denetim Cebi

Kargo şubeleri için telefondan saha denetimi. Ücretsiz, sunucusuz. Bütün veriler telefonun içinde kalır.

- Üç hazır denetim türü var: şube, aktarma merkezi, araç ve kurye. Her türün kendi listesi ve bilgi alanları (personel, plaka, km…) var. Yeni tür eklenebilir.
- Kontrol listesini işaretle. Uygunsuz maddeye fotoğraf çek. Notu sesle yaz ya da hazır notlardan seç; uygulama önceki notlardan öğrenir.
- Fotoğraflara tarih/saat/şube damgası basılır, üzerine kırmızı kalemle işaret konabilir.
- Kasa sayımı: kupür adetleri girilir, fark hesaplanır, farkı kasa maddesine kendiliğinden işler.
- Gönderi kontrolü: barkod kamerayla okunur (Android Chrome) ya da elle yazılır.
- Denetim başında konum kaydedilir (isteğe bağlı).
- "Bitir"e basınca rapor metni, başlık puanları, PDF ve Excel kendiliğinden hazırlanır. Şube sorumlusu ekrana imza atar.
- Bulgular termin tarihleriyle takibe girer, arama ve termin değiştirme var, hatırlatma WhatsApp'tan gider.
- Önceki denetimdeki bulgu yeni denetimde uygun çıkarsa kendiliğinden kapanır.
- Şubelere denetim planı ve sıklığı verilir; ana sayfa sıradaki şubeleri gösterir.
- Haftalık faaliyet raporu ve aylık özet: metin, şube sıralaması, Excel.
- Kontrol listesi kendi Excel'inden yüklenebilir ("Kategori, Madde, Önem" sütunları).
- PIN kilidi, büyük yazı, yedek al/geri yükle, bütün kayıtları Excel'e aktarma.

## Çalıştırma

Derleme yok, düz HTML/JS. GitHub Pages'te depo kökünden yayınlanır.
Yerelde denemek için:

```
python -m http.server 8790
```

## Dosyalar

- `js/app.js`: ekranlar ve olaylar
- `js/ui.js`: ortak parçalar (alt pencere, paylaşma, fotoğraf, sesli not)
- `js/tools.js`: kasa sayımı, barkod, imza, fotoğraf üzerine çizim
- `js/report.js`: puanlama ve kural tabanlı rapor metni
- `js/excel.js`: Excel çıktıları ve liste içe aktarma (SheetJS, `vendor/`)
- `js/data.js`: hazır kontrol listesi, önem seviyeleri, tarih yardımcıları
- `js/db.js`: IndexedDB
- `sw.js`: internetsiz çalışma. Dosya eklenince `FILES` listesine ekle, `CACHE` sürümünü artır.
