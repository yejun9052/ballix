"""순수 로직 단위 테스트 — Playwright/FastAPI 없이 api.py의 시계·상태 파싱 함수만 검증.

heavy 의존(fastapi, playwright, scraper, search)을 sys.modules에 스텁으로 끼워넣어
api.py를 import 한 뒤, 네트워크 없는 순수 함수들을 직접 호출한다.
시간 의존 함수는 api.time.time 을 고정값으로 패치해 결정적으로 만든다.

실행: py -3 test_live_clock.py   (또는 python -m pytest 없이 단독 실행)
"""
import sys
import types
from datetime import datetime, timezone
from unittest import mock

# ── heavy 의존 스텁 ──────────────────────────────────────────────
def _stub(name):
    m = types.ModuleType(name)
    m.__getattr__ = lambda attr: mock.MagicMock()  # 어떤 속성 접근도 MagicMock
    sys.modules[name] = m
    return m

fastapi = _stub("fastapi")
fastapi.FastAPI = mock.MagicMock()
fastapi.HTTPException = type("HTTPException", (Exception,), {})
_stub("playwright")
_stub("playwright.async_api")
# scraper / search 는 api.py가 from 으로 이름을 꺼내므로 해당 이름들을 가진 스텁이 필요
scraper = _stub("scraper")
for n in ["extract_from_page", "resolve_page_url", "fetch_schedule_from_page",
          "fetch_league_table_from_page", "fetch_commentary_from_page",
          "fetch_player_from_page", "fetch_youtube_search", "fetch_youtube_embeddable",
          "BROWSER_LAUNCH_ARGS", "CONTEXT_OPTIONS", "STEALTH_INIT_SCRIPT",
          "install_resource_blocking"]:
    setattr(scraper, n, mock.MagicMock())
search = _stub("search")
search.search_matches = mock.MagicMock()

import api  # noqa: E402

# ── 테스트 유틸 ──────────────────────────────────────────────────
PASS, FAIL = 0, 0
def check(name, cond):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  [PASS] {name}")
    else:
        FAIL += 1
        print(f"  [FAIL] {name}")

def iso(dt_utc: datetime) -> str:
    return dt_utc.strftime("%Y-%m-%dT%H:%M:%S.000Z")

def halfs_str(dt_utc: datetime) -> str:
    # halfs 문자열은 "dd.mm.YYYY HH:MM:SS" (여기선 UTC 가정 → offset 0)
    return dt_utc.strftime("%d.%m.%Y %H:%M:%S")


print("== _normalize_status ==")
check("finished→FINISHED", api._normalize_status({"finished": True}) == "FINISHED")
check("started→IN_PLAY", api._normalize_status({"started": True}) == "IN_PLAY")
check("cancelled→CANCELLED", api._normalize_status({"cancelled": True}) == "CANCELLED")
check("none→SCHEDULED", api._normalize_status({}) == "SCHEDULED")
check("finished 우선순위", api._normalize_status({"finished": True, "started": True}) == "FINISHED")

print("== _iso_epoch ==")
base = datetime(2026, 6, 24, 12, 0, 0, tzinfo=timezone.utc)
check("Z 파싱", abs(api._iso_epoch("2026-06-24T12:00:00.000Z") - base.timestamp()) < 1)
check("None→None", api._iso_epoch(None) is None)
check("빈문자→None", api._iso_epoch("") is None)
check("쓰레기→None", api._iso_epoch("not-a-date") is None)

print("== _added_times (전·후반 추가시간) ==")
raw = {"content": {"matchFacts": {"events": {"events": [
    {"type": "AddedTime", "time": 45, "minutesAddedInput": 2},
    {"type": "AddedTime", "time": 90, "minutesAddedInput": 5},
    {"type": "Goal", "time": 30},
]}}}}
check("전반=2 후반=5", api._added_times(raw) == (2, 5))
check("이벤트 없음→(None,None)", api._added_times({}) == (None, None))

