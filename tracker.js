/**
 * tracker.js — 轻量级前端访问统计（纯静态、零后端依赖）
 * 统计能力：
 *   1. 页面浏览量 PV（按天）
 *   2. 独立访客 UV（按天，基于 localStorage 生成的访客 ID）
 *   3. 访问来源（referrer 解析：直接访问/搜索引擎/社交媒体/外部链接）
 *   4. 设备类型（UA 解析：桌面/移动/平板）
 *   5. 各模块停留时间（IntersectionObserver + 页面可见性判断）
 *   6. 每日访问量记录（30 天）
 * 数据写入 localStorage，实时镜像写入 live key 供数据看板跨页面读取。
 */
(function () {
  "use strict";

  var STORE_KEY = "ldf_analytics_v1";   // 聚合数据
  var LIVE_KEY  = "ldf_live_session";    // 实时会话镜像
  var MODULE_NAMES = {
    hero: "首页横幅", about: "关于我", skills: "专业技能",
    experience: "工作经历", projects: "项目经历",
    recommend: "推荐", contact: "联系"
  };

  /* ---------- 工具 ---------- */
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "v-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  }
  function loadJSON(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v || fallback; }
    catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  /* ---------- 来源解析 ---------- */
  function parseSource() {
    // 支持 UTM 参数覆盖（用于测试/推广链接）
    var q = new URLSearchParams(location.search);
    var utm = q.get("utm_source");
    if (utm) {
      var u = utm.toLowerCase();
      if (/baidu|google|bing|sogou|so\.com|duckduckgo/.test(u)) return "搜索引擎";
      if (/weibo|wechat|zhihu|douyin|xiaohongshu|twitter|facebook|qq/.test(u)) return "社交媒体";
      if (/mail|email/.test(u)) return "邮件推广";
      return "外部链接";
    }
    var ref = (document.referrer || "").toLowerCase();
    if (!ref) return "直接访问";
    if (ref.indexOf(location.hostname) >= 0) return "站内跳转";
    if (/baidu|google|bing|sogou|so\.com|duckduckgo|sm\.cn/.test(ref)) return "搜索引擎";
    if (/weibo|weixin|zhihu|douyin|xiaohongshu|twitter|facebook|t\.cn|qq\.com/.test(ref)) return "社交媒体";
    if (/mail|gmail|outlook|163|126|qq\.com/.test(ref)) return "邮件推广";
    return "外部链接";
  }

  /* ---------- 设备解析 ---------- */
  function parseDevice() {
    var ua = navigator.userAgent;
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "平板";
    if (/iPhone|iPod|Android|Windows Phone|Mobile/i.test(ua)) return "移动";
    return "桌面";
  }

  /* ---------- 访客识别 ---------- */
  function getVisitor() {
    var data = loadJSON(STORE_KEY, null);
    if (!data) data = newData();
    if (!data.visitorId) {
      data.visitorId = uuid();
      data.firstVisit = today();
      data.isNew = true;
    }
    return data;
  }
  function newData() {
    return {
      visitorId: null, firstVisit: null, visits: 0,
      days: {},            // { "2026-09-12": {pv: n, uv: n} }
      sources: {},         // { "直接访问": n }
      devices: {},         // { "桌面": n }
      moduleTime: {},      // { "hero": 秒 }（本机累计）
      moduleVisits: {}     // { "hero": n }（模块曝光次数）
    };
  }

  /* ---------- 主流程 ---------- */
  var data = getVisitor();
  var t = today();
  var source = parseSource();
  var device = parseDevice();

  if (!data.days[t]) data.days[t] = { pv: 0, uv: 0 };
  data.days[t].pv += 1;
  if (!data._todayUV || data._todayUV.date !== t) { data._todayUV = { date: t, counted: false }; }
  if (!data._todayUV.counted) { data.days[t].uv += 1; data._todayUV.counted = true; }
  data.sources[source] = (data.sources[source] || 0) + 1;
  data.devices[device] = (data.devices[device] || 0) + 1;
  data.visits += 1;
  saveJSON(STORE_KEY, data);

  /* ---------- 模块停留时间追踪 ---------- */
  var sessionTime = {};   // 本次会话各模块秒数
  var activeModule = null, lastTick = Date.now();
  var visibility = { hidden: document.hidden };

  document.addEventListener("visibilitychange", function () {
    visibility.hidden = document.hidden;
    lastTick = Date.now(); // 切换瞬间重置基准，避免后台时间计入
  });

  function flushTick() {
    var now = Date.now();
    if (activeModule && !visibility.hidden) {
      var delta = (now - lastTick) / 1000;
      sessionTime[activeModule] = (sessionTime[activeModule] || 0) + delta;
      data.moduleTime[activeModule] = (data.moduleTime[activeModule] || 0) + delta;
    }
    lastTick = now;
    saveJSON(STORE_KEY, data);
    writeLive();
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      // 可见度最高的模块作为当前活跃模块
      var best = null, bestRatio = 0;
      entries.forEach(function (en) {
        if (en.isIntersecting && en.intersectionRatio > bestRatio) {
          bestRatio = en.intersectionRatio; best = en.target;
        }
      });
      var newActive = best ? best.getAttribute("data-module") : null;
      if (newActive !== activeModule) {
        flushTick();
        activeModule = newActive;
        lastTick = Date.now();
        if (activeModule) {
          data.moduleVisits[activeModule] = (data.moduleVisits[activeModule] || 0) + 1;
        }
      }
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    document.querySelectorAll("[data-module]").forEach(function (el) { io.observe(el); });
  }

  // 每 2 秒落盘 + 每 30 秒一次心跳
  setInterval(flushTick, 2000);
  window.addEventListener("beforeunload", flushTick);
  window.addEventListener("scroll", function () {}, { passive: true });

  /* ---------- 实时会话镜像（供数据看板读取） ---------- */
  function writeLive() {
    var rounded = {};
    Object.keys(sessionTime).forEach(function (k) {
      rounded[k] = Math.round(sessionTime[k]);
    });
    saveJSON(LIVE_KEY, {
      ts: Date.now(),
      date: t,
      source: source,
      device: device,
      isNew: !!data.isNew,
      visits: data.visits,
      currentModule: activeModule,
      sessionTime: rounded
    });
  }
  writeLive();

  /* ---------- 暴露 API ---------- */
  window.SiteTracker = {
    MODULE_NAMES: MODULE_NAMES,
    getData: function () { return data; },
    getSession: function () { return loadJSON(LIVE_KEY, null); },
    fmtTime: function (sec) {
      sec = Math.round(sec);
      var m = Math.floor(sec / 60), s = sec % 60;
      return (m > 0 ? m + " 分 " : "") + s + " 秒";
    }
  };
})();
