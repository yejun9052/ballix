"""FotMob 스크래퍼를 감싸는 FastAPI 서비스.

Java 백엔드가 HTTP로 호출한다. Playwright 브라우저를 lifespan 동안 한 번만
띄워 모든 요청이 재사용하므로 매 요청 콜드스타트를 피한다.

실행:
    py -3 -m uvicorn api:app --host 127.0.0.1 --port 8800

엔드포인트:
    GET /health
    GET /match/{match_id}          → 라인업·이벤트·평점 (영문 평탄 구조)
    GET /player/{player_id}        → 선수 상세 정보(프로필 + 시즌 스탯)
    GET /search?team1=&team2=&competition=  → fotmobMatchId 후보 목록
    GET /youtube/search?q=         → 유튜브 동영상 검색 후보 (경기 하이라이트 찾기용)
    GET /youtube/embeddable/{id}   → 영상 임베드(외부 사이트 재생) 가능 여부

모든 크롤 엔드포인트는 시작 시 crawl_throttle()로 직전 크롤과 300~500ms 랜덤 간격을 둔다.
"""
import asyncio
import random
import time
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from playwright.async_api import async_playwright

from scraper import (
    extract_from_page,
    resolve_page_url,
    fetch_schedule_from_page,
    fetch_league_table_from_page,
    fetch_commentary_from_page,
    fetch_player_from_page,
    fetch_youtube_search,
    fetch_youtube_embeddable,
    BROWSER_LAUNCH_ARGS,
    CONTEXT_OPTIONS,
    STEALTH_INIT_SCRIPT,
    install_resource_blocking,
)
from search import search_matches


# ── 공유 브라우저 상태 ────────────────────────────────────────────────
_state: dict[str, Any] = {}


# ── 크롤 간격 제한(throttle) ──────────────────────────────────────────
# 모든 크롤 시작 사이에 300~500ms 의 랜덤 간격을 둔다(예: 352ms, 421ms, 367ms).
# 연속/동시 요청이 몰려도 FotMob에 일정 텀을 두고 접근해 차단 위험을 낮춘다.
# 락 + 마지막 크롤 시각으로 간격을 강제하므로, 한가할 땐 불필요하게 지연되지 않는다.
CRAWL_DELAY_MIN_MS = 300
CRAWL_DELAY_MAX_MS = 500
_throttle_lock = asyncio.Lock()
_last_crawl_ts = 0.0

# 동시에 떠 있는 Chromium 페이지 수 제한(메모리 보호). 무료 인스턴스(512MB)에서 크롤이 겹치면
# 페이지가 여러 개 떠 OOM으로 프로세스가 죽고(502), 그 뒤 크롤이 전부 실패한다. 1로 직렬화해 피크 메모리를 묶는다.
_browser_sem = asyncio.Semaphore(1)


async def crawl_throttle():
    """직전 크롤로부터 랜덤 간격(300~500ms)이 지나도록 대기한 뒤 진행."""
    global _last_crawl_ts
    async with _throttle_lock:
        gap = random.uniform(CRAWL_DELAY_MIN_MS, CRAWL_DELAY_MAX_MS) / 1000.0
        wait = _last_crawl_ts + gap - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        _last_crawl_ts = time.monotonic()
    print(f"[throttle] 크롤 간격 {gap * 1000:.0f}ms 적용", flush=True)


@asynccontextmanager
async def crawl_page(navigate_home: bool = False):
    """크롤용 페이지를 `_browser_sem` 보호 하에 열고 자동으로 닫는다.

    무료 인스턴스(512MB)에서 Chromium 페이지가 동시에 여러 개 뜨면 OOM(502)으로 프로세스가 죽는다.
    모든 크롤(경기·선수·일정·순위·커멘터리·유튜브)을 이 한 세마포어로 직렬화해 **동시에 떠 있는 페이지를 1개로** 묶는다.
    (컨텍스트에 설치된 리소스 차단과 함께 작동 — 차단으로 페이지당 메모리를, 세마포어로 페이지 수를 제한.)

    navigate_home=True 면 fotmob.com 으로 먼저 이동해 상대경로 `fetch('/api/data/*')` 를 쓸 수 있게 한다.
    """
    async with _browser_sem:
        page = await _state["context"].new_page()
        try:
            if navigate_home:
                await page.goto("https://www.fotmob.com", wait_until="domcontentloaded", timeout=30000)
            yield page
        finally:
            await page.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    pw = await async_playwright().start()
    browser = await pw.chromium.launch(headless=True, args=BROWSER_LAUNCH_ARGS)
    context = await browser.new_context(**CONTEXT_OPTIONS)
    await context.add_init_script(STEALTH_INIT_SCRIPT)
    await install_resource_blocking(context)   # 렌더 전용 리소스·광고 차단 → 512MB OOM 방지
    _state["pw"] = pw
    _state["browser"] = browser
    _state["context"] = context
    print("[api] Playwright 브라우저 준비 완료")
    try:
        yield
    finally:
        await context.close()
        await browser.close()
        await pw.stop()
        print("[api] Playwright 종료")


app = FastAPI(title="FotMob Scraper API", lifespan=lifespan)


# ── 데이터 정제 (raw → Java가 먹기 좋은 영문 평탄 구조) ────────────────
def _normalize_status(header_status: dict) -> str:
    """FotMob status를 SCHEDULED/IN_PLAY/FINISHED로 정규화."""
    if header_status.get("finished"):
        return "FINISHED"
    if header_status.get("cancelled"):
        return "CANCELLED"
    if header_status.get("started"):
        return "IN_PLAY"
    return "SCHEDULED"


def _fmt_match_stat(stat: dict):
    """경기별 선수 스탯 값 포맷. boolean(표시 플래그)·값 없음은 None으로 제외."""
    t = stat.get("type")
    v = stat.get("value")
    if t == "boolean" or v is None:
        return None
    if t == "fractionWithPercentage":
        total = stat.get("total")
        return f"{v}/{total}" if total is not None else v
    return v


