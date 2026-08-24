"""Crop the white padding around the masthead logotype.

The source asset is a 1024×1024 square in which the artwork occupies only
669×364 — the remaining ~65% of the height is white padding baked into the
file. With `object-fit: contain` that padding becomes real layout space and
inflates the masthead by hundreds of pixels, so we trim it once here and let
CSS control the spacing instead.

Run: .tmp_venv/bin/python scripts/trim_header_logo.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "delovye-resheniya-logo.png"
DST = ROOT / "public" / "brand-logotype.png"

# Пиксель считаем частью логотипа, если он заметно темнее белого.
NON_WHITE_THRESHOLD = 24
# Небольшой запас, чтобы сглаженные края не обрезались вплотную.
MARGIN = 6


def content_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    rgb = im.convert("RGB")
    px = rgb.load()
    w, h = rgb.size
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if (255 - r) + (255 - g) + (255 - b) > NON_WHITE_THRESHOLD:
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    if max_x < 0:
        raise SystemExit("logo appears to be entirely white")
    return (
        max(0, min_x - MARGIN),
        max(0, min_y - MARGIN),
        min(w, max_x + 1 + MARGIN),
        min(h, max_y + 1 + MARGIN),
    )


def main() -> None:
    src = Image.open(SRC)
    box = content_bbox(src)
    out = src.convert("RGB").crop(box)
    out.save(DST, "PNG", optimize=True)
    print(f"ok: {DST.name} → {out.size[0]}×{out.size[1]} (was {src.size[0]}×{src.size[1]})")


if __name__ == "__main__":
    main()
