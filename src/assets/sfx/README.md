# Kayıtlı efektler

`<ad>.mp3` dosyaları `src/sim/render/sfx.ts` içinde ilgili olaya bağlıdır; dosya yoksa sentez ses çalar.

| Dosya | Nerede | Kaynak |
|---|---|---|
| `sword-hit` | liderin silah vuruşu (güçe göre ses/ton) | kullanıcı |
| `clash` | iki silah çarpışınca | ElevenLabs SFX |
| `bone-crack` | duvara çarpıp sersemleme, çok ağır vuruş | kullanıcı |
| `bow` | ok atışı | kullanıcı |
| `cannon` | Mehmed'in bombardı, Napolyon'un topu | kullanıcı |
| `horn` | ultimate başlangıcı | ElevenLabs SFX |
| `gasp` | 3. kıl payı (frenzy) | ElevenLabs SFX |
| `epic` | sadece epik bitişte (kaybeden son 2 sn'de canının %25'ini kaybettiyse): parça K.O.'dan 4,03 sn önce başlar, bas tam K.O. karesinde girer | kullanıcı (0–9,40 sn; şarkının 4,03. saniyesi K.O. karesine denk gelir) |

Hepsi mono, ses seviyeleri eşitlenmiş (loudnorm). Yeni dosya eklerken aynı adla değiştirmek yeterli.
