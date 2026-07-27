from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "store-assets" / "source" / "editorial-collage-v1.png"
POPUP_SOURCE = ROOT / "store-assets" / "source" / "popup-demo-browser.png"
STORE = ROOT / "store-assets"
CORAL = "#ff5c35"
INK = "#161616"
PAPER = "#f5f2ec"


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), size)


def mark(size: int) -> Image.Image:
    scale = size / 128
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def box(values: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
        return tuple(round(value * scale) for value in values)

    draw.rounded_rectangle(
        box((16, 16, 112, 112)),
        radius=round(22 * scale),
        fill=CORAL,
    )
    draw.ellipse(box((34, 34, 98, 94)), fill=INK)
    draw.ellipse(box((52, 47, 84, 81)), fill=CORAL)
    draw.rectangle(box((16, 34, 40, 94)), fill=CORAL)
    draw.rectangle(box((40, 34, 54, 94)), fill=INK)
    return image


def save_store_icons() -> None:
    mark(512).save(STORE / "icon-master-512.png", optimize=True)
    mark(128).save(STORE / "store-icon-128.png", optimize=True)


def crop_background(size: tuple[int, int], centering: tuple[float, float]) -> Image.Image:
    source = Image.open(SOURCE).convert("RGB")
    return ImageOps.fit(
        source,
        size,
        method=Image.Resampling.LANCZOS,
        centering=centering,
    ).convert("RGBA")


def small_promo() -> None:
    image = crop_background((440, 280), (0.5, 0.52))
    logo = mark(144)
    image.alpha_composite(logo, ((440 - 144) // 2, (280 - 144) // 2))
    image.convert("RGB").save(STORE / "promo-small-440x280.jpg", quality=94)


def marquee() -> None:
    image = crop_background((1400, 560), (0.5, 0.5))
    veil = Image.new("RGBA", image.size, (245, 242, 236, 224))
    veil_draw = ImageDraw.Draw(veil)
    veil_draw.rounded_rectangle((330, 105, 1070, 455), radius=28, fill=(245, 242, 236, 238))
    image = Image.alpha_composite(image, veil)

    logo = mark(220)
    image.alpha_composite(logo, (395, 170))

    draw = ImageDraw.Draw(image)
    heading = font("arialbd.ttf", 64)
    mono = font("consolab.ttf", 24)
    draw.text((650, 205), "OOBLIK", font=heading, fill=INK)
    draw.text((650, 274), "DIGEST", font=heading, fill=CORAL)
    draw.text((653, 358), "CAPTURER · CLASSER · PUBLIER", font=mono, fill=INK)
    image.convert("RGB").save(STORE / "promo-marquee-1400x560.jpg", quality=94)


def screenshot() -> None:
    image = crop_background((1280, 800), (0.5, 0.5))
    veil = Image.new("RGBA", image.size, (245, 242, 236, 216))
    image = Image.alpha_composite(image, veil)
    draw = ImageDraw.Draw(image)

    logo = mark(112)
    image.alpha_composite(logo, (88, 88))
    eyebrow = font("consolab.ttf", 17)
    heading = font("arialbd.ttf", 54)
    body = font("arial.ttf", 24)
    draw.text((88, 228), "CURATION PERSONNELLE", font=eyebrow, fill=CORAL)
    draw.multiline_text(
        (88, 270),
        "Capturez en\nquelques secondes.",
        font=heading,
        fill=INK,
        spacing=5,
    )
    draw.multiline_text(
        (91, 430),
        "Titre, catégorie, résumé et tags\nrestent sous votre contrôle.",
        font=body,
        fill=INK,
        spacing=8,
    )
    draw.rounded_rectangle((88, 558, 522, 614), radius=28, fill=INK)
    draw.text(
        (116, 575),
        "ICÔNE OU RACCOURCI CLAVIER",
        font=eyebrow,
        fill=PAPER,
    )

    popup = Image.open(POPUP_SOURCE).convert("RGB").crop((0, 0, 420, 700))
    popup = popup.resize((420, 700), Image.Resampling.LANCZOS)
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle((733, 37, 1183, 773), radius=20, fill=(0, 0, 0, 38))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    image = Image.alpha_composite(image, shadow)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((718, 22, 1168, 758), radius=18, fill="#ffffff", outline="#d7d2c9", width=2)
    draw.rounded_rectangle((718, 22, 1168, 58), radius=18, fill=INK)
    draw.rectangle((718, 42, 1168, 58), fill=INK)
    for offset, color in ((0, CORAL), (18, PAPER), (36, "#77736d")):
        draw.ellipse((738 + offset, 34, 748 + offset, 44), fill=color)
    image.alpha_composite(popup.convert("RGBA"), (733, 58))
    image.convert("RGB").save(STORE / "screenshot-capture-1280x800.jpg", quality=95)


def main() -> None:
    STORE.mkdir(parents=True, exist_ok=True)
    save_store_icons()
    small_promo()
    marquee()
    if POPUP_SOURCE.exists():
        screenshot()
    print("Chrome Web Store brand assets generated.")


if __name__ == "__main__":
    main()
