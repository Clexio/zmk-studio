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
    for name in sorted(os.listdir(src_dir)):
        local = os.path.join(src_dir, name)
        if not os.path.isfile(local):
            continue
        key = f"{prefix}/{platform}/{name}"
        bucket.put_object_from_file(
            key, local, headers={"x-oss-object-acl": "public-read"}
        )
        files.append(
            {
                "name": name,
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
    return 0


if __name__ == "__main__":
    sys.exit(main())
