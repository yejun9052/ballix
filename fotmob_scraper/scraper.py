"""FotMob 경기 데이터를 Playwright로 수집하는 모듈."""
import asyncio
import json
import re
from typing import Optional
from urllib.parse import urlparse
from playwright.async_api import async_playwright, Page


def extract_match_id(url: str) -> Optional[str]:
    """FotMob URL 또는 matchId 문자열에서 matchId를 추출."""
    if url.strip().isdigit():
        return url.strip()
    # URL 해시 뒤 숫자 (#5451162)
    m = re.search(r"#(\d+)$", url)
    if m:
        return m.group(1)
    # URL path 끝 숫자
    m = re.search(r"/(\d+)(?:[/?#]|$)", url)
    if m:
        return m.group(1)
    return None


async def _try_extract_next_data(page: Page) -> Optional[dict]:
    """Next.js SSR 데이터(__NEXT_DATA__)에서 경기 데이터 추출 시도."""
    try:
        result = await page.evaluate("""() => {
            const el = document.getElementById('__NEXT_DATA__');
            if (!el) return null;
            try { return JSON.parse(el.textContent); } catch(e) { return null; }
        }""")
        if result:
            return result
    except Exception:
        pass
    return None


async def _try_fetch_via_page(page: Page, match_id: str) -> Optional[dict]:
    """페이지 컨텍스트에서 FotMob 라이브 API를 직접 호출 — SSR(__NEXT_DATA__)보다 신선하다.

    경로는 `/api/data/matchDetails`(현행). 과거 `/api/matchDetails`는 404 HTML을 반환해 항상 SSR로
    폴백됐고, SSR 스냅샷은 ~10분마다만 갱신돼 HT·스코어가 최대 10분 늦게 반영되는 원인이었다.
    이 엔드포인트는 같은 오리진의 페이지 컨텍스트에서 호출하면 200 JSON(신선한 status.halfs 포함)을 준다.
    """
    try:
        result = await page.evaluate(f"""async () => {{
            try {{
                const r = await fetch('/api/data/matchDetails?matchId={match_id}', {{
                    headers: {{
                        'Accept': 'application/json',
                        'x-requested-with': 'XMLHttpRequest'
                    }}
                }});
                const text = await r.text();
                if (text.trim().startsWith('{{')) return JSON.parse(text);
                return null;
            }} catch(e) {{ return null; }}
        }}""")
        if result and isinstance(result, dict) and "general" in result:
            return result
    except Exception:
        pass
    return None


def resolve_page_url(url_or_id: str) -> tuple[str, Optional[str]]:
    """URL 또는 matchId를 (page_url, match_id) 튜플로 정규화."""
    match_id = extract_match_id(url_or_id)
    if url_or_id.startswith("http"):
        return url_or_id, match_id
    elif match_id:
        # 단수 /match/{id} 는 slug 없이도 해당 경기로 직접 접근 가능
        return f"https://www.fotmob.com/match/{match_id}", match_id
    raise ValueError(f"유효하지 않은 URL 또는 matchId: {url_or_id}")


