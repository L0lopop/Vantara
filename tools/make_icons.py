"""Генерация иконок Vantara всех размеров из brand/logo/mark.png.

Выход:
  brand/icons/vantara-<size>.png   — набор для Linux/Firefox chrome
  brand/icons/vantara.ico          — мультиразмерная иконка для Windows
  brand/tray/tray-<size>.png       — иконка трея
"""
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "brand" / "icons"
TRAY = ROOT / "brand" / "tray"

APP_SIZES = [16, 20, 24, 32, 48, 64, 96, 128, 256, 512]
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
TRAY_SIZES = [16, 20, 24, 32, 48, 64]


def squarify(img: Image.Image, pad_ratio: float = 0.0) -> Image.Image:
    """Вписывает изображение в прозрачный квадрат по большей стороне."""
    img = img.convert("RGBA")
    side = int(max(img.size) * (1 + pad_ratio * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
    return canvas


def render(src: Image.Image, sizes, out_dir: Path, stem: str) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for s in sizes:
        src.resize((s, s), Image.LANCZOS).save(out_dir / f"{stem}-{s}.png")
    print(f"  {stem}: {', '.join(str(s) for s in sizes)}")


def main() -> None:
    mark = squarify(Image.open(ROOT / "brand" / "logo" / "mark.png"), pad_ratio=0.04)
    render(mark, APP_SIZES, ICONS, "vantara")

    ico = ICONS / "vantara.ico"
    mark.resize((256, 256), Image.LANCZOS).save(
        ico, format="ICO", sizes=[(s, s) for s in ICO_SIZES])
    print(f"  vantara.ico: {', '.join(str(s) for s in ICO_SIZES)}")

    tray = squarify(Image.open(TRAY / "tray-square.png"))
    render(tray, TRAY_SIZES, TRAY, "tray")
    tray.resize((256, 256), Image.LANCZOS).save(
        TRAY / "tray.ico", format="ICO", sizes=[(s, s) for s in [16, 24, 32, 48, 64]])
    print("  tray.ico: 16, 24, 32, 48, 64")


if __name__ == "__main__":
    main()
