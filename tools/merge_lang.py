#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NOX QR Menü — Çok dilli sözlük birleştirici

site/data/i18n/lang_*.json dosyalarını okur, menu.json'dan "tr" girişini
sentezler ve hepsini site/data/lang.json olarak yazar. Tarayıcı tarafında
çevirisi olmayan anahtarlar Türkçe'ye düşer; çevirmenler aynıysa anahtarı
bilerek atladığı için bu bir hata değildir.

Doğrulama (validation) sadece yazdırır — asla hata üretmez, çıkış kodu daima 0.

Kullanım:  python tools/merge_lang.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
I18N = SITE / "data" / "i18n"
OUT = SITE / "data" / "lang.json"


def _tr_entry(menu):
    """menu.json'dan eksiksiz Türkçe sözlük girişini üretir."""
    sections = {}
    for s in menu["sections"]:
        sec = {"title": s["title"], "items": {}}
        if s.get("subtitle"):
            sec["subtitle"] = s["subtitle"]
        for item in s["items"]:
            entry = {}
            if item.get("desc"):
                entry["desc"] = item["desc"]
            sec["items"][item["name"]] = entry
        sections[s["id"]] = sec
    return {
        "meta": {"tagline": menu["meta"]["tagline"]},
        "ui": {
            "follow": "Bizi takip edin",
            "igView": "Instagram'da Gör",
            "footerTag": "Güzel anların lezzetli eşliği",
            "fxNote": "Döviz karşılıkları TCMB satış kuru ile hesaplanır",
            "skipIntro": "Menüye Geç",
        },
        "groups": {g["id"]: g["title"] for g in menu["groups"]},
        "notes": {"Şişe": "Şişe", "33 cl": "33 cl"},
        "sections": sections,
    }


def _validate(lang_code, data, menu, warnings):
    """Tek dil dosyasını menu.json ile karşılaştırıp uyarıları toplar (sadece yazdırma)."""
    menu_sections = {s["id"]: s for s in menu["sections"]}
    data_sections = data.get("sections", {})
    missing_sec = [sid for sid in menu_sections if sid not in data_sections]
    extra_sec = [sid for sid in data_sections if sid not in menu_sections]
    if missing_sec:
        warnings.append(f"[{lang_code}] eksik bölüm: {', '.join(missing_sec)}")
    if extra_sec:
        warnings.append(f"[{lang_code}] fazla bölüm: {', '.join(extra_sec)}")

    for sid, sec in menu_sections.items():
        trans_sec = data_sections.get(sid, {})
        trans_items = trans_sec.get("items", {}) if isinstance(trans_sec, dict) else {}
        missing_items = []
        for item in sec["items"]:
            if item["name"] not in trans_items:
                if item.get("desc"):
                    missing_items.append(f"{item['name']} (NEEDS-DESC)")
                else:
                    missing_items.append(item["name"])
        if missing_items:
            warnings.append(f"[{lang_code}] bölüm '{sid}' eksik ürün: {', '.join(missing_items)}")

    for key in ("ui", "notes", "groups"):
        if key not in data:
            warnings.append(f"[{lang_code}] '{key}' anahtarı eksik")


def merge(root=ROOT):
    """Tüm dilleri birleştirip site/data/lang.json dosyasına yazar.

    Geçersiz JSON dosyalarını atlar, eksikleri sadece uyarı olarak yazdırır.
    """
    root = Path(root)
    site = root / "site"
    i18n = site / "data" / "i18n"

    menu_path = site / "data" / "menu.json"
    menu = json.loads(menu_path.read_text(encoding="utf-8"))

    tr = _tr_entry(menu)
    langs = {"tr": tr}
    warnings = []

    for path in sorted(i18n.glob("lang_*.json")):
        code = re.match(r"lang_(\w+)\.json$", path.name).group(1)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, UnicodeDecodeError) as e:
            print(f"[HATA] {path.name} geçersiz JSON, atlandı: {e}")
            continue
        langs[code] = data
        _validate(code, data, menu, warnings)

    out = site / "data" / "lang.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(langs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"[OK] lang.json yazıldı: {out} ({out.stat().st_size} B)")
    print(f"[BİLGİ] Birleştirilen diller: {', '.join(sorted(langs))}")
    if warnings:
        print(f"[UYARI] {len(warnings)} uyarı:")
        for w in warnings:
            print(f"  - {w}")
    else:
        print("[UYARI] uyarı yok")
    return langs


def main():
    merge(ROOT)


if __name__ == "__main__":
    main()
