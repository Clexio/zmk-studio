#!/usr/bin/env python3
"""Upload KeyPlayer Studio installers to OSS and update app/latest.json."""

import datetime
import hashlib
import json
import os
import sys

import oss2


def sha256_of(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    platform = sys.argv[1]
    src_dir = sys.argv[2]
    endpoint = os.environ["OSS_ENDPOINT"]
    bucket_name = os.environ["OSS_BUCKET"]
    prefix = os.environ["OSS_PREFIX"].strip("/")
    fw_sha = os.environ.get("FW_SHA", "").strip()
    short_sha = fw_sha[:7] if fw_sha else "local"

    auth = oss2.Auth(
        os.environ["OSS_ACCESS_KEY_ID"], os.environ["OSS_ACCESS_KEY_SECRET"]
    )
    bucket = oss2.Bucket(auth, endpoint, bucket_name)

    files = []
    # 产物内可能还有子目录（nsis/、msi/、dmg/ 等），递归上传并保留相对路径
    for root, _dirs, fnames in os.walk(src_dir):
        for name in sorted(fnames):
            local = os.path.join(root, name)
            rel = os.path.relpath(local, src_dir).replace(os.sep, "/")
            key = f"{prefix}/{platform}/{rel}"
            bucket.put_object_from_file(
                key, local, headers={"x-oss-object-acl": "public-read"}
            )
            files.append(
                {
                    "name": rel,
                    "url": f"https://{bucket_name}.{endpoint.removeprefix('https://')}/{key}",
                    "sha256": sha256_of(local),
                    "size": os.path.getsize(local),
                }
            )
            print(f"UPLOADED {key}")

    if not files:
        print("No installer files found; aborting.")
        return 1

    manifest_key = f"{prefix}/latest.json"
    manifest = {}
    try:
        manifest = json.loads(bucket.get_object(manifest_key).read())
    except Exception:
        manifest = {"platforms": {}}

    manifest["version"] = "app-{}-{}".format(
        datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d"), short_sha
    )
    manifest["released_at"] = datetime.datetime.now(
        datetime.timezone.utc
    ).strftime("%Y-%m-%d")
    manifest["platforms"][platform] = {"files": files}
    bucket.put_object(
        manifest_key,
        json.dumps(manifest, ensure_ascii=False, indent=2),
        headers={"x-oss-object-acl": "public-read"},
    )
    print(f"UPLOADED {manifest_key}: {manifest['version']}")

    # 回读校验：OSS 清单里的哈希/大小必须与本次上传的本地文件一致，防止发布旧包
    verify_manifest = json.loads(bucket.get_object(manifest_key).read())
    uploaded = (
        verify_manifest.get("platforms", {}).get(platform, {}).get("files", [])
    )
    local_map = {f["name"]: (f["sha256"], f["size"]) for f in files}
    for entry in uploaded:
        local = local_map.get(entry["name"])
        if not local:
            print(f"VERIFY FAIL: {entry['name']} missing locally")
            return 1
        if (
            entry.get("sha256", "").lower() != local[0].lower()
            or entry.get("size") != local[1]
        ):
            print(f"VERIFY FAIL: {entry['name']} hash/size mismatch")
            return 1
    print(f"VERIFY OK: {len(uploaded)} files match manifest")
    return 0


if __name__ == "__main__":
    sys.exit(main())
