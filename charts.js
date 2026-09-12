/**
 * charts.js — 纯 SVG 轻量图表库（无 CDN / 无外部依赖）
 * 提供：折线图（多系列）、环形图、横向条形图、纵向条形图
 * 所有图表自适应容器宽度（viewBox 缩放）。
 */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function txt(node, x, y, s, opts) {
    var t = el("text", {
      x: x, y: y,
      "font-size": opts && opts.size || 11,
      fill: opts && opts.fill || "#64748b",
      "text-anchor": opts && opts.anchor || "middle",
      "font-family": "PingFang SC, Microsoft YaHei, sans-serif"
    });
    t.textContent = s;
    if (opts && opts.weight) t.setAttribute("font-weight", opts.weight);
    node.appendChild(t);
    return t;
  }
  function niceMax(v) {
    if (v <= 5) return 5;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var n = v / p;
    var m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return m * p;
  }

  /* ---------- 折线图 ---------- */
  function lineChart(container, opt) {
    container.innerHTML = "";
    var W = 720, H = 300, padL = 44, padR = 16, padT = 26, padB = 52;
    var iw = W - padL - padR, ih = H - padT - padB;
    var n = opt.labels.length;
    var maxV = niceMax(Math.max.apply(null, opt.series.reduce(function (a, s) { return a.concat(s.data); }, [1])));
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", style: "max-width:100%;height:auto" });

    // 网格 + Y 轴
    for (var g = 0; g <= 4; g++) {
      var y = padT + ih - ih * g / 4;
      svg.appendChild(el("line", { x1: padL, y1: y, x2: W - padR, y2: y, stroke: "#e2e8f0", "stroke-width": g === 0 ? 1.5 : 1 }));
      txt(svg, padL - 8, y + 4, Math.round(maxV * g / 4), { anchor: "end" });
    }
    // X 轴标签（最多显示 ~10 个，避免拥挤）
    var step = Math.ceil(n / 10);
    opt.labels.forEach(function (lb, i) {
      if (i % step === 0 || i === n - 1) txt(svg, x(i), padT + ih + 18, lb);
    });

    function x(i) { return padL + (n === 1 ? iw / 2 : iw * i / (n - 1)); }
    function y(v) { return padT + ih - ih * v / maxV; }

    opt.series.forEach(function (s) {
      var d = "", area = "";
      s.data.forEach(function (v, i) {
        var px = x(i).toFixed(1), py = y(v).toFixed(1);
        d += (i === 0 ? "M" : "L") + px + "," + py;
      });
      if (s.fill) {
        area = d + "L" + x(n - 1).toFixed(1) + "," + (padT + ih) + "L" + x(0).toFixed(1) + "," + (padT + ih) + "Z";
        svg.appendChild(el("path", { d: area, fill: s.color, opacity: .12 }));
      }
      svg.appendChild(el("path", { d: d, fill: "none", stroke: s.color, "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      s.data.forEach(function (v, i) {
        var c = el("circle", { cx: x(i), cy: y(v), r: 3, fill: "#fff", stroke: s.color, "stroke-width": 2 });
        var title = el("title", {});
        title.textContent = opt.labels[i] + "：" + v + (opt.unit || "");
        c.appendChild(title);
        svg.appendChild(c);
      });
    });

    // 图例
    var lx = padL;
    opt.series.forEach(function (s) {
      svg.appendChild(el("rect", { x: lx, y: 6, width: 14, height: 4, rx: 2, fill: s.color }));
      txt(svg, lx + 20, 11, s.name, { anchor: "start", fill: "#475569", weight: 600 });
      lx += 20 + s.name.length * 12 + 24;
    });
    container.appendChild(svg);
  }

  /* ---------- 环形图 ---------- */
  function donutChart(container, items, centerLabel, centerValue) {
    container.innerHTML = "";
    var W = 340, H = 240, cx = 110, cy = 120, R = 82, r = 52;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", style: "max-width:340px;height:auto;display:block;margin:0 auto" });
    var total = items.reduce(function (a, b) { return a + b.value; }, 0) || 1;
    var angle = -Math.PI / 2;
    items.forEach(function (it) {
      var frac = it.value / total, a2 = angle + frac * Math.PI * 2;
      var large = frac > 0.5 ? 1 : 0;
      var x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
      var x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
      var x3 = cx + r * Math.cos(a2), y3 = cy + r * Math.sin(a2);
      var x4 = cx + r * Math.cos(angle), y4 = cy + r * Math.sin(angle);
      var d = "M" + x1 + "," + y1 + " A" + R + "," + R + " 0 " + large + " 1 " + x2 + "," + y2 +
              " L" + x3 + "," + y3 + " A" + r + "," + r + " 0 " + large + " 0 " + x4 + "," + y4 + " Z";
      var p = el("path", { d: d, fill: it.color, opacity: .92 });
      var title = el("title", {});
      title.textContent = it.label + "：" + it.value + "（" + (frac * 100).toFixed(1) + "%）";
      p.appendChild(title);
      svg.appendChild(p);
      angle = a2;
    });
    txt(svg, cx, cy - 4, centerValue || String(total), { size: 24, weight: 700, fill: "#1e293b" });
    txt(svg, cx, cy + 16, centerLabel || "总计", { size: 11 });
    // 图例
    items.forEach(function (it, i) {
      var ly = 30 + i * 26;
      svg.appendChild(el("rect", { x: 225, y: ly - 9, width: 12, height: 12, rx: 3, fill: it.color }));
      txt(svg, 243, ly + 1, it.label, { anchor: "start", fill: "#334155" });
      txt(svg, 335, ly + 1, it.value + "（" + (it.value / total * 100).toFixed(0) + "%）", { anchor: "end", fill: "#64748b" });
    });
    container.appendChild(svg);
  }

  /* ---------- 横向条形图 ---------- */
  function hBarChart(container, items, fmt) {
    container.innerHTML = "";
    var W = 640, rowH = 40, H = items.length * rowH + 16;
    var maxV = Math.max.apply(null, items.map(function (i) { return i.value; })) || 1;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", style: "max-width:100%;height:auto" });
    items.forEach(function (it, i) {
      var y = 10 + i * rowH, bw = Math.max(4, (W - 250) * it.value / maxV);
      txt(svg, 8, y + 15, it.label, { anchor: "start", fill: "#334155", size: 12.5 });
      svg.appendChild(el("rect", { x: 110, y: y + 2, width: W - 250, height: 20, rx: 10, fill: "#eef2f7" }));
      var bar = el("rect", { x: 110, y: y + 2, width: bw, height: 20, rx: 10, fill: it.color || "#2563eb" });
      var title = el("title", {});
      title.textContent = it.label + "：" + (fmt ? fmt(it.value) : it.value);
      bar.appendChild(title);
      svg.appendChild(bar);
      txt(svg, 120 + bw, y + 16, fmt ? fmt(it.value) : it.value, { anchor: "start", weight: 700, fill: "#1e293b", size: 12 });
    });
    container.appendChild(svg);
  }

  /* ---------- 纵向条形图 ---------- */
  function vBarChart(container, items, unit) {
    container.innerHTML = "";
    var W = 360, H = 260, padB = 46, padT = 26;
    var iw = W - 40, ih = H - padB - padT;
    var maxV = niceMax(Math.max.apply(null, items.map(function (i) { return i.value; })));
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", style: "max-width:360px;height:auto;display:block;margin:0 auto" });
    var bw = Math.min(64, iw / items.length * 0.55);
    items.forEach(function (it, i) {
      var cx = 40 + iw / items.length * (i + 0.5);
      var bh = ih * it.value / maxV;
      var bar = el("rect", { x: cx - bw / 2, y: padT + ih - bh, width: bw, height: Math.max(bh, 3), rx: 6, fill: it.color || "#2563eb" });
      var title = el("title", {});
      title.textContent = it.label + "：" + it.value + (unit || "");
      bar.appendChild(title);
      svg.appendChild(bar);
      txt(svg, cx, padT + ih - bh - 8, String(it.value) + (unit || ""), { weight: 700, fill: "#1e293b" });
      txt(svg, cx, H - 22, it.label);
    });
    container.appendChild(svg);
  }

  window.Charts = { line: lineChart, donut: donutChart, hbar: hBarChart, vbar: vBarChart };
})();
