"""Подготовка брендинга Vantara для сборки форка.

Surfer ждёт строго определённый набор файлов в configs/branding/<бренд>/.
Отсутствие любого из них валит сборку на середине, поэтому набор
генерируется скриптом из одного исходника, а не собирается руками.

    python tools/build-branding.py

Что создаётся:
    logo16..512.png   иконки приложения (22 и 24 нужны Linux)
    logo.png          основной логотип, идёт на экран "О программе"
    logo-mac.png      иконка macOS: с полями по краям, как требует Apple
    firefox.ico       мультиразмерная иконка Windows
    firefox64.ico     отдельная иконка 64px для установщика

Имена firefox*.ico заданы surfer и менять их нельзя: сборочная система
Firefox ищет файлы именно под этими именами. Содержимое при этом наше.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "brand" / "logo" / "mark.png"
BRAND = "stable"                       # соответствует brands в surfer.json
OUT = ROOT / "configs" / "branding" / BRAND

# Размеры, которые surfer требует поимённо. Список менять нельзя:
# отсутствие даже одного файла останавливает сборку.
SIZES = [16, 22, 24, 32, 48, 64, 128, 256, 512]

ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]


def squarify(img: Image.Image, pad_ratio: float = 0.0) -> Image.Image:
    """Вписывает изображение в прозрачный квадрат по большей стороне."""
    img = img.convert("RGBA")
    side = round(max(img.size) * (1 + pad_ratio * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
    return canvas


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Нет исходного логотипа: {SOURCE}")

    OUT.mkdir(parents=True, exist_ok=True)
    mark = squarify(Image.open(SOURCE), pad_ratio=0.04)

    for size in SIZES:
        mark.resize((size, size), Image.LANCZOS).save(OUT / f"logo{size}.png")
    print(f"  logo<размер>.png: {', '.join(map(str, SIZES))}")

    # Основной логотип. Surfer сам уменьшит его для экрана «О программе».
    mark.resize((512, 512), Image.LANCZOS).save(OUT / "logo.png")
    print("  logo.png: 512")

    # macOS оставляет вокруг иконки заметные поля — примерно десятая часть
    # стороны. Без них иконка выглядит крупнее соседних в доке.
    mac = squarify(Image.open(SOURCE), pad_ratio=0.10)
    mac.resize((512, 512), Image.LANCZOS).save(OUT / "logo-mac.png")
    print("  logo-mac.png: 512 с полями по краям")

    ico = mark.resize((256, 256), Image.LANCZOS)
    ico.save(OUT / "firefox.ico", format="ICO",
             sizes=[(s, s) for s in ICO_SIZES])
    print(f"  firefox.ico: {', '.join(map(str, ICO_SIZES))}")

    mark.resize((64, 64), Image.LANCZOS).save(
        OUT / "firefox64.ico", format="ICO", sizes=[(64, 64)])
    print("  firefox64.ico: 64")

    required = ["logo.png", "logo-mac.png", "firefox.ico", "firefox64.ico"]
    required += [f"logo{s}.png" for s in SIZES]
    missing = [name for name in required if not (OUT / name).exists()]

    print()
    if missing:
        raise SystemExit(f"Не хватает файлов: {', '.join(missing)}")

    print(f"Брендинг готов: {OUT.relative_to(ROOT)}")
    print(f"Файлов: {len(required)}")


if __name__ == "__main__":
    main()
