# Silah-top savaşı simülasyonu — analiz ve plan

## Referans kanal ne yapıyor? (vidIQ verisi + 6 videonun incelenmesi + yorumlar)

- 108K abone, 266M görüntülenme, 236 video; son 30 günde 32 video. Abone başına ~2.470 izlenme: büyümeyi Shorts akışı getiriyor. En iyi video 11,3M izlenme. Videolar 7–70 sn, çoğu 20–45 sn.
- Format zamanla evrildi: genel fantezi toplar → silah/boss teması → elementler, takımlar, lore videoları, turnuva.
- Görünüm: 9:16 dikey, ortada kare arena, sabit kamera, CRT filtresi, diskin ortasında HP sayısı, üstte isimler, altta telemetri paneli (`[CHARGING]`, `DMG`…).
- Fizik: yerçekimi yok, neredeyse tam elastik sekme; hasar silah ucunun hitbox'ından.
- **Çekirdek desen "duvar vuruşu = kaynak":** seviye atlama, sayaç, çivi dikme gibi mekanikler duvar çarpmasına bağlı; bu yerleşik geri dönüş mekanizması.
- İncelenen 1v1 maçların üçü de kazananın 2, 3 ve 10 HP ile bitirdiği sıkı maçlardı. İkinci hook: imkânsız zafer (100 HP'lik karakter 500 HP'lik boss'u yeniyor).
- Asıl hendek evren: izleyici karakterlere kişilik veriyor, liderlik tablosu tutuyor, yeni karakter istiyor.

Not: kare kare sayılar bir görsel modelin raporudur, tek tek doğrulanmadı.

## Riskler

- Tür kalabalık; farklılaşma için özgün kadro ve hikâye şart. Şablon turnuva videoları (91K–185K) hikâyeli boss/upset videolarından (1–11M) zayıf kaldı.
- Shorts geliri düşük; gelir hedefi varsa ayrıca hesaplanmalı.
- YouTube seri üretim içerik politikası: her videoda anlatı farkı gerekli.
- Telif: referans kanalın teması kullanılmıyor; karakterler, sprite'lar ve sesler özgün.
- Seed seçimi "adil test" diye sunulacaksa dürüst olunmalı.

## Teknik yaklaşım

Çekirdek çerçevesiz TypeScript: sabit zaman adımı (240 Hz), `mulberry32` seed'li rastgelelik, özel fizik (silah vuruşu standart rigid-body değil). Yetenekler küçük modüller; yeni karakter = yeni dosya. Aynı seed aynı maçı verdiği için binlerce seed headless koşturulup en dramatik olan video yapılabilir.

## Yol haritası

M0 (bitti): çekirdek + 6 karakter + arena sayfası. M1: yetenek modülleri, elementler, boss, drama skoru, ses. M2: MP4 dışa aktarma. M3: kayıt/ELO/liderlik/bracket. M4 (opsiyonel): uygulama içi canlı arena.

## M0 sonrası denge ölçümü

6 karakter, çift başına 150 maç: kazanma oranları %43–52, ortalama maç 23,5 sn, maçların ~%25'i kazananın ≤%15 canıyla bitiyor, determinizm 108/108.
