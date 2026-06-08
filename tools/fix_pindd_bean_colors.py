#!/usr/bin/env python3
"""
Deprecated legacy helper for the removed single-bean PNG workflow.

Current runtime bean art is packed in assets/BootstrapBundle/Beans/bean-atlas.png
with frame metadata in bean-atlas-data.json. Do not regenerate the old per-bean
GameAssetsBundle directories.
"""

import os
from PIL import Image, ImageDraw

# Must match COLOR_HEX in LevelConfig.ts and the bNNN visual palette.
COLOR_HEX = {
    1:  '#ED5090', 2:  '#4EEAEA', 3:  '#F8C811', 4:  '#FE8B10', 5:  '#F4BD9E',
    6:  '#EBDEA6', 7:  '#4A4DCF', 8:  '#7221BC', 9:  '#9FCE21', 10: '#EA281A',
    11: '#37A92D', 12: '#207955', 13: '#20A8DC', 14: '#EEB2BC', 15: '#C4BED9',
    16: '#974714', 17: '#782F3C', 18: '#36387E', 19: '#373737', 20: '#F2EDE4',
}

# Size matches existing Pindd bean PNGs
BEAN_SIZE = 84


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def create_bean_sprite(color_id, variant, size=BEAN_SIZE):
    """Create a bean sprite matching the existing Pindd style.
    variant: 1=locked, 2=normal, 4=slot"""
    r, g, b = hex_to_rgb(COLOR_HEX[color_id])
    pad = 2
    radius = 12
    inset = 5
    cx, cy = size / 2, size / 2
    margin = size / 2 - pad - inset - 2

    # Main body (variant 2 style). Keep the center equal to COLOR_HEX.
    mr, mg, mb = r, g, b

    # Border (darker)
    br, bg, bb = int(r * 0.55), int(g * 0.55), int(b * 0.55)

    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Border
    ow = size - pad * 2
    d.rounded_rectangle([pad, pad, pad + ow, pad + ow], radius=radius,
                        fill=(br, bg, bb, 255))

    # Main body
    iw = size - (pad + inset) * 2
    d.rounded_rectangle([pad + inset, pad + inset, pad + inset + iw, pad + inset + iw],
                        radius=radius - 1, fill=(mr, mg, mb, 255))

    # Highlight strip (top half)
    ip = inset + 2
    iw2 = size - (pad + ip) * 2
    ih = int(iw2 * 0.35)
    if ih > 2:
        hr = min(255, int(r * 0.92 + 80 * 0.08))
        hg = min(255, int(g * 0.92 + 80 * 0.08))
        hb = min(255, int(b * 0.92 + 80 * 0.08))
        d.rounded_rectangle([pad + ip, pad + ip, pad + ip + iw2, pad + ip + ih],
                            radius=max(1, radius - 2), fill=(hr, hg, hb, 204))

    # X-cut triangles
    l2 = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d2 = ImageDraw.Draw(l2)
    d2.polygon([(cx - margin, cy + margin), (cx + margin, cy + margin), (cx, cy)],
               fill=(255, 255, 255, 46))
    d2.polygon([(cx - margin, cy + margin), (cx - margin, cy - margin), (cx, cy)],
               fill=(255, 255, 255, 26))
    d2.polygon([(cx + margin, cy - margin), (cx - margin, cy - margin), (cx, cy)],
               fill=(0, 0, 0, 26))
    d2.polygon([(cx + margin, cy + margin), (cx + margin, cy - margin), (cx, cy)],
               fill=(0, 0, 0, 13))

    # X diagonals
    lw = 2
    d2.line([(cx - margin, cy + margin), (cx + margin, cy - margin)],
            fill=(255, 255, 255, 31), width=lw)
    d2.line([(cx + margin, cy + margin), (cx - margin, cy - margin)],
            fill=(255, 255, 255, 31), width=lw)

    # Locked checkmark
    l3 = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    if variant == 1:
        d3 = ImageDraw.Draw(l3)
        ck = int(size * 0.22)
        d3.line([(cx - ck, cy + ck * 0.2), (cx - ck * 0.2, cy + ck * 0.7), (cx + ck * 0.7, cy - ck * 0.6)],
                fill=(255, 255, 255, 200), width=4)

    result = Image.alpha_composite(Image.alpha_composite(img, l2), l3)
    return result


def create_slot_sprite(color_id, size=64):
    """Create a slot sprite matching the existing Pindd slot style."""
    r, g, b = hex_to_rgb(COLOR_HEX[color_id])
    pad = 4
    rad = 10
    m1 = pad + 3
    r1 = 7
    w1 = size - m1 * 2
    m2 = m1 + 2
    r2 = 6
    w2 = size - m2 * 2
    w_outer = size - pad * 2

    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Outer border
    d.rounded_rectangle([pad, pad, pad + w_outer, pad + w_outer], radius=rad,
                        fill=(int(r * 0.5 + 40), int(g * 0.5 + 40), int(b * 0.5 + 40), 255))
    # Inner
    d.rounded_rectangle([m1, m1, m1 + w1, m1 + w1], radius=r1,
                        fill=(int(r * 0.2 + 15), int(g * 0.2 + 15), int(b * 0.2 + 15), 255))
    # Innermost
    d.rounded_rectangle([m2, m2, m2 + w2, m2 + w2], radius=r2,
                        fill=(int(r * 0.25 + 20), int(g * 0.25 + 20), int(b * 0.25 + 20), 255))

    # Shadow
    l2 = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d2 = ImageDraw.Draw(l2)
    th = int(w2 * 0.45)
    d2.rounded_rectangle([m2 + 1, m2, m2 + w2 - 2, m2 + th], radius=r2, fill=(0, 0, 0, 100))
    d2.rounded_rectangle([m2 + 2, size - m2 - 8, m2 + w2 - 4, size - m2 - 3], radius=2, fill=(255, 255, 255, 60))

    return Image.alpha_composite(img, l2)


def main():
    raise SystemExit(
        'fix_pindd_bean_colors.py is deprecated: single-bean PNGs were removed. '
        'Update assets/BootstrapBundle/Beans/bean-atlas.png and bean-atlas-data.json instead.'
    )


if __name__ == '__main__':
    main()
