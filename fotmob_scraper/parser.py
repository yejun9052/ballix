"""FotMob API JSON 데이터 파싱 모듈."""
from typing import Any


def safe_get(d: Any, *keys, default=None):
    for key in keys:
        if isinstance(d, dict):
            d = d.get(key, default)
        elif isinstance(d, list) and isinstance(key, int):
            d = d[key] if key < len(d) else default
        else:
            return default
        if d is None:
            return default
    return d


def parse_overview(data: dict) -> dict:
    general = data.get("general", {})
    header = data.get("header", {})
    teams = header.get("teams", [])
    status = header.get("status", {})

    home = teams[0] if len(teams) > 0 else {}
    away = teams[1] if len(teams) > 1 else {}

    home_score = home.get("score", "?")
    away_score = away.get("score", "?")

    return {
        "matchId": general.get("matchId"),
        "경기명": general.get("matchName", ""),
        "리그": general.get("leagueName", ""),
        "라운드": general.get("leagueRoundName", ""),
        "경기일시UTC": general.get("matchTimeUTCDate", ""),
        "홈팀": home.get("name", ""),
        "홈팀ID": home.get("id"),
        "원정팀": away.get("name", ""),
        "원정팀ID": away.get("id"),
        "홈득점": home_score,
        "원정득점": away_score,
        "스코어": status.get("scoreStr", f"{home_score} - {away_score}"),
        "상태": status.get("reason", {}).get("long", ""),
        "홈레드카드": status.get("numberOfHomeRedCards", 0),
        "원정레드카드": status.get("numberOfAwayRedCards", 0),
        "종료시간": status.get("halfs", {}).get("gameEnded", ""),
    }


def parse_stats(data: dict) -> list[dict]:
    rows = []
    periods = safe_get(data, "content", "stats", "Periods", default={})

    for period_name, period_data in periods.items():
        if not isinstance(period_data, dict):
            continue
        for group in period_data.get("stats", []):
            group_name = group.get("title", "")
            for stat in group.get("stats", []):
                stat_values = stat.get("stats", [None, None])
                rows.append({
                    "기간": period_name,
                    "그룹": group_name,
                    "항목_영문": stat.get("key", ""),
                    "항목": stat.get("title", ""),
                    "홈": stat_values[0] if len(stat_values) > 0 else None,
                    "원정": stat_values[1] if len(stat_values) > 1 else None,
                    "형식": stat.get("format", ""),
                    "우세팀": stat.get("highlighted", ""),
                })
    return rows


def parse_events(data: dict) -> list[dict]:
    rows = []
    events = safe_get(data, "content", "matchFacts", "events", "events", default=[])
    header_teams = data.get("header", {}).get("teams", [])
    home_name = header_teams[0].get("name", "") if header_teams else ""

    for ev in events:
        ev_type = ev.get("type", "")
        is_home = ev.get("isHome")
        team_name = home_name if is_home else (
            header_teams[1].get("name", "") if len(header_teams) > 1 else ""
        )
        player = ev.get("player") or {}
        new_score = ev.get("newScore", [])

        rows.append({
            "시간": ev.get("timeStr", ev.get("time", "")),
            "추가시간": ev.get("overloadTime", ""),
            "타입": ev_type,
            "선수": player.get("name", "") if isinstance(player, dict) else ev.get("nameStr", ""),
            "선수ID": player.get("id") if isinstance(player, dict) else ev.get("playerId"),
            "팀": team_name,
            "홈여부": "홈" if is_home else "원정",
            "어시스트": ev.get("assistStr", "") or "",
            "골후_홈점수": new_score[0] if len(new_score) > 0 else "",
            "골후_원정점수": new_score[1] if len(new_score) > 1 else "",
            "자책골": "Y" if ev.get("ownGoal") else "",
            "페널티": "Y" if ev.get("goalDescription") == "Penalty" else "",
        })
    return rows


def _parse_team_lineup(team_data: dict, is_bench: bool) -> list[dict]:
    rows = []
    section = "subs" if is_bench else "starters"
    players = team_data.get(section, [])
    team_name = team_data.get("name", "")
    formation = team_data.get("formation", "")

    for p in players:
        if not isinstance(p, dict):
            continue
        perf = p.get("performance", {}) or {}
        sub_events = perf.get("substitutionEvents", []) or []
        sub_time = ""
        if sub_events:
            sub_time = sub_events[0].get("time", "")

        rows.append({
            "팀": team_name,
            "포메이션": formation,
            "선발_후보": "후보" if is_bench else "선발",
            "등번호": p.get("shirtNumber", ""),
            "선수명": p.get("name", ""),
            "선수ID": p.get("id"),
            "나이": p.get("age", ""),
            "국적": p.get("countryName", ""),
            "포지션ID": p.get("positionId", ""),
            "소속팀": p.get("primaryTeamName", ""),
            "평점": perf.get("rating", ""),
            "교체시간": sub_time,
            "시장가치": p.get("marketValue", ""),
        })
    return rows


def parse_lineups(data: dict) -> list[dict]:
    rows = []
    lineup = safe_get(data, "content", "lineup", default={})

    for side in ("homeTeam", "awayTeam"):
        team_data = lineup.get(side, {})
        if not team_data:
            continue
        rows.extend(_parse_team_lineup(team_data, is_bench=False))
        rows.extend(_parse_team_lineup(team_data, is_bench=True))
    return rows


def parse_shots(data: dict) -> list[dict]:
    rows = []
    shots = safe_get(data, "content", "shotmap", "shots", default=[])
    header_teams = data.get("header", {}).get("teams", [])
    home_id = header_teams[0].get("id") if header_teams else None

    for s in shots:
        is_home = s.get("teamId") == home_id
        team_name = ""
        if header_teams:
            team_name = header_teams[0].get("name", "") if is_home else header_teams[1].get("name", "") if len(header_teams) > 1 else ""

        rows.append({
            "시간": s.get("eventTime", ""),
            "선수": s.get("playerName", ""),
            "팀": team_name,
            "홈여부": "홈" if is_home else "원정",
            "결과": s.get("eventType", ""),
            "xG": s.get("expectedGoals"),
            "xGOT": s.get("expectedGoalsOnTarget"),
            "위치X": s.get("x"),
            "위치Y": s.get("y"),
            "골방향X": s.get("goalCrossedX"),
            "골방향Y": s.get("goalCrossedY"),
            "블로킹_선수": s.get("blockedByPlayer", {}).get("name", "") if s.get("blockedByPlayer") else "",
        })
    return rows


def parse_all(data: dict) -> dict:
    return {
        "overview": parse_overview(data),
        "stats": parse_stats(data),
        "events": parse_events(data),
        "lineups": parse_lineups(data),
        "shots": parse_shots(data),
    }
