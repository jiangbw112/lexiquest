#!/usr/bin/env python3
"""Build the desktop woff2 subsets from fonts/src and the extracted charsets."""

import json
import subprocess
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
SOURCES = json.loads((ROOT / "tools/font-sources.json").read_text())
CHAR = ROOT / "build/fonts"
OUT = ROOT / "public/fonts"
GLYPHS = json.loads((CHAR / "glyph-sources.json").read_text())


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def chars_of(name: str) -> str:
    text = (CHAR / name).read_text()
    return "".join(text.split("\n"))


def static_source(src: Path, instance: str | None) -> Path:
    if not instance:
        return src
    weight = instance.split("=", 1)[1]
    cached = src.with_name(f"{src.stem}-{weight}.ttf")
    if cached.is_file() and cached.stat().st_mtime >= src.stat().st_mtime:
        return cached
    font = TTFont(src)
    instantiateVariableFont(font, {"wght": float(weight)}, inplace=True, static=True)
    font.save(cached)
    font.close()
    return cached


def subset(src: Path, text: str, dest: Path, instance: str | None, unicodes: str) -> None:
    if not src.is_file():
        fail(f"missing source font {src}. Unzip style_test_warm_v0.1 fonts/ into fonts/src (not committed).")
    src = static_source(src, instance)
    dest.parent.mkdir(parents=True, exist_ok=True)
    text_file = dest.with_suffix(".txt")
    text_file.write_text(text)
    command = [
        sys.executable,
        "-m",
        "fontTools.subset",
        str(src),
        f"--text-file={text_file}",
        "--flavor=woff2",
        "--layout-features=*",
        f"--output-file={dest}",
    ]
    if unicodes:
        command.append(f"--unicodes={unicodes}")
    if instance:
        command.extend(["--no-hinting", "--desubroutinize"])
    subprocess.check_call(command)
    text_file.unlink(missing_ok=True)


def cmap_of(path: Path) -> set[int]:
    font = TTFont(path)
    cmap = font.getBestCmap() or {}
    font.close()
    return set(cmap)


def require_cmap(path: Path, text: str, bucket: str) -> None:
    have = cmap_of(path)
    sources = GLYPHS.get(bucket, {})
    for ch in text:
        if ord(ch) in have:
            continue
        where = ", ".join(sources.get(ch, ["extracted charset"]))
        fail(f"missing {ch} U+{ord(ch):04X} in {path.name} from {where}")


def css_range(codepoints: list[int]) -> str:
    if not codepoints:
        return "U+0000"
    points = sorted(set(codepoints))
    chunks: list[str] = []
    start = prev = points[0]
    for point in points[1:]:
        if point == prev + 1:
            prev = point
            continue
        chunks.append(f"U+{start:04X}" if start == prev else f"U+{start:04X}-{prev:04X}")
        start = prev = point
    chunks.append(f"U+{start:04X}" if start == prev else f"U+{start:04X}-{prev:04X}")
    return ", ".join(chunks)


def face(family: str, weight: str, file_name: str, unicode_range: str) -> str:
    return (
        "@font-face {\n"
        f'  font-family: "{family}";\n'
        "  font-style: normal;\n"
        f"  font-weight: {weight};\n"
        "  font-display: swap;\n"
        f'  src: url("{file_name}") format("woff2");\n'
        f"  unicode-range: {unicode_range};\n"
        "}\n"
    )


def main() -> None:
    noto = ROOT / SOURCES["fonts"]["noto"]
    kuaile = ROOT / SOURCES["fonts"]["kuaile"]
    nunito = ROOT / SOURCES["fonts"]["nunito"]
    core = chars_of("charset_core.txt")
    title = chars_of("charset_kuaile.txt")
    ascii_range = "U+0020-007E"
    jobs = [
        (noto, core, OUT / "NotoSansSC-Regular-core.woff2", "wght=400", ascii_range, "core"),
        (noto, core, OUT / "NotoSansSC-Bold-core.woff2", "wght=700", ascii_range, "core"),
        (kuaile, title, OUT / "ZCOOLKuaiLe-ui.woff2", None, ascii_range, "kuaile"),
    ]
    for grade in (3, 4, 5, 6):
        text = chars_of(f"charset_g{grade}.txt")
        jobs.append((noto, text, OUT / f"NotoSansSC-Regular-g{grade}.woff2", "wght=400", "", f"g{grade}"))
        jobs.append((noto, text, OUT / f"NotoSansSC-Bold-g{grade}.woff2", "wght=700", "", f"g{grade}"))
    for src, text, dest, instance, unicodes, bucket in jobs:
        if not text and bucket.startswith("g"):
            fail(f"{bucket} charset is empty")
        subset(src, text, dest, instance, unicodes)
        require_cmap(dest, text, bucket)
        print(f"{dest.name} {dest.stat().st_size} bytes")
    latin = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:'\"?!-–—()[]/"
    subset(nunito, latin, OUT / "Nunito-latin.woff2", None, "U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201D,U+2026")
    require_cmap(OUT / "Nunito-latin.woff2", "Apple", "nunito")
    css: list[str] = []
    for weight, file_name in (("400", "NotoSansSC-Regular-core.woff2"), ("700", "NotoSansSC-Bold-core.woff2")):
        css.append(face("Noto Sans SC", weight, file_name, css_range(sorted(cmap_of(OUT / file_name)))))
    for grade in (3, 4, 5, 6):
        for weight, stem in (("400", "Regular"), ("700", "Bold")):
            file_name = f"NotoSansSC-{stem}-g{grade}.woff2"
            css.append(face("Noto Sans SC", weight, file_name, css_range(sorted(cmap_of(OUT / file_name)))))
    css.append(face("ZCOOL KuaiLe", "400", "ZCOOLKuaiLe-ui.woff2", css_range(sorted(cmap_of(OUT / "ZCOOLKuaiLe-ui.woff2")))))
    css.append(face("Nunito", "200 1000", "Nunito-latin.woff2", css_range(sorted(cmap_of(OUT / "Nunito-latin.woff2")))))
    (OUT / "fonts.css").write_text("".join(css))
    print("wrote public/fonts/fonts.css")


if __name__ == "__main__":
    main()
