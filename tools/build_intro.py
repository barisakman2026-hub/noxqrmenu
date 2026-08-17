"""NOX Lounge — intro videosu üretici.

Seçili kokteyl fotoğraflarından 9:16 (1080x1920) sessiz bir slideshow videosu üretir:
her karede Ken Burns hareketi (yakınlaş/uzaklaş) + kareler arası yumuşak crossfade.
Video, NOX logosu + "Güzel anların lezzetli eşliği" sloganıyla biten bir marka karesiyle kapanır.
Çıktı: site/assets/video/intro.mp4  (mobil uyumlu, ~2-4 MB)

Kullanım:  python tools/build_intro.py [--out OUTFILE]
Bağımlılık: ffmpeg PATH'te + Pillow (marka karesi için).
"""
import argparse
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# --- Seçili kaynak görseller ------------------------------------------------
IMAGES = [
    r"C:\Users\Barıs\AppData\Local\Temp\opencode\nox_intro\uns_1536935338788.jpg",
    r"C:\Users\Barıs\AppData\Local\Temp\opencode\nox_intro\uns_1544145945.jpg",
    r"C:\Users\Barıs\AppData\Local\Temp\opencode\nox_intro\pex_1283219.jpg",
    r"C:\Users\Barıs\AppData\Local\Temp\opencode\nox_intro\uns_1551538827.jpg",
    r"C:\Users\Barıs\AppData\Local\Temp\opencode\nox_intro\uns_1470337458.jpg",
    r"C:\Users\Barıs\AppData\Local\Temp\opencode\nox_intro\pex_1888704.jpg",
]

LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "site", "assets", "img", "logo.png")
TAGLINE = "GÜZEL ANLARIN LEZZETLİ EŞLİĞİ"
BRAND_DUR, BRAND_FADE = 2.2, 0.8   # marka karesinin süresi ve giriş geçişi

W, H = 1080, 1920          # çıktı çözünürlüğü
FPS = 30                   # kare hızı
DUR = 1.6                  # kokteyl karesi süresi (sn)
FADE = 0.6                 # kokteyl crossfade süresi (sn)
BIG_W, BIG_H = 2160, 3840  # Ken Burns pürüzsüzlüğü için 2x çekirdek örnekleme
CRF = "26"                 # h.264 kalite

_NOIR = (11, 10, 8)
_GOLD = (198, 161, 91)
_GOLD_BRIGHT = (232, 201, 133)
_INK_DIM = (168, 158, 140)


# ---------------------------------------------------------------------------
# Marka karesi (logo + slogan) — Pillow ile 1080x1920 PNG üretir
# ---------------------------------------------------------------------------
def _fonts():
    base = "C:/Windows/Fonts/"
    cand = {
        "serif_bold": ["georgiab.ttf", "georgia.ttf"],
        "serif": ["georgia.ttf"],
    }
    out = {}
    for key, names in cand.items():
        for n in names:
            p = base + n
            if os.path.exists(p):
                out[key] = p
                break
    return out


def _draw_tracked(draw, cx, y, text, font, fill, tracking):
    """Harf aralıklı metni GERÇEK genişliğine göre x=cx etrafında ortalar.

    Her harfin çizim genişliği ölçülür; toplam genişlik = harfler + tracking.
    Böylece metin kesin ortada durur ve taşma olmaz."""
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = cx - total / 2
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += w + tracking


