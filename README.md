# NOX Lounge — QR Menü

Gece kulübü **NOX** için ücretsiz (0₺), reklamsız QR menü sitesi.

## İçerik

| Dosya | Açıklama |
|---|---|
| `site/index.html` | Müşterilerin QR ile açtığı menü sayfası (açılışta kokteyl tanıtım videosu oynar) |
| `site/assets/video/intro.mp4` | Açılış videosu (~8 sn, 9:16, kokteyl gösterimi + NOX logosu ile kapanış) |
| `site/yonetim-kzJNFLxj5Zw.html` | Şifreli fiyat güncelleme sayfası (QR'ı ayrı!) |
| `site/data/menu.json` | Tüm menü verisi (tek kaynak) |
| `site/qr/` | Basılacak QR kod görselleri |
| `site/yonetim-qr.html` | URL belli olduktan sonra QR üreten araç |
| `tools/build.py` | Veriyi sayfalara gömülü yedek olarak yazan derleme aracı |
| `tools/build_intro.py` | Açılış videosunu yeniden üreten araç (ffmpeg + Pillow) |

> 💡 **Çift tıklamayla da çalışır:** `index.html` ve yönetim sayfası, `data/` klasörüne
> erişilemediğinde (dosyayı doğrudan tarayıcıda açtığında) gömülü yedek veriyi kullanır.
> Yayındaki (GitHub/Netlify) sürüm her zaman güncel `menu.json`'dan okur.
> Menüyü düzenleyip `menu.json`'ı güncelledikten sonra yerel önizlemenin de yenilenmesi için:
> `python tools/build.py`

## Açılış Videosu (Intro)

QR menü açıldığında `site/assets/video/intro.mp4` tam ekran oynar (kokteyl görselleri
+ NOX logosu kapanışı), ardından menü otomatik açılır. Sağ üstteki **"Menüye Geç"**
butonu 0.9 sn sonra çıkar; video yüklenemezse menü doğrudan açılır (siyah ekran asla görünmez).

Görseller/sıralama değiştirmek için `tools/build_intro.py` içindeki `IMAGES` listesini
düzenleyip yeniden üretin:

```bash
python tools/build_intro.py        # -> site/assets/video/intro.mp4
```

Sonra `site/` klasörünü Netlify'a tekrar sürükleyin (video `assets/video/` altındadır).

## Yayına Alma (5 dakika, ücretsiz)

### Seçenek — Netlify Drop (önerilir: en hızlı, tek tık)

1. [app.netlify.com/drop](https://app.netlify.com/drop) → ücretsiz hesap aç.
2. `site/` klasörünü pencereye **sürükle-bırak** → anında yayında.
3. Güncelleme: `site/` klasörünü Netlify'a **tekrar sürükle** → aynı adres, yeni sürüm (1-2 dk).
4. Adresin: `https://SITEN-ADI.netlify.app/` (panelde görünür).

> İpucu: Fiyat güncellemeleri için `site/` sürüklemeye gerek yok — yönetim panelindeki
> **"Kaydet"** butonu her şeyi halleder: Netlify bağlantısı kuruluysa tüm siteyi tek tıkla
> yeniden yayınlar. Netlify bağlantısı kurulu değilse buton uyarı verir (kurulum: paneldeki
> ⚙ bölümünden Netlify token'ı + siteni seç, tek seferlik). Kayıt bitince **"Kayıt Başarılı!"**
> uyarısı çıkar. Token, panel giriş şifrenle **şifrelenerek** (PBKDF2 + AES-GCM) tarayıcıda
> saklanır — asla düz metin değildir.

## QR Kodları Üretme

Yayın adresi belli olunca iki QR üret:

```bash
python tools/gen_qr.py "https://SITEN-ADI.netlify.app/" "https://SITEN-ADI.netlify.app/yonetim-kzJNFLxj5Zw.html"
```

Veya tarayıcıda `yonetim-qr.html` dosyasını açıp URL'leri yapıştır.

- **menu.png** → masalara/menülere bas
- **admin.png** → SAKLA, sadece kulüp içinde kalsın

## Fiyat Güncelleme (şifreli)

1. `yonetim-kzJNFLxj5Zw.html` adresini aç (sadece bu QR'ı bilen girebilir).
2. Şifre: **NOX!2026**
3. Fiyatları düzenle → **"Kaydet"** → tüm site tek tıkla Netlify'a yeniden yüklenir
   (1-2 dk içinde yayında). Kayıt bitince **"Kayıt Başarılı!"** uyarısı çıkar.
   - İlk kullanımda "⚙ Netlify'a Tek Tıkla Yayınla" bölümünden Netlify **Personal Access Token** oluşturup (User settings → Applications → Personal access tokens) yapıştır ve **"Siteleri Listele"** ile siteni seç. Kurulum tek seferliktir; token panel şifrenle şifreli saklanır.

## Şifre Değiştirme

Giriş yaptıktan sonra paneldeki **"Şifre Değiştir"** bölümünden mevcut + yeni şifreyi girip **"Şifreyi Kaydet"**:

- `config.json` + güncel menü tek tıkla Netlify'a yayınlanır (Netlify bağlantısı zorunlu; ⚙ kurulumu önceden yapılmalı).
- Şifre değişince şifreli saklanan Netlify token'ı da otomatik olarak yeni şifreyle yeniden şifrelenir.
- Her durumda önce `python tools/build.py` çalıştır (gömülü yedekler senkron kalsın; sadece çift tıklama modu için gerekli).

Elle değiştirmek için: `data/config.json` içindeki `adminPasswordHash` değerini şu komutla üretilen hash ile değiştir:

```bash
python -c "import hashlib; print(hashlib.sha256('YENİŞİFRE'.encode()).hexdigest())"
```

## Eski Menüde Tespit Edilen ve Düzeltilen Mantıksal Hatalar

Eski menü görselleri OCR ile okunup satır satır incelendi. Tespit edilen sorunlar ve çözümleri:

| # | Tespit | Düzeltme |
|---|---|---|
| 1 | **Votka bölümünde şişe fiyatları bardakmış gibi duruyordu** (Belvedere 12.000 ₺, Grey Goose 7.700 ₺, Absolut 4.500 ₺...) | Bölüm başlığına ve her ürüne **"Şişe 70 cl"** etiketi eklendi |
| 2 | **Viski bölümünde şişe fiyatları** (Jack Daniel's 8.000 ₺, Chivas 9.000 ₺...) | Aynı şekilde **"Şişe"** olarak etiketlendi |
| 3 | **"Şişe Alkoller" listesi diğer bölümlerle çelişiyordu** (Red Label 5.500 ₺ vs 7.000 ₺, Smirnoff 4.400 ₺ vs 7.500 ₺ aynı üründe iki farklı fiyat) | Çelişkili kopya liste **kaldırıldı**; tek otorite kaynağı kategori bölümleri oldu. Sadece o listede bulunan **Johnnie Walker (8.000 ₺)** viski bölümüne taşındı |
| 4 | **İçecekler iki menüde farklı fiyattaydı** (Kola: içki menüsünde 300 ₺, yemek menüsünde 200 ₺) | Tek fiyat kullanıldı (300 ₺) |
| 5 | Okunamayan/kayıp ürünler tamamlandı | **Corona 33cl** ve **Jim Beam** eksikti → eklendi; **Su (100 ₺)** ve **Meyve Suyu (150 ₺)** netleştirildi |
| 6 | Kokteyl tarifleri tutarsız/eksikti (Lynchburg Lemonade'te "fripte Set" vb. yazım hataları) | Tarifler temizlendi (triple sec, peach schnapps vb. düzeltildi) |
| 7 | Menüde yayın tarihi/İnstagram bilgisi yoktu | Sayfaya **@clubnoxlounge** linki ve güncelleme tarihi eklendi |

### ⚠️ Kulüpten teyit isteyen noktalar (admin panelinden 1 dk'da düzeltilir)

- **Viski/Cin bardak fiyatları**: Votka ve viski için bardak fiyatı orijinal menüde hiç yoktu; sadece şişe fiyatı yazıyordu. Bardak satışı yapılıyorsa eklenmeli.
- **Bira Tabağı 350 ₺** ve **sıcak içecek fiyatları** (Türk Kahvesi 150 ₺, Çay 100 ₺ vb.) görselde kısmen silikti — teyit edin.
- **Green Mark (7.000 ₺)** ve **Dutch Los Napoleon (450 ₺)** ürün adları görselde böyle okundu — doğru isimleriyle güncelleyin.
- Kokteyl fiyatları 600 ₺, alkolsüzler 500 ₺ olarak görselden aynen alındı.