def _match_stats_by_player(raw: dict) -> dict:
    """content.playerStats[playerId] → {playerId(int): [{title,value}]} 로 평탄화.

    경기별 선수 상세(슈팅·기회 창출·터치·패스·태클 등). 그룹(Top stats/Attack/...)을 가로질러
    {title: {stat:{value,total,type}}} 를 모아 같은 title 중복 제거.
    """
    out: dict[int, list[dict]] = {}
    ps = (raw.get("content", {}) or {}).get("playerStats") or {}
    if not isinstance(ps, dict):
        return out
    for pid, pdata in ps.items():
        if not isinstance(pdata, dict):
            continue
        items, seen = [], set()
        for group in pdata.get("stats", []) or []:
            if not isinstance(group, dict):
                continue
            for title, entry in (group.get("stats") or {}).items():
                if not isinstance(entry, dict):
                    continue
                val = _fmt_match_stat(entry.get("stat") or {})
                if val is None:
                    continue
                key = str(title).strip().lower()
                if key in seen:
                    continue
                seen.add(key)
                items.append({"title": str(title), "value": val})
        pid_int = _to_int(pid)
        if pid_int is not None and items:
            out[pid_int] = items
    return out


def _lineup_rows(team_data: dict, is_home: bool, stats_by_player: dict | None = None) -> list[dict]:
    stats_by_player = stats_by_player or {}
    rows = []
    for is_starter, key in ((True, "starters"), (False, "subs")):
        for p in team_data.get(key, []) or []:
            if not isinstance(p, dict):
                continue
            perf = p.get("performance") or {}
            sub_events = perf.get("substitutionEvents") or []
            sub_in = next((e.get("time") for e in sub_events if e.get("type") == "subIn"), None)
            sub_out = next((e.get("time") for e in sub_events if e.get("type") == "subOut"), None)
            hl = p.get("horizontalLayout") or {}  # 피치 좌표(0~1): x=깊이(0=GK쪽,1=공격), y=좌우
            pid = p.get("id")
            rows.append({
                "playerId": pid,
                "name": p.get("name"),
                "shirtNumber": _to_int(p.get("shirtNumber")),
                "positionId": p.get("positionId"),
                "posX": _to_float(hl.get("x")),
                "posY": _to_float(hl.get("y")),
                "isHome": is_home,
                "isStarter": is_starter,
                "rating": _to_float(perf.get("rating")),
                "subInMinute": sub_in,
                "subOutMinute": sub_out,
                # 경기별 상세 스탯(슈팅·기회 창출·터치 등). 경기 진행/종료 시에만 채워짐.
                "matchStats": stats_by_player.get(_to_int(pid)) or [],
            })
    return rows


def _event_rows(raw: dict) -> list[dict]:
    events = (
        raw.get("content", {})
        .get("matchFacts", {})
        .get("events", {})
        .get("events", [])
    ) or []
    out = []
    for ev in events:
        etype = ev.get("type")
        minute = ev.get("time")
        added = ev.get("overloadTime")
        is_home = ev.get("isHome")

        if etype == "Goal":
            p = ev.get("player") or {}
            out.append(_event(
                "GOAL", minute, added, is_home,
                p.get("id"), p.get("name") or ev.get("nameStr"),
                ev.get("assistStr") or "",
            ))
        elif etype == "Card":
            out.append(_event(
                "CARD", minute, added, is_home,
                ev.get("playerId") or (ev.get("player") or {}).get("id"),
                ev.get("nameStr") or (ev.get("player") or {}).get("name"),
                ev.get("card") or "",  # "Yellow" / "Red"
            ))
        elif etype == "Substitution":
            swap = ev.get("swap") or []
            in_p = swap[0] if len(swap) > 0 else {}
            out_p = swap[1] if len(swap) > 1 else {}
            out.append(_event(
                "SUB", minute, added, is_home,
                _to_int(in_p.get("id")), in_p.get("name"),
                f"out:{out_p.get('name', '')}",
            ))
    return out


def _added_times(raw: dict) -> tuple[Optional[int], Optional[int]]:
    """전·후반 추가시간(분). FotMob의 type="AddedTime" 이벤트에서 time=45→전반, 90→후반."""
    events = ((raw.get("content", {}) or {}).get("matchFacts", {}) or {}).get("events", {}) or {}
    first = second = None
    for ev in events.get("events", []) or []:
        if ev.get("type") != "AddedTime":
            continue
        mins = _to_int(ev.get("minutesAddedInput"))
        if ev.get("time") == 45:
            first = mins
        elif ev.get("time") == 90:
            second = mins
    return first, second


def _event(etype, minute, added, is_home, player_id, player_name, detail) -> dict:
    return {
        "type": etype,
        "minute": minute,
        "addedTime": added,
        "isHome": is_home,
        "playerId": player_id,
        "playerName": player_name,
        "detail": detail,
    }


