#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""OCR kelime koordinatlarından çok sütunlu menüyü yeniden kur."""
import os
import sys
from collections import defaultdict

TSV = os.path.join(os.environ.get("TEMP", "."), "nox_words.tsv")

words = []  # (img, W, H, x, y, text)
with open(TSV, encoding="utf-8") as f:
    for line in f:
        parts = line.rstrip("\n").split("\t")
        if len(parts) != 6:
            continue
        img, W, H, x, y, text = parts
        words.append((int(img), int(W), int(H), int(x), int(y), text))

# Görselleri ayrı işle
for img in (1, 2):
    ws = [w for w in words if w[0] == img]
    W, H = ws[0][1], ws[0][2]
    print(f"=========== IMAGE {img}  ({W}x{H}) ===========")

    # Y'ye göre satır gruplama: ortanca kelime yüksekliği toleransı
    # Önce ortanca kelime yüksekliğini tahmin et (ykoordinatlar arası farklar)
    ys = sorted({w[4] for w in ws})
    gaps = [b - a for a, b in zip(ys, ys[1:]) if b - a > 0]
    median_gap = sorted(gaps)[len(gaps) // 2] if gaps else 20

    # Satırlar: Y-merkezlerini kümeler
    rows_list = []
    for w in ws:
        _, _, _, x, y, text = w
        placed = False
        for row in rows_list:
            if abs(row["y"] - y) <= max(12, median_gap * 0.6):
                row["words"].append((x, text))
                row["y"] = (row["y"] * (len(row["words"]) - 1) + y) / len(row["words"])
                placed = True
                break
        if not placed:
            rows_list.append({"y": y, "words": [(x, text)]})

    rows_list.sort(key=lambda r: r["y"])
    for row in rows_list:
        row["words"].sort(key=lambda t: t[0])
        # Sütunları ayır: kelimeler arası boşluk > ~2.5 katı ortanca harf genişliği
        texts = [t for _, t in row["words"]]
        xs = [x for x, _ in row["words"]]
        # tahmini ortalama kelime genişliği
        col_widths = [len(t) * 9 for t in texts]
        cols = []
        cur = [(xs[0], texts[0])]
        for i in range(1, len(texts)):
            gap = xs[i] - (xs[i - 1] + len(texts[i - 1]) * 9)
            if gap > 26:
                cols.append(cur)
                cur = [(xs[i], texts[i])]
            else:
                cur.append((xs[i], texts[i]))
        cols.append(cur)
        line_out = "  ||  ".join(" ".join(t for _, t in c) for c in cols)
        print(f"Y={int(row['y']):4d}  {line_out}")