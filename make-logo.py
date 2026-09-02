"""Turn the supplied logo.jpg into web assets.

The source is a solid single-colour mark on a white JPEG background. We key the
white out to alpha so the same file works on both the light and the dark theme,
then cut the two pieces the site actually needs: the monogram alone (header,
favicon) and the full lockup with the strapline (footer).
"""
from PIL import Image
from collections import Counter
import os

SRC = 'logo files/logo.jpg'
OUT = 'public'
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert('RGB')
W, H = im.size
print(f'source: {W}x{H}')

# ---- exact brand colour: the most common non-white pixel
counts = Counter()
for x in range(0, W, 3):
    for y in range(0, H, 3):
        p = im.getpixel((x, y))
        if sum(p) < 700:            # ignore white/near-white
            counts[p] += 1
brand = counts.most_common(1)[0][0]
BRAND_HEX = '#%02X%02X%02X' % brand
print(f'brand colour: {BRAND_HEX}  rgb{brand}')

# ---- white -> alpha, keeping the mark's own colour and its antialiased edges
rgba = im.convert('RGBA')
px = rgba.load()
for y in range(H):
    for x in range(W):
        r, g, b, _ = px[x, y]
        # luminance drives alpha: white = transparent, brand colour = opaque
        lum = (r * 299 + g * 587 + b * 114) / 1000
        a = 255 - int(lum) if lum < 255 else 0
        # rescale so the darkest pixel becomes fully opaque
        a = min(255, int(a * 255 / (255 - (brand[0] * 299 + brand[1] * 587 + brand[2] * 114) / 1000)))
        px[x, y] = (brand[0], brand[1], brand[2], a) if a > 0 else (0, 0, 0, 0)


def bbox_of(img):
    return img.getbbox()


full = rgba.crop(bbox_of(rgba))
print(f'trimmed lockup: {full.size[0]}x{full.size[1]}')

# ---- split: the strapline is the band of content below the monogram.
# Find the widest empty horizontal gap in the lower half — that is the split.
fw, fh = full.size
alpha = full.split()[3]
rows = [alpha.crop((0, y, fw, y + 1)).getextrema()[1] for y in range(fh)]

gap_start = gap_len = best_start = best_len = 0
for y in range(int(fh * 0.5), fh):
    if rows[y] == 0:
        if gap_len == 0:
            gap_start = y
        gap_len += 1
        if gap_len > best_len:
            best_len, best_start = gap_len, gap_start
    else:
        gap_len = 0
split = best_start + best_len // 2
print(f'split at y={split} of {fh} (gap {best_len}px)')

mark = full.crop((0, 0, fw, best_start))
mark = mark.crop(bbox_of(mark))
print(f'monogram: {mark.size[0]}x{mark.size[1]}')


def save(img, name, target_h):
    w = max(1, round(img.size[0] * target_h / img.size[1]))
    out = img.resize((w, target_h), Image.LANCZOS)
    path = os.path.join(OUT, name)
    out.save(path, 'PNG', optimize=True)
    print(f'  {name}  {w}x{target_h}  {os.path.getsize(path)} bytes')


print('written:')
save(mark, 'logo-mark.png', 240)      # header, ~40px displayed at 6x
save(full, 'logo.png', 560)           # footer lockup with strapline

# square icon: monogram centred on the brand colour's dark counterpart
side = 512
icon = Image.new('RGBA', (side, side), (0, 0, 0, 0))
pad = 84
mw = side - pad * 2
mh = max(1, round(mark.size[1] * mw / mark.size[0]))
if mh > side - pad * 2:
    mh = side - pad * 2
    mw = max(1, round(mark.size[0] * mh / mark.size[1]))
icon.paste(mark.resize((mw, mh), Image.LANCZOS), ((side - mw) // 2, (side - mh) // 2))
icon.save(os.path.join(OUT, 'logo-icon.png'), 'PNG', optimize=True)
print(f'  logo-icon.png  {side}x{side}  {os.path.getsize(os.path.join(OUT, "logo-icon.png"))} bytes')

with open(os.path.join(OUT, '.brand-colour'), 'w') as f:
    f.write(BRAND_HEX)
