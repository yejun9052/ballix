"""FotMob 검색으로 경기를 찾는 모듈 (팀명 + 대회명 기반)."""
import asyncio
import re
from dataclasses import dataclass
from typing import Optional
from playwright.async_api import async_playwright, Page, Browser


@dataclass
class MatchCandidate:
    match_id: str
    url: str
    home_team: str
    away_team: str
    competition: str
    date_str: str
    raw_text: str

    def __str__(self):
        parts = [f"[{self.match_id}]"]
        if self.competition:
            parts.append(self.competition)
        parts.append(f"{self.home_team} vs {self.away_team}")
        if self.date_str:
            parts.append(self.date_str)
        return " | ".join(parts)


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9가-힣]", "", text.lower())


def _match_keyword(text: str, keyword: str) -> bool:
    if not keyword:
        return True
    norm_text = _normalize(text)
    words = [_normalize(w) for w in keyword.split() if w]
    return all(w in norm_text for w in words)


async def _search_and_extract(page: Page, query: str) -> list[dict]:
    """검색창에 쿼리를 입력하고 경기 링크 + 부모 컨텍스트를 추출."""
    search_selectors = [
        'input[placeholder*="earch"]',
        'input[type="search"]',
        '[role="searchbox"]',
    ]
    for sel in search_selectors:
        try:
            await page.click(sel, timeout=3000)
            break
        except Exception:
            continue

    await page.keyboard.press("Control+a")
    await page.keyboard.type(query, delay=80)
    await asyncio.sleep(2.5)

    return await page.evaluate("""() => {
        return Array.from(document.querySelectorAll('a[href*="/matches/"]'))
            .filter(a => a.href.includes('#'))
            .map(a => {
                // 부모 4단계까지 올라가 대회명 컨텍스트 확보
                let parent = a;
                for (let i = 0; i < 4; i++) {
                    if (parent.parentElement) parent = parent.parentElement;
                }
                return {
                    href: a.href,
                    linkText: a.innerText.trim(),
                    context: parent.innerText.trim().replace(/\\s+/g, ' ')
                };
            });
    }""")


def _parse_link(link: dict) -> Optional[MatchCandidate]:
    href = link["href"]
    link_text = link["linkText"]
    context = link.get("context", "")

    m = re.search(r"#(\d+)$", href)
    if not m:
        return None
    match_id = m.group(1)

    # URL slug에서 팀명 추출
    path_m = re.search(r"/matches/(.+?)-vs-(.+?)/", href)
    if path_m:
        home_slug = path_m.group(1).replace("-", " ").title()
        away_slug = path_m.group(2).replace("-", " ").title()
    else:
        home_slug = away_slug = ""

    # linkText에서 날짜/스코어 추출
    lines = [l.strip() for l in link_text.splitlines() if l.strip()]

    # 대회명: context의 첫 번째 단어 그룹 (숫자 이전까지)
    # 예: "FIFA World Cup A 1 South Korea 2:00 AM Czechia..."
    # 또는 context 앞부분에서 "-" 나 "/" 기준으로
    competition = ""
    if context:
        # context 첫 부분이 대회명인 경우가 많음
        # "Friendlies 1/20 ..." → "Friendlies"
        # "FIFA World Cup A ..." → "FIFA World Cup"
        # 숫자/특수패턴 직전까지 추출
        comp_m = re.match(r"^([A-Za-z ]+?)(?:\s+\d|\s+[A-Z]\s+\d|$)", context)
        if comp_m:
            competition = comp_m.group(1).strip()

    # 날짜/시간 (링크 텍스트 마지막 2줄)
    date_str = ""
    if len(lines) >= 2:
        last = lines[-1]
        # AM/PM 포함이면 시간, 날짜 패턴
        if re.search(r"\d+:\d+|\bAM\b|\bPM\b|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec", last, re.I):
            date_str = " ".join(lines[-2:]) if len(lines) >= 2 else last

    # 전체 검색 텍스트 = linkText + context (필터링용)
    raw_text = f"{link_text} {context}"

    return MatchCandidate(
        match_id=match_id,
        url=href,
        home_team=home_slug,
        away_team=away_slug,
        competition=competition,
        date_str=date_str,
        raw_text=raw_text,
    )


def _filter_candidates(
    candidates: list[MatchCandidate],
    team1: str,
    team2: str,
    competition: str,
) -> list[MatchCandidate]:
    result = []
    for c in candidates:
        team1_ok = _match_keyword(c.raw_text, team1) if team1 else True
        team2_ok = _match_keyword(c.raw_text, team2) if team2 else True
        comp_ok = _match_keyword(c.raw_text, competition) if competition else True

        if team1_ok and team2_ok and comp_ok:
            result.append(c)
    return result


