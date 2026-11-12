// 新加坡探店地图 · Supabase Edge Function「sgmap」
//
// 所有写操作和 OneMap 搜索都走这里。口令在服务端校验，通过后用 secret key 写库（绕过 RLS）。
// 需要在 Supabase 后台 Edge Functions → Secrets 配置：
//   EDIT_PASSCODE    编辑口令
//   ONEMAP_EMAIL     OneMap 账号邮箱（用于换取搜索 token）
//   ONEMAP_PASSWORD  OneMap 账号密码
// 请求：POST /functions/v1/sgmap?action=<verify|search|upload|create|update|delete|discard>
//   口令放在请求头 x-sgmap-passcode（encodeURIComponent 编码）。

import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "sg-map";
const ONEMAP = "https://www.onemap.gov.sg";
const MAX_FAILS = 8; // 15 分钟内同一 IP 口令错误次数上限
const FAIL_WINDOW_MIN = 15;

function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys.default) return keys.default;
  } catch { /* fall through to legacy key */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const db = createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sgmap-passcode",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

// ---------- 口令 ----------

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0].trim()) || req.headers.get("cf-connecting-ip") || "unknown";
}

async function requirePasscode(req: Request): Promise<void> {
  const expected = Deno.env.get("EDIT_PASSCODE");
  if (!expected) throw new HttpError(503, "服务端还没有设置编辑口令（EDIT_PASSCODE）");

  const ip = clientIp(req);
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60_000).toISOString();
  const { count } = await db
    .from("sgmap_auth_failures")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("at", since);
  if ((count ?? 0) >= MAX_FAILS) {
    throw new HttpError(429, `口令错误次数太多，请 ${FAIL_WINDOW_MIN} 分钟后再试`);
  }

  let given = "";
  try {
    given = decodeURIComponent(req.headers.get("x-sgmap-passcode") ?? "");
  } catch { /* malformed → treated as wrong */ }

  if (!given || !(await safeEqual(given, expected))) {
    await db.from("sgmap_auth_failures").insert({ ip });
    // 顺手清理一天前的旧记录
    await db.from("sgmap_auth_failures").delete().lt("at", new Date(Date.now() - 86_400_000).toISOString());
    await new Promise((r) => setTimeout(r, 600));
    throw new HttpError(401, "编辑口令不对");
  }
}

// ---------- 校验 ----------

const IMAGE_PATH = /^places\/\d{4}\/[0-9a-f-]{36}\.(webp|jpg|png)$/;

function str(v: unknown, max: number, field: string, required = false): string | null {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
    if (required) throw new HttpError(400, `缺少${field}`);
    return null;
  }
  if (typeof v !== "string") throw new HttpError(400, `${field}格式不对`);
  const s = v.trim();
  if (s.length > max) throw new HttpError(400, `${field}太长（最多 ${max} 字）`);
  return s;
}

function nickname(v: unknown): string {
  return str(v, 24, "昵称", true)!;
}

type ImageRef = { path: string; w: number; h: number };

function cleanPlace(p: Record<string, unknown>) {
  if (!p || typeof p !== "object") throw new HttpError(400, "缺少地点数据");
  const category = str(p.category, 32, "类别", true)!;
  if (!/^[a-z0-9_-]{1,32}$/.test(category)) throw new HttpError(400, "类别格式不对");
  const postal = str(p.postal, 6, "邮编");
  if (postal && !/^\d{6}$/.test(postal)) throw new HttpError(400, "邮编应为 6 位数字");
  const lat = Number(p.lat), lng = Number(p.lng);
  if (!(lat >= 1.1 && lat <= 1.5 && lng >= 103.5 && lng <= 104.2)) {
    throw new HttpError(400, "位置不在新加坡范围内");
  }
  const images = Array.isArray(p.images) ? p.images : [];
  if (images.length > 12) throw new HttpError(400, "图片最多 12 张");
  const cleanImages: ImageRef[] = images.map((im: any) => {
    if (!im || typeof im.path !== "string" || !IMAGE_PATH.test(im.path)) {
      throw new HttpError(400, "图片路径不对");
    }
    return { path: im.path, w: Math.max(0, Math.round(Number(im.w) || 0)), h: Math.max(0, Math.round(Number(im.h) || 0)) };
  });
  const links = Array.isArray(p.links) ? p.links : [];
  if (links.length > 10) throw new HttpError(400, "链接最多 10 个");
  const cleanLinks = links.map((l: unknown) => {
    if (typeof l !== "string" || !/^https?:\/\/\S+$/i.test(l.trim()) || l.length > 1000) {
      throw new HttpError(400, "链接格式不对");
    }
    return l.trim();
  });
  return {
    name: str(p.name, 120, "店名", true)!,
    category,
    postal,
    address: str(p.address, 300, "地址"),
    unit: str(p.unit, 60, "楼层/门牌"),
    lat,
    lng,
    images: cleanImages,
    links: cleanLinks,
    note: str(p.note, 2000, "备注"),
  };
}