print("== _live_seconds_from_halfs (앵커 경과초) ==")
kick = datetime(2026, 6, 24, 18, 0, 0, tzinfo=timezone.utc)  # 킥오프 18:00 UTC
# 1) 전반 23분 진행 — 전반 시작=킥오프, now=킥오프+23분
with mock.patch.object(api.time, "time", return_value=(kick.timestamp() + 23 * 60)):
    st = {"utcTime": iso(kick), "halfs": {"firstHalfStarted": halfs_str(kick)}}
    sec = api._live_seconds_from_halfs(st, fallback=1380)
    check("전반23분 ≈ 1380s", sec is not None and abs(sec - 1380) <= 2)

# 2) 후반 60분(=3600s): 후반 시작=킥오프+60분(HT 15분 포함), now=후반시작+15분
second_start = datetime(2026, 6, 24, 19, 0, 0, tzinfo=timezone.utc)
with mock.patch.object(api.time, "time", return_value=(second_start.timestamp() + 15 * 60)):
    st = {"utcTime": iso(kick), "halfs": {
        "firstHalfStarted": halfs_str(kick), "firstHalfEnded": halfs_str(datetime(2026,6,24,18,45,0,tzinfo=timezone.utc)),
        "secondHalfStarted": halfs_str(second_start)}}
    sec = api._live_seconds_from_halfs(st, fallback=3600)
    # 후반 = 2700 + (now - secondStart) = 2700 + 900 = 3600
    check("후반15분 ≈ 3600s", sec is not None and abs(sec - 3600) <= 2)

# 3) SSR과 10분 이상 어긋나면 fallback
with mock.patch.object(api.time, "time", return_value=(kick.timestamp() + 23 * 60)):
    st = {"utcTime": iso(kick), "halfs": {"firstHalfStarted": halfs_str(kick)}}
    check("SSR 괴리 큰 fallback 유지", api._live_seconds_from_halfs(st, fallback=100) == 100)

# 4) halfs 없음 → fallback
check("halfs 없음→fallback", api._live_seconds_from_halfs({"utcTime": iso(kick)}, fallback=777) == 777)
# 5) 음수/비정상(now < 전반시작) → fallback
with mock.patch.object(api.time, "time", return_value=(kick.timestamp() - 60)):
    st = {"utcTime": iso(kick), "halfs": {"firstHalfStarted": halfs_str(kick)}}
    check("음수경과→fallback", api._live_seconds_from_halfs(st, fallback=5) == 5)

print("== _break_override (정지구간 시계 멈춤) ==")
# HT: 전반 종료 + 후반 미시작 → ("HT", None)
st_ht = {"halfs": {"firstHalfStarted": "x", "firstHalfEnded": "x"}}
check("HT 라벨·앵커 None", api._break_override(st_ht, "47'", 2820, None, None, None) == ("HT", None))
# (A) 전반인데 부여추가(2분)+30초 초과 → HT 강제
st_a = {"halfs": {"firstHalfStarted": "x"}}
over = 45 * 60 + 2 * 60 + 31  # 2731s
check("전반 추가시간 초과→HT", api._break_override(st_a, "47'", over, None, 2, None) == ("HT", None))
# (A) 경계 내(추가시간 안 넘김)면 그대로 흐름
within = 45 * 60 + 2 * 60 + 10  # 2710s
check("전반 추가시간 이내→유지", api._break_override(st_a, "46'", within, None, 2, None) == ("46'", within))
# 후반 진행 중(둘 다 시작)이면 정지 아님 → 입력 그대로
st_run = {"halfs": {"firstHalfStarted": "x", "firstHalfEnded": "x", "secondHalfStarted": "x"}}
check("후반 진행→유지", api._break_override(st_run, "67'", 4020, None, None, None) == ("67'", 4020))
# 승부차기 진행 → ("Pen.", None)
st_pen = {"halfs": {"penaltyShootoutStarted": "x"}}
check("승부차기→Pen.", api._break_override(st_pen, "120'", 7200, None, None, None) == ("Pen.", None))
# 승부차기 종료(gameEnded) → 발동 안 함
st_pen_end = {"halfs": {"penaltyShootoutStarted": "x", "gameEnded": "x"}}
check("승부차기 종료→유지", api._break_override(st_pen_end, "FT", None, None, None, None) == ("FT", None))

print(f"\n== 결과: {PASS} passed, {FAIL} failed ==")
sys.exit(1 if FAIL else 0)