async def _fetch_team_fixtures(page: Page, team_url: str, team2: str, competition: str) -> list[MatchCandidate]:
    """팀 페이지 fixtures API를 통해 경기 목록을 가져옴 (단독 팀 검색 폴백)."""
    team_data: dict = {}
    done = asyncio.Event()

    async def on_response(resp):
        if "/api/data/teams?id=" in resp.url and not done.is_set():
            ct = resp.headers.get("content-type", "")
            if "json" in ct:
                try:
                    team_data.update(await resp.json())
                    done.set()
                except Exception:
                    pass

    page.on("response", on_response)
    try:
        await page.goto(team_url, wait_until="domcontentloaded", timeout=30000)
        await asyncio.wait_for(done.wait(), timeout=15)
    except asyncio.TimeoutError:
        print(f"[search] 팀 페이지 API 타임아웃: {team_url}")
        return []
    finally:
        page.remove_listener("response", on_response)

    fixtures_raw = team_data.get("fixtures", {}).get("allFixtures", {}).get("fixtures", [])
    candidates = []
    seen = set()

    for f in fixtures_raw:
        match_id = str(f.get("id", ""))
        if not match_id or match_id in seen:
            continue
        seen.add(match_id)

        page_url = f.get("pageUrl", "")
        full_url = f"https://www.fotmob.com{page_url}" if page_url.startswith("/") else page_url

        home = f.get("home", {})
        away = f.get("away", {})
        tournament = f.get("tournament", {})
        status = f.get("status", {})

        utc_time = status.get("utcTime", "")
        date_str = utc_time[:10] if utc_time else ""

        raw_text = f"{home.get('name','')} {away.get('name','')} {tournament.get('name','')} {date_str}"

        c = MatchCandidate(
            match_id=match_id,
            url=full_url,
            home_team=home.get("name", ""),
            away_team=away.get("name", ""),
            competition=tournament.get("name", ""),
            date_str=date_str,
            raw_text=raw_text,
        )

        # 팀2 및 대회 필터
        team2_ok = _match_keyword(raw_text, team2) if team2 else True
        comp_ok = _match_keyword(raw_text, competition) if competition else True
        if team2_ok and comp_ok:
            candidates.append(c)

    return candidates


async def search_matches(
    team1: str,
    team2: str = "",
    competition: str = "",
    headless: bool = True,
    max_results: int = 15,
) -> list[MatchCandidate]:
    """
    FotMob 검색으로 경기 목록을 반환.

    Args:
        team1: 첫 번째 팀명 (필수)
        team2: 두 번째 팀명 (선택)
        competition: 대회명 필터 (선택, 예: "World Cup", "Champions League")
        headless: 헤드리스 여부
        max_results: 최대 반환 수

    Returns:
        MatchCandidate 리스트
    """
    query_parts = [p for p in [team1, team2] if p]
    query = " ".join(query_parts)

    print(f"[search] 검색어: '{query}'" + (f" | 대회 필터: '{competition}'" if competition else ""))

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            args=["--disable-blink-features=AutomationControlled"],
        )
        ctx = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
        )
        await ctx.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
        )
        page = await ctx.new_page()
        await page.goto("https://www.fotmob.com", wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(1)

        # ── 1단계: 검색 드롭다운에서 경기 링크 추출 ──────────────────
        raw_links = await _search_and_extract(page, query)

        # 팀 URL도 수집 (폴백용)
        team_urls = await page.evaluate("""() => {
            return Array.from(document.querySelectorAll('a[href*="/teams/"]'))
                .map(a => ({href: a.href, text: a.innerText.trim()}))
                .filter(a => a.text && !a.href.includes('/squad') && !a.href.includes('/fixtures'))
                .slice(0, 5);
        }""")

        candidates = []
        seen: set[str] = set()
        for link in raw_links:
            c = _parse_link(link)
            if c and c.match_id not in seen:
                seen.add(c.match_id)
                candidates.append(c)

        filtered = _filter_candidates(candidates, team1, team2, competition)

        # ── 2단계: 드롭다운 결과 부족하면 팀 페이지 fixtures 폴백 ───
        if not filtered:
            team1_norm = _normalize(team1)
            team_url = None
            for t in team_urls:
                # URL slug에 팀명 포함 여부 확인
                slug = t["href"].split("/teams/")[-1] if "/teams/" in t["href"] else ""
                slug_norm = _normalize(slug.split("/")[1] if "/" in slug else slug)
                text_norm = _normalize(t["text"])
                if team1_norm in slug_norm or team1_norm in text_norm:
                    # U팀, 여자팀 제외 (team1에 명시된 경우 제외하지 않음)
                    if ("u2" in text_norm or "u1" in text_norm or "(w)" in text_norm) and (
                        "u" not in _normalize(team1) and "w" not in _normalize(team1)
                    ):
                        continue
                    team_url = t["href"]
                    break

            if team_url:
                print(f"[search] 팀 페이지 fixtures 검색 중: {team_url}")
                filtered = await _fetch_team_fixtures(page, team_url, team2, competition)
            else:
                print(f"[search] 팀 페이지를 찾지 못했습니다.")

        await browser.close()

    if not filtered and candidates:
        print(f"[search] 필터 결과 없음 → 전체 {len(candidates)}개 결과 표시")
        return candidates[:max_results]

    return filtered[:max_results]


def select_match_interactively(candidates: list[MatchCandidate]) -> Optional[MatchCandidate]:
    if not candidates:
        print("[search] 검색 결과가 없습니다.")
        return None

    if len(candidates) == 1:
        print(f"[search] 경기 발견: {candidates[0]}")
        return candidates[0]

    print(f"\n[search] {len(candidates)}개 경기 발견:")
    for i, c in enumerate(candidates, 1):
        print(f"  {i}. {c}")

    while True:
        try:
            choice = input("\n번호를 선택하세요 (0=취소): ").strip()
            if choice == "0":
                return None
            idx = int(choice) - 1
            if 0 <= idx < len(candidates):
                return candidates[idx]
            print("유효하지 않은 번호입니다.")
        except (ValueError, EOFError):
            return candidates[0]
