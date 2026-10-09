# top-uklar

Silahlı topların bir karede otomatik olarak savaştığı, her vuruşun hasar verdiği bir simülasyon. Kısa video (Shorts/Reels) üretimi için tasarlandı.

Şu an: **M0 prototipi** — simülasyon çekirdeği, 6 özgün karakter ve tarayıcıda canlı izlenen arena.

## Çalıştırma

```sh
bun install      # veya: npm install
bun run dev      # http://localhost:5173
```

Arena sayfasında karakter seçebilir, seed girebilir, duraklatabilir ve hızlandırabilirsiniz. Bir maçı link olarak paylaşmak için: `/?a=drill&b=chime&seed=7`.

## Karakterler

| Karakter | Özellik                                                   |
| -------- | --------------------------------------------------------- |
| DRILL    | Duvara çarptıkça seviye atlar, vuruşları sertleşir        |
| CHIME    | Duvar vuruşları çanı doldurur, dolunca şok dalgası yayar  |
| PYLON    | Duvara direk diker, direkler arasında elektrik yayı çakar |
| GRAPPLE  | Duvarlardan seken kanca atar, rakibi çeker                |
| LANCE    | Şarj olur, rakibe nişan alıp hızla saplanır               |
| MAUL     | Yavaş ve ağır, çok sert knockback                         |

Yeni karakter eklemek: `src/sim/roster/` altına bir dosya ekleyip `index.ts`'e yazmak yeterli.

## Testler

```sh
bun scripts/sim-check.ts 100
```

Aynı seed'in birebir aynı maçı verdiğini (determinizm) ve karakterlerin kazanma oranlarını (denge) kontrol eder.

## Yapı

- `src/sim/` — simülasyon çekirdeği (DOM'dan bağımsız, seed'li rastgelelik, sabit zaman adımı)
- `src/sim/roster/` — karakterler
- `src/sim/render/` — Canvas çizimi, efektler
- `src/ArenaPage.tsx` — arayüz
- `docs/analiz-ve-plan.md` — kanal analizi ve yol haritası

## Yol haritası

- **M1:** yetenek modülleri, elementler, boss'lar, drama skoruyla seed arama, ses
- **M2:** 1080×1920 MP4 dışa aktarma (Playwright + ffmpeg)
- **M3:** sonuçların kaydı, ELO, liderlik tablosu, bracket ekranı
