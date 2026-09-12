/**
 * recommend.js — 基于访客行为的轻量个性化推荐引擎
 * 推荐依据（均为本站埋点实时采集）：
 *   - 设备类型 / 访问来源 / 是否回访
 *   - 各模块实时停留时长与曝光次数
 * 规则简单可解释：先按"停留时间最长的模块"推荐相关深读内容，
 * 再叠加设备与来源维度做微调，保证至少输出 3 张卡片。
 */
(function () {
  "use strict";
  if (!window.SiteTracker) return;

  var grid = document.getElementById("recGrid");
  var note = document.getElementById("recNote");
  if (!grid) return;

  // ---------- 推荐内容库 ----------
  var CONTENT = {
    projects: [
      { e: "⚡", t: "实时反欺诈：毫秒级风控决策", d: "Flink OVER 窗口实时特征 + 6 条规则加权评分 + MATCH_RECOGNIZE 盗卡路径检测，交易发生瞬间完成欺诈判定。", href: "#projects" },
      { e: "🏗️", t: "监管报送：500+ 条校验规则", d: "一表通平台协议主题域数据合格率从 74% 提升至 99%，四级穿透血缘让问题排查从 1 天缩短到 3 小时。", href: "#projects" },
      { e: "👤", t: "客户画像：500+ 标签体系", d: "离线 Hive + 实时 Flink 双链路标签计算，FastAPI 接口服务营销系统，标签应用率达 92%。", href: "#projects" },
      { e: "🔁", t: "2 亿条数据迁移零丢失", d: "Oracle → GaussDB 信创迁移，四维度自动化校验（行数/主键/金额汇总/字段MD5），一致率 99.99%。", href: "#projects" }
    ],
    skills: [
      { e: "🛠️", t: "SQL 性能调优实战", d: "分区裁剪、MapJoin 广播、EXISTS 替代 IN——核心作业执行时间从 4h 降至 1.5h（降低 62.5%）。", href: "#skills" },
      { e: "🌊", t: "流处理三板斧", d: "OVER 窗口、Lookup JOIN、Watermark 水位线：Flink SQL 处理实时特征的典型套路与踩坑经验。", href: "#skills" },
      { e: "📊", t: "数仓分层方法论", d: "ODS→DWD→DWS→ADS 全链路开发 + 星型模型维度建模，Mapping 映射与血缘梳理的完整实践。", href: "#skills" }
    ],
    experience: [
      { e: "🏦", t: "5 家农商行 + 1 家券商", d: "从数据重构、核心迁移到客户画像、监管报送、实时风控，金融数据领域的完整项目光谱。", href: "#experience" },
      { e: "📈", t: "从初级到独立负责模块", d: "6 年成长路径：由良品铺子项目起步，到独立负责 2 亿条核心数据迁移与实时风控开发。", href: "#experience" }
    ],
    about: [
      { e: "🎯", t: "为什么选择数据开发", d: "电气工程背景 + 严谨工科思维，把数据质量当作工程问题来求解：可度量、可校验、可追溯。", href: "#about" },
      { e: "🧭", t: "我的技术价值观", d: "数仓基本功扎实优先于追新：分层架构、Mapping 文档、数据校验这些'笨功夫'是系统稳定的基石。", href: "#about" }
    ],
    contact: [
      { e: "💬", t: "正在招聘数据开发？", d: "可直接电话/微信联系：15108832270，邮箱 709162753@qq.com，随时欢迎沟通。", href: "#contact" },
      { e: "🤝", t: "项目合作咨询", d: "数仓建设、ETL 开发、实时计算方向的项目评估与技术方案，欢迎交流。", href: "#contact" }
    ]
  };
  var FALLBACK = [
    { e: "⭐", t: "简历速览 30 秒", d: "6 年大数据开发 · 金融数据领域 7 个项目 · Hive/Flink/DataX 全链路 ETL · 数仓建模与数据治理。", href: "#about" },
    { e: "⚡", t: "最有含金量的项目", d: "荆州农商行实时反欺诈平台：毫秒级风控决策，6 条规则引擎 + CEP 盗卡检测。", href: "#projects" },
    { e: "📞", t: "保持联系", d: "电话/微信 15108832270 · 邮箱 709162753@qq.com。", href: "#contact" }
  ];

  // ---------- 计算推荐 ----------
  function computeRecommendations() {
    var live = window.SiteTracker.getSession() || {};
    var st = live.sessionTime || {};
    var picks = [], reasons = [];

    // 1) 按停留时间排序找兴趣模块
    var ranked = Object.keys(st).sort(function (a, b) { return st[b] - st[a]; });
    var topModule = ranked.length && st[ranked[0]] >= 4 ? ranked[0] : null; // ≥4 秒视为有效兴趣

    if (topModule && CONTENT[topModule]) {
      CONTENT[topModule].slice(0, 2).forEach(function (c) { picks.push(c); });
      reasons.push("你在「" + (window.SiteTracker.MODULE_NAMES[topModule] || topModule) + "」停留最久（" + window.SiteTracker.fmtTime(st[topModule]) + "）");
    }

    // 2) 设备维度
    if (live.device === "移动") {
      reasons.push("正在使用移动设备");
      picks.push({ e: "📱", t: "移动端快速了解", d: "三句话认识我：6 年大数据开发；金融领域 7 个项目；离线数仓 + 实时计算双修。", href: "#about" });
    } else if (live.device === "桌面" && picks.length < 3) {
      picks.push(CONTACT_CARD());
    }

    // 3) 来源维度
    if (live.source === "搜索引擎") reasons.push("来自搜索引擎");
    if (live.source === "社交媒体") reasons.push("来自社交媒体");
    if (live.source === "外部链接") reasons.push("来自外部链接");

    // 4) 回访维度
    if (live.visits > 1) {
      reasons.push("第 " + live.visits + " 次回访");
      if (picks.length < 3) {
        picks.push({ e: "🙏", t: "欢迎回来！", d: "你已第 " + live.visits + " 次到访本站，可跳到「项目经历」直接看干货。", href: "#projects" });
      }
    } else {
      reasons.push("首次到访");
    }

    // 5) 兜底补齐 3 张
    var i = 0;
    while (picks.length < 3 && i < FALLBACK.length) { picks.push(FALLBACK[i++]); }
    return { picks: picks.slice(0, 3), reasons: reasons };
  }

  function CONTACT_CARD() {
    return { e: "💼", t: "HR 视角速读", d: "技能矩阵 + 时间线 + 7 个项目详情，适合桌面端逐项深入阅读。", href: "#skills" };
  }

  // ---------- 渲染 ----------
  function render() {
    var r = computeRecommendations();
    grid.innerHTML = r.picks.map(function (c) {
      return '<div class="rec-card"><div class="rec-emoji">' + c.e + '</div><h4>' + c.t + '</h4><p>' + c.d + '</p><a href="' + c.href + '">查看 →</a></div>';
    }).join("");
    if (note) {
      note.innerHTML = "🤖 推荐依据：" + r.reasons.join(" · ") +
        "。所有行为数据仅存储于你的浏览器本地（localStorage），不上传服务器。";
    }
  }

  // 首次 6 秒后生成（积累一定行为数据），之后每 15 秒刷新一次
  setTimeout(render, 6000);
  setInterval(render, 15000);
})();
