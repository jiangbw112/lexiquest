#!/usr/bin/env python3
"""Check committed subsets against the charsets and the size budgets. No source fonts required."""

import json
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
SOURCES = json.loads((ROOT / "tools/font-sources.json").read_text())
BUDGETS = SOURCES["budgets"]
OUT = ROOT / "public/fonts"
CHAR = ROOT / "build/fonts"
GLYPHS = json.loads((CHAR / "glyph-sources.json").read_text())


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def chars_of(name: str) -> str:
    return "".join((CHAR / name).read_text().split("\n"))


def cmap_of(path: Path) -> set[int]:
    font = TTFont(path)
    cmap = font.getBestCmap() or {}
    font.close()
    return set(cmap)


def check(path: Path, text: str, bucket: str, limit: int) -> None:
    if not path.is_file():
        fail(f"missing {path}")
    size = path.stat().st_size
    if size > limit:
        fail(f"{path.name} is {size} bytes, over the {limit} byte budget")
    have = cmap_of(path)
    sources = GLYPHS.get(bucket, {})
    for ch in text:
        if ord(ch) in have:
            continue
        where = ", ".join(sources.get(ch, ["charset"]))
        fail(f"missing {ch} U+{ord(ch):04X} in {path.name} from {where}")
    print(f"{path.name} {size} bytes ok")


def main() -> None:
    core = chars_of("charset_core.txt")
    check(OUT / "NotoSansSC-Regular-core.woff2", core, "core", BUDGETS["coreBytes"])
    check(OUT / "NotoSansSC-Bold-core.woff2", core, "core", BUDGETS["coreBytes"])
    check(OUT / "ZCOOLKuaiLe-ui.woff2", chars_of("charset_kuaile.txt"), "kuaile", BUDGETS["kuaileBytes"])
    for grade in (3, 4, 5, 6):
        text = chars_of(f"charset_g{grade}.txt")
        check(OUT / f"NotoSansSC-Regular-g{grade}.woff2", text, f"g{grade}", BUDGETS["gradeBytes"])
        check(OUT / f"NotoSansSC-Bold-g{grade}.woff2", text, f"g{grade}", BUDGETS["gradeBytes"])
    nunito = OUT / "Nunito-latin.woff2"
    if not nunito.is_file():
        fail("missing Nunito-latin.woff2")
    have = cmap_of(nunito)
    for ch in "Apple0123456789":
        if ord(ch) not in have:
            fail(f"Nunito is missing {ch}")
    print(f"{nunito.name} {nunito.stat().st_size} bytes ok")


if __name__ == "__main__":
    main()