async def extract_from_page(page: Page, page_url: str, match_id: Optional[str], verbose: bool = True) -> dict:
    """
    이미 생성된 Playwright page로 경기 데이터를 추출.

    브라우저를 직접 만들지 않으므로 FastAPI 등에서 공유 컨텍스트를 재사용할 때 사용한다.
    """
    captured: dict = {}
    capture_done = asyncio.Event()

    def log(msg: str):
        if verbose:
            print(msg)

    async def handle_response(response):
        if capture_done.is_set():
            return
        if "/api/data/matchDetails" in response.url:
            try:
                ct = response.headers.get("content-type", "")
                if "json" in ct:
                    body = await response.json()
                    if isinstance(body, dict) and "general" in body:
                        captured.update(body)
                        capture_done.set()
                        # FotMob 페이지가 스스로 쏜 /api/data/matchDetails XHR을 가로챔 = 신선값.
                        print(f"[fotmob] source=XHR-CAPTURE (fresh) matchId={match_id}", flush=True)
            except Exception:
                pass

    page.on("response", handle_response)
    try:
        log(f"[fotmob] 페이지 로딩 중: {page_url}")
        try:
            await page.goto(page_url, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            log(f"[fotmob] 초기 로딩 경고: {e}")

        # FotMob 라이브 페이지는 `/api/data/matchDetails` XHR로 신선한 데이터를 받는다(goto 중 잡히면 그대로 사용).
        # 단 SSR(__NEXT_DATA__)도 함께 내려오지만 ~10분 캐시라 라이브엔 부적합 → 직접 fetch를 우선한다.

        # 방법 1: 페이지 내 직접 fetch (/api/data/matchDetails — 라이브 경기에도 가장 신선한 데이터)
        if not capture_done.is_set() and match_id:
            log("[fotmob] 페이지 내 직접 fetch 시도...")
            data = await _try_fetch_via_page(page, match_id)
            if data:
                captured.update(data)
                capture_done.set()
                # verbose와 무관하게 항상 찍어 운영(Render) 로그에서 신선/지연 경로를 확인 가능하게 한다.
                # LIVE-FETCH = /api/data/matchDetails 신선값. 라이브 HT·스코어가 즉시 반영되는 경로.
                print(f"[fotmob] source=LIVE-FETCH (fresh) matchId={match_id}", flush=True)

        # 방법 2: Next.js SSR 데이터 추출
        if not capture_done.is_set():
            next_data = await _try_extract_next_data(page)
            if next_data:
                props = next_data.get("props", {}).get("pageProps", {})
                if "general" in props:
                    captured.update(props)
                    capture_done.set()
                    # SSR-FALLBACK = __NEXT_DATA__(~10분 캐시). 라이브면 HT/스코어가 최대 10분 늦는 원인.
                    print(f"[fotmob] source=SSR-FALLBACK (stale ~10min) matchId={match_id}", flush=True)
                else:
                    match_data = props.get("matchDetails") or props.get("data") or props.get("match")
                    if match_data and isinstance(match_data, dict) and "general" in match_data:
                        captured.update(match_data)
                        capture_done.set()
                        print(f"[fotmob] source=SSR-FALLBACK(nested) (stale ~10min) matchId={match_id}", flush=True)
                    else:
                        log(f"[fotmob] Next.js 데이터 키: {list(props.keys())}")

        # 방법 3: 그래도 없으면 짧게 네트워크 인터셉트를 기다린 뒤 스크롤 후 재시도
        if not capture_done.is_set():
            try:
                await asyncio.wait_for(capture_done.wait(), timeout=5)
            except asyncio.TimeoutError:
                log("[fotmob] 네트워크 인터셉트 실패, 스크롤 후 재시도...")

        if not capture_done.is_set():
            try:
                await page.mouse.wheel(0, 500)
                await asyncio.sleep(2)
                await asyncio.wait_for(capture_done.wait(), timeout=8)
            except asyncio.TimeoutError:
                pass
    finally:
        page.remove_listener("response", handle_response)

    if not captured:
        raise RuntimeError(f"경기 데이터를 가져오지 못했습니다. URL: {page_url}")

    return captured


# 공유 컨텍스트 생성에 쓰이는 설정 (api.py 등에서 재사용)
# --no-sandbox: 컨테이너(root 실행)에서 Chromium이 안 켜지는 문제 방지(Render/도커 필수)
# --disable-dev-shm-usage: 컨테이너 기본 /dev/shm(64MB)가 작아 발생하는 크래시 방지(공유메모리 대신 /tmp 사용)
BROWSER_LAUNCH_ARGS = [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    # 무료 인스턴스(512MB) OOM 방지용 메모리 절감 — GPU/확장/백그라운드 작업 등 불필요 기능 끔.
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-default-apps",
    "--mute-audio",
    "--no-first-run",
]
CONTEXT_OPTIONS = {
    "user_agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "locale": "ko-KR",
    "viewport": {"width": 1280, "height": 800},
}
STEALTH_INIT_SCRIPT = (
    "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
)

# ── 무거운 리소스 차단(메모리 절감) ──────────────────────────────────────
# 우리가 쓰는 데이터는 전부 same-origin `fetch('/api/data/*')` + HTML에 내장된 `__NEXT_DATA__`/`ytInitialData`
# 에서만 온다 — 페이지가 실제로 렌더될 필요가 없다. 그래서 이미지/폰트/CSS/미디어와 광고·트래커 요청을 abort하면
# Chromium 피크 메모리가 크게 줄어 무료 인스턴스(512MB)의 OOM(502)을 막는다(속도도 빨라짐).
# 스크립트·문서·XHR/fetch는 통과시켜 first-party JS(XHR-CAPTURE 신선경로)와 데이터 fetch를 보존한다.
_BLOCKED_RESOURCE_TYPES = {"image", "media", "font", "stylesheet"}
# 데이터와 무관한 광고/애널리틱스/동의배너 호스트(부분일치) — 순수 오버헤드라 차단해도 안전.
_BLOCKED_HOST_SUBSTR = (
    "doubleclick", "googlesyndication", "google-analytics", "googletagmanager",
    "googletagservices", "adservice", "adsystem", "amazon-adsystem",
    "scorecardresearch", "hotjar", "mixpanel", "criteo", "taboola", "outbrain",
    "quantserve", "pubmatic", "rubiconproject", "onetrust", "cookielaw",
    "sentry.io", "facebook.net",
)


async def _route_block_heavy(route):
    """렌더 전용 리소스·광고/트래커는 abort, 데이터·문서·스크립트·XHR은 통과."""
    req = route.request
    try:
        if req.resource_type in _BLOCKED_RESOURCE_TYPES:
            await route.abort()
            return
        host = (urlparse(req.url).hostname or "").lower()
        if any(s in host for s in _BLOCKED_HOST_SUBSTR):
            await route.abort()
            return
        await route.continue_()
    except Exception:
        # 라우팅 처리 실패가 크롤 자체를 깨지 않도록 안전하게 통과 시도.
        try:
            await route.continue_()
        except Exception:
            pass


async def install_resource_blocking(context) -> None:
    """공유 브라우저 컨텍스트에 무거운 리소스 차단 라우트를 설치한다(모든 페이지에 자동 적용)."""
    await context.route("**/*", _route_block_heavy)


async def fetch_schedule_from_page(page: Page, date: str, tz: str = "Asia/Seoul", ccode: str = "KOR") -> Optional[dict]:
    """
    날짜별 전체 경기 목록을 가져온다 (page는 fotmob.com에 로드된 상태여야 함).

    Args:
        date: "YYYYMMDD" (예: 20260612)
        tz: 타임존 (한국시간 기준 그룹핑이면 Asia/Seoul)

    Returns:
        FotMob raw {leagues:[...], date:...} 또는 None
    """
    return await page.evaluate(f"""async () => {{
        try {{
            const r = await fetch('/api/data/matches?date={date}&timezone={tz}&ccode3={ccode}&includeNextDayLateNight=true');
            const t = await r.text();
            if (!t.trim().startsWith('{{')) return null;
            return JSON.parse(t);
        }} catch(e) {{ return null; }}
    }}""")


async def fetch_commentary_from_page(page: Page, match_id: str, lang: str = "en_gen") -> Optional[dict]:
    """라이브티커(ltc) 커멘터리 피드를 가져온다 (page는 fotmob.com 로드 상태).

    골 해설 등 상세 중계 텍스트는 별도 ltc 피드에 있다:
        /api/data/ltc?ltcUrl=http://data.fotmob.com/webcl/ltc/gsm/{matchId}_{lang}.json.gz&teams=[...]
    teams 파라미터는 존재만 하면 되므로 더미값을 넣는다.
    """
    return await page.evaluate(f"""async () => {{
        try {{
            const ltc = 'http://data.fotmob.com/webcl/ltc/gsm/{match_id}_{lang}.json.gz';
            const u = '/api/data/ltc?ltcUrl=' + encodeURIComponent(ltc) + '&teams=' + encodeURIComponent('["x","y"]');
            const r = await fetch(u);
            const t = await r.text();
            if (!t.trim().startsWith('{{')) return null;
            return JSON.parse(t);
        }} catch(e) {{ return null; }}
    }}""")


async def fetch_league_table_from_page(page: Page, league_id: int, ccode: str = "KOR") -> Optional[dict]:
    """리그 상세(순위 table 포함)를 가져온다 (page는 fotmob.com에 로드된 상태)."""
    return await page.evaluate(f"""async () => {{
        try {{
            const r = await fetch('/api/data/leagues?id={league_id}&ccode3={ccode}');
            const t = await r.text();
            if (!t.trim().startsWith('{{')) return null;
            return JSON.parse(t);
        }} catch(e) {{ return null; }}
    }}""")


async def fetch_player_from_page(page: Page, player_id: int, ccode: str = "KOR") -> Optional[dict]:
    """선수 상세 데이터를 가져온다.

    선수 페이지(/players/{id})를 열어 (1) 내부 API(/api/data/playerData) 를 직접 fetch 하고,
    실패하면 (2) SSR(__NEXT_DATA__.props.pageProps) 를 폴백으로 읽는다. 경기 수집과 같은 패턴.
    """
    try:
        await page.goto(f"https://www.fotmob.com/players/{player_id}",
                        wait_until="domcontentloaded", timeout=30000)
    except Exception:
        pass

    # 방법1: 페이지 컨텍스트에서 내부 API 직접 호출(가장 깔끔한 JSON)
    data = await page.evaluate(f"""async () => {{
        try {{
            const r = await fetch('/api/data/playerData?id={player_id}&ccode3={ccode}');
            const t = await r.text();
            if (t.trim().startsWith('{{')) return JSON.parse(t);
        }} catch(e) {{}}
        return null;
    }}""")
    if isinstance(data, dict) and (data.get("id") or data.get("name")):
        return data

    # 방법2: SSR __NEXT_DATA__ 폴백
    ssr = await page.evaluate("""() => {
        try {
            const el = document.getElementById('__NEXT_DATA__');
            if (!el) return null;
            const j = JSON.parse(el.textContent);
            const pp = (j.props && j.props.pageProps) || {};
            return pp.playerData || pp.player || pp.data || pp;
        } catch(e) { return null; }
    }""")
    if isinstance(ssr, dict) and (ssr.get("id") or ssr.get("name")):
        return ssr
    return None


async def fetch_youtube_search(page: Page, query: str, limit: int = 8) -> list[dict]:
    """유튜브 검색결과를 ytInitialData에서 추출(경기 하이라이트 찾기용).

    FotMob과 같은 방식: 공개 API 없이 SSR 페이지의 전역 객체(window.ytInitialData)를
    Playwright로 읽어 videoRenderer 항목을 평탄하게 뽑는다. sp=EgIQAQ%3D%3D 는 "동영상"
    필터(채널/재생목록 제외). 결과가 없으면 빈 리스트.
    """
    from urllib.parse import quote
    # GDPR 동의창 우회용 쿠키(베스트에포트) — 동의 인터스티셜이 뜨면 ytInitialData가 비어 빈 결과가 됨
    try:
        await page.context.add_cookies([
            {"name": "SOCS", "value": "CAI", "domain": ".youtube.com", "path": "/"},
            {"name": "CONSENT", "value": "YES+", "domain": ".youtube.com", "path": "/"},
        ])
    except Exception:
        pass
    url = "https://www.youtube.com/results?search_query=" + quote(query) + "&sp=EgIQAQ%253D%253D"
    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
    return await page.evaluate("""(limit) => {
        const data = window.ytInitialData;
        if (!data) return [];
        const out = [];
        const walk = (node) => {
            if (!node || typeof node !== 'object') return;
            if (Array.isArray(node)) { node.forEach(walk); return; }
            if (node.videoRenderer && node.videoRenderer.videoId) {
                const v = node.videoRenderer;
                const title = ((v.title && v.title.runs) || []).map(r => r.text).join('');
                const length = (v.lengthText && v.lengthText.simpleText) || null;
                const channel = (v.ownerText && v.ownerText.runs && v.ownerText.runs[0] && v.ownerText.runs[0].text) || null;
                const views = (v.viewCountText && (v.viewCountText.simpleText
                    || ((v.viewCountText.runs || []).map(r => r.text).join('')))) || null;
                const published = (v.publishedTimeText && v.publishedTimeText.simpleText) || null;
                out.push({ videoId: v.videoId, title, length, channel, views, published });
            }
            for (const k in node) walk(node[k]);
        };
        walk(data);
        const seen = new Set();
        const uniq = [];
        for (const o of out) { if (!seen.has(o.videoId)) { seen.add(o.videoId); uniq.push(o); } }
        return uniq.slice(0, limit);
    }""", limit)


async def fetch_youtube_embeddable(page: Page, video_id: str) -> bool:
    """영상이 외부 사이트(iframe)에서 재생 가능한지 확인.

    watch 페이지의 ytInitialPlayerResponse.playabilityStatus 를 본다(embed 페이지엔 SSR 데이터가
    없어 못 읽음). status=="OK" 이고 playableInEmbed 가 명시적 false 가 아니면 임베드 가능으로 본다.
    영상 소유자가 임베드를 끈 경우 playableInEmbed===false 로 온다.
    """
    try:
        await page.goto(f"https://www.youtube.com/watch?v={video_id}",
                        wait_until="domcontentloaded", timeout=20000)
    except Exception:
        return False
    r = await page.evaluate("""() => {
        try {
            const r = window.ytInitialPlayerResponse;
            if (!r || !r.playabilityStatus) return null;
            const ps = r.playabilityStatus;
            return { status: ps.status || null, embed: ps.playableInEmbed };
        } catch(e) { return null; }
    }""")
    if not r:
        return False
    return r.get("status") == "OK" and r.get("embed") is not False


async def fetch_match_data(url_or_id: str, headless: bool = True) -> dict:
    """
    FotMob 경기 페이지를 열고 matchDetails 데이터를 반환 (독립 브라우저 사용).

    Args:
        url_or_id: FotMob 경기 URL 또는 matchId
        headless: True면 헤드리스, False면 크롬 UI 표시

    Returns:
        match data dict
    """
    page_url, match_id = resolve_page_url(url_or_id)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless, args=BROWSER_LAUNCH_ARGS)
        context = await browser.new_context(**CONTEXT_OPTIONS)
        await context.add_init_script(STEALTH_INIT_SCRIPT)
        await install_resource_blocking(context)   # 렌더 전용 리소스 차단(메모리 절감)
        page: Page = await context.new_page()
        try:
            return await extract_from_page(page, page_url, match_id)
        finally:
            await browser.close()