async function removeImages(paths: string[]) {
  const safe = paths.filter((p) => IMAGE_PATH.test(p));
  if (safe.length) await db.storage.from(BUCKET).remove(safe);
}

// ---------- OneMap ----------

type Token = { token: string; exp: number };
let memToken: Token | null = null;

function tokenFresh(t: Token | null): t is Token {
  return !!t && t.exp * 1000 - Date.now() > 6 * 3600_000; // 剩余 6 小时以上才复用
}

async function onemapToken(force = false): Promise<string | null> {
  const email = Deno.env.get("ONEMAP_EMAIL");
  const password = Deno.env.get("ONEMAP_PASSWORD");
  if (!email || !password) return null;

  if (!force && tokenFresh(memToken)) return memToken.token;
  if (!force) {
    const { data } = await db.from("sgmap_kv").select("value").eq("key", "onemap_token").maybeSingle();
    if (tokenFresh(data?.value as Token)) {
      memToken = data!.value as Token;
      return memToken.token;
    }
  }

  const r = await fetch(`${ONEMAP}/api/auth/post/getToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) {
    throw new HttpError(502, `OneMap 登录失败（${j.error ?? r.status}），请检查 ONEMAP_EMAIL / ONEMAP_PASSWORD`);
  }
  memToken = { token: j.access_token, exp: Number(j.expiry_timestamp) };
  await db.from("sgmap_kv").upsert({ key: "onemap_token", value: memToken, updated_at: new Date().toISOString() });
  return memToken.token;
}

async function onemapSearch(q: string, page: number) {
  const url = `${ONEMAP}/api/common/elastic/search?searchVal=${encodeURIComponent(q)}` +
    `&returnGeom=Y&getAddrDetails=Y&pageNum=${page}`;
  const call = async (token: string | null) => {
    const r = await fetch(url, { headers: token ? { Authorization: token } : {} });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  let token = await onemapToken();
  let res = await call(token);
  const tokenProblem = (b: any) => typeof b?.error === "string" && /token/i.test(b.error);
  if (token && (res.status === 401 || res.status === 403 || tokenProblem(res.body))) {
    token = await onemapToken(true);
    res = await call(token);
  }
  if (res.status !== 200 || !Array.isArray(res.body?.results)) {
    throw new HttpError(502, `OneMap 搜索失败：${res.body?.error ?? res.status}`);
  }
  const b = res.body;
  return {
    found: b.found ?? 0,
    page: b.pageNum ?? page,
    totalPages: b.totalNumPages ?? 1,
    tokenless: !token,
    results: b.results.map((r: any) => ({
      title: r.SEARCHVAL,
      building: r.BUILDING && r.BUILDING !== "NIL" ? r.BUILDING : "",
      blk: r.BLK_NO && r.BLK_NO !== "NIL" ? r.BLK_NO : "",
      road: r.ROAD_NAME && r.ROAD_NAME !== "NIL" ? r.ROAD_NAME : "",
      address: r.ADDRESS,
      postal: r.POSTAL && r.POSTAL !== "NIL" ? r.POSTAL : "",
      lat: Number(r.LATITUDE),
      lng: Number(r.LONGITUDE),
    })),
  };
}

// ---------- 动作 ----------

async function readJson(req: Request): Promise<Record<string, any>> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "请求格式不对");
  }
}

async function handle(req: Request): Promise<Response> {
  const action = new URL(req.url).searchParams.get("action") ?? "";

  switch (action) {
    case "verify": {
      await requirePasscode(req);
      return json(200, { ok: true });
    }

    case "search": {
      await requirePasscode(req);
      const body = await readJson(req);
      const q = str(body.q, 100, "搜索词", true)!;
      const page = Math.min(Math.max(1, Number(body.page) || 1), 50);
      return json(200, await onemapSearch(q, page));
    }

    case "upload": {
      await requirePasscode(req);
      const form = await req.formData().catch(() => null);
      const file = form?.get("file");
      if (!(file instanceof File)) throw new HttpError(400, "没有收到图片");
      const ext = ({ "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" } as Record<string, string>)[file.type];
      if (!ext) throw new HttpError(400, "只支持 webp / jpeg / png");
      if (file.size > 1024 * 1024) throw new HttpError(413, "图片太大（压缩后应小于 1MB）");
      const path = `places/${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
      const { error } = await db.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });
      if (error) throw new HttpError(500, `图片保存失败：${error.message}`);
      return json(200, { path });
    }

    case "discard": {
      // 保存失败时清理刚上传、还没被任何地点引用的图片
      await requirePasscode(req);
      const body = await readJson(req);
      const paths: string[] = (Array.isArray(body.paths) ? body.paths : []).filter(
        (p: unknown) => typeof p === "string" && IMAGE_PATH.test(p),
      ).slice(0, 12);
      const unused: string[] = [];
      for (const p of paths) {
        const { count } = await db.from("places").select("id", { count: "exact", head: true })
          .filter("images", "cs", JSON.stringify([{ path: p }]));
        if (!count) unused.push(p);
      }
      await removeImages(unused);
      return json(200, { removed: unused.length });
    }

    case "create": {
      await requirePasscode(req);
      const body = await readJson(req);
      const who = nickname(body.nickname);
      const place = cleanPlace(body.place);
      const { data, error } = await db.from("places")
        .insert({ ...place, created_by: who, updated_by: who })
        .select().single();
      if (error) throw new HttpError(500, `保存失败：${error.message}`);
      return json(200, { place: data });
    }

    case "update": {
      await requirePasscode(req);
      const body = await readJson(req);
      const who = nickname(body.nickname);
      const id = str(body.id, 40, "id", true)!;
      const place = cleanPlace(body.place);
      const { data: old, error: e1 } = await db.from("places").select("images").eq("id", id).maybeSingle();
      if (e1) throw new HttpError(500, e1.message);
      if (!old) throw new HttpError(404, "这个地点已经不存在了");
      const { data, error } = await db.from("places")
        .update({ ...place, updated_by: who, updated_at: new Date().toISOString() })
        .eq("id", id).select().single();
      if (error) throw new HttpError(500, `保存失败：${error.message}`);
      const keep = new Set(place.images.map((i) => i.path));
      await removeImages((old.images as ImageRef[]).map((i) => i.path).filter((p) => !keep.has(p)));
      return json(200, { place: data });
    }

    case "delete": {
      await requirePasscode(req);
      const body = await readJson(req);
      const id = str(body.id, 40, "id", true)!;
      const { data: old, error } = await db.from("places").delete().eq("id", id).select("images").maybeSingle();
      if (error) throw new HttpError(500, `删除失败：${error.message}`);
      if (!old) throw new HttpError(404, "这个地点已经不存在了");
      await removeImages((old.images as ImageRef[]).map((i) => i.path));
      return json(200, { ok: true });
    }

    default:
      throw new HttpError(404, "未知操作");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "只接受 POST" });
  try {
    return await handle(req);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: "服务器出错了，请稍后再试" });
  }
});
