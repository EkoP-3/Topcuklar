#!/usr/bin/env python3
"""Turns a pixel-art item sprite into a game-ready weapon image.

Usage:  python3 scripts/prepare-weapon.py <input.png|gif> <weapon-id> [--no-rotate] [--scale N]

Minecraft-style tool sprites are drawn diagonally (handle bottom-left, head top-right).
The game wants weapons pointing right, so by default the image is enlarged with
nearest-neighbour scaling (stays crisp), rotated 45 degrees clockwise, trimmed to its
visible pixels and saved to src/assets/weapons/<weapon-id>.png.
For animated GIFs only the first frame is used.
"""
import argparse
import pathlib

from PIL import Image


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("weapon_id")
    ap.add_argument("--no-rotate", action="store_true", help="image already points right")
    ap.add_argument("--scale", type=int, default=0, help="integer enlargement (default: auto, ~512px)")
    args = ap.parse_args()

    img = Image.open(args.input)
    img.seek(0)
    img = img.convert("RGBA")

    scale = args.scale or max(1, 512 // max(img.size))
    img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    if not args.no_rotate:
        img = img.rotate(-45, resample=Image.NEAREST, expand=True)

    box = img.getbbox()
    if box is None:
        raise SystemExit("image is fully transparent")
    img = img.crop(box)

    out = pathlib.Path(__file__).resolve().parent.parent / "src/assets/weapons" / f"{args.weapon_id}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    print(f"saved {out} ({img.width}x{img.height})")


if __name__ == "__main__":
    main()
