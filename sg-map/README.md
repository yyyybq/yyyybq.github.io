# 新加坡探店地图

线上地址：https://yyyybq.github.io/sg-map/

这是一个纯静态页面，没有构建步骤，GitHub Pages 直接从 `master` 分支发布。数据和图片存在 Supabase，所有写操作都经过 Supabase 上的 Edge Function，由它在服务端校验编辑口令。

```
sg-map/
  index.html  styles.css  app.js     页面
  config.js                          ← 类别、链接来源、Supabase 公开 key 都在这里
  lib/leaflet/                       地图库 Leaflet 1.9.4
  backend/schema.sql                 数据库结构（可在 SQL Editor 重复运行）
  backend/functions/sgmap/index.ts   Edge Function：口令校验、增删改、传图、OneMap 代理
  backend/backup.sh                  备份脚本
.github/workflows/sg-map-keepalive.yml   每 3 天读一次数据库，防止 Supabase 暂停
```

## 增减类别

编辑 `config.js` 里的 `categories`，提交到 `master`，一两分钟后线上生效。数据库不需要改。

- **加一个类别**：加一行，例如 `{ key: "spa", label: "按摩", icon: "💆", color: "#0EA5E9" }`。`key` 只能用小写英文、数字、`-` 和 `_`。
- **改名字、图标、颜色**：直接改 `label`、`icon`、`color`。
- **删一个类别**：删掉对应那一行。已经用了这个类别的地点会显示成最后一个类别，所以「其他」请一直放在最后。如果之后把这一行加回来，这些地点会恢复原来的类别。
- **不要改已经在用的 `key`**。改了的话，旧地点就对不上了。

## 换编辑口令

1. 打开 Supabase 后台 → 左侧 **Edge Functions** → **Secrets**（https://supabase.com/dashboard/project/akzakeqyiwhscuykbqfk/functions/secrets）。
2. 找到 `EDIT_PASSCODE`，改成新口令，保存。立即生效，不用重新部署。
3. 已经登录的人下次保存时会提示"口令不对"，输入新口令即可。

同一个页面里还有 `ONEMAP_EMAIL` 和 `ONEMAP_PASSWORD`。如果改了 OneMap 账号的密码，记得这里也一起改。

口令连续输错 8 次，该 IP 会被锁 15 分钟。

## 备份数据

- **一键备份全部数据和图片**：在电脑终端运行下面这条命令，会生成 `sg-map-backup-日期/` 文件夹，里面有 `places.json` 和全部图片。只需要 `curl` 和 `python3`，不需要任何密码。

  ```bash
  bash sg-map/backend/backup.sh
  ```

- **只导出数据**：浏览器打开下面这个地址，另存为 `.json`：
  `https://akzakeqyiwhscuykbqfk.supabase.co/rest/v1/places?select=*&apikey=sb_publishable_9SjzkExmEjMdz-S3maJ-EQ_ImiOk2qv`
- **导出成表格**：Supabase 后台 → **Table Editor** → `places` → 右上角 **Export** → CSV。

## 其他

- **改后端代码**：修改 `backend/functions/sgmap/index.ts` 后重新部署。可以在 Supabase 后台 Edge Functions → `sgmap` → Code 里粘贴后点 Deploy；也可以用 Supabase CLI 部署，记得加 `--no-verify-jwt`，因为口令校验在函数内部完成。
- **保活**：GitHub Actions 里的 `sg-map keep-alive` 每 3 天运行一次，在 Actions 页面可以手动点 Run workflow。如果项目还是被暂停了（Supabase 会发邮件），在后台点 **Restore project** 即可恢复，数据不会丢。
- **地图来源**：底图来自 OneMap（新加坡土地管理局），按 OneMap 的使用条款显示了 logo 和来源标注。邮编和关键词搜索也走 OneMap，由后端函数用你的 OneMap 账号换取 token（有效期 3 天，自动续期）。
