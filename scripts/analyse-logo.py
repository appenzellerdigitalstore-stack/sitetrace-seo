"""Diagnostic: prints the ink-column runs so the mark/wordmark split is visible."""

import sys

from PIL import Image

sys.path.insert(0, "scripts")
from extract_logo import BG, columns_with_ink, foreground_mask  # noqa: E402

SRC = (
    r"C:\Users\edy_a\.minimax\v2\assets\2026\10\22\14-01-26-403-asset_"
    r"20261022-140126-403_7bf71ddc970e_3dcd3c01-Gemini_Generated_Image_h8tq05h8tq05h8tq.jfif"
)

img = Image.open(SRC).convert("RGB")
alpha = foreground_mask(img, threshold=60)  # stricter, to shrug off JPEG noise
runs = columns_with_ink(alpha)
w = img.size[0]

print(f"width={w}  runs={len(runs)}")
print(f"first run={runs[0]}  last run={runs[-1]}")

# Ink density per 50px bucket makes the two clusters obvious at a glance.
px = alpha.load()
print("\nink density (x-bucket -> % columns with ink):")
for b in range(0, w, 100):
    cols = sum(1 for x in range(b, min(b + 100, w)) if any(px[x, y] > 24 for y in range(0, img.size[1], 2)))
    print(f"  {b:5d} {'#' * (cols // 2)} {cols:3d}")

print("\nruns in the left 45%:")
for r in runs:
    if r[0] > w * 0.45:
        break
    print("  ", r)