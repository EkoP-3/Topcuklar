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
| `bell` | K.O. | kullanıcı |
| `crowd` | kazanan için tezahürat | ElevenLabs SFX |
| `epic` | "epik an": maçta en fazla bir kez — çok ağır vuruş (0,5 sn'de canın %28'i) ya da sürpriz/kıl payı galibiyet | kullanıcı (6,5 sn kesit) |

Hepsi mono, ses seviyeleri eşitlenmiş (loudnorm). Yeni dosya eklerken aynı adla değiştirmek yeterli.
