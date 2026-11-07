#!/usr/bin/env python3
"""Generate Fantasy Tag Nottingham app icons + splash screen.

Design: mowed-pitch stripes in the brand greens, a yellow tag rugby ball
with white seams and laces, and two orange tag ribbons (the "tags" from a
tag-rugby belt) flying off the ball.

Outputs into mobile/assets/:
  icon.png          1024x1024  App Store / Play icon
  adaptive-icon.png 1024x1024  Android adaptive foreground (66% safe zone)
  splash.png        1284x2778  Splash screen, centred mark + wordmark
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

GREEN = "#0B3D2E"
GREEN_ALT = "#0F4A38"
YELLOW = "#FFD54F"
YELLOW_DARK = "#E8B93B"
ORANGE = "#FF6F00"
WHITE = "#FFFFFF"

OUT = Path(__file__).parent.parent / "mobile" / "assets"
OUT.mkdir(parents=True, exist_ok=True)


def find_bold_font(size: int) -> ImageFont.FreeTypeFont:
    """DejaVu Sans Bold ships with matplotlib."""
    try:
        import matplotlib  # noqa: F401
        from matplotlib import font_manager
        path = font_manager.findfont("DejaVu Sans:bold")
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def pitch_background(size: tuple[int, int]) -> Image.Image:
    """Vertical mowed-stripe background."""
    w, h = size
    img = Image.new("RGB", size, GREEN)
    d = ImageDraw.Draw(img)
    bands = 8
    band_w = w / bands
    for i in range(bands):
        if i % 2 == 1:
            x0, x1 = round(i * band_w), round((i + 1) * band_w)
            d.rectangle([x0, 0, x1, h], fill=GREEN_ALT)
    return img


def tag_ball(scale: float) -> Image.Image:
    """Rugby ball with laces + two tag ribbons hanging below, transparent bg.

    `scale` = 1.0 for a ~640px-wide layer (before rotation).
    """
    import math

    s = scale
    W, H = round(640 * s), round(680 * s)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    bw, bh = round(500 * s), round(300 * s)
    bx, by = (W - bw) // 2, round(120 * s)
    bottom_y = by + bh

    # --- tag ribbons (behind the ball, hanging from its underside) ---------
    rib_l, rib_w = round(200 * s), round(56 * s)
    tip_l = round(56 * s)

    def ribbon(angle_deg: float, anchor: tuple[float, float]) -> None:
        rib = Image.new("RGBA", (rib_w, rib_l), (0, 0, 0, 0))
        rd = ImageDraw.Draw(rib)
        rd.rounded_rectangle([0, 0, rib_w - 1, rib_l - 1],
                             radius=rib_w // 3, fill=ORANGE)
        rd.rounded_rectangle([0, rib_l - tip_l, rib_w - 1, rib_l - 1],
                             radius=rib_w // 3, fill=WHITE)
        rotated = rib.rotate(angle_deg, expand=True, resample=Image.BICUBIC)
        # ribbon runs from anchor along direction after rotation
        rad = math.radians(angle_deg)
        dx, dy = math.sin(rad), math.cos(rad)
        cx = anchor[0] + dx * rib_l / 2
        cy = anchor[1] + dy * rib_l / 2
        layer.alpha_composite(
            rotated, (round(cx - rotated.width / 2), round(cy - rotated.height / 2)))

    ribbon(-48, (bx + round(140 * s), bottom_y - round(30 * s)))       # left tag, swings down-left
    ribbon(48, (bx + bw - round(140 * s), bottom_y - round(30 * s)))   # right tag, swings down-right

    # --- ball body on its own layer, clipped to the ellipse ----------------
    ball = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(ball)
    bd.ellipse([bx, by, bx + bw, by + bh], fill=YELLOW,
               outline=YELLOW_DARK, width=round(7 * s))

    # end stripes (full-height rectangles; the ellipse mask clips them)
    stripe_w = round(36 * s)
    for ox in (bx + round(78 * s), bx + bw - round(78 * s) - stripe_w):
        bd.rectangle([ox, by, ox + stripe_w, by + bh], fill=WHITE)

    # centre seam + laces
    cx0 = bx + round(bw * 0.34)
    cx1 = bx + round(bw * 0.66)
    cy = by + bh // 2
    bd.line([cx0, cy, cx1, cy], fill=WHITE, width=round(10 * s))
    n_laces = 4
    for i in range(n_laces):
        lx = cx0 + round((i + 0.5) * (cx1 - cx0) / n_laces)
        bd.line([lx, cy - round(24 * s), lx, cy + round(24 * s)],
                fill=WHITE, width=round(8 * s))

    # clip everything to the ellipse
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).ellipse([bx, by, bx + bw, by + bh], fill=255)
    ball.putalpha(Image.composite(ball.getchannel("A"),
                                  Image.new("L", (W, H), 0), mask))
    layer.alpha_composite(ball)

    return layer.rotate(-18, expand=True, resample=Image.BICUBIC)


def make_icon(path: Path, size: int, logo_frac: float) -> None:
    img = pitch_background((size, size)).convert("RGBA")
    ball = tag_ball(size / 620 * logo_frac)
    x = (size - ball.width) // 2
    y = (size - ball.height) // 2
    img.alpha_composite(ball, (x, y))
    img.convert("RGB").save(path, "PNG")
    print(f"wrote {path} ({size}x{size})")


def make_splash(path: Path, size: tuple[int, int]) -> None:
    w, h = size
    img = pitch_background(size).convert("RGBA")
    ball = tag_ball(w / 620 * 0.62)
    img.alpha_composite(ball, ((w - ball.width) // 2, round(h * 0.32) - ball.height // 2))

    d = ImageDraw.Draw(img)
    title_font = find_bold_font(round(w * 0.085))
    sub_font = find_bold_font(round(w * 0.038))

    title = "FANTASY TAG"
    sub = "NOTTINGHAM"
    for text, fnt, y_frac, colour in (
        (title, title_font, 0.58, WHITE),
        (sub, sub_font, 0.655, YELLOW),
    ):
        bbox = d.textbbox((0, 0), text, font=fnt)
        tw = bbox[2] - bbox[0]
        d.text(((w - tw) / 2, h * y_frac), text, font=fnt, fill=colour)

    img.convert("RGB").save(path, "PNG")
    print(f"wrote {path} ({w}x{h})")


if __name__ == "__main__":
    make_icon(OUT / "icon.png", 1024, logo_frac=0.9)
    make_icon(OUT / "adaptive-icon.png", 1024, logo_frac=0.62)  # 66% safe zone
    make_splash(OUT / "splash.png", (1284, 2778))
