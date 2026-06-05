"""FotMob 경기 데이터 수집 및 Excel 저장 메인 스크립트.

사용법 1 - URL / matchId로 직접 수집:
    py main.py <URL_또는_matchId> [옵션]

사용법 2 - 팀명으로 검색:
    py main.py search <팀1> [팀2] [--comp 대회명] [옵션]

예시:
    py main.py https://www.fotmob.com/ko/matches/guinea-vs-northern-ireland/29ixyj#5451162
    py main.py 5451162
    py main.py search "South Korea" "Czechia" --comp "World Cup"
    py main.py search "Korea" "Czechia"
    py main.py search "Manchester City" "Real Madrid" --comp "Champions League"
    py main.py search "Brazil" --comp "World Cup"
"""
import argparse
import asyncio
import sys
from datetime import datetime
from pathlib import Path

from scraper import fetch_match_data
from parser import parse_all
from exporter import export_to_excel, save_raw_json
from search import search_matches, select_match_interactively


def build_output_path(parsed_overview: dict, suffix: str = "") -> str:
    home = parsed_overview.get("홈팀", "home").replace(" ", "_")
    away = parsed_overview.get("원정팀", "away").replace(" ", "_")
    match_id = parsed_overview.get("matchId", "unknown")
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{home}_vs_{away}_{match_id}{suffix}_{ts}.xlsx"
    return str(Path(__file__).parent / "output" / filename)


async def run_fetch(url_or_id: str, headless: bool, save_json: bool, out_path: str | None):
    print(f"[fotmob] 데이터 수집 시작: {url_or_id}")
    raw_data = await fetch_match_data(url_or_id, headless=headless)

    parsed = parse_all(raw_data)
    overview = parsed["overview"]

    score_str = overview.get("스코어") or f"{overview.get('홈득점')}-{overview.get('원정득점')}"
    print(f"[fotmob] 경기: {overview.get('홈팀')} {score_str} {overview.get('원정팀')}")
    print(f"[fotmob] 리그: {overview.get('리그')} | 날짜: {overview.get('경기일시UTC')} | 상태: {overview.get('상태')}")

    xlsx_path = out_path or build_output_path(overview)
    saved = export_to_excel(parsed, xlsx_path)
    print(f"[fotmob] Excel 저장 완료: {saved}")

    if save_json:
        json_path = saved.replace(".xlsx", "_raw.json")
        save_raw_json(raw_data, json_path)
        print(f"[fotmob] JSON 저장 완료: {json_path}")

    return saved


async def run_search(
    team1: str,
    team2: str,
    competition: str,
    headless: bool,
    save_json: bool,
    out_path: str | None,
    auto_select: bool,
):
    candidates = await search_matches(
        team1=team1,
        team2=team2,
        competition=competition,
        headless=headless,
    )

    if not candidates:
        print("[search] 검색 결과가 없습니다. 검색어를 바꿔보세요.")
        sys.exit(1)

    if auto_select or len(candidates) == 1:
        selected = candidates[0]
        print(f"[search] 선택된 경기: {selected}")
    else:
        selected = select_match_interactively(candidates)
        if not selected:
            print("[search] 취소되었습니다.")
            sys.exit(0)

    await run_fetch(selected.url, headless, save_json, out_path)


def main():
    parser = argparse.ArgumentParser(
        description="FotMob 경기 데이터 수집기",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    subparsers = parser.add_subparsers(dest="mode")

    # ── 서브커맨드: search ──────────────────────────────────────────────
    sp = subparsers.add_parser("search", help="팀명으로 경기 검색")
    sp.add_argument("team1", help="첫 번째 팀명")
    sp.add_argument("team2", nargs="?", default="", help="두 번째 팀명 (선택)")
    sp.add_argument("--comp", default="", metavar="대회명", help="대회명 필터 (예: 'World Cup')")
    sp.add_argument("--auto", action="store_true", help="검색 결과 중 첫 번째를 자동 선택")
    sp.add_argument("--no-headless", action="store_true")
    sp.add_argument("--json", action="store_true")
    sp.add_argument("--out", default=None)

    # ── 기본 모드: URL 또는 matchId ────────────────────────────────────
    parser.add_argument("url_or_id", nargs="?", help="FotMob 경기 URL 또는 matchId")
    parser.add_argument("--no-headless", action="store_true", help="크롬 브라우저 UI 표시")
    parser.add_argument("--json", action="store_true", help="원본 JSON도 저장")
    parser.add_argument("--out", default=None, help="출력 Excel 파일 경로")

    args = parser.parse_args()

    if args.mode == "search":
        asyncio.run(run_search(
            team1=args.team1,
            team2=args.team2,
            competition=args.comp,
            headless=not args.no_headless,
            save_json=args.json,
            out_path=args.out,
            auto_select=args.auto,
        ))
    elif args.url_or_id:
        asyncio.run(run_fetch(
            args.url_or_id,
            headless=not args.no_headless,
            save_json=args.json,
            out_path=args.out,
        ))
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
