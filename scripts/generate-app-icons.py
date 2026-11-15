#!/usr/bin/env python3
"""Render launcher and browser icons from the existing Sirius vector mark (ImageMagick required)."""
from pathlib import Path
from subprocess import run
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ANDROID = ROOT / "android/app/src/main/res"
IOS = ROOT / "ios/App/App/Assets.xcassets"
BACKGROUND = "#F1F9FA"
SVG = "{http://www.w3.org/2000/svg}"
LOGO = ElementTree.parse(ASSETS / "sirius-logo.svg")
MARK = LOGO.find(f"{SVG}g/{SVG}g/{SVG}g")
COLORS = {"cls-1": "#004278", "cls-2": "#4BBECF"}


def svg_icon(scale=0.67, shape="square"):
    parts = []
    if shape == "round":
        parts.append(f'<circle cx="64" cy="64" r="64" fill="{BACKGROUND}"/>')
    elif shape != "transparent":
        radius = 28 if shape == "rounded" else 0
        parts.append(f'<rect width="128" height="128" rx="{radius}" fill="{BACKGROUND}"/>')
    # The symbol in the full logotype occupies approximately x=0…112, y=0…118.
    parts.append(f'<g transform="translate(64 64) scale({scale}) translate(-56 -59)">')
    parts.extend(f'<path fill="{COLORS[path.attrib["class"]]}" d="{path.attrib["d"]}"/>' for path in MARK)
    parts.append("</g>")
    return '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">\n' + "\n".join(parts) + "\n</svg>\n"


def png(path, pixels, *, scale=0.73, shape="square"):
    opaque = shape == "square"
    run([
        "magick", "-background", "none", "-density", "768", "svg:-",
        "-resize", f"{pixels}x{pixels}", "-strip", f"{'PNG24' if opaque else 'PNG32'}:{path}",
    ], input=svg_icon(scale, shape).encode(), check=True)


(ASSETS / "icon.svg").write_text(svg_icon(0.84, "rounded"))
png(ASSETS / "favicon-32.png", 32, scale=0.84, shape="rounded")
png(ASSETS / "icon-192.png", 192)
png(ASSETS / "icon-512.png", 512)
png(ASSETS / "icon-maskable-512.png", 512, scale=0.60)
png(ASSETS / "apple-touch-icon-180.png", 180)

for density, launcher, foreground in (
    ("mdpi", 48, 108), ("hdpi", 72, 162), ("xhdpi", 96, 216), ("xxhdpi", 144, 324), ("xxxhdpi", 192, 432),
):
    folder = ANDROID / f"mipmap-{density}"
    png(folder / "ic_launcher.png", launcher, shape="rounded")
    png(folder / "ic_launcher_round.png", launcher, scale=0.70, shape="round")
    png(folder / "ic_launcher_foreground.png", foreground, scale=0.49, shape="transparent")

png(IOS / "AppIcon.appiconset/AppIcon-512@2x.png", 1024)
png(IOS / "Splash.imageset/sirius-mark.png", 288, scale=1, shape="transparent")

vector = ANDROID / "drawable-v24/ic_launcher_foreground.xml"
paths = "\n".join(f'        <path android:fillColor="{COLORS[path.attrib["class"]]}" android:pathData="{path.attrib["d"]}" />' for path in MARK)
vector.write_text(f'''<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="128" android:viewportHeight="128">
    <group android:scaleX="0.49" android:scaleY="0.49" android:translateX="36.56" android:translateY="35.09">
{paths}
    </group>
</vector>
''')