def _iso_epoch(s: Optional[str]) -> Optional[float]:
    """ISO-8601(UTC, 'Z' 포함) → epoch seconds."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except (ValueError, TypeError):
        return None


def _live_seconds_from_halfs(status: dict, fallback: Optional[int]) -> Optional[int]:
    """하프 시작 실제 시각(`status.halfs`)으로 현재 경과초를 계산 — SSR(`liveTime.long`) 지연 제거.

    halfs 시각은 FotMob이 대회/경기장 타임존으로 렌더한 문자열("dd.mm.YYYY HH:MM:SS")이라 타임존이 모호하다.
    예약 킥오프(`utcTime`, 신뢰 UTC)와의 차이를 **15분 배수로 반올림**해 타임존 오프셋을 구하고(나머지=지연 킥오프),
    그렇게 UTC로 환산한 하프 시작에서 경과초를 계산한다. SSR 값과 10분 이상 어긋나면(파싱 오류) 폴백.
    전·후반 진행 중만 계산하고 HT/연장/종료는 폴백(기존 라벨/None 로직에 위임).
    """
    try:
        halfs = status.get("halfs") or {}
        kickoff = _iso_epoch(status.get("utcTime"))
        first_str = (halfs.get("firstHalfStarted") or "").strip()
        if kickoff is None or not first_str:
            return fallback

        def naive_utc(s: str) -> float:  # 문자열을 UTC로 가정한 epoch
            return datetime.strptime(s.strip(), "%d.%m.%Y %H:%M:%S").replace(tzinfo=timezone.utc).timestamp()

        # 타임존 오프셋 = (1st 시작 문자열을 UTC로 본 값 − 예약 킥오프)을 15분 배수로 반올림
        offset = round((naive_utc(first_str) - kickoff) / 900.0) * 900

        def half_utc(key: str) -> Optional[float]:
            s = (halfs.get(key) or "").strip()
            return (naive_utc(s) - offset) if s else None

        def half_utc_any(*keys: str) -> Optional[float]:    # 연장 필드명이 버전마다 달라 후보 키를 모두 시도
            for k in keys:
                v = half_utc(k)
                if v is not None:
                    return v
            return None

        def ended_any(*keys: str) -> bool:
            return any((halfs.get(k) or "").strip() for k in keys)

        first_start = half_utc("firstHalfStarted")
        second_start = half_utc("secondHalfStarted")
        first_ended = ended_any("firstHalfEnded")
        second_ended = ended_any("secondHalfEnded")
        # 연장(토너먼트): 1차 연장=90:00~, 2차 연장=105:00~. 후보 키로 방어적으로 읽고 없으면 None(=폴백, 무회귀).
        et1_start = half_utc_any("firstExtraHalfStarted", "extraFirstHalfStarted")
        et2_start = half_utc_any("secondExtraHalfStarted", "extraSecondHalfStarted")
        et1_ended = ended_any("firstExtraHalfEnded", "extraFirstHalfEnded")
        et2_ended = ended_any("secondExtraHalfEnded", "extraSecondHalfEnded")
        now = time.time()

        if et2_start is not None and not et2_ended:
            computed = 6300 + (now - et2_start)             # 2차 연장: 105:00 + (지금 − 2차 연장시작)
        elif et1_start is not None and not et1_ended:
            computed = 5400 + (now - et1_start)             # 1차 연장: 90:00 + (지금 − 1차 연장시작)
        elif second_start is not None and not second_ended:
            computed = 2700 + (now - second_start)          # 후반: 45:00 + (지금 − 후반시작)
        elif first_start is not None and not first_ended:
            computed = now - first_start                    # 전반: 지금 − 전반시작
        else:
            return fallback                                 # 휴식/승부차기/종료 등은 폴백

        computed = int(round(computed))
        if computed < 0 or computed > 9000:                 # 음수/2.5시간 초과 = 비정상
            return fallback
        if fallback is not None and abs(computed - fallback) > 600:  # SSR과 10분↑ 차이 = 파싱오류
            return fallback
        return computed
    except (ValueError, TypeError, KeyError):
        return fallback


def _break_override(status: dict, label: Optional[str], seconds: Optional[int],
                    live_added: Optional[int], first_added: Optional[int],
                    second_added: Optional[int]) -> tuple:
    """라이브 '정지(휴식)' 구간을 status.halfs로 선반영해 시계를 멈춘다(SSR 라벨 지연 보완).
    숫자 없는 라벨을 내리면 Java isClockPaused가 앵커를 비워 시계를 멈추고 라벨만 표시한다.

    - HT: 전반 종료 + 후반 미시작.
    - (A) 전반 진행 중인데 경과가 (45분 + 부여 추가시간 + 30초)를 넘김 → 종료로 보고 HT.
          firstHalfEnded 신호가 지연돼 '55분'처럼 계속 흐르는 것을 막는다.
    - (B) 연장 하프타임: 1차 연장 종료 + 2차 연장 미시작 → HT. 승부차기 진행 중(종료 전) → "Pen.".
    연장/승부차기 필드명은 FotMob 버전마다 달라 후보 키를 모두 본다(없으면 발동 안 함 = 무회귀).
    반환: (라벨, 경과초) — 정지 구간이면 (라벨, None), 아니면 입력 그대로.
    """
    halfs = status.get("halfs") or {}

    def has(*keys: str) -> bool:
        return any((halfs.get(k) or "").strip() for k in keys)

    # 정규 하프타임: 전반 종료 + 후반 미시작
    if has("firstHalfEnded") and not has("secondHalfStarted"):
        return "HT", None
    # (A) 전반 진행 중인데 부여 추가시간 + 30초를 넘김 → HT 강제
    if (has("firstHalfStarted") and not has("firstHalfEnded")
            and not has("secondHalfStarted") and seconds is not None):
        added = live_added if (live_added and live_added > 0) else first_added
        if added and added > 0 and seconds > 45 * 60 + added * 60 + 30:
            return "HT", None
    # (B) 연장 하프타임: 1차 연장 종료 + 2차 연장 미시작
    if has("firstExtraHalfEnded", "extraFirstHalfEnded") and not has(
            "secondExtraHalfStarted", "extraSecondHalfStarted"):
        return "HT", None
    # (B) 승부차기 진행 중(아직 경기 종료 아님) → 시계 정지
    if has("penaltyShootoutStarted", "penaltiesStarted", "shootoutStarted") and not has("gameEnded"):
        return "Pen.", None
    return label, seconds


def build_match_response(raw: dict) -> dict:
    general = raw.get("general", {})
    header = raw.get("header", {})
    teams = header.get("teams", [])
    status = header.get("status", {})

    home = teams[0] if len(teams) > 0 else {}
    away = teams[1] if len(teams) > 1 else {}

    lineup = raw.get("content", {}).get("lineup", {}) or {}
    home_lineup = lineup.get("homeTeam", {}) or {}
    away_lineup = lineup.get("awayTeam", {}) or {}

    # 구장 이름: content.matchFacts.infoBox.Stadium.name (없는 경기도 있어 전부 방어)
    info_box = ((raw.get("content", {}) or {}).get("matchFacts", {}) or {}).get("infoBox", {}) or {}
    stadium = info_box.get("Stadium") or {}
    venue = stadium.get("name") if isinstance(stadium, dict) else None

    stats_by_player = _match_stats_by_player(raw)
    lineups = (_lineup_rows(home_lineup, True, stats_by_player)
               + _lineup_rows(away_lineup, False, stats_by_player))
    lineup_available = bool(home_lineup.get("starters") or away_lineup.get("starters"))

    live = (status.get("liveTime") or {})
    # FotMob 라벨은 둥근 아포스트로피(’ U+2019)를 쓰는데 Playwright 경유로 lone surrogate(\udce2..)로 깨져 온다.
    # _clean_label로 UTF-8 원복 후 ASCII 아포스트로피로 정규화(프론트 "67'"·"45+2'" 표기 + JSON/DB 안전).
    live_short = _clean_label(live.get("short")) or None
    live_long = _clean_label(live.get("long")) or ""
    live_seconds = None
    if ":" in live_long:
        try:
            mm, ss = live_long.split(":")[:2]
            live_seconds = int(mm) * 60 + int(ss)
        except (ValueError, TypeError):
            live_seconds = None
    is_live = _normalize_status(status) == "IN_PLAY"
    # 현재 하프의 정규시간 끝(전반 45 / 후반 90) — FotMob 권위값. 프론트가 추가시간("45+N'"/"90+N'")
    # 표기 기준(base)을 라벨 숫자로 추측하지 않고 이 값으로 정확히 쓰게 한다(1차 스토피지 오판 방지).
    live_base = _to_int(live.get("basePeriod"))
    # 현재 하프에 부여된 추가시간(분) — FotMob 라이브값. 프론트가 "45+N'"의 N 상한(cap)으로 써서
    # 표시가 부여시간을 넘어 계속 늘어나지 않게 한다(예: +4면 "45+4'"에서 멈춤).
    live_added = _to_int(live.get("addedTime"))
    first_added, second_added = _added_times(raw)
    # liveTime.long(SSR)은 실제보다 0~몇 분 지연된다. 하프 시작 실제 시각(halfs)으로 경과초를 다시 계산해
    # 지연 없는 값으로 교체한다(없거나 비정상이면 SSR 값으로 폴백). → 앵커가 정확해져 프론트 보정 불필요.
    if is_live:
        live_seconds = _live_seconds_from_halfs(status, live_seconds)
        # 휴식(HT/연장 HT/승부차기 + 전반 추가시간 초과) 구간을 halfs로 선반영해 시계를 멈춘다
        # — SSR 라벨("HT" 등)은 0~수 분 지연되지만 status.halfs는 신뢰·선반영되므로 라벨을 안 기다림.
        live_short, live_seconds = _break_override(
            status, live_short, live_seconds, live_added, first_added, second_added)

    return {
        "matchId": general.get("matchId"),
        "leagueName": general.get("leagueName"),
        "venue": venue,
        "statusType": _normalize_status(status),
        "statusReason": (status.get("reason") or {}).get("long"),
        "liveTime": live_short if is_live else None,
        "liveSeconds": live_seconds if is_live else None,
        "liveBasePeriod": live_base if is_live else None,   # 현재 하프 정규시간 끝(45/90) — 추가시간 표기 기준
        "liveAddedTime": live_added if is_live else None,   # 현재 하프 부여 추가시간(분) — "+N" 상한
        "firstHalfAddedTime": first_added,    # 전반 추가시간(분), 없으면 null
        "secondHalfAddedTime": second_added,  # 후반 추가시간(분), 없으면 null
        "started": status.get("started", False),
        "finished": status.get("finished", False),
        "homeTeamId": home.get("id"),
        "homeTeamName": home.get("name"),
        "homeScore": home.get("score"),
        "homeFormation": home_lineup.get("formation"),
        "awayTeamId": away.get("id"),
        "awayTeamName": away.get("name"),
        "awayScore": away.get("score"),
        "awayFormation": away_lineup.get("formation"),
        "lineupAvailable": lineup_available,
        "lineups": lineups,
        "events": _event_rows(raw),
    }


def _to_int(v) -> Optional[int]:
    try:
        return int(v) if v is not None and str(v) != "" else None
    except (ValueError, TypeError):
        return None


def _to_float(v) -> Optional[float]:
    try:
        return float(v) if v is not None and str(v) != "" else None
    except (ValueError, TypeError):
        return None


def _parse_score_str(s) -> tuple[Optional[int], Optional[int]]:
    """리그 fixtures의 scoreStr "2 - 0" → (2, 0). 미진행 경기(빈값)는 (None, None)."""
    if not s or "-" not in str(s):
        return None, None
    try:
        a, b = str(s).split("-")[:2]
        return int(a.strip()), int(b.strip())
    except (ValueError, TypeError):
        return None, None


# ── 엔드포인트 ────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/match/{match_id}")
async def get_match(match_id: str):
    try:
        page_url, mid = resolve_page_url(match_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await crawl_throttle()
    print(f"[crawl] 경기 수집 시작 matchId={mid} url={page_url}", flush=True)
    t0 = time.perf_counter()
    # 폴링 핫패스 — crawl_page 가 세마포어로 동시 페이지를 1개로 직렬화해 OOM(502)을 막는다.
    try:
        async with crawl_page() as page:
            raw = await extract_from_page(page, page_url, mid, verbose=False)
    except Exception as e:
        print(f"[crawl] 경기 수집 실패 matchId={mid} ({time.perf_counter() - t0:.1f}s): {e}", flush=True)
        raise HTTPException(status_code=502, detail=f"FotMob 수집 실패: {e}")

    resp = build_match_response(raw)
    print(f"[crawl] 경기 수집 완료 matchId={mid} status={resp['statusType']} "
          f"score={resp['homeScore']}-{resp['awayScore']} 라인업={len(resp['lineups'])}명 "
          f"이벤트={len(resp['events'])}건 ({time.perf_counter() - t0:.1f}s)", flush=True)
    return resp


def _team_logo(team_id) -> str:
    return f"https://images.fotmob.com/image_resources/logo/teamlogo/{team_id}.png" if team_id else ""


def _clean_str(v) -> str:
    """문자열 정제 — FotMob 비ASCII(€·한글 등)가 잘못된 서로게이트로 들어오면 UTF-8로 원복.

    Playwright 경유로 일부 문자열이 lone surrogate(예: € → \\udce2\\udc82\\udcac)로 깨져 오는데,
    surrogateescape로 바이트 복원 후 UTF-8 재디코딩하면 원문이 살아난다. JSON 직렬화 안전도 보장.
    """
    s = str(v)
    try:
        return s.encode("utf-8", "surrogateescape").decode("utf-8", "replace")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s.encode("utf-8", "ignore").decode("utf-8")


def _clean_label(v) -> str:
    """라이브 시계 라벨 정제 — 깨진 인코딩 원복 + 둥근 따옴표→ASCII, 방향표시 마크 제거."""
    if v is None:
        return ""
    s = _clean_str(v)
    return (s.replace("’", "'").replace("‘", "'")
             .replace("‎", "").replace("‏", "").strip())


def _player_info_items(raw: dict) -> list[dict]:
    """선수 프로필 항목(나이·키·국적·등번호·주발·시장가치·계약만료 등)을 {label,value}로 평탄화."""
    items = []
    for it in raw.get("playerInformation", []) or []:
        if not isinstance(it, dict):
            continue
        label = it.get("title") or it.get("translationKey")
        val = it.get("value")
        if isinstance(val, dict):
            v = val.get("fallback")
            if v is None:
                v = val.get("numberValue")
            if v is None:
                v = val.get("key")
        else:
            v = val
        # 중첩 dict(예: 계약만료 {utcTime, timezone}) → 날짜(YYYY-MM-DD)만 추출
        if isinstance(v, dict):
            ut = v.get("utcTime")
            v = str(ut)[:10] if ut else None
        if label is None or v is None or str(v) == "":
            continue
        items.append({"label": _clean_str(label), "value": _clean_str(v)})
    return items


def _player_stats(raw: dict) -> list[dict]:
    """이번 시즌 상세 스탯을 {title,value}로 평탄화.

    두 소스를 합친다(둘 다 playerData에 이미 들어있어 추가 크롤 없음):
      1) mainLeague.stats — 시즌 카운팅(골·도움·출전·분·평점·카드 등)
      2) firstSeasonStats.statsSection — 상세(슈팅·xA·정확한 패스·패스 정확도·기회 창출 등)
    같은 title은 1)을 우선해 중복 제거한다.
    """
    out = []
    seen = set()

    def add(title, value):
        if title is None or value is None:
            return
        key = str(title).strip().lower()
        if not key or key in seen:
            return
        seen.add(key)
        out.append({"title": str(title), "value": value})

    main = raw.get("mainLeague") or {}
    for s in main.get("stats", []) or []:
        if isinstance(s, dict):
            add(s.get("title") or s.get("localizedTitleId"), s.get("value"))

    # firstSeasonStats: statsSection.items[](그룹) → items[](개별 스탯) 평탄화
    fss = raw.get("firstSeasonStats") or {}
    section = fss.get("statsSection") or {}
    for group in section.get("items", []) or []:
        if not isinstance(group, dict):
            continue
        for st in group.get("items", []) or []:
            if isinstance(st, dict):
                add(st.get("title") or st.get("localizedTitleId"), st.get("statValue"))
    return out


def build_player_response(raw: dict) -> dict:
    """선수 raw → Java가 먹기 좋은 평탄 구조(프로필 + 시즌 스탯)."""
    primary_team = raw.get("primaryTeam") or {}
    primary_pos = (raw.get("positionDescription") or {}).get("primaryPosition") or {}
    main = raw.get("mainLeague") or {}
    pid = _to_int(raw.get("id"))
    # 이름·팀·리그명은 비ASCII(한글 등) 깨짐 방지로 정제
    name = raw.get("name")
    team_name = primary_team.get("teamName")
    league_name = main.get("leagueName")
    return {
        "id": pid,
        "name": _clean_str(name) if name is not None else None,
        "teamId": _to_int(primary_team.get("teamId")),
        "teamName": _clean_str(team_name) if team_name is not None else None,
        "teamCrest": _team_logo(primary_team.get("teamId")),
        "onLoan": primary_team.get("onLoan"),
        "position": primary_pos.get("label"),
        "photo": f"https://images.fotmob.com/image_resources/playerimages/{pid}.png" if pid else None,
        "leagueName": _clean_str(league_name) if league_name is not None else None,
        "season": main.get("season"),
        "info": _player_info_items(raw),
        "stats": _player_stats(raw),
    }


@app.get("/player/{player_id}")
async def get_player(player_id: int):
    """선수 상세 정보(프로필 + 주 리그 시즌 스탯). DB 미저장 — 백엔드가 프록시."""
    await crawl_throttle()
    print(f"[crawl] 선수 수집 시작 playerId={player_id}", flush=True)
    t0 = time.perf_counter()
    try:
        async with crawl_page() as page:
            raw = await fetch_player_from_page(page, player_id)
    except Exception as e:
        print(f"[crawl] 선수 수집 실패 playerId={player_id}: {e}", flush=True)
        raise HTTPException(status_code=502, detail=f"선수 수집 실패: {e}")
    if not raw:
        raise HTTPException(status_code=502, detail="선수 데이터를 가져오지 못했습니다.")
    resp = build_player_response(raw)
    print(f"[crawl] 선수 수집 완료 playerId={player_id} name={resp['name']} "
          f"정보={len(resp['info'])}항목 스탯={len(resp['stats'])}개 "
          f"({time.perf_counter() - t0:.1f}s)", flush=True)
    return resp


def build_schedule(raw: dict, filters: list[str], date: str) -> dict:
    """날짜별 raw 응답을 평탄한 경기 목록으로 정제.

    filters 토큰이 숫자면 leagueId(primaryId/id) 정확매칭, 아니면 leagueName 부분매칭(소문자).
    숫자 토큰을 쓰면 이름이 같은 여자/U21/클럽 파생 리그를 정확히 구분해 걸러낼 수 있다.
    """
    id_filters = {f for f in filters if f.isdigit()}
    name_filters = [f for f in filters if not f.isdigit()]
    out = []
    for lg in raw.get("leagues", []) or []:
        lname = lg.get("name", "") or ""
        lid = str(lg.get("primaryId") or lg.get("id") or "")
        if filters and not (lid in id_filters or any(f in lname.lower() for f in name_filters)):
            continue
        for m in lg.get("matches", []) or []:
            st = m.get("status", {}) or {}
            home = m.get("home", {}) or {}
            away = m.get("away", {}) or {}
            out.append({
                "matchId": m.get("id"),
                "leagueId": lg.get("primaryId") or lg.get("id"),
                "parentLeagueId": lg.get("parentLeagueId"),
                "leagueName": lname,
                "ccode": lg.get("ccode"),
                "homeId": home.get("id"),
                "homeName": home.get("name"),
                "homeCrest": _team_logo(home.get("id")),
                "homeScore": home.get("score"),
                "awayId": away.get("id"),
                "awayName": away.get("name"),
                "awayCrest": _team_logo(away.get("id")),
                "awayScore": away.get("score"),
                "utcTime": st.get("utcTime"),
                "started": st.get("started", False),
                "finished": st.get("finished", False),
                "cancelled": st.get("cancelled", False),
            })
    return {"date": date, "matches": out}


def build_league_table(raw: dict, league_id: int) -> dict:
    """리그 상세 raw에서 순위 테이블(조별 지원)을 정제."""
    groups = []
    table = raw.get("table", []) or []
    if table:
        data = table[0].get("data", {}) or {}
        tables = data.get("tables")
        # 단일 리그(조 없음)면 data.table 하나를 감싼다
        if not tables and isinstance(data.get("table"), dict):
            tables = [{"leagueName": data.get("leagueName"), "table": data["table"]}]
        for grp in tables or []:
            rows = []
            for r in (grp.get("table", {}) or {}).get("all", []) or []:
                rows.append({
                    "rank": r.get("idx"),
                    "teamId": r.get("id"),
                    "name": r.get("name"),
                    "shortName": r.get("shortName"),
                    "crest": _team_logo(r.get("id")),
                    "played": r.get("played"),
                    "wins": r.get("wins"),
                    "draws": r.get("draws"),
                    "losses": r.get("losses"),
                    "scoresStr": r.get("scoresStr"),
                    "goalDiff": r.get("goalConDiff"),
                    "points": r.get("pts"),
                    "qualColor": r.get("qualColor"),
                })
            groups.append({"groupName": grp.get("leagueName"), "rows": rows})
    return {"leagueId": league_id, "groups": groups}


@app.get("/schedule")
async def schedule(date: str, tz: str = "Asia/Seoul", leagues: str = ""):
    """date=YYYYMMDD 의 경기 목록. leagues=쉼표구분 leagueName 부분매칭 필터."""
    filters = [s.strip().lower() for s in leagues.split(",") if s.strip()]
    await crawl_throttle()
    print(f"[crawl] 일정 수집 시작 date={date} leagues={leagues or '전체'}", flush=True)
    t0 = time.perf_counter()
    try:
        async with crawl_page(navigate_home=True) as page:
            raw = await fetch_schedule_from_page(page, date, tz)
    except Exception as e:
        print(f"[crawl] 일정 수집 실패 date={date}: {e}", flush=True)
        raise HTTPException(status_code=502, detail=f"일정 수집 실패: {e}")
    if not raw:
        raise HTTPException(status_code=502, detail="일정 데이터를 가져오지 못했습니다.")
    result = build_schedule(raw, filters, date)
    print(f"[crawl] 일정 수집 완료 date={date} {len(result['matches'])}경기 "
          f"({time.perf_counter() - t0:.1f}s)", flush=True)
    return result


def build_commentary_goals(raw: dict) -> list[dict]:
    """ltc 피드에서 골 해설만 추출(시간순). 골 항목은 type=="G"."""
    if not raw or not isinstance(raw, dict):
        return []
    out = []
    for e in raw.get("events", []) or []:
        typ = e.get("type") or ""
        text = (e.get("text") or "").replace("‎", "").replace("‏", "").strip()
        if typ != "G" and not text.startswith("Goal!"):
            continue
        tm = e.get("time") or {}
        main = (tm.get("main") or "").replace("‎", "").replace("‏", "")
        minute = "".join(c for c in main if c.isdigit()) or None
        out.append({
            "minute": minute,
            "addedTime": tm.get("added"),
            "isHome": e.get("teamEvent") == "home",
            "text": text,
            "_elapsed": e.get("elapsed") or 0,
        })
    out.sort(key=lambda g: g.pop("_elapsed"))  # 시간순(피드는 역순)
    return out


@app.get("/commentary/{match_id}")
async def commentary(match_id: str):
    """경기 골 해설(라이브티커). 끝난 경기 요약용 — 골 항목만 영문 해설 텍스트로 반환."""
    await crawl_throttle()
    print(f"[crawl] 커멘터리 수집 시작 matchId={match_id}", flush=True)
    t0 = time.perf_counter()
    try:
        async with crawl_page(navigate_home=True) as page:
            raw = await fetch_commentary_from_page(page, match_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"커멘터리 수집 실패: {e}")
    goals = build_commentary_goals(raw)
    print(f"[crawl] 커멘터리 수집 완료 matchId={match_id} 골 {len(goals)}건 "
          f"({time.perf_counter() - t0:.1f}s)", flush=True)
    return {"matchId": _to_int(match_id), "goals": goals}


def build_league_fixtures(raw: dict, league_id: int) -> dict:
    """리그 상세 raw의 fixtures.allMatches(시즌 전체 경기, 결승까지)를 /schedule 과 같은 평탄 형식으로 정제.

    날짜 ±N일 동기화로는 먼 미래 경기(결승 등)를 못 가져오므로, 토너먼트(월드컵)는 이걸로 전체를 한 번에 받는다.
    백엔드 ScheduledMatch 와 동일한 키를 내려 같은 upsert 로직을 그대로 태운다.
    """
    league_name = (raw.get("details", {}) or {}).get("name") or ""
    fixtures = (raw.get("fixtures", {}) or {}).get("allMatches", []) or []
    out = []
    for m in fixtures:
        st = m.get("status", {}) or {}
        home = m.get("home", {}) or {}
        away = m.get("away", {}) or {}
        hs, as_ = _parse_score_str(st.get("scoreStr"))
        group = m.get("group")
        # 백엔드 groupName 추출용으로 leagueName에 "Grp. X" 합성(조별리그만). 토너먼트 라운드는 그룹 없음.
        name = f"{league_name} Grp. {group}".strip() if group else league_name
        out.append({
            "matchId": _to_int(m.get("id")),
            "leagueId": league_id,
            "parentLeagueId": league_id,   # 월드컵 전체를 한 competition(77)으로 묶는다
            "leagueName": name,
            "ccode": None,
            "homeId": _to_int(home.get("id")),
            "homeName": home.get("name"),
            "homeCrest": _team_logo(home.get("id")),
            "homeScore": hs,
            "awayId": _to_int(away.get("id")),
            "awayName": away.get("name"),
            "awayCrest": _team_logo(away.get("id")),
            "awayScore": as_,
            "utcTime": st.get("utcTime"),
            "started": st.get("started", False),
            "finished": st.get("finished", False),
            "cancelled": st.get("cancelled", False),
        })
    return {"date": f"league-{league_id}", "matches": out}


@app.get("/league/{league_id}/fixtures")
async def league_fixtures(league_id: int):
    """리그/토너먼트 시즌 전체 경기 일정(결승까지). 월드컵 같은 토너먼트 전체 동기화용."""
    await crawl_throttle()
    print(f"[crawl] 리그 전체 일정 수집 시작 leagueId={league_id}", flush=True)
    t0 = time.perf_counter()
    try:
        async with crawl_page(navigate_home=True) as page:
            raw = await fetch_league_table_from_page(page, league_id)
    except Exception as e:
        print(f"[crawl] 리그 전체 일정 수집 실패 leagueId={league_id}: {e}", flush=True)
        raise HTTPException(status_code=502, detail=f"리그 일정 수집 실패: {e}")
    if not raw:
        raise HTTPException(status_code=502, detail="리그 일정을 가져오지 못했습니다.")
    result = build_league_fixtures(raw, league_id)
    print(f"[crawl] 리그 전체 일정 수집 완료 leagueId={league_id} {len(result['matches'])}경기 "
          f"({time.perf_counter() - t0:.1f}s)", flush=True)
    return result


def build_playoff(raw: dict, league_id: int) -> dict:
    """리그 상세 raw의 playoff(토너먼트 브래킷)를 매치 단위로 평탄화.

    rounds[].matchups[] 각 대진을 한 경기로 펼친다. FotMob은 그룹 진행 상황에 따라 **예상 대진**을 채워
    주는데, 32강(stage "1/16")은 실제 예상 팀(tbdTeam=false), 그 이후 라운드는 미정(placeholder)이다.
    stage·drawOrder(슬롯 순서)·tbd 플래그를 함께 내려 백엔드가 기존 경기에 단계/대진을 반영하게 한다.
    """
    po = raw.get("playoff", {}) or {}
    out = []
    for rd in po.get("rounds", []) or []:
        stage = rd.get("stage")
        for mu in rd.get("matchups", []) or []:
            matches = mu.get("matches") or []
            m = matches[0] if matches else {}
            st = m.get("status", {}) or {}
            home = m.get("home", {}) or {}
            away = m.get("away", {}) or {}
            started = st.get("started", False)
            finished = st.get("finished", False)
            out.append({
                "matchId": _to_int(m.get("matchId")),
                "stage": stage,
                "drawOrder": _to_int(mu.get("drawOrder")),
                "tbd1": bool(mu.get("tbdTeam1")),
                "tbd2": bool(mu.get("tbdTeam2")),
                "homeId": _to_int(home.get("id")),
                "homeName": home.get("name"),
                "homeShortName": home.get("shortName"),
                "homeCrest": _team_logo(home.get("id")),
                "homeScore": _to_int(home.get("score")) if (started or finished) else None,
                "awayId": _to_int(away.get("id")),
                "awayName": away.get("name"),
                "awayShortName": away.get("shortName"),
                "awayCrest": _team_logo(away.get("id")),
                "awayScore": _to_int(away.get("score")) if (started or finished) else None,
                "utcTime": st.get("utcTime"),
                "started": started,
                "finished": finished,
                "cancelled": st.get("cancelled", False),
            })
    return {"leagueId": league_id, "matchups": out}


@app.get("/league/{league_id}/playoff")
async def league_playoff(league_id: int):
    """토너먼트 예상 브래킷(라운드별 대진). 월드컵 등 32강 예상 대진 동기화용."""
    await crawl_throttle()
    print(f"[crawl] 브래킷 수집 시작 leagueId={league_id}", flush=True)
    t0 = time.perf_counter()
    try:
        async with crawl_page(navigate_home=True) as page:
            raw = await fetch_league_table_from_page(page, league_id)
    except Exception as e:
        print(f"[crawl] 브래킷 수집 실패 leagueId={league_id}: {e}", flush=True)
        raise HTTPException(status_code=502, detail=f"브래킷 수집 실패: {e}")
    if not raw:
        raise HTTPException(status_code=502, detail="브래킷 데이터를 가져오지 못했습니다.")
    result = build_playoff(raw, league_id)
    print(f"[crawl] 브래킷 수집 완료 leagueId={league_id} {len(result['matchups'])}대진 "
          f"({time.perf_counter() - t0:.1f}s)", flush=True)
    return result


@app.get("/league/{league_id}/table")
async def league_table(league_id: int):
    await crawl_throttle()
    print(f"[crawl] 순위 수집 시작 leagueId={league_id}", flush=True)
    t0 = time.perf_counter()
    try:
        async with crawl_page(navigate_home=True) as page:
            raw = await fetch_league_table_from_page(page, league_id)
    except Exception as e:
        print(f"[crawl] 순위 수집 실패 leagueId={league_id}: {e}", flush=True)
        raise HTTPException(status_code=502, detail=f"리그 순위 수집 실패: {e}")
    if not raw:
        raise HTTPException(status_code=502, detail="리그 순위를 가져오지 못했습니다.")
    result = build_league_table(raw, league_id)
    rows = sum(len(g["rows"]) for g in result["groups"])
    print(f"[crawl] 순위 수집 완료 leagueId={league_id} {len(result['groups'])}그룹 {rows}팀 "
          f"({time.perf_counter() - t0:.1f}s)", flush=True)
    return result


async def _full_stat_list(page, category: dict, limit: int) -> list[dict]:
    """리그 stats 카테고리(goals/goal_assist)의 fetchAllUrl(전체 랭킹 JSON)을 받아 상위 limit명 정규화.
    실패하면 리그 overview에 인라인된 topThree(상위 3명)로 폴백한다."""
    url = (category or {}).get("fetchAllUrl")
    raw = None
    if url:
        raw = await page.evaluate("""async (u) => {
            try { const r = await fetch(u); const t = await r.text();
              if (t.trim().startsWith('{') || t.trim().startsWith('[')) return JSON.parse(t); }
            catch(e) {} return null;
        }""", url)
    stat_list = None
    if isinstance(raw, dict):
        top_lists = raw.get("TopLists") or []
        if isinstance(top_lists, list) and top_lists:
            stat_list = (top_lists[0] or {}).get("StatList") or []
    items = []
    if stat_list:
        for r in stat_list[:limit]:
            items.append({
                "rank": r.get("Rank"),
                "playerId": r.get("ParticiantId") or r.get("ParticipantId"),  # FotMob 원본 오타(ParticiantId)
                "name": r.get("ParticipantName"),
                "teamId": r.get("TeamId"),
                "teamName": r.get("TeamName"),
                "countryCode": r.get("ParticipantCountryCode"),
                "value": r.get("StatValue"),
                "matchesPlayed": r.get("MatchesPlayed"),
            })
        return items
    # 폴백: 리그 overview의 topThree(상위 3)
    for r in (category or {}).get("topThree", []) or []:
        items.append({
            "rank": r.get("rank"),
            "playerId": r.get("id"),
            "name": r.get("name"),
            "teamId": r.get("teamId"),
            "teamName": r.get("teamName"),
            "countryCode": r.get("ccode"),
            "value": r.get("value"),
            "matchesPlayed": None,
        })
    return items


@app.get("/league/{league_id}/player-stats")
async def league_player_stats(league_id: int, limit: int = 20):
    """리그 득점왕/도움왕 랭킹 — /api/data/leagues 의 stats.players 에서 goals·goal_assist 카테고리를
    찾아 각 fetchAllUrl(전체 랭킹 JSON)을 받아 상위 limit명씩 반환. 개인성적 탭용."""
    await crawl_throttle()
    print(f"[crawl] 개인기록 수집 시작 leagueId={league_id}", flush=True)
    t0 = time.perf_counter()
    try:
        async with crawl_page(navigate_home=True) as page:
            raw = await fetch_league_table_from_page(page, league_id)
            if not raw:
                raise HTTPException(status_code=502, detail="리그 데이터를 가져오지 못했습니다.")
            players = ((raw.get("stats") or {}).get("players")) or []

            def find(*names):
                for c in players:
                    if c.get("name") in names:
                        return c
                return None

            goals = find("goals")
            assists = find("goal_assist", "assists")
            scorers = await _full_stat_list(page, goals, limit) if goals else []
            assists_list = await _full_stat_list(page, assists, limit) if assists else []
    except HTTPException:
        raise
    except Exception as e:
        print(f"[crawl] 개인기록 수집 실패 leagueId={league_id}: {e}", flush=True)
        raise HTTPException(status_code=502, detail=f"개인기록 수집 실패: {e}")
    print(f"[crawl] 개인기록 수집 완료 leagueId={league_id} 득점왕 {len(scorers)} 도움왕 {len(assists_list)} "
          f"({time.perf_counter() - t0:.1f}s)", flush=True)
    return {"leagueId": league_id, "scorers": scorers, "assists": assists_list}


@app.get("/youtube/search")
async def youtube_search(q: str, limit: int = 8):
    """유튜브에서 q로 동영상을 검색해 후보 목록 반환(경기 하이라이트 찾기용).

    FotMob과 동일하게 공개 API 없이 SSR(window.ytInitialData)을 Playwright로 읽는다.
    """
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="q는 필수입니다.")
    await crawl_throttle()
    print(f"[crawl] 유튜브 검색 시작 q={q!r}", flush=True)
    t0 = time.perf_counter()
    try:
        async with crawl_page() as page:
            videos = await fetch_youtube_search(page, q.strip(), limit)
    except Exception as e:
        print(f"[crawl] 유튜브 검색 실패 q={q!r}: {e}", flush=True)
        raise HTTPException(status_code=502, detail=f"유튜브 검색 실패: {e}")
    print(f"[crawl] 유튜브 검색 완료 q={q!r} {len(videos)}건 ({time.perf_counter() - t0:.1f}s)", flush=True)
    return {"query": q, "videos": videos}


@app.get("/youtube/embeddable/{video_id}")
async def youtube_embeddable(video_id: str):
    """영상이 외부 사이트(iframe)에서 재생 가능한지 — FIFA 공식처럼 임베드 막힌 영상 거르기용."""
    await crawl_throttle()
    try:
        async with crawl_page() as page:
            ok = await fetch_youtube_embeddable(page, video_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"임베드 확인 실패: {e}")
    return {"videoId": video_id, "embeddable": bool(ok)}


@app.get("/search")
async def search(team1: str, team2: str = "", competition: str = ""):
    if not team1:
        raise HTTPException(status_code=400, detail="team1은 필수입니다.")
    await crawl_throttle()
    try:
        results = await search_matches(team1, team2, competition, headless=True)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"검색 실패: {e}")
    # Java가 먹기 좋게 camelCase로 통일
    candidates = [
        {
            "matchId": _to_int(r.match_id),
            "url": r.url,
            "homeTeam": r.home_team,
            "awayTeam": r.away_team,
            "competition": r.competition,
            "dateStr": r.date_str,
        }
        for r in results
    ]
    return {"candidates": candidates}
