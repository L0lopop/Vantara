"""Нарезка брендшита Vantara на отдельные ассеты.

Вход:  brand/source/vantara-brandsheet.png
Выход: brand/logo/*.png (с прозрачным фоном), brand/tray/*.png
"""
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "brand" / "source" / "vantara-brandsheet.png"

# Регионы в координатах исходника (left, top, right, bottom).
REGIONS = {
    "logo/shield-full":  (190, 240, 1210, 1250),   # большой щит с топорами
    "logo/mark":         (1250, 465, 1680, 900),   # компактный знак
    "logo/wordmark":     (1700, 570, 2660, 860),   # надпись VANTARA
    "logo/tab-mock":     (1250, 990, 2300, 1220),  # мокап вкладки (референс)
    "tray/tray-square":  (2340, 1000, 2560, 1215), # иконка трея
}

# Порог «белизны»: всё светлее HI становится полностью прозрачным,
# между LO и HI — плавный переход, чтобы края не были рваными.
LO, HI = 236, 250


def strip_white(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            m = min(r, g, b)
            if m >= HI:
                px[x, y] = (r, g, b, 0)
            elif m > LO:
                k = (m - LO) / (HI - LO)
                px[x, y] = (r, g, b, int(a * (1 - k)))
    return img


def autocrop(img: Image.Image, pad: int = 8) -> Image.Image:
    box = img.getbbox()
    if not box:
        return img
    l, t, r, b = box
    w, h = img.size
    return img.crop((max(0, l - pad), max(0, t - pad),
                     min(w, r + pad), min(h, b + pad)))


def main() -> None:
    sheet = Image.open(SRC)
    print(f"Исходник: {sheet.size[0]}x{sheet.size[1]}")
    for name, box in REGIONS.items():
        out = ROOT / "brand" / f"{name}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        crop = sheet.crop(box)
        if name.startswith("tray/"):
            # Фон плашки — часть дизайна. Убираем только белые поля вокруг,
            # определяя границы по прозрачности пробной копии.
            probe = strip_white(crop.copy()).getbbox()
            if probe:
                crop = crop.crop(probe)
        else:
            crop = autocrop(strip_white(crop))
        crop.save(out)
        print(f"  {name}.png  {crop.size[0]}x{crop.size[1]}")


if __name__ == "__main__":
    main()
