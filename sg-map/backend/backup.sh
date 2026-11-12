#!/usr/bin/env bash
# 备份新加坡探店地图：全部地点数据（JSON）+ 全部图片。只读，用公开 key，不需要任何密码。
# 用法：bash sg-map/backend/backup.sh [输出目录]
set -euo pipefail

SUPABASE_URL="https://akzakeqyiwhscuykbqfk.supabase.co"
KEY="sb_publishable_9SjzkExmEjMdz-S3maJ-EQ_ImiOk2qv"
OUT="${1:-sg-map-backup-$(date +%Y%m%d)}"

mkdir -p "$OUT/images"
curl -fsS "$SUPABASE_URL/rest/v1/places?select=*&order=created_at.asc" -H "apikey: $KEY" -o "$OUT/places.json"
echo "地点数据 → $OUT/places.json"

python3 - "$OUT/places.json" <<'PY' | while read -r path; do
import json, sys
for p in json.load(open(sys.argv[1])):
    for im in p.get("images") or []:
        print(im["path"])
PY
  mkdir -p "$OUT/images/$(dirname "$path")"
  curl -fsS "$SUPABASE_URL/storage/v1/object/public/sg-map/$path" -o "$OUT/images/$path"
  echo "图片 → $OUT/images/$path"
done
echo "完成。"
