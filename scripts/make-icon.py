"""
Renders the PageLens app icon to PNG at 512x512 (and a 180px apple-touch size).

The icon is generated from the same geometry as the SVG mark and the mark
drawn into the PDF, so the brand stays identical across every surface:
app header, favicon, report header, and store listing.

Run: python scripts/make-icon.py
"""

from __future__ import annotations

import os
from PIL import Image, ImageDraw

SS = 4  # supersampling factor for clean edges
SIZE = 512
BLUE = (37, 99, 235)
VIOLET = (124, 58, 237)
WHITE = (255, 255, 255)


def gradient(size: int, c0: tuple[int, int, int], c1: tuple[int, int, int]) -> Image.Image:
    """Diagonal blue -> violet gradient."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            # Project onto the diagonal so the blend runs top-left to bottom-right.
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))
    return img


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def draw_mark(canvas: Image.Image) -> None:
    """White lens-over-document line art, drawn at supersampled scale.

    Geometry is tuned against a 512px tile:
      - two document lines sit clear above the lens
      - the lens holds a two-bar chart entirely inside its circle
      - the handle leaves the rim at 45 degrees and stays within the tile
    """
    d = ImageDraw.Draw(canvas)
    s = canvas.width / SIZE
    w = max(2, int(round(24 * s)))  # stroke weight

    # The mark is drawn around a nominal 512 grid, then nudged so the optical
    # centre of the whole composition lands on the tile centre.
    ox, oy = -10, -38

    def P(x: float, y: float) -> tuple[int, int]:
        return int(round((x + ox) * s)), int(round((y + oy) * s))

    # --- document lines, above the lens ---------------------------------
    d.line([P(132, 148), P(336, 148)], fill=WHITE, width=w)
    d.line([P(132, 202), P(268, 202)], fill=WHITE, width=w)

    # --- lens -----------------------------------------------------------
    cx, cy, r = 258, 322, 88
    C = P(cx, cy)
    R = int(round(r * s))
    d.ellipse([C[0] - R, C[1] - R, C[0] + R, C[1] + R], outline=WHITE, width=w)

    # --- handle, starting just outside the rim on the 45 deg diagonal ---
    dx = dy = r * 0.72  # 0.707 would be exactly on the rim; 0.72 clears the stroke
    d.line([P(cx + dx, cy + dy), P(cx + dx + 88, cy + dy + 88)], fill=WHITE, width=w)

    # --- two bars fully inside the lens, suggesting an audit score -------
    # Base sits 44px above the rim centre-line so neither bar touches the
    # circle stroke at its own x position.
    base = cy + r - 44
    bar_w = 20
    d.rectangle([*(P(cx - 40, base - 42)), *(P(cx - 40 + bar_w, base))], fill=WHITE)
    d.rectangle([*(P(cx - 12, base - 74)), *(P(cx - 12 + bar_w, base))], fill=WHITE)


def build(size: int, radius_ratio: float = 0.22) -> Image.Image:
    big = size * SS
    base = gradient(big, BLUE, VIOLET).convert("RGBA")
    mask = rounded_mask(big, int(big * radius_ratio))
    base.putalpha(mask)
    draw_mark(base)
    return base.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "brand")
    os.makedirs(out_dir, exist_ok=True)

    for px, name in [(512, "pagelens-icon.png"), (180, "pagelens-icon-180.png")]:
        path = os.path.join(out_dir, name)
        build(px).save(path, "PNG", optimize=True)
        print(f"wrote {path} ({os.path.getsize(path):,} bytes)")