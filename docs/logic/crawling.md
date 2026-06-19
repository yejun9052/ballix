# 크롤링 로직 (Python FotMob 스크래퍼)

FotMob 데이터를 어떻게 가져오는지. 관련 파일: `fotmob_scraper/scraper.py`(추출), `fotmob_scraper/api.py`(FastAPI 엔드포인트·가공), `fotmob_scraper/search.py`.

---

## 1. 왜 Python 스크래퍼가 따로 있나

- FotMob은 공개 API가 없고 직접 호출(`/api/matchDetails`)을 **차단**한다(404).
- Next.js SSR 앱이라 **Playwright로 페이지를 열어** 데이터를 추출한다.
- 백엔드(Spring)는 FotMob을 직접 안 긁고 **이 스크래퍼를 HTTP로 호출**한다. 스크래퍼는 무상태(stateless) 수집기.

---

## 2. 경기 데이터 추출 — `extract_from_page` (가장 중요)

`scraper.py`의 `extract_from_page()`는 **두 경로**를 순서대로 시도한다:

### 방법 1 — 페이지 내 직접 fetch (★ 라이브 신선값)

```python
# scraper.py _try_fetch_via_page
const r = await fetch('/api/data/matchDetails?matchId={match_id}', { headers: {...} });
```

- **경로가 `/api/data/matchDetails`** (현행). 과거 `/api/matchDetails`(`/data/` 없음)는 **404 HTML**을 반환해
  항상 SSR로 폴백됐고, 그게 **HT·스코어가 최대 10분 늦던 원인**이었다.
- 같은 오리진의 페이지 컨텍스트에서 호출하면 **200 JSON**(신선한 `status.halfs` 포함)을 준다.
- 응답 리스너도 `"/api/data/matchDetails"` 를 매칭해 FotMob이 스스로 쏘는 XHR도 캡처한다.

### 방법 2 — `__NEXT_DATA__` SSR 폴백

- 방법 1이 실패할 때만. SSR 스냅샷은 **~10분 캐시**라 라이브엔 부적합(지연).
- 로그에 **"Next.js SSR 데이터 추출 성공"** 만 보이면 fallback 중 = 라이브 데이터가 늦다는 뜻
  (→ [live-clock-and-halftime.md](live-clock-and-halftime.md) 2절 진단).

### 가공 — `build_match_response`

raw에서 프론트/백엔드가 쓸 평탄한 JSON으로 변환:
- `statusType`(SCHEDULED/IN_PLAY/FINISHED), `homeScore`/`awayScore`, 라인업(`posX`/`posY`/포메이션/평점),
  이벤트(골/카드/교체), `venue`(구장), `liveTime`/`liveSeconds`/`liveBasePeriod`/`liveAddedTime`,
  전·후반 추가시간(`AddedTime` 이벤트 `time=45/90`에서).
- `liveSeconds`는 `_live_seconds_from_halfs`로 재계산(시계 문서 1절).
- HT는 `halfs.firstHalfEnded`로 즉시 판정(시계 문서 2절).

---

## 3. 크롤 throttle (차단 위험 ↓)

`api.py`의 모든 크롤 엔드포인트는 첫 줄에서 `await crawl_throttle()`을 호출:

- **직전 크롤과 300~500ms 랜덤 간격**을 강제(락 + 마지막 크롤 시각 기반).
- 동시/연속 요청이 몰려도 FotMob에 일정 텀을 두고 접근, 한가할 땐 지연 없음.
- 범위: `CRAWL_DELAY_MIN_MS`/`CRAWL_DELAY_MAX_MS`.
- **새 크롤 엔드포인트를 추가하면 본문 첫 줄에 `await crawl_throttle()` 필수.**

### 클라우드(컨테이너) Chromium 플래그

`BROWSER_LAUNCH_ARGS`에 `--no-sandbox`, `--disable-dev-shm-usage` 포함 — Render/도커(root 실행, 작은 /dev/shm)에서 브라우저가 안 켜지는 문제 방지.

---

## 4. 엔드포인트 맵 (`api.py`)

| 엔드포인트 | 용도 |
|---|---|
| `GET /match/{id}` | 경기 상세(라인업·이벤트·평점·**liveTime/liveSeconds**·포메이션·posX/posY·venue) — `/api/data/matchDetails` 기반 |
| `GET /player/{id}` | 선수 상세(프로필 + 주 리그 시즌 스탯) — `/api/data/playerData` |
| `GET /schedule?date=` | 날짜별 일정 — `/api/data/matches` |
| `GET /league/{id}/table` | 리그 순위(조별) |
| `GET /league/{id}/fixtures` | 시즌 전체 일정(결승까지) — 토너먼트 `syncFullLeagues` 전용 |
| `GET /commentary/{id}` | 라이브티커(ltc) 골 해설 — 골 요약용 |
| `GET /search` | 팀/경기 검색 |
| `GET /youtube/search?q=` · `/youtube/embeddable/{id}` | 하이라이트 검색·임베드 가능 확인 |
| `GET /health` | 헬스체크 |

> 선수 사진은 저장 안 함 — 프론트가 `fotmobPlayerId`로 `images.fotmob.com/.../{id}.png` URL 직접 구성.

---

## 5. 백엔드 쪽 동기화 (참고)

스크래퍼는 데이터만 주고, **스케줄·DB·폴링은 백엔드가 소유**한다(`com.example.backend.fotmob`):
- **일정 동기화**(부팅 후 + 30분): 날짜 ±N일(`syncRange`) + 시즌 전체(`syncFullLeagues`).
- **데이터 폴링**(3분) / **라이브 빠른 폴링**(20초) / **시계 재앵커**(11분).
- **HTTP-in-transaction 방지**: HTTP 크롤은 트랜잭션 밖, DB 저장만 `@Lazy self` 프록시로 독립 트랜잭션.
- **DB-first lazy-cache**: 순위·상세·라인업은 조회 시 비어있으면 1회 크롤+저장 후 이후 DB만.

> ⚠️ **`api.py`/`scraper.py` 수정 후 uvicorn(또는 도커 스크래퍼)을 재시작**해야 반영된다(자동 리로드 없음).
