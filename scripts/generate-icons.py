#!/usr/bin/env python3
"""
Gera o ícone do Micshare (master artwork) e todos os derivados para o
app Windows (Tauri) e o app Android.

Uso:
    python scripts/generate-icons.py master   # gera assets/icon-source.png (1024x1024)
    python scripts/generate-icons.py assets   # gera os ícones a partir do master
    python scripts/generate-icons.py all      # master + assets

O master é a fonte única de verdade: basta substituir assets/icon-source.png
pelo arquivo final e rodar `assets` para reprocessar tudo.
"""
from __future__ import annotations

import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "assets" / "icon-source.png"
TAURI_ICONS = ROOT / "pc" / "src-tauri" / "icons"
ANDROID_RES = ROOT / "mobile" / "app" / "src" / "main" / "res"

S = 1024  # resolução do master

# Paleta
GOLD = (233, 182, 46)
GOLD_DARK = (200, 154, 34)
BADGE_TOP = (46, 46, 46)
BADGE_BOTTOM = (24, 24, 24)
CREAM = (243, 233, 204)
CREAM_DARK = (214, 202, 173)
RED_TOP = (238, 74, 51)
RED_BOTTOM = (192, 34, 31)
TEAL = (126, 154, 154)
ORANGE = (245, 130, 32)
LIME = (201, 212, 46)


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def gradient_box(size, box, radius, top, bottom):
    """Retângulo de cantos arredondados preenchido com gradiente vertical."""
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=255)

    grad = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(grad)
    y0, y1 = box[1], box[3]
    for y in range(y0, y1 + 1):
        t = (y - y0) / max(1, y1 - y0)
        draw.line([(box[0], y), (box[2], y)], fill=lerp(top, bottom, t) + (255,))

    out = Image.new("RGBA", size, (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)
    return out


def capsule(size, box, radius, top_a, top_b, bottom_a, bottom_b, split_ratio):
    """Cápsula (microfone) com metade superior clara e inferior vermelha."""
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=255)

    grad = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(grad)
    y0, y1 = box[1], box[3]
    split = y0 + int((y1 - y0) * split_ratio)
    for y in range(y0, y1 + 1):
        if y <= split:
            t = (y - y0) / max(1, split - y0)
            color = lerp(top_a, top_b, t)
        else:
            t = (y - split) / max(1, y1 - split)
            color = lerp(bottom_a, bottom_b, t)
        draw.line([(box[0], y), (box[2], y)], fill=color + (255,))

    out = Image.new("RGBA", size, (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)
    return out


def build_master() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # ---- Badge (quadrado arredondado escuro) ----
    badge_box = (24, 24, S - 24, S - 24)
    img.alpha_composite(gradient_box((S, S), badge_box, 168, BADGE_TOP, BADGE_BOTTOM))

    # ---- Bordas douradas (dupla) ----
    draw.rounded_rectangle(badge_box, radius=168, outline=GOLD + (255,), width=26)
    inner = (badge_box[0] + 40, badge_box[1] + 40, badge_box[2] - 40, badge_box[3] - 40)
    draw.rounded_rectangle(inner, radius=130, outline=GOLD_DARK + (255,), width=9)

    # ---- Ondas de som (arcos concêntricos) ----
    cx, cy = 512, 352
    for radius, color, start, end in (
        (168, ORANGE, 197, 343),
        (238, LIME, 190, 350),
    ):
        draw.arc(
            [cx - radius, cy - radius, cx + radius, cy + radius],
            start=start,
            end=end,
            fill=color + (255,),
            width=20,
        )
    # arco externo: verde à esquerda, laranja à direita
    r = 308
    draw.arc([cx - r, cy - r, cx + r, cy + r], start=184, end=270, fill=LIME + (255,), width=20)
    draw.arc([cx - r, cy - r, cx + r, cy + r], start=270, end=356, fill=ORANGE + (255,), width=20)

    # ---- Microfone ----
    # Berço primeiro (fica atrás da cápsula), como no desenho original.
    holder = CREAM + (255,)
    draw.line([(444, 340), (444, 430)], fill=holder, width=25)
    draw.line([(580, 340), (580, 430)], fill=holder, width=25)
    draw.arc([444, 362, 580, 498], start=0, end=180, fill=holder, width=25)

    # haste (fica atrás da base)
    draw.rectangle([499, 470, 525, 524], fill=TEAL + (255,))

    img.alpha_composite(
        capsule((S, S), (446, 238, 578, 456), 66, CREAM, CREAM_DARK, RED_TOP, RED_BOTTOM, 0.47)
    )

    # base: esquerda creme, direita teal
    draw.rounded_rectangle([430, 518, 594, 554], radius=18, fill=TEAL + (255,))
    draw.rounded_rectangle(
        [430, 518, 512, 554], radius=18, fill=CREAM + (255,), corners=(True, True, False, False)
    )

    # ---- Nome ----
    font = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 132)
    text = "Micshare"
    bbox = draw.textbbox((0, 0), text, font=font)
    draw.text(
        ((S - (bbox[2] - bbox[0])) / 2 - bbox[0], 786 - bbox[1]),
        text,
        font=font,
        fill=CREAM + (255,),
    )

    return img


