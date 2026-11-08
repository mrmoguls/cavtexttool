#!/usr/bin/env python3
"""Make the CAV Hub app icons from the Care-A-Van logo.

Usage (from the project folder):
    python3 scripts/make-icons.py                # uses public/brand/logo.png
    python3 scripts/make-icons.py path/to/logo.png

Writes:
    public/icons/icon-192.png, icon-512.png    app icons (Android / install)
    public/icons/maskable-512.png              Android adaptive icon (extra safe-zone padding)
    public/icons/apple-touch-icon.png          iPhone home screen (180 x 180)
    public/favicon.png                         browser tab (64 x 64)

The logo is centered on a white square with padding, so the wide badge isn't cut off.
Needs Pillow (pip install pillow).
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'public' / 'brand' / 'logo.png'


def trim_white(img: Image.Image) -> Image.Image:
    """Crop away plain white / transparent margins around the logo."""
    rgba = img.convert('RGBA')
    bg = Image.new('RGBA', rgba.size, (255, 255, 255, 255))
    flat = Image.alpha_composite(bg, rgba).convert('RGB')
    # Anything noticeably darker than white counts as logo.
    mask = flat.point(lambda v: 255 if v < 245 else 0).convert('L')
    box = mask.getbbox()
    return rgba.crop(box) if box else rgba


def square(img: Image.Image, size: int, padding: float) -> Image.Image:
    """Fit `img` inside a white size x size square, leaving `padding` (fraction) on each side."""
    canvas = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    inner = int(size * (1 - 2 * padding))
    logo = img.copy()
    logo.thumbnail((inner, inner), Image.LANCZOS)
    canvas.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    return canvas.convert('RGB')


def main() -> None:
    if not SRC.exists():
        sys.exit(f'Logo not found: {SRC}\nPut the logo at public/brand/logo.png (PNG, ideally 1000px+ wide) and run this again.')
    logo = trim_white(Image.open(SRC))
    out = ROOT / 'public' / 'icons'
    out.mkdir(parents=True, exist_ok=True)
    square(logo, 192, 0.06).save(out / 'icon-192.png', optimize=True)
    square(logo, 512, 0.06).save(out / 'icon-512.png', optimize=True)
    square(logo, 512, 0.14).save(out / 'maskable-512.png', optimize=True)   # Android crops to a circle
    square(logo, 180, 0.06).save(out / 'apple-touch-icon.png', optimize=True)
    square(logo, 64, 0.02).save(ROOT / 'public' / 'favicon.png', optimize=True)
    # A trimmed copy for the in-app header.
    logo.save(ROOT / 'public' / 'brand' / 'logo-trimmed.png', optimize=True)
    print(f'Icons written from {SRC.name}: public/icons/*, public/favicon.png, public/brand/logo-trimmed.png')


if __name__ == '__main__':
    main()
