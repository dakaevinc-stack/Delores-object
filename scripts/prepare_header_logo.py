"""Prepare masthead logo: remove black background, flatten onto white, save lossless PNG.

Removes JPEG blockiness at edges by compositing onto white (no semi-transparent fringe
on a white header). Run: .tmp_venv/bin/python scripts/prepare_header_logo.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "delovye-resheniya-logo.png"
DST = ROOT / "public" / "delovye-resheniya-logo.png"


def luminance(r: int, g: int, b: int) -> float:
    return (r * 299 + g * 587 + b * 114) / 1000.0


def black_to_alpha(im: Image.Image) -> Image.Image:
    """Black/near-black → transparent; smooth band for anti-aliased edges."""
    rgba = im.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    t0, t1 = 18.0, 42.0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            L = luminance(r, g, b)
            if L <= t0:
                new_a = 0
            elif L >= t1:
                new_a = a
            else:
                new_a = int(round(a * (L - t0) / (t1 - t0)))
            px[x, y] = (r, g, b, new_a)
    return rgba


def main() -> None:
    raw = Image.open(SRC)
    cut = black_to_alpha(raw)
    out = Image.new("RGB", cut.size, (255, 255, 255))
    out.paste(cut, mask=cut.split()[3])
    out.save(DST, "PNG", optimize=True)
    print(f"ok: {DST} → {out.size[0]}×{out.size[1]} RGB PNG (on white)")


if __name__ == "__main__":
    main()
