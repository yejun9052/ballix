"""FotMob 스크래퍼를 감싸는 FastAPI 서비스.

Java 백엔드가 HTTP로 호출한다. Playwright 브라우저를 lifespan 동안 한 번만
띄워 모든 요청이 재사용하므로 매 요청 콜드스타트를 피한다.

실행:
    py -3 -m uvicorn api:app --host 127.0.0.1 --port 8800

엔드포인트:
    GET /health
    GET /match/{match_id}          → 라인업·이벤트·평점 (영문 평탄 구조)
    GET /search?team1=&team2=&competition=  → fotmobMatchId 후보 목록
"""
from contextlib import asynccontextmanager
from dataclasses import asdict
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from playwright.async_api import async_playwright

from scraper import (
    extract_from_page,
    resolve_page_url,
    fetch_schedule_from_page,
    fetch_league_table_from_page,
    BROWSER_LAUNCH_ARGS,
    CONTEXT_OPTIONS,
    STEALTH_INIT_SCRIPT,
)
from search import search_matches


# ── 공유 브라우저 상태 ────────────────────────────────────────────────
_state: dict[str, Any] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    pw = await async_playwright().start()
    browser = await pw.chromium.launch(headless=True, args=BROWSER_LAUNCH_ARGS)
    context = await browser.new_context(**CONTEXT_OPTIONS)
    await context.add_init_script(STEALTH_INIT_SCRIPT)
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


def _lineup_rows(team_data: dict, is_home: bool) -> list[dict]:
    rows = []
    for is_starter, key in ((True, "starters"), (False, "subs")):
        for p in team_data.get(key, []) or []:
            if not isinstance(p, dict):
                continue
            perf = p.get("performance") or {}
            sub_events = perf.get("substitutionEvents") or []
            sub_in = next((e.get("time") for e in sub_events if e.get("type") == "subIn"), None)
            sub_out = next((e.get("time") for e in sub_events if e.get("type") == "subOut"), None)
            rows.append({
                "playerId": p.get("id"),
                "name": p.get("name"),
                "shirtNumber": _to_int(p.get("shirtNumber")),
                "positionId": p.get("positionId"),
                "isHome": is_home,
                "isStarter": is_starter,
                "rating": _to_float(perf.get("rating")),
                "subInMinute": sub_in,
                "subOutMinute": sub_out,
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

    lineups = _lineup_rows(home_lineup, True) + _lineup_rows(away_lineup, False)
    lineup_available = bool(home_lineup.get("starters") or away_lineup.get("starters"))

    return {
        "matchId": general.get("matchId"),
        "leagueName": general.get("leagueName"),
        "statusType": _normalize_status(status),
        "statusReason": (status.get("reason") or {}).get("long"),
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

    page = await _state["context"].new_page()
    try:
        raw = await extract_from_page(page, page_url, mid, verbose=False)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"FotMob 수집 실패: {e}")
    finally:
        await page.close()

    return build_match_response(raw)


def _team_logo(team_id) -> str:
    return f"https://images.fotmob.com/image_resources/logo/teamlogo/{team_id}.png" if team_id else ""


def build_schedule(raw: dict, filters: list[str], date: str) -> dict:
    """날짜별 raw 응답을 평탄한 경기 목록으로 정제. filters는 leagueName 부분매칭(소문자)."""
    out = []
    for lg in raw.get("leagues", []) or []:
        lname = lg.get("name", "") or ""
        if filters and not any(f in lname.lower() for f in filters):
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


async def _new_fotmob_page():
    """fotmob.com 이 로드된 새 page (상대경로 fetch 가능)."""
    page = await _state["context"].new_page()
    await page.goto("https://www.fotmob.com", wait_until="domcontentloaded", timeout=30000)
    return page


@app.get("/schedule")
async def schedule(date: str, tz: str = "Asia/Seoul", leagues: str = ""):
    """date=YYYYMMDD 의 경기 목록. leagues=쉼표구분 leagueName 부분매칭 필터."""
    filters = [s.strip().lower() for s in leagues.split(",") if s.strip()]
    page = await _new_fotmob_page()
    try:
        raw = await fetch_schedule_from_page(page, date, tz)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"일정 수집 실패: {e}")
    finally:
        await page.close()
    if not raw:
        raise HTTPException(status_code=502, detail="일정 데이터를 가져오지 못했습니다.")
    return build_schedule(raw, filters, date)


@app.get("/league/{league_id}/table")
async def league_table(league_id: int):
    page = await _new_fotmob_page()
    try:
        raw = await fetch_league_table_from_page(page, league_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"리그 순위 수집 실패: {e}")
    finally:
        await page.close()
    if not raw:
        raise HTTPException(status_code=502, detail="리그 순위를 가져오지 못했습니다.")
    return build_league_table(raw, league_id)


@app.get("/search")
async def search(team1: str, team2: str = "", competition: str = ""):
    if not team1:
        raise HTTPException(status_code=400, detail="team1은 필수입니다.")
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
