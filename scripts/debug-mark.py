"""Diagnostic: composites the extracted mark onto navy so white-on-transparent
is actually visible, and reports alpha statistics."""

import os
import sys

from PIL import Image

sys.path.insert(0, "scripts")
from extract_logo import OUT  # noqa: E402

name = sys.argv[1] if len(sys.argv) > 1 else "sitetrace-mark-white.png"
path = os.path.join(OUT, name)
im = Image.open(path).convert("RGBA")
alpha = im.getchannel("A")

hist = alpha.histogram()
opaque = hist[255]
partial = sum(hist[1:255])
print(f"{name}: size={im.size}  fully-opaque px={opaque:,}  partial px={partial:,}  transparent px={hist[0]:,}")
print(f"alpha bbox={alpha.getbbox()}")

# Composite over navy so a white mark reads as a shape.
bg = Image.new("RGBA", im.size, (10, 17, 36, 255))
bg.alpha_composite(im)
preview = os.path.join(OUT, f"_debug-{name}")
bg.convert("RGB").save(preview.replace(".png", ".jpg"), "JPEG", quality=92)
print(f"wrote {preview.replace('.png', '.jpg')}")