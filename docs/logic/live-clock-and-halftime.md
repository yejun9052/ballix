# 라이브 진행시계 · 하프타임(HT) · 추가시간 로직

라이브 경기의 **진행 분/초 시계**, **하프타임 판정**, **추가시간(+N) 표기**가 어떻게 계산되는지 정리한다.
관련 파일: `fotmob_scraper/api.py`(추출), `backend/.../match/Match.java`(앵커·HT), `frontend/.../LiveClock.jsx`(표시), `App.jsx`(폴링).

---

## 1. 큰 그림 — "앵커 시계"

FotMob `/api/matchDetails` 직접호출은 막혀 있어 진행시간을 직접 못 받는다. 그래서 시계는 **앵커 방식**으로 흐른다:

```
Match.liveStartedAt = 지금(KST) - 경과초     ← 고정된 실제 시각(서버가 1회 저장)
프론트 표시 = (현재시각 - liveStartedAt)      ← 브라우저가 매초 계산 (서버 부하 0)
```

- 앵커(`liveStartedAt`)는 **고정된 실제 시각**이라, 프론트가 `Date.now() - liveStartedAtMs`로 매초 흘린다.
- `liveStartedAtMs`(절대 epoch millis)를 **우선** 사용 — 타임존 해석이 안 껴서 어느 환경에서도 정확.
- 시계가 멈춰야 하는 구간(HT 등)은 **앵커를 `null`로 비워** 표시를 정지시킨다.

### 경과초는 `status.halfs`로 계산 (SSR 지연 제거)

`api.py`의 `_live_seconds_from_halfs()`:

- FotMob SSR `liveTime.long`은 실제보다 **0~7분 불규칙 지연** → 고정 보정 불가.
- 대신 **하프 실제 시작시각**(`status.halfs.firstHalfStarted` / `secondHalfStarted`)으로 계산:
  ```
  전반: 경과초 = 지금 - firstHalfStarted
  후반: 경과초 = 2700 + (지금 - secondHalfStarted)   # 2700 = 45분
  ```
- halfs 문자열 타임존이 모호해 `utcTime`(신뢰 UTC)과의 차이를 **15분 배수로 반올림**해 오프셋을 구한다.
- SSR 값과 **10분 이상 어긋나면** 파싱오류로 보고 SSR로 폴백.
- 덕분에 프론트 SSR 보정값은 **0**.

---

## 2. 하프타임(HT) 판정 — "55분에야 뜨는" 문제의 핵심

### 어떻게 HT가 적용되나 (정상 경로)

1. **Python** (`api.py build_match_response`): `status.halfs.firstHalfEnded`가 찍혔고 후반 미시작이면 **즉시 `liveTime="HT"`, `liveSeconds=null`** 로 내린다.
   ```python
   _halfs = status.get("halfs") or {}
   if (_halfs.get("firstHalfEnded") or "").strip() and not (_halfs.get("secondHalfStarted") or "").strip():
       live_short = "HT"
       live_seconds = None
   ```
   > SSR `liveTime.short("HT")`는 0~수 분 지연되지만, **같은 스냅샷의 `halfs.firstHalfEnded`는 신뢰·선반영**되므로 이쪽으로 판정한다.

2. **백엔드** (`Match.updateLiveIfAbsent`): 라벨에 **숫자가 없으면(`isClockPaused`)** 앵커를 비운다.
   ```java
   private static boolean isClockPaused(String liveTime) {
       return liveTime != null && liveTime.chars().noneMatch(Character::isDigit);
   }
   // HT/Break/Pen. 같은 정지 라벨 → liveStartedAt = null (시계 정지, 라벨만 표시)
   ```

3. **프론트** (`LiveClock.jsx`): `clockRunning === false`(= IN_PLAY && `liveStartedAt == null`)면 시계를 멈추고 라벨(`HT`)만 표시.

→ 이 경로가 정상이면 **HT는 폴링 1주기(~20초) 안에** 뜬다.

### ⚠️ "45분이 아니라 55분에 HT" = 스크래퍼가 stale 데이터를 줌

`45 + 10 = 55`. 10분 지연은 **FotMob SSR 스냅샷(`__NEXT_DATA__`)이 ~10분마다만 갱신**되는 값을 쓸 때 나타나는 전형적 신호다.

- HT 판정은 `halfs.firstHalfEnded`에 달렸는데, **스냅샷이 통째로 10분 늙으면 `firstHalfEnded`도 비어 있다** → SSR이 갱신될 때까지(=실제 55분쯤) HT가 안 뜬다.
- 근본 해법은 **신선한 소스**: 스크래퍼가 `/api/data/matchDetails`(페이지 컨텍스트 in-page fetch, 200 JSON, 실시간 halfs)를 읽어야 한다 — [crawling.md](crawling.md) 참고.

**진단 체크리스트 (HT가 ~10분 늦으면):**
1. 배포된 **스크래퍼(Render)** 가 최신 코드인지 — `scraper.py`가 `/api/data/matchDetails`(과거 `/api/matchDetails`는 404)를 쓰는지.
2. 스크래퍼 로그에 **"페이지 내 fetch 성공"** 이 찍히는지(= 신선 경로). **"Next.js SSR 데이터 추출 성공"** 만 찍히면 fallback(=stale)이라 HT가 늦는다.
3. 라이브 경기에서 `GET {scraper}/match/{id}` 응답의 `liveSeconds`가 실제 경과와 맞는지(맞으면 신선).
4. 백엔드 `fotmob.poll.live.enabled=true`, 프론트 폴링 동작(아래 4절) 확인.

> 즉 "55분 HT"는 시계/HT **계산 로직 버그가 아니라 데이터 신선도** 문제일 확률이 높다. Python→백엔드→프론트 계산은 위처럼 즉시 반영하도록 돼 있다.

### 후반 재개

후반이 시작(`secondHalfStarted` 세팅)되면 숫자 라벨이 다시 와서 `updateLiveIfAbsent`가 앵커를 재설정 → 시계 재개.

---

## 3. 추가시간(+N) 표기

`LiveClock.jsx`:

```
정규시간(minute < base): "mm:ss" 로 매초 흐름                  예) "44:58"
스토피지(minute >= base): "mm:ss +N" — 시계는 계속 흐르고 N만 배지   예) "45:30 +2"
```

- **base(정규시간 끝, 45/90)** = 권위값 `Match.liveBasePeriod`(FotMob `liveTime.basePeriod`) 우선.
  없으면 라벨 선행 숫자로 폴백(`"45+1"`→45, `"90+2"`→90).
  > base를 라벨로 추측하면 1차 스토피지를 후반으로 오판할 수 있어 `liveBasePeriod`가 권위값.
- **N(부여 추가시간)** = `Match.liveAddedTime`(FotMob 라이브값) 우선, 없으면 하프별
  `firstHalfAddedTime`/`secondHalfAddedTime`(`AddedTime` 이벤트 `time=45/90`에서 파생).
  **프론트가 N을 임의로 증가시키지 않고 DB값 그대로** 쓴다.

### 전반 추가시간이 "안 보이던" 이유 & 보정

전반 스토피지는 보통 1~2분으로 짧다. **시계 의도적 지연(`LIVE_CLOCK_LAG_SECONDS`)이 크면**
표시 시계가 `45:00`에 닿기 전에 HT가 와서 `+N` 창이 거의 없다.

- `constants.js`의 `LIVE_CLOCK_LAG_SECONDS`: 시계는 halfs로 정확한데 골·스코어는 폴링으로 늦게 들어와
  시계가 데이터보다 앞서므로, 시계를 그만큼 늦춰 골 표시와 동기화한다.
- 스크래퍼가 `/api/data/matchDetails`로 바뀌어 데이터가 빨라져서 **45초 → 20초로 축소**(현재값).
  더 줄이면 시계가 골보다 앞설 수 있으니 20~25 사이에서 조정.

---

## 4. 폴링 주기 (프론트/백엔드)

데이터가 실제로 빨리 들어오려면 **각 단의 폴링**이 맞물려야 한다:

| 단 | 주기 | 역할 |
|---|---|---|
| Python 스크래퍼 | 요청 시 크롤(+ 300~500ms throttle) | 신선 데이터 제공 |
| 백엔드 라이브 빠른 폴링(`syncLive`) | IN_PLAY당 **20초** + 지터 | 이벤트·스코어·HT·종료를 DB에 반영 |
| 백엔드 풀폴링(`syncMatch`) | 3분 | 라인업·평점 등 무거운 갱신 |
| 백엔드 시계 재앵커(`refreshLiveClock`) | 11분 | 드리프트 보정(앵커가 30분↑ 어긋나면 즉시) |
| **프론트(App)** | **평상시 20초 / 하프 경계 근처 10초** | `selectedMatch` 갱신 → 시계/HT 재반영 |

### 프론트 적응형 폴링 (App.jsx)

```js
// 하프 경계(스토피지 진입 44'+/89'+ 또는 정지=HT) 근처면 10초로 좁힌다.
function isLiveNearBoundary(match) {
  const raw = match.raw || match;
  if (raw.status !== "IN_PLAY") return false;
  if (raw.liveStartedAtMs == null || raw.clockRunning === false) return true; // HT 등 정지 → 재개 빨리
  const base = raw.liveBasePeriod === 90 ? 90 : 45;
  const minute = Math.floor((Date.now() - raw.liveStartedAtMs) / 60000);
  return minute >= base - 1;
}
const interval = pollFast ? 10000 : 20000;
```

- App의 `loadMatches`가 매 폴링마다 `selectedMatch`를 **새 목록에서 id로 다시 찾아** 교체하므로,
  상세 화면의 시계/HT 데이터도 같은 주기로 갱신된다.

---

## 5. 손잡이 (튜닝 포인트)

| 값 | 위치 | 효과 |
|---|---|---|
| `LIVE_CLOCK_LAG_SECONDS` | `frontend/src/utils/constants.js` | 시계 의도적 지연(작을수록 실시간, 너무 작으면 골보다 앞섬) |
| `pollFast ? 10000 : 20000` | `frontend/src/App.jsx` | 경계 근처/평상시 프론트 폴링 주기 |
| `fotmob.poll.live.interval-seconds` | `application.yml` | 백엔드 IN_PLAY 재조회 간격(낮추면 빠르지만 크롤 부하↑) |
| `fotmob.poll.clock-ms` | `application.yml` | 시계 재앵커 주기 |

---

## 6. 자주 겪는 함정

- **시계가 `"45+501"`/`"554:50"`처럼 깨짐** → 서버 JVM이 UTC인데 앵커를 KST로 안 저장. `liveStartedAtMs`(절대 epoch) 우선 사용 + 컨테이너 `TZ=Asia/Seoul`로 방어.
- **HT에서 시계가 안 멈춤** → FotMob이 HT에 `liveSeconds=null`을 줘서 앵커를 못 지우면 직전 앵커로 계속 흐름. `isClockPaused`(숫자 없는 라벨)이면 앵커를 비워 해결.
- **HT가 10분 늦음** → 위 2절. 스크래퍼 신선도(데이터) 문제지 계산 버그 아님.
