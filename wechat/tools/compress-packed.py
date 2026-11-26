"""Rewrite packed PNG copies as WebP. public/ originals stay byte-for-byte.

UI atlases (art-ui, art-world) use lossless WebP only when the decoded pixels
match and the file is smaller. Otherwise the packed PNG stays. Character and
scene atlases (art-extra) use WebP quality 35, method 4. A larger WebP is discarded.
"""

import hashlib
import json
import os
from concurrent.futures import ProcessPoolExecutor
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(ROOT)
INDEX = os.path.join(ROOT, "packages", "art-index.js")
PUBLIC = os.path.join(REPO, "public")
MANIFEST = os.path.join(ROOT, "evidence", "w10-compress-r9.json")


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def compress_one(job):
    src, dest, mode = job
    before = os.path.getsize(src)
    image = Image.open(src).convert("RGBA")
    if mode == "lossless":
        image.save(dest, format="WEBP", lossless=True, quality=100, method=6)
        decoded = Image.open(dest).convert("RGBA")
        identical = image.tobytes() == decoded.tobytes()
        after = os.path.getsize(dest)
        if not identical or after >= before:
            os.remove(dest)
            return {"keep": "png", "before": before, "after": before, "identical": identical, "codec": "png-kept"}
        return {"keep": "webp", "before": before, "after": after, "identical": True, "codec": "webp-lossless-m6"}
    image.save(dest, format="WEBP", quality=35, method=4)
    after = os.path.getsize(dest)
    if after >= before:
        os.remove(dest)
        return {"keep": "png", "before": before, "after": before, "identical": True, "codec": "png-kept"}
    return {"keep": "webp", "before": before, "after": after, "identical": False, "codec": "webp-q35-m4"}


def main():
    text = open(INDEX, encoding="utf-8").read()
    payload = text.split("=", 1)[1].strip()
    if payload.endswith(";"):
        payload = payload[:-1]
    index = json.loads(payload)
    jobs = []
    meta = []
    for public_path, packed_rel in index.items():
        if not packed_rel.endswith(".png"):
            continue
        src = os.path.join(ROOT, packed_rel)
        dest = src[:-4] + ".webp"
        mode = "lossless" if "/art-ui/" in packed_rel or "/art-world/" in packed_rel else "q35"
        jobs.append((src, dest, mode))
        meta.append((public_path, packed_rel, mode))
    print(f"png copies {len(jobs)}", flush=True)
    with ProcessPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(compress_one, jobs, chunksize=1))
    rows = []
    removed = 0
    for (public_path, packed_rel, mode), result in zip(meta, results):
        public_file = os.path.join(PUBLIC, public_path)
        packed_file = os.path.join(ROOT, packed_rel)
        public_hash = sha256(public_file)
        packed_before_hash = sha256(packed_file)
        if result["keep"] == "webp":
            os.remove(packed_file)
            packed_after = packed_rel[:-4] + ".webp"
            index[public_path] = packed_after
            removed += 1
        else:
            packed_after = packed_rel
        rows.append({
            "publicPath": public_path,
            "publicBytes": os.path.getsize(public_file),
            "publicSha256": public_hash,
            "packedBefore": packed_rel,
            "packedBeforeSha256": packed_before_hash,
            "packedBeforeBytes": result["before"],
            "packedAfter": packed_after,
            "packedAfterBytes": result["after"],
            "codec": result["codec"],
            "pixelIdentical": result["identical"],
            "publicMatchesPackedBefore": public_hash == packed_before_hash,
        })
        if len(rows) % 40 == 0:
            print(f"indexed {len(rows)}", flush=True)
    public_unchanged = all(
        sha256(os.path.join(PUBLIC, row["publicPath"])) == row["publicSha256"] for row in rows
    )
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    manifest = {
        "source": "packed copies only. public/ originals were not rewritten or deleted.",
        "replacedPng": removed,
        "keptPng": len(rows) - removed,
        "packedBeforeBytes": sum(row["packedBeforeBytes"] for row in rows),
        "packedAfterBytes": sum(row["packedAfterBytes"] for row in rows),
        "publicOriginalsStillMatchRecordedHash": public_unchanged,
        "everyPublicMatchedPackedBefore": all(row["publicMatchesPackedBefore"] for row in rows),
        "files": rows,
    }
    with open(MANIFEST, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    with open(INDEX, "w", encoding="utf-8") as handle:
        handle.write("module.exports = ")
        json.dump(index, handle, ensure_ascii=False, indent=2)
        handle.write(";\n")
    print(
        f"replaced {removed} kept {len(rows) - removed} "
        f"before {manifest['packedBeforeBytes']} after {manifest['packedAfterBytes']}",
        flush=True,
    )


if __name__ == "__main__":
    main()
