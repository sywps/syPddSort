"""Export game-sized portraits from retained original artwork; keep frame alpha intact."""
import json
from pathlib import Path
from PIL import Image


def round_avatar_corners(image, radius=5, samples=8):
    """Clip only corner alpha; leave the existing quantized RGB pixels untouched."""
    image = image.convert('RGBA')
    pixels = image.load()
    width, height = image.size
    for y in range(radius):
        for x in range(radius):
            inside = sum(
                (x + (sx + 0.5) / samples - radius) ** 2
                + (y + (sy + 0.5) / samples - radius) ** 2 <= radius ** 2
                for sy in range(samples) for sx in range(samples)
            )
            alpha = round(255 * inside / (samples * samples))
            for xx, yy in ((x, y), (width - 1 - x, y),
                           (x, height - 1 - y), (width - 1 - x, height - 1 - y)):
                pixels[xx, yy] = (*pixels[xx, yy][:3], alpha)
    return image

root = Path(__file__).resolve().parent.parent
source = root / 'config/profile-art-source'
output = root / 'temp/profile-art-export'
output.mkdir(parents=True, exist_ok=True)
normalization_file = source / 'frame-normalization.json'
normalization = json.loads(normalization_file.read_text(encoding='utf-8')) if normalization_file.exists() else {}
for row in json.loads((source / 'catalog.json').read_text(encoding='utf-8'))['items']:
    with Image.open(source / row['source']) as image:
        if row['kind'] == 'avatar':
            image = image.convert('RGB').resize((160, 160), Image.Resampling.LANCZOS)
            image = image.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
            image = round_avatar_corners(image)
        else:
            geometry = normalization.get(str(row['id']))
            if geometry:
                left, top, right, bottom = geometry['sourceBounds']
                scale = (144 / max(right-left, bottom-top)) * (256 / 240)
                cx, cy = (left+right)/2, (top+bottom)/2
                image = image.convert('RGBA').convert('RGBa').transform(
                    (256, 256), Image.Transform.AFFINE,
                    (1/scale, 0, cx-128/scale, 0, 1/scale, cy-128/scale),
                    Image.Resampling.BICUBIC).convert('RGBA')
            # Premultiplied alpha avoids dark fringes around transparent decorations.
            image = image.convert('RGBA').convert('RGBa').resize((256, 256), Image.Resampling.LANCZOS).convert('RGBA')
            # Indexed PNG retains per-palette alpha; originals remain available for larger exports.
            image = image.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        image.save(output / f"{row['id']}.png", optimize=True)
