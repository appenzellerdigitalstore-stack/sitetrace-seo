"""
Turns the supplied SiteTrace lockup (a JPEG on a flat navy plate) into the
assets the app actually needs.

The source is a wide horizontal lockup: mark + wordmark + domain, on a solid
navy background. Three problems that has to solve:

  1. the JPEG has no alpha, so it cannot sit on a light surface
  2. the whole lockup is unusable as a favicon or app icon (too wide)
  3. the PDF report header has room for a mark, not a lockup

Splitting mark from wordmark needs care: the wordmark has normal letter
spacing, so "largest gap" alone finds a gap between two letters instead of the
gap between the mark and the text. The split is therefore taken as the largest
gap inside the left half of the image only.

Outputs, into public/brand/:
  sitetrace-mark-white.png   mark only, white, transparent  (UI on dark, PDF header)
  sitetrace-mark-blue.png    mark only, brand blue, transparent (light surfaces)
  sitetrace-lockup.png       full lockup, transparent        (wide hero / footer)
  sitetrace-icon.png         mark on a brand tile, 512x512  (favicon / PWA)
  sitetrace-icon-180.png     same at apple-touch size

Run: python scripts/extract_logo.py "<path-to-logo>"
"""

from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw

# Sampled from the four corners of the source JPEG.
BG = (10, 17, 36)
BRAND_BLUE = (56, 132, 222)  # wordmark gradient mid-tone
# The SiteTrace plate is navy, not blue. A subtle navy lift keeps the icon
# on-brand with the real logo instead of borrowing the old blue/violet tile.
TILE_TOP = (10, 17, 36)
TILE_BOTTOM = (26, 43, 76)

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "brand")


def foreground_mask(img: Image.Image, threshold: int = 60, floor: int = 40) -> Image.Image:
    """Alpha = how far each pixel sits from the flat background plate.

    Two details matter more than they look:

    * The threshold. The source is a JPEG, so the plate carries compression
      noise along its edges; at a low threshold the noise reads as ink and the
      mark/wordmark split lands on a speck near x=0 instead of the real gap
      at x=587. 60 ignores the noise without eating antialiased mark edges.
    * The floor. A pure soft ramp leaves grain at alpha 21 or so, which is
      non-zero, so getbbox() never tightens and the mark ships padded with
      dead space. Anything below `floor` is snapped to fully transparent.
    """
    px = img.load()
    w, h = img.size
    alpha = Image.new("L", (w, h), 0)
    ap = alpha.load()
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            dist = max(abs(c[0] - BG[0]), abs(c[1] - BG[1]), abs(c[2] - BG[2]))
            if dist <= threshold:
                v = int(dist / threshold * 255)
                ap[x, y] = 0 if v < floor else v
            else:
                ap[x, y] = 255
    return alpha


def columns_with_ink(alpha: Image.Image, floor: int = 24) -> list[tuple[int, int]]:
    """Runs of columns containing ink."""
    w, h = alpha.size
    ap = alpha.load()
    runs: list[tuple[int, int]] = []
    start = None
    for x in range(w):
        has = any(ap[x, y] > floor for y in range(h))
        if has and start is None:
            start = x
        elif not has and start is not None:
            runs.append((start, x - 1))
            start = None
    if start is not None:
        runs.append((start, w - 1))
    return runs


def split_point(runs: list[tuple[int, int]], image_width: int) -> int:
    """Right edge of the mark.

    The mark is the leftmost cluster. Letter spacing inside the wordmark
    produces gaps too, so only gaps in the left 55% of the image are
    considered, and the widest of those wins.
    """
    limit = image_width * 0.55
    best_size, best_x = 0, runs[0][1]
    for (_s1, e1), (s2, _e2) in zip(runs, runs[1:]):
        if s2 > limit:
            break
        if s2 - e1 > best_size:
            best_size, best_x = s2 - e1, e1
    return best_x


def trim(alpha: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    ap = alpha.load()
    x0, y0, x1, y1 = box
    for y in range(alpha.size[1]):
        for x in range(alpha.size[0]):
            if x < x0 or x > x1 or y < y0 or y > y1:
                ap[x, y] = 0
    return alpha


def solid_colour(alpha: Image.Image, colour: tuple[int, int, int]) -> Image.Image:
    flat = Image.new("RGBA", alpha.size, colour + (0,))
    flat.putalpha(alpha)
    return flat


def icon_tile(mark: Image.Image, size: int, radius_ratio: float = 0.22) -> Image.Image:
    """Places the mark on a rounded brand tile, at 4x then downsampled."""
    ss = 4
    big = size * ss

    grad = Image.new("RGB", (big, big))
    gp = grad.load()
    for y in range(big):
        t = y / (big - 1)
        gp_row = tuple(int(TILE_TOP[i] + (TILE_BOTTOM[i] - TILE_TOP[i]) * t) for i in range(3))
        for x in range(big):
            gp[x, y] = gp_row

    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * radius_ratio), fill=255)

    tile = grad.convert("RGBA")
    tile.putalpha(mask)

    inner = int(big * 0.58)
    tile.alpha_composite(mark.resize((inner, inner), Image.LANCZOS), ((big - inner) // 2, (big - inner) // 2))
    return tile.resize((size, size), Image.LANCZOS)


def main(src: str) -> None:
    img = Image.open(src).convert("RGB")
    alpha = foreground_mask(img)
    runs = columns_with_ink(alpha)

    cut = split_point(runs, img.size[0])
    mark_alpha = trim(alpha.copy(), (0, 0, cut, img.size[1]))
    box = mark_alpha.getbbox()
    if box is None:
        raise SystemExit("no mark found — check the background sample")
    mark_alpha = mark_alpha.crop(box)
    print(f"mark bbox {box} -> {mark_alpha.size}  (split at x={cut})")

    os.makedirs(OUT, exist_ok=True)

    white = solid_colour(mark_alpha, (255, 255, 255))
    white.save(os.path.join(OUT, "sitetrace-mark-white.png"), "PNG", optimize=True)

    blue = solid_colour(mark_alpha, BRAND_BLUE)
    blue.save(os.path.join(OUT, "sitetrace-mark-blue.png"), "PNG", optimize=True)

    lockup = img.convert("RGBA")
    lockup.putalpha(alpha)
    full = lockup.crop(alpha.getbbox())
    lockup = lockup.crop(alpha.getbbox())
    lockup.save(os.path.join(OUT, "sitetrace-lockup.png"), "PNG", optimize=True)

    for px, name in [(512, "sitetrace-icon.png"), (180, "sitetrace-icon-180.png")]:
        path = os.path.join(OUT, name)
        icon_tile(white, px).save(path, "PNG", optimize=True)
        print(f"wrote {os.path.basename(path)} ({os.path.getsize(path):,} bytes)")

    for f in sorted(os.listdir(OUT)):
        if f.startswith("sitetrace"):
            print(f"   {f}  {os.path.getsize(os.path.join(OUT, f)):,} bytes")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("usage: python scripts/extract_logo.py <path-to-logo>")
    main(sys.argv[1])