#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NOX QR Menu - QR Kod Üretim Aracı
Kullanım:  python tools/gen_qr.py "https://SENIN-ADIN.github.io/nox-qr/" "https://SENIN-ADIN.github.io/nox-qr/yonetim-kzJNFLxj5Zw/"
Çıktı:     site/qr/menu.png  ve  site/qr/admin.png
"""
import sys
import qrcode
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "site" / "qr"

def make_qr(url: str, out: Path, label: str) -> None:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=12,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0b0b10", back_color="#ffffff")
    img.save(out)
    print(f"[OK] {label}: {out}  ->  {url}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    menu_url, admin_url = sys.argv[1], sys.argv[2]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    make_qr(menu_url, OUT_DIR / "menu.png", "MENÜ QR")
    make_qr(admin_url, OUT_DIR / "admin.png", "YÖNETİM QR")