def write_ico(img: Image.Image, path: Path):
    img.save(path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


def write_icns(img: Image.Image, path: Path):
    """ICNS mínimo com payloads PNG (ic11/ic12/ic07/ic08/ic09/ic10)."""
    entries = [
        (b"ic11", 32),
        (b"ic12", 64),
        (b"ic07", 128),
        (b"ic08", 256),
        (b"ic09", 512),
        (b"ic10", 1024),
    ]
    import io

    chunks = []
    for kind, size in entries:
        buf = io.BytesIO()
        img.resize((size, size), Image.LANCZOS).convert("RGBA").save(buf, format="PNG")
        data = buf.getvalue()
        chunks.append(kind + struct.pack(">I", len(data) + 8) + data)

    body = b"".join(chunks)
    path.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)


def generate_assets(master: Image.Image):
    # ---------- Tauri / Windows ----------
    TAURI_ICONS.mkdir(parents=True, exist_ok=True)
    for name, size in (("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256)):
        master.resize((size, size), Image.LANCZOS).save(TAURI_ICONS / name)
    write_ico(master, TAURI_ICONS / "icon.ico")
    write_icns(master, TAURI_ICONS / "icon.icns")
    print(f"tauri  -> {TAURI_ICONS}")

    # ---------- Android ----------
    densities = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

    for density, factor in densities.items():
        folder = ANDROID_RES / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)

        # ícone legado quadrado
        legacy = int(48 * factor)
        master.resize((legacy, legacy), Image.LANCZOS).save(folder / "ic_launcher.png")

        # ícone legado redondo (máscara circular)
        round_mask = Image.new("L", (legacy, legacy), 0)
        ImageDraw.Draw(round_mask).ellipse((0, 0, legacy - 1, legacy - 1), fill=255)
        rounded = master.resize((legacy, legacy), Image.LANCZOS)
        circle = Image.new("RGBA", (legacy, legacy), (0, 0, 0, 0))
        circle.paste(rounded, (0, 0), round_mask)
        circle.save(folder / "ic_launcher_round.png")

        # foreground adaptativo: artwork em 72/108 do canvas (safe zone)
        fg = int(108 * factor)
        art = int(72 * factor)
        canvas = Image.new("RGBA", (fg, fg), (0, 0, 0, 0))
        scaled = master.resize((art, art), Image.LANCZOS)
        canvas.alpha_composite(scaled, ((fg - art) // 2, (fg - art) // 2))
        canvas.save(folder / "ic_launcher_foreground.png")

    # adaptive icons (API 26+)
    anydpi = ANDROID_RES / "mipmap-anydpi-v26"
    anydpi.mkdir(parents=True, exist_ok=True)
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        (anydpi / name).write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '    <background android:drawable="@color/micshare_icon_background"/>\n'
            '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
            "</adaptive-icon>\n",
            encoding="utf-8",
        )
    print(f"android -> {ANDROID_RES}")


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "all"

    if command in ("master", "all"):
        MASTER.parent.mkdir(parents=True, exist_ok=True)
        master = build_master()
        master.save(MASTER)
        print(f"master -> {MASTER} ({master.size[0]}x{master.size[1]})")

    if command in ("assets", "all"):
        if not MASTER.exists():
            print("Erro: assets/icon-source.png não existe. Rode 'master' antes.", file=sys.stderr)
            sys.exit(1)
        generate_assets(Image.open(MASTER).convert("RGBA"))


if __name__ == "__main__":
    main()
