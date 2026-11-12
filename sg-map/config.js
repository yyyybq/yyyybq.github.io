// 新加坡探店地图 · 配置
// 增减类别、改颜色/图标只需要改这个文件，改完提交即可（数据库不用动）。
window.SGMAP_CONFIG = {
  // Supabase 项目地址和「公开」key（publishable key，本来就是给浏览器用的，可以放在这里）
  supabaseUrl: "https://akzakeqyiwhscuykbqfk.supabase.co",
  supabaseKey: "sb_publishable_9SjzkExmEjMdz-S3maJ-EQ_ImiOk2qv",
  bucket: "sg-map",

  // 类别：key 存进数据库，一旦有地点用了就别改 key（label / icon / color 随便改）。
  // 删掉某个类别后，用了它的地点会显示为最后一个类别（建议保留「其他」放最后）。
  categories: [
    { key: "eat", label: "吃", icon: "🍜", color: "#E4572E" },
    { key: "drink", label: "喝", hint: "咖啡 · 酒吧", icon: "☕", color: "#9C6644" },
    { key: "play", label: "玩·体验", icon: "🎡", color: "#1F8A70" },
    { key: "exhibit", label: "看展", icon: "🖼️", color: "#6C4AB6" },
    { key: "shop", label: "买", icon: "🛍️", color: "#D63384" },
    { key: "other", label: "其他", icon: "📍", color: "#5B6770" },
  ],

  // 链接来源：按域名识别。domains 里可以写域名（含子域名），也可以写「域名/路径前缀」。
  linkSources: [
    { label: "小红书", color: "#FF2442", domains: ["xiaohongshu.com", "xhslink.com", "xhslink.cn", "xhs.cn"] },
    { label: "视频号", color: "#07C160", domains: ["channels.weixin.qq.com", "weixin.qq.com/sph", "finder.video.qq.com"] },
  ],
  otherLinkSource: { label: "其他", color: "#6B7280" },

  // 图片压缩：长边像素上限、目标大小
  image: { maxSide: 1600, targetKB: 300 },

  // 地图初始视野
  map: { center: [1.3245, 103.8400], zoom: 12 },
};