def make_brand_frame(out_png):
    img = Image.new("RGBA", (W, H), _NOIR + (255,))

    # --- sıcak altın ışıma: merkeze doğru yoğunlaşan radyal hale ---
    tile = Image.new("RGBA", (360, 640), (0, 0, 0, 0))
    td = ImageDraw.Draw(tile)
    cx, cy, maxr = 180, 250, 300
    steps = 140
    for i in range(steps, 0, -1):
        t = i / steps
        r = maxr * t
        alpha = int(26 * (1 - t) ** 1.7)
        td.ellipse([cx - r, cy - r * 1.35, cx + r, cy + r * 1.35], fill=_GOLD + (alpha,))
    glow = tile.resize((W, H), Image.BILINEAR)
    img.alpha_composite(glow, (0, 0))

    # --- logo: dairesel kırp + altın halka ---
    logo = Image.open(LOGO_PATH).convert("RGBA")
    size = 430
    logo = logo.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    circle = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    circle.paste(logo, (0, 0), mask)
    logo_with_ring = circle.copy()
    ImageDraw.Draw(logo_with_ring).ellipse(
        [0, 0, size - 1, size - 1], outline=_GOLD, width=3)
    # halka dışına hafif ışıma
    halo = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(halo).ellipse([-22, -22, size + 21, size + 21], outline=_GOLD + (70,), width=10)
    halo = halo.filter(ImageFilter.GaussianBlur(14))
    img.alpha_composite(halo, ((W - size) // 2, 570))
    img.alpha_composite(logo_with_ring, ((W - size) // 2, 570))

    fonts = _fonts()
    serif_bold = ImageFont.truetype(fonts.get("serif_bold", fonts["serif"]), 150)
    serif = ImageFont.truetype(fonts["serif"], 30)

    # --- "NOX" wordmark: altın + yumuşak parıltı ---
    draw = ImageDraw.Draw(img)
    wordmark = "NOX"
    wm_w = draw.textlength(wordmark, font=serif_bold)
    wm_x, wm_y = (W - wm_w) / 2, 1050
    for dx, dy, col, blurs in [(0, 4, (176, 141, 74, 200), 8), (0, 0, _GOLD_BRIGHT + (255,), 0)]:
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(layer).text((wm_x + dx, wm_y + dy), wordmark, font=serif_bold, fill=col)
        if blurs:
            layer = layer.filter(ImageFilter.GaussianBlur(blurs))
        img.alpha_composite(layer, (0, 0))

    # --- ince altın cetvel + slogan ---
    rule_y = 1280
    ImageDraw.Draw(img).line(
        [(W / 2 - 130, rule_y), (W / 2 + 130, rule_y)], fill=_GOLD + (180,), width=2)

    glow_slogan = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_slogan)
    _draw_tracked(gd, W / 2, 1320, TAGLINE, serif, _INK_DIM + (255,), 8)
    img.alpha_composite(glow_slogan, (0, 0))

    img.convert("RGB").save(out_png, "PNG")
    return out_png


# ---------------------------------------------------------------------------
# ffmpeg komutu
# ---------------------------------------------------------------------------
def zoompan_expr(i, dur, brand):
    frames = int(dur * FPS)
    if brand:
        # marka karesi: çok yavaş içeri zoom
        return f"z='1+0.06*on/{frames}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2'"
    if i % 2 == 0:
        return f"z='1+0.16*on/{frames}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2'"
    return f"z='1.16-0.16*on/{frames}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2'"


def build_ffmpeg_cmd(images, brand_png, out):
    segs = [(img, DUR, FADE, False) for img in images] + [(brand_png, BRAND_DUR, BRAND_FADE, True)]
    n = len(segs)

    inputs = []
    for s, _, _, _ in segs:
        inputs += ["-i", s]

    total = sum(d for _, d, _, _ in segs) - sum(f for _, _, f, _ in segs[1:])
    fc = []
    prev = None
    for i in range(n):
        src, dur, fade, brand = segs[i]
        frames = int(dur * FPS)
        label = f"[s{i}]"
        if brand:
            chain = f"[{i}:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
        else:
            chain = (
                f"[{i}:v]scale={BIG_W}:{BIG_H}:force_original_aspect_ratio=increase,"
                f"crop={BIG_W}:{BIG_H},"
            )
        chain += f"zoompan={zoompan_expr(i, dur, brand)}:d={frames}:s={W}x{H}:fps={FPS}"
        if not brand:
            chain += ",vignette=angle=PI/5"
        fc.append(chain + label)
        if prev is None:
            prev = label
        else:
            out_label = f"[x{i}]" if i < n - 1 else "[vout]"
            offset = round(sum(d for _, d, _, _ in segs[:i]) - sum(f for _, _, f, _ in segs[1:i + 1]), 3)
            fc.append(f"{prev}{label}xfade=transition=fade:duration={fade}:offset={offset}{out_label}")
            prev = out_label

    fc.append("[vout]format=yuv420p[v]")
    cmd = (
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning"]
        + inputs
        + [
            "-filter_complex", ";".join(fc),
            "-map", "[v]",
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", CRF,
            "-r", str(FPS),
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-an",
            out,
        ]
    )
    return cmd, total


def main():
    ap = argparse.ArgumentParser(description="NOX intro videosu üret")
    ap.add_argument("--out", default=os.path.join(
        os.path.dirname(__file__), "..", "site", "assets", "video", "intro.mp4"))
    ap.add_argument("--no-brand", action="store_true", help="Marka karesi ekleme")
    ap.add_argument("images", nargs="*", help="Görsel dosyaları (verilmezse IMAGES listesi)")
    args = ap.parse_args()

    images = args.images or IMAGES
    if not images:
        sys.exit("Görsel verilmedi: python tools/build_intro.py img1.jpg img2.jpg ...")

    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)

    brand_png = None
    if not args.no_brand:
        fd, brand_png = tempfile.mkstemp(suffix=".png", prefix="nox_brand_")
        os.close(fd)
        print("Marka karesi üretiliyor (logo + slogan)...")
        make_brand_frame(brand_png)

    try:
        cmd, total = build_ffmpeg_cmd(images, brand_png, out)
        print(f"Üretiliyor: {len(images)} kokteyl + marka karesi, {total:.1f}s -> {out}")
        print("ffmpeg:", " ".join(cmd[:6]), "...")
        rc = subprocess.call(cmd)
        if rc != 0:
            sys.exit(f"ffmpeg hatası (kod {rc})")
        size = os.path.getsize(out) / (1024 * 1024)
        print(f"OK: {out} ({size:.2f} MB)")
    finally:
        if brand_png and os.path.exists(brand_png):
            os.remove(brand_png)


if __name__ == "__main__":
    main()