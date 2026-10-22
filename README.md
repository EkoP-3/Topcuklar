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

Her liderin canı 1000 civarındadır. Liderlerin hasarı her saniye %1,5 artar (alt panelde imza sayısı büyür). 15. saniyede seviye 2, 30. saniyede seviye 3 olurlar; yetenek bir kademe güçlenir (Mehmed II 1→2→3 gülle, Genghis 3→5→7 ok, Caesar 2→3→4 lejyoner, Leonidas'ın kalkanı uzar vb.). İsimlerin yanında bayrak vardır: bilinen yerde bugünkü ülke bayrağı, tartışmalı ya da tanınmayan yerde tarihi sancak (Alexander: Makedon güneşi, Caesar: SPQR).

**Ultimate:** her liderin canı %30'un altına inince maçta bir kez süper hamlesi gelir (ekran kararır, ağır çekimde adı çıkar). Hepsi farklı çalışır: Mehmed II işaretli noktalara top yağdırır, son olarak dev Şahi güllesi düşer (THE GREAT BOMBARDMENT); Genghis ok yağmuru (ARROW STORM); Hannibal dört yandan fil hücumu (CROSSING THE ALPS); Caesar ışınlanır, rakibi dondurur, üç darbe vurur (VENI, VIDI, VICI); Napoleon beş muhafızla yaylım ateşi ve süngü hücumu (IMPERIAL GUARD); Leonidas rakibi duvara tekmeler (THIS IS SPARTA!); Alexander dev olup Bucephalus'la ezerek koşar (BUCEPHALUS); Cleopatra sarmal yılan atışı (SPIRAL OF ASPS).

**Kıl payı (CLOSE CALLS):** iki lider topu birbirine doğru hızla gelip kıl payı (aralarında çok küçük bir boşlukla) çarpmadan geçtiğinde, ya da bir gülle rakibin dibinden sıyırdığında kısa bir ağır çekim olur, "SO CLOSE!", "NEAR MISS!" gibi yazılar çıkar ve arenanın üstündeki sayaç artar. Sayaç 3 olunca arena 4 saniyeliğine küçülür ve toplar %25 hızlanır (yalnızca Tarih modunda).

**Liderler (16):** Alexander, Genghis Khan, Caesar, Hannibal, Napoleon, Leonidas, Mehmed II, Cleopatra, Vlad III, Richard I, Saladin, Qin Shi Huang, Joan of Arc, Harald III, Oda Nobunaga, Shaka Zulu. Yeni liderlerin mekanikleri: kazık tarlası ve gece baskını (Vlad), canı azaldıkça güçlenme (Richard), pala savurma ve Hattin alevleri (Selahaddin), mermi tutan terracotta askerleri ve Çin Seddi (Qin), taşınan kutsal sancak (Joan), geri dönen balta ve berserker (Harald), ışık hızında katana atılımı ve Nagashino yaylımı (Nobunaga), iki yandan kıskaç yapan savaşçılar (Shaka).

**Canlı kazanma oranı:** can barlarının altında, "PICK YOUR SIDE" kartındakiyle aynı tek ortak "WIN CHANCE" barı anlık kayar. Simülasyonlardan öğrenilmiş küçük bir modelden gelir: maç öncesi oran, can farkı (ilerleyen saniyelerde daha ağır basar), kullanılmamış ultimate ve alan sahibi. Oyunu etkilemez. Denge değişince önce `bun scripts/odds.ts`, sonra `bun scripts/live-odds.ts` çalıştırın.

**Domain Expansion (15–17. saniye):** 15. saniyede canı az olan lider kendi tarihî savaş alanını açar ve arenanın sınırları çatlar. 16,5. saniyede diğer lider cevap verir ve alanlar çarpışır ("DOMAIN CLASH"). 2,5 saniye boyunca daha çok hasar veren taraf sınırı iter. Sonunda duvarlar yıkılır, kazananın alanı arenayı kaplar ve maç sonuna kadar kendi kuralını uygular (ör. Thermopylae: Leonidas daha az hasar alır; Constantinople: dev gülleler yağar; The Alps: rakip yavaşlar). Alan kazanılınca rakibe bir "SURE HIT" iner.

**Yüzler ve "Pick your side":** liderlerin toplarında çizgi film tarzı yüzler var. Gözler rakibi izler, ifade maça göre değişir (vurulunca acı, öndeyken kendinden emin, canı azalınca korku, ultimate'ta öfke, kazanınca sırıtma). Can sayısı topun altındaki küçük rozette. Maç başında "PICK YOUR SIDE!" kartı, simülasyondan hesaplanan kazanma oranını ve 3-2-1 geri sayımı gösterir. Kazananın oranı %40'ın altındaysa "UPSET!" yazar. Denge değişince oranları yenileyin: `bun scripts/odds.ts`.

**Görünüm ve ses:** arena eski bir parşömen harita gibi çizilir (pusula gülü, enlem/boylam çizgileri, mürekkep çerçeve, "Cinzel" yazı tipi); her liderin topu, can barı ve kartı kendi halkının simgesinden gelen renkte (Mehmed Osmanlı kırmızısı, Cengiz Mavi Gök, Kleopatra firuze, Saladin Eyyubi sarısı, Qin terakota…); iki rakip birbirine çok benziyorsa biri ikinci rengine geçer (ör. Richard'a karşı Mehmed yeşil). Renk tablosu `src/sim/render/palette.ts` içinde. Silah modunda taraflar kızıl ve kraliyet mavisi. Ultimate ve K.O. anında kamera hafifçe yaklaşır. Sesler yine kodla üretilir ama ortak bir salon yankısı, borazan, taiko davul ve telli çalgı (Karplus-Strong) melodisi kullanır.

**Müzik:** kodla üretilir (telifsiz), videoya da girer. Maçın gidişine göre değişir: savaş davulları, 15. saniyede yaylılar ve melodi, daralmada hızlanma, ultimate'ta sessizlik + vuruş, sonda zafer fanfarı. Melodi önde olan liderin makamını kullanır (Osmanlı: hicaz, Moğol: pentatonik…). Sayfada "Müzik açık/kapalı" düğmesi vardır.

**Video sonu:** "X WINS" ardından "WHO'S NEXT? — COMMENT BELOW" kartı. Sayfada "Sonraki maç kartı" seçilirse kartta "?" yerine o iki lider görünür.

**Video açıklaması:** sayfadaki kutu, seçili maç için İngilizce başlık, bilgiler, kaynaklar ve etiketler hazırlar ("Kopyala" düğmesi). Tarih bilgilerinin doğruluk notları ve kaynaklar: `docs/tarih-kaynaklari.md`.

Arenanın altında her lider için bir kart vardır: yetenek adı, ne işe yaradığı, kalan süre (halkanın içinde), seviye ve ultimate.

Girişte "WHO WINS?" kartı: bayrak, isim, unvan, dönem. Toplarda liderin başlığı (kavuk, iki köşeli şapka, defne, taç, Sparta miğferi…) çizilidir.

Geliştirici için: `npx vite` açıkken `/dev/frames.html?a=mehmed&b=caesar&seed=3` maçı arka planda oynatıp giriş ve ultimate anlarını yan yana gösterir.

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
