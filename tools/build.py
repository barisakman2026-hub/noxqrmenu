#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NOX QR Menü — Derleme aracı
menu.json ve config.json verisini sayfalara gömülü yedek olarak yazar.
Böylece site dosyası doğrudan çift tıklanarak da (file://) çalışır.
Yayında (GitHub Pages vb.) sayfa her zaman canlı dosyadan okur — gömülü
yedek sadece fetch başarısız olursa devreye girer.

Kullanım:  python tools/build.py
"""
import json
import re
from pathlib import Path

from merge_lang import merge as merge_lang

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"

def inline(path: Path, var: str, payload) -> None:
    html = path.read_text(encoding="utf-8")
    stripped = re.sub(r"<script>" + re.escape(var) + r" = .*?</script>[ \t]*\r?\n?", "", html)
    block = f"<script>{var} = {json.dumps(payload, ensure_ascii=False)};</script>"
    if var + " = null;" in stripped:
        out = stripped.replace(var + " = null;", block)
    else:
        out = stripped.replace("</body>", block + "\n</body>") if "</body>" in stripped else stripped + "\n" + block
    path.write_text(out, encoding="utf-8")
    print(f"[OK] {path.name}: {var} ({len(out)} B)")

menu = json.loads((SITE / "data" / "menu.json").read_text(encoding="utf-8"))
cfg = json.loads((SITE / "data" / "config.json").read_text(encoding="utf-8"))

# Çok dilli sözlüğü birleştir (lang.json). Başarısız olursa derlemeyi
# öldürme — sadece uyar, LANG_FALLBACK olmadan devam et.
try:
    lang_dict = merge_lang(ROOT)
except Exception as e:
    print(f"[UYARI] lang.json birleştirilemedi, LANG_FALLBACK atlanıyor: {e}")
    lang_dict = {"tr": {"meta": {}, "ui": {}, "groups": {}, "notes": {}, "sections": {}}}

inline(SITE / "index.html", "window.MENU_FALLBACK", menu)
inline(SITE / "yonetim-kzJNFLxj5Zw.html", "window.MENU_FALLBACK", menu)
inline(SITE / "yonetim-kzJNFLxj5Zw.html", "window.CONFIG_FALLBACK", cfg)
inline(SITE / "index.html", "window.LANG_FALLBACK", lang_dict)
print("Tamam — site dosyaları artık çift tıklamayla da açılır.")