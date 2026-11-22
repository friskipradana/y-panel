"""Run: python scripts/make-brand-icons.py   (needs Pillow)

Reneo icon set rebuilt as clean geometry, following the supplied REN brand kit:
navy rounded square with a white geometric "R" (stem, rounded head with a thin slot,
diagonal leg). Same shapes feed the raster (Pillow, supersampled) and the SVG."""
import os
import sys

from PIL import Image, ImageDraw

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public'))
NAVY = (11, 42, 87)  # #0B2A57 from the kit palette
WHITE = (255, 255, 255)

# Geometry on a 512 grid
SQUARE = (40, 40, 472, 472)
SQUARE_R = 92

# (kind, params, colour) painted in order
SHAPES = [
    # head: block with rounded right side (the bowl)
    ('rrect', (146, 150, 366, 302, 62, {'tl': 10, 'bl': 10}), 'white'),
    # stem
    ('rect', (146, 150, 206, 366), 'white'),
    # leg
    ('poly', [(238, 296), (300, 296), (378, 366), (310, 366)], 'white'),
    # thin slot between the top bar and the body
    ('rrect', (146, 212, 306, 228, 8, {'tl': 0, 'bl': 0}), 'navy'),
    # notch between stem and leg
    ('poly', [(206, 302), (244, 302), (300, 366), (206, 366)], 'navy'),
]

COLORS = {'navy': NAVY, 'white': WHITE}


def render(size: int, glyph_scale: float = 1.0, bleed: bool = False) -> Image.Image:
    ss = 4
    s = size * ss
    k = s / 512.0
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # glyph is scaled around the centre for the maskable variant
    def t(v):
        return (256 + (v - 256) * glyph_scale) * k

    if bleed:
        d.rectangle((0, 0, s, s), fill=(*NAVY, 255))
    else:
        d.rounded_rectangle([SQUARE[0] * k, SQUARE[1] * k, SQUARE[2] * k, SQUARE[3] * k], radius=SQUARE_R * k, fill=(*NAVY, 255))

    for kind, p, col in SHAPES:
        fill = (*COLORS[col], 255)
        if kind == 'rect':
            d.rectangle([t(p[0]), t(p[1]), t(p[2]), t(p[3])], fill=fill)
        elif kind == 'poly':
            d.polygon([(t(x), t(y)) for x, y in p], fill=fill)
        elif kind == 'rrect':
            x0, y0, x1, y1, r, corners = p
            d.rounded_rectangle(
                [t(x0), t(y0), t(x1), t(y1)],
                radius=r * glyph_scale * k,
                fill=fill,
                corners=(True, True, True, True),
            )
            # square off the left corners that should be tight (head/slot start)
            tl = corners.get('tl', r)
            bl = corners.get('bl', r)
            if tl < r:
                d.rectangle([t(x0), t(y0), t(x0 + r), t(y0 + r)], fill=fill)
            if bl < r:
                d.rectangle([t(x0), t(y1 - r), t(x0 + r), t(y1)], fill=fill)
    return img.resize((size, size), Image.LANCZOS)


def svg(bleed: bool = False, glyph_scale: float = 1.0) -> str:
    def t(v):
        return round(256 + (v - 256) * glyph_scale, 2)

    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Reneo">']
    if bleed:
        out.append(f'  <rect width="512" height="512" fill="#0B2A57"/>')
    else:
        x0, y0, x1, y1 = SQUARE
        out.append(f'  <rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" rx="{SQUARE_R}" fill="#0B2A57"/>')
    for kind, p, col in SHAPES:
        fill = '#FFFFFF' if col == 'white' else '#0B2A57'
        if kind == 'rect':
            x0, y0, x1, y1 = p
            out.append(f'  <rect x="{t(x0)}" y="{t(y0)}" width="{round((x1 - x0) * glyph_scale, 2)}" height="{round((y1 - y0) * glyph_scale, 2)}" fill="{fill}"/>')
        elif kind == 'poly':
            pts = ' '.join(f'{t(x)},{t(y)}' for x, y in p)
            out.append(f'  <polygon points="{pts}" fill="{fill}"/>')
        elif kind == 'rrect':
            x0, y0, x1, y1, r, corners = p
            out.append(
                f'  <rect x="{t(x0)}" y="{t(y0)}" width="{round((x1 - x0) * glyph_scale, 2)}" height="{round((y1 - y0) * glyph_scale, 2)}" rx="{round(r * glyph_scale, 2)}" fill="{fill}"/>'
            )
            tl = corners.get('tl', r)
            bl = corners.get('bl', r)
            if tl < r:
                out.append(f'  <rect x="{t(x0)}" y="{t(y0)}" width="{round(r * glyph_scale, 2)}" height="{round(r * glyph_scale, 2)}" fill="{fill}"/>')
            if bl < r:
                out.append(f'  <rect x="{t(x0)}" y="{t(y1 - r)}" width="{round(r * glyph_scale, 2)}" height="{round(r * glyph_scale, 2)}" fill="{fill}"/>')
    out.append('</svg>')
    return '\n'.join(out) + '\n'


def save(img, *parts):
    path = os.path.join(OUT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    print('wrote', os.path.relpath(path, OUT), img.size)


if __name__ == '__main__':
    preview_only = '--preview' in sys.argv
    if preview_only:
        render(512).save(os.path.join(OUT, '..', 'scratch-preview.png'))
        sys.exit(0)

    for n in (16, 32, 48):
        save(render(n), f'favicon-{n}x{n}.png')
    save(render(180), 'apple-touch-icon.png')
    for n in (64, 128, 256, 512):
        save(render(n), 'brand', f'reneo-icon-{n}.png')
    save(render(192), 'brand', 'icon-192.png')
    save(render(512), 'brand', 'icon-512.png')
    save(render(512, glyph_scale=0.78, bleed=True), 'brand', 'icon-maskable-512.png')
    render(256).save(os.path.join(OUT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print('wrote favicon.ico')
    with open(os.path.join(OUT, 'favicon.svg'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(svg())
    with open(os.path.join(OUT, 'pwa-maskable.svg'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(svg(bleed=True, glyph_scale=0.78))
    print('wrote favicon.svg, pwa-maskable.svg')
