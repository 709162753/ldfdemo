# -*- coding: utf-8 -*-
"""
app.py — 陆德飞个人网站 · 访问统计后端（FastAPI + SQLite）
职责：
  1. 接收前端埋点上报：PV / UV（按天去重）、来源、设备、模块停留时间心跳
  2. 聚合真实统计数据供数据看板拉取
  3. 托管静态网站（website/ 目录），一个进程搞定整站
启动：python run.py  →  http://127.0.0.1:8000
"""
import os
import sqlite3
import time
from datetime import date, datetime, timedelta

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

BASE = os.path.dirname(os.path.abspath(__file__))
SITE_DIR = os.path.abspath(os.path.join(BASE, ".."))          # website/
DB_PATH = os.path.join(BASE, "data", "analytics.db")

# ---------- 数据库 ----------
def get_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS pageviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visitor_id TEXT NOT NULL,
            ts TEXT NOT NULL,
            date TEXT NOT NULL,
            source TEXT NOT NULL,
            device TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_pv_date ON pageviews(date);
        CREATE INDEX IF NOT EXISTS idx_pv_visitor ON pageviews(visitor_id);
        CREATE TABLE IF NOT EXISTS dwell (
            date TEXT NOT NULL,
            module TEXT NOT NULL,
            seconds REAL NOT NULL DEFAULT 0,
            PRIMARY KEY (date, module)
        );
        CREATE TABLE IF NOT EXISTS visit_meta (
            visitor_id TEXT PRIMARY KEY,
            first_visit TEXT NOT NULL,
            visits INTEGER NOT NULL DEFAULT 1
        );
    """)
    conn.commit()
    conn.close()

init_db()

# ---------- 内存态：实时会话 ----------
LIVE = {}            # visitor_id -> {ts, currentModule, device, source, sessionTime}
LAST_SESSION = {}    # visitor_id -> 最近一次心跳的 sessionTime 快照（用于差量计算）

LIVE_TIMEOUT = 30    # 秒，超过视为离线

app = FastAPI(title="个人网站访问统计后端")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

# ---------- 埋点上报 ----------
@app.post("/api/collect/pv")
async def collect_pv(req: Request):
    d = await req.json()
    visitor_id = (d.get("visitorId") or "")[:64]
    if not visitor_id:
        return {"ok": False, "msg": "missing visitorId"}
    today = d.get("date") or date.today().isoformat()
    source = (d.get("source") or "未知")[:32]
    device = (d.get("device") or "未知")[:16]
    conn = get_db()
    conn.execute(
        "INSERT INTO pageviews (visitor_id, ts, date, source, device) VALUES (?,?,?,?,?)",
        (visitor_id, datetime.now().isoformat(timespec="seconds"), today, source, device),
    )
    conn.execute(
        """INSERT INTO visit_meta (visitor_id, first_visit, visits) VALUES (?,?,1)
           ON CONFLICT(visitor_id) DO UPDATE SET visits = visits + 1""",
        (visitor_id, today),
    )
    conn.commit()
    conn.close()
    return {"ok": True}

@app.post("/api/collect/heartbeat")
async def collect_heartbeat(req: Request):
    d = await req.json()
    visitor_id = (d.get("visitorId") or "")[:64]
    if not visitor_id:
        return {"ok": False}
    st = d.get("sessionTime") or {}
    today = d.get("date") or date.today().isoformat()
    prev = LAST_SESSION.get(visitor_id) or {}

    conn = get_db()
    for mod, sec in st.items():
        mod = str(mod)[:32]
        try:
            delta = max(0.0, float(sec) - float(prev.get(mod) or 0))
        except (TypeError, ValueError):
            continue
        if delta > 0:
            conn.execute(
                """INSERT INTO dwell (date, module, seconds) VALUES (?,?,?)
                   ON CONFLICT(date, module) DO UPDATE SET seconds = seconds + excluded.seconds""",
                (today, mod, delta),
            )
    conn.commit()
    conn.close()

    LAST_SESSION[visitor_id] = {str(k): float(v or 0) for k, v in st.items()}
    LIVE[visitor_id] = {
        "ts": time.time(),
        "currentModule": d.get("currentModule"),
        "device": d.get("device"),
        "source": d.get("source"),
        "sessionTime": LAST_SESSION[visitor_id],
    }
    return {"ok": True}

# ---------- 统计聚合 ----------
@app.get("/api/stats")
def stats():
    conn = get_db()
    days = [(date.today() - timedelta(days=i)).isoformat() for i in range(29, -1, -1)]
    qm = ",".join("?" * len(days))
    bydate = {
        r["date"]: {"pv": r["pv"], "uv": r["uv"]}
        for r in conn.execute(
            f"SELECT date, COUNT(*) AS pv, COUNT(DISTINCT visitor_id) AS uv "
            f"FROM pageviews WHERE date IN ({qm}) GROUP BY date", days)
    }
    trend = [{"date": d, "pv": bydate.get(d, {}).get("pv", 0),
              "uv": bydate.get(d, {}).get("uv", 0)} for d in days]

    total = conn.execute(
        "SELECT COUNT(*) AS pv, COUNT(DISTINCT visitor_id) AS uv FROM pageviews").fetchone()
    sources = {r["source"]: r["n"] for r in conn.execute(
        "SELECT source, COUNT(*) n FROM pageviews GROUP BY source ORDER BY n DESC")}
    devices = {r["device"]: r["n"] for r in conn.execute(
        "SELECT device, COUNT(*) n FROM pageviews GROUP BY device ORDER BY n DESC")}
    module_time = {r["module"]: round(r["s"]) for r in conn.execute(
        "SELECT module, SUM(seconds) s FROM dwell GROUP BY module ORDER BY s DESC")}
    dwell_total = sum(module_time.values())
    visitors = total["uv"] or 0

    now = time.time()
    live_list = [
        {
            "visitorId": v[:8] + "…",
            "currentModule": s.get("currentModule"),
            "device": s.get("device"),
            "source": s.get("source"),
            "sessionTime": {k: round(x) for k, x in (s.get("sessionTime") or {}).items()},
        }
        for v, s in LIVE.items() if now - s.get("ts", 0) < LIVE_TIMEOUT
    ]
    conn.close()

    return {
        "totalPv": total["pv"],
        "totalUv": visitors,
        "today": trend[-1],
        "trend": trend,
        "sources": sources,
        "devices": devices,
        "moduleTime": module_time,
        "dwellTotal": round(dwell_total),
        "avgDwellPerVisitor": round(dwell_total / visitors) if visitors else 0,
        "online": len(live_list),
        "live": live_list,
    }

# ---------- 托管静态站点（放最后，避免吞掉 /api 路由） ----------
app.mount("/", StaticFiles(directory=SITE_DIR, html=True), name="site")
