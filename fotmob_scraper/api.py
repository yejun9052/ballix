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
import time
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
    fetch_commentary_from_page,
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
            hl = p.get("horizontalLayout") or {}  # 피치 좌표(0~1): x=깊이(0=GK쪽,1=공격), y=좌우
            rows.append({
                "playerId": p.get("id"),
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

    # 구장 이름: content.matchFacts.infoBox.Stadium.name (없는 경기도 있어 전부 방어)
    info_box = ((raw.get("content", {}) or {}).get("matchFacts", {}) or {}).get("infoBox", {}) or {}
    stadium = info_box.get("Stadium") or {}
    venue = stadium.get("name") if isinstance(stadium, dict) else None

    lineups = _lineup_rows(home_lineup, True) + _lineup_rows(away_lineup, False)
    lineup_available = bool(home_lineup.get("starters") or away_lineup.get("starters"))

    live = (status.get("liveTime") or {})
    live_short = (live.get("short") or "").replace("‎", "").replace("‏", "").strip() or None
    live_long = (live.get("long") or "").replace("‎", "").replace("‏", "").strip()
    live_seconds = None
    if ":" in live_long:
        try:
            mm, ss = live_long.split(":")[:2]
            live_seconds = int(mm) * 60 + int(ss)
        except (ValueError, TypeError):
            live_seconds = None
    is_live = _normalize_status(status) == "IN_PLAY"

    return {
        "matchId": general.get("matchId"),
        "leagueName": general.get("leagueName"),
        "venue": venue,
        "statusType": _normalize_status(status),
        "statusReason": (status.get("reason") or {}).get("long"),
        "liveTime": live_short if is_live else None,
        "liveSeconds": live_seconds if is_live else None,
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

    print(f"[crawl] 경기 수집 시작 matchId={mid} url={page_url}", flush=True)
    t0 = time.perf_counter()
    page = await _state["context"].new_page()
    try:
        raw = await extract_from_page(page, page_url, mid, verbose=False)
    except Exception as e:
        print(f"[crawl] 경기 수집 실패 matchId={mid} ({time.perf_counter() - t0:.1f}s): {e}", flush=True)
        raise HTTPException(status_code=502, detail=f"FotMob 수집 실패: {e}")
    finally:
        await page.close()

    resp = build_match_response(raw)
    print(f"[crawl] 경기 수집 완료 matchId={mid} status={resp['statusType']} "
          f"score={resp['homeScore']}-{resp['awayScore']} 라인업={len(resp['lineups'])}명 "
          f"이벤트={len(resp['events'])}건 ({time.perf_counter() - t0:.1f}s)", flush=True)
    return resp


def _team_logo(team_id) -> str:
    return f"https://images.fotmob.com/image_resources/logo/teamlogo/{team_id}.png" if team_id else ""


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


async def _new_fotmob_page():
    """fotmob.com 이 로드된 새 page (상대경로 fetch 가능)."""
    page = await _state["context"].new_page()
    await page.goto("https://www.fotmob.com", wait_until="domcontentloaded", timeout=30000)
    return page


@app.get("/schedule")
async def schedule(date: str, tz: str = "Asia/Seoul", leagues: str = ""):
    """date=YYYYMMDD 의 경기 목록. leagues=쉼표구분 leagueName 부분매칭 필터."""
    filters = [s.strip().lower() for s in leagues.split(",") if s.strip()]
    print(f"[crawl] 일정 수집 시작 date={date} leagues={leagues or '전체'}", flush=True)
    t0 = time.perf_counter()
    page = await _new_fotmob_page()
    try:
        raw = await fetch_schedule_from_page(page, date, tz)
    except Exception as e:
        print(f"[crawl] 일정 수집 실패 date={date}: {e}", flush=True)
        raise HTTPException(status_code=502, detail=f"일정 수집 실패: {e}")
    finally:
        await page.close()
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
    print(f"[crawl] 커멘터리 수집 시작 matchId={match_id}", flush=True)
    t0 = time.perf_counter()
    page = await _new_fotmob_page()
    try:
        raw = await fetch_commentary_from_page(page, match_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"커멘터리 수집 실패: {e}")
    finally:
        await page.close()
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
    print(f"[crawl] 리그 전체 일정 수집 시작 leagueId={league_id}", flush=True)
    t0 = time.perf_counter()
    page = await _new_fotmob_page()
    try:
        raw = await fetch_league_table_from_page(page, league_id)
    except Exception as e:
        print(f"[crawl] 리그 전체 일정 수집 실패 leagueId={league_id}: {e}", flush=True)
        raise HTTPException(status_code=502, detail=f"리그 일정 수집 실패: {e}")
    finally:
        await page.close()
    if not raw:
        raise HTTPException(status_code=502, detail="리그 일정을 가져오지 못했습니다.")
    result = build_league_fixtures(raw, league_id)
    print(f"[crawl] 리그 전체 일정 수집 완료 leagueId={league_id} {len(result['matches'])}경기 "
          f"({time.perf_counter() - t0:.1f}s)", flush=True)
    return result


@app.get("/league/{league_id}/table")
async def league_table(league_id: int):
    print(f"[crawl] 순위 수집 시작 leagueId={league_id}", flush=True)
    t0 = time.perf_counter()
    page = await _new_fotmob_page()
    try:
        raw = await fetch_league_table_from_page(page, league_id)
    except Exception as e:
        print(f"[crawl] 순위 수집 실패 leagueId={league_id}: {e}", flush=True)
        raise HTTPException(status_code=502, detail=f"리그 순위 수집 실패: {e}")
    finally:
        await page.close()
    if not raw:
        raise HTTPException(status_code=502, detail="리그 순위를 가져오지 못했습니다.")
    result = build_league_table(raw, league_id)
    rows = sum(len(g["rows"]) for g in result["groups"])
    print(f"[crawl] 순위 수집 완료 leagueId={league_id} {len(result['groups'])}그룹 {rows}팀 "
          f"({time.perf_counter() - t0:.1f}s)", flush=True)
    return result


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
