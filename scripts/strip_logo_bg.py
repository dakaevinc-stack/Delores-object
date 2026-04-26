"""Remove the opaque black background from the brand logo and save as true RGBA PNG.

Strategy: alpha = smoothstep on per-pixel max(R,G,B).
 - max ≤ T_low   → fully transparent (pure black background)
 - max ≥ T_high  → fully opaque (any coloured / non-black content)
 - in-between    → smooth fade (anti-aliased edges stay soft, no jaggies)

Thresholds chosen so that the dark-navy body of the shield (max≈54) stays fully
opaque while the pure-black background (max=0) is removed.
"""

from PIL import Image, ImageChops

SRC = "public/delovye-resheniya-logo.png"
DST = "public/delovye-resheniya-logo.png"

T_LOW = 5
T_HIGH = 22


def main() -> None:
    src = Image.open(SRC).convert("RGB")
    r, g, b = src.split()
    max_ch = ImageChops.lighter(ImageChops.lighter(r, g), b)

    def ramp(v: int) -> int:
        if v <= T_LOW:
            return 0
        if v >= T_HIGH:
            return 255
        return int(round(255 * (v - T_LOW) / (T_HIGH - T_LOW)))

    alpha = max_ch.point(ramp)
    out = Image.merge("RGBA", (r, g, b, alpha))
    out.save(DST, "PNG", optimize=True)
    print(f"ok: {DST} → {out.size[0]}x{out.size[1]} RGBA")


if __name__ == "__main__":
    main()
