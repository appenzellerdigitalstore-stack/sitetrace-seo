"""
Builds the social share card (og:image).

The lockup on its own is a white-on-transparent PNG at a 4.5:1 ratio. Shared
on WhatsApp, LinkedIn or X, that renders as a nearly blank strip - the exact
failure this product is supposed to help other people avoid.

So the card is composed here: brand navy background, the real lockup, and one
line of headline. 1200x630 is the size every major platform crops to.

Run from the project root:
    python scripts/make_og_card.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "public" / "brand"
OUT = BRAND / "og-card.png"

W, H = 1200, 630

NAVY = (7, 11, 22)
GLOW = (20, 32, 58)
TEXT = (226, 232, 240)
MUTED = (148, 163, 184)
ACCENT = (96, 165, 250)

FONT_DIR = Path(r"C:\Windows\Fonts")
REGULAR = FONT_DIR / "segoeui.ttf"
SEMIBOLD = FONT_DIR / "seguisb.ttf"
BOLD = FONT_DIR / "segoeuib.ttf"


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def background() -> Image.Image:
    """Base colour plus the soft glow the site uses behind the hero."""
    base = Image.new("RGB", (W, H), NAVY)

    glow = Image.new("L", (W, H), 0)
    g = ImageDraw.Draw(glow)
    g.ellipse((-260, -520, W + 260, 420), fill=120)
    glow = glow.filter(ImageFilter.GaussianBlur(220))

    tint = Image.new("RGB", (W, H), GLOW)
    return Image.composite(tint, base, glow)


def main() -> None:
    canvas = background()

    # The real lockup: mark plus wordmark, used unmodified.
    lockup = Image.open(BRAND / "sitetrace-lockup.png").convert("RGBA")
    scale = 620 / lockup.width
    lockup = lockup.resize((int(lockup.width * scale), int(lockup.height * scale)), Image.LANCZOS)
    canvas.paste(lockup, (76, 92), lockup)

    draw = ImageDraw.Draw(canvas)

    headline_font = font(BOLD, 62)
    sub_font = font(REGULAR, 29)
    tag_font = font(SEMIBOLD, 26)

    draw.text(
        (76, 300),
        "Find the SEO problems",
        font=headline_font,
        fill=TEXT,
    )
    draw.text(
        (76, 374),
        "on a page.",
        font=headline_font,
        fill=TEXT,
    )

    draw.text(
        (76, 468),
        "Audit it, preview it in Google, and send a branded report.",
        font=sub_font,
        fill=MUTED,
    )

    # Accent rule plus the address, so the card says where it points.
    draw.rectangle((76, 540, 150, 545), fill=ACCENT)
    draw.text((166, 524), "seo.sitetrace.it.com", font=tag_font, fill=ACCENT)

    canvas.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB, {canvas.width}x{canvas.height})")


if __name__ == "__main__":
    main()
