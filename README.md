# top-uklar

Topların bir karede otomatik olarak savaştığı bir simülasyon. Kısa video (Shorts/Reels) üretimi için tasarlandı.

İki kadro var:

- **Tarih (liderler, varsayılan):** toplar tarihi komutanları temsil eder, silah tutmaz; çarpışınca hasar verir ve belli aralıklarla liderin ünlü özelliğine dayanan bir yetenek kullanır. Videodaki yazılar İngilizcedir.
- **Silahlar:** dönen silahlı toplar (10 karakter).

## Çalıştırma

```sh
bun install      # veya: npm install
bun run dev      # http://localhost:5173
```

Arena sayfasında karakter seçebilir, seed girebilir, duraklatabilir ve hızlandırabilirsiniz. **"Bu maçı video olarak kaydet"** düğmesi maçı baştan oynatıp 1080×1920 video olarak (Chrome/Edge/Safari) kendiliğinden indirir. Ses efektleri tarayıcıda üretilir (dosya gerekmez), kaydedilen videoya da girer; tarayıcılar sesi ancak bir tıklamadan sonra açtığı için sayfaya bir kez tıklamak gerekir. Bir maçı link olarak paylaşmak için: `/?mode=leaders&a=caesar&b=hannibal&seed=7` (silahlar için `mode=weapons`).

## Liderler

| Lider               | Dönem         | Yetenek                                                 |
| ------------------- | ------------- | ------------------------------------------------------- |
| Alexander the Great | 356–323 BC    | Companion Charge: durup nişan alır, sert hücum          |
| Genghis Khan        | c. 1162–1227  | Horse Archers: hızlı gövde, 3 oklu yaylım               |
| Julius Caesar       | 100–44 BC     | Legions: rakibi kovalayan 2 lejyoner çağırır            |
| Hannibal            | 247–c. 183 BC | War Elephant: savuran ve sersemleten savaş fili         |
| Napoleon            | 1769–1821     | Grand Battery: duvardan seken top güllesi               |
| Leonidas            | c. 540–480 BC | Hold the Line: %60 hasar azaltan kalkan, kalkanla vuruş |
| Mehmed II           | 1432–1481     | Great Bombard: şarjlı dev gülle, çarptığı yerde patlar  |
| Cleopatra           | 69–30 BC      | Asp: zehirleyen engerek                                 |

Portre eklemek için `src/assets/leaders/<lider-id>.png` (veya .jpg/.webp) koyun; top üzerinde daire şeklinde gösterilir. Dosya yoksa kodla çizilmiş simge kullanılır. Yeni lider: `src/sim/leaders/` altına bir dosya (yetenek kalıbı `kit.ts` içindeki `skill()`), sonra `index.ts`.

## Silah karakterleri

| Karakter | Özellik                                                   |
| -------- | --------------------------------------------------------- |
| DRILL    | Duvara çarptıkça seviye atlar, vuruşları sertleşir        |
| CHIME    | Duvar vuruşları çanı doldurur, dolunca şok dalgası yayar  |
| PYLON    | Duvara direk diker, direkler arasında elektrik yayı çakar |
| GRAPPLE  | Duvarlardan seken kanca atar, rakibi çeker                |
| LANCE    | Şarj olur, rakibe nişan alıp hızla saplanır               |
| MAUL     | Yavaş ve ağır, çok sert knockback                         |

Silahları kendi görselinizle değiştirmek için `src/assets/weapons/<karakter-id>.png` koyun (piksel sanatı çizimleri için `python3 scripts/prepare-weapon.py <görsel> <karakter-id>` büyütüp döndürüp hazırlar) (kurallar: `src/assets/weapons/README.md`); dosya yoksa vektör çizim kullanılır.

Yeni karakter eklemek: `src/sim/roster/` altına bir dosya ekleyip `index.ts`'e yazmak yeterli.

## Testler

```sh
bun scripts/sim-check.ts 100 leaders   # veya: weapons
```

Aynı seed'in birebir aynı maçı verdiğini (determinizm) ve karakterlerin kazanma oranlarını (denge) kontrol eder.

## Yapı

- `src/sim/` — simülasyon çekirdeği (DOM'dan bağımsız, seed'li rastgelelik, sabit zaman adımı)
- `src/sim/leaders/` — liderler (tarih modu), `src/sim/units.ts` — çağrılan birlikler ve mermiler
- `src/sim/roster/` — silah karakterleri
- `src/sim/render/` — Canvas çizimi, efektler
- `src/ArenaPage.tsx` — arayüz
- `docs/analiz-ve-plan.md` — kanal analizi ve yol haritası

## Yol haritası

- **M1:** yetenek modülleri, elementler, boss'lar, drama skoruyla seed arama, ses
- **M2:** 1080×1920 MP4 dışa aktarma (Playwright + ffmpeg)
- **M3:** sonuçların kaydı, ELO, liderlik tablosu, bracket ekranı
