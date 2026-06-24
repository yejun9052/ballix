# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**Ballix**는 풀스택 축구 경기 예측 앱입니다. 저장소는 세 개의 독립 하위 프로젝트로 구성되며, **모든 축구 데이터는 FotMob에서 옵니다**(과거 football-data.org는 제거됨).

| 하위 프로젝트 | 스택 | 루트 | 포트 |
|---|---|---|---|
| REST API | Java 21, Spring Boot 4, Gradle, MySQL | `backend/` | 8080 |
| 웹 UI | React 18, Vite, react-router-dom, axios (JSX, TypeScript 없음) | `frontend/` | 5173 |
| FotMob 스크래퍼 | Python 3.12, Playwright, FastAPI | `fotmob_scraper/` | 8800 |

환경은 Windows + PowerShell입니다. gradlew는 `.\gradlew.bat` 형태로 호출하세요.

> **`frontend/`가 실제 웹 UI다** — React 18 + react-router-dom + axios. `src/pages/`(화면), `src/components/`(common·admin·lineup·match·worldcup), `src/hooks/`, `src/utils/`로 구성되고, `App.jsx`가 전역 상태(로그인·경기목록·선택경기·화면 스위칭)를 들고 화면을 라우팅한다. **모든 백엔드 호출은 `src/api/`(axios) 모듈을 거친다**(직접 `fetch` 금지) — 도메인별 파일(`match.js`/`user.js`/`prediction.js`/`admin.js`…)이 `index.js`의 axios 인스턴스를 공유한다. `index.js` 인터셉터가 **성공 응답에서 `CommonResponse.data`만 언래핑**해 반환하고(호출부는 `await getX()`로 바로 payload 획득), 실패는 `msg`로 `toast.error`(`react-hot-toast`, `main.jsx`에 `<Toaster/>` 마운트). 예상된 에러(예측 전 400/404 등)는 호출 시 `{ skipErrorToast: true }`로 토스트 억제. baseURL은 현재 `http://localhost:8080` 하드코딩(`vite.config.js`에 `/api`·`/oauth2` → :8080 프록시도 있음). **자세한 규약은 `frontend/API_GUIDE.md` 참고.**
>
> (옛 관리자/테스트 UI였던 `test-api/`는 제거됨 — 모든 웹 작업은 `frontend/`에서 한다.)

## 핵심 아키텍처 (먼저 이해할 것)

데이터 흐름은 한 방향입니다:

```
FotMob ──Playwright──> Python FastAPI(:8800) ──HTTP──> Spring Boot(:8080) ──> MySQL
                          (stateless 수집)          (스케줄·DB·폴링 소유)        │
                                                                          React(:5173)
```

- **백엔드는 FotMob을 직접 긁지 않는다.** 반드시 Python FastAPI(`fotmob_scraper/api.py`)를 HTTP로 호출한다. Python은 stateless 수집기이고, 일정·DB·폴링·스케줄은 전부 Java가 소유한다.
- **Python 서비스가 필요한 이유**: FotMob은 공개 API가 없고 직접 호출(`/api/matchDetails`)을 차단한다. Next.js SSR이라 Playwright로 `__NEXT_DATA__`를 추출하거나 페이지 컨텍스트에서 fetch한다. slug 없이 접근할 땐 `https://www.fotmob.com/match/{id}`(단수)를 쓴다 — `/matches/{id}`(복수)는 빈 페이지를 준다.
- **엔티티 식별 키는 FotMob ID**: `Match.fotmobMatchId`, `Team.fotmobTeamId`, `Competition.fotmobLeagueId`가 upsert 키다. FotMob 일정에 matchId가 처음부터 들어오므로 **별도 매핑 단계가 없다**(매핑 코드는 삭제됨).
- **matchTime은 한국시간(KST = UTC+9)으로 저장**한다.
- **idempotent 동기화**: 라인업·이벤트·순위는 `deleteByMatchId/CompetitionId → saveAll`로 통째로 교체한다.
- **DB-first lazy-cache**: 순위(`FotmobStandingService.getStandings`)·경기상세(`FotmobQueryService.getView/getLineup/getEvents`)는 조회 시 DB가 비어있으면 **그 자리에서 1회 크롤+저장 후 반환**하고 이후엔 DB만 읽는다. 단 라인업은 킥오프 `LINEUP_LAZY_WINDOW_MINUTES`(60분) 전부터만 lazy 크롤(미래 경기 헛크롤 방지) + `lineupSynced` 플래그로 1회만.
- **응답 직렬화**: 대체로 엔티티를 그대로 직렬화하되 **예측·유저 응답은 DTO**(`PredictionView`/`UserView`/`RankView`)로 내려 User(email 등) 노출을 막는다. 공통 부모 `BaseTimeEntity`의 `@JsonIgnoreProperties({"hibernateLazyInitializer","handler"})`가 엔티티 직렬화 시 지연로딩 프록시 노이즈를 제거한다. `spring.jpa.open-in-view`(기본 on) 덕에 컨트롤러 직렬화 시점까지 LAZY 연관(`Match.homeTeam` 등)이 로드된다.

### FotMob 동기화/폴링 (`com.example.backend.fotmob`)

패키지 구조: 서비스·클라이언트·컨트롤러(`Fotmob*`)는 `fotmob` 루트에 두고, **엔티티+레포는 도메인별 하위 패키지**에 둔다 — `fotmob.lineup`(LineupPlayer), `fotmob.matchevent`(MatchEvent), `fotmob.league`(LeagueStanding). 엔티티를 옮길 땐 package 선언만 바꾸면 되고 DB 테이블명은 `@Table`로 고정돼 영향 없다.

**HTTP-in-transaction 방지 패턴**: `FotmobSyncService`와 `FotmobScheduleService` 모두 `@Lazy @Autowired private XxxService self`로 자기 자신의 스프링 프록시를 주입한다. HTTP 크롤(네트워크 I/O)은 트랜잭션 밖에서 수행하고, DB 저장(`applySyncResult`/`persistSchedule`)만 `self.xxx()` 경유로 독립 트랜잭션에서 커밋한다 — `@Transactional` 자기호출(self-invocation)은 프록시를 우회해 무시되기 때문. 새 sync 서비스를 만들 때 이 패턴을 따라야 한다.

`FotmobPollScheduler`가 다섯 가지 `@Scheduled` 작업을 돌린다:

1. **일정 동기화** (부팅 10초 뒤 + 30분마다): 두 방식을 함께 돌린다 — (a) `syncRange()`가 `fotmob.schedule.leagues`(날짜 ±N일 방식, 기본 친선 `114`)를 과거/미래 N일치 날짜별로 upsert, (b) `syncFullLeagues()`가 `fotmob.schedule.full-season-leagues`(시즌 전체 일정 방식, 기본 월드컵 `77`)를 Python `/league/{id}/fixtures`로 **결승까지 전 경기 한 번에** upsert. 날짜 ±N일 방식만 쓰면 먼 미래(결승 등)를 못 가져오므로 토너먼트는 (b)로 받는다. 리그 필터는 Python `build_schedule`에서 적용(**토큰 숫자=leagueId 정확매칭, 문자=leagueName 부분매칭** — 여자/U21/클럽 파생 리그가 같은 이름을 써서 이름 매칭으론 못 거름 → 숫자 ID 권장). **기존 경기 upsert 시 팀(homeTeam/awayTeam)도 갱신**한다 — 토너먼트 대진이 확정되면 미정 플레이스홀더("Winner SF 1")가 실제 팀으로 자동 반영(`Match.updateTeams`). 일정 데이터엔 구장 정보가 없으므로 저장 후 `enrichScheduledVenues()`가 **venue 없는 예정 경기 중 향후 14일 이내만** 상세(`/match/{id}`)를 추가 크롤해 `Match.venue`를 1회 채운다(멱등·윈도우 제한 — 먼 경기는 가까워지면 채움). 진행/종료 경기 venue는 폴링이 채운다. 저장 후 `enrichTeamTranslations()`가 **번역 안 된(`Team.nameKo` 비어있는) 팀 이름을 한 번에 모아** `TranslationService`(`ai` 패키지, Gemini 구조화출력)로 한국어로 번역해 `Team.nameKo`에 채운다 — **번역 전=`Team.name`(FotMob 영문), 번역 후=`Team.nameKo`(한국어) 둘 다 보관**. `enrichScheduledVenues`와 같은 패턴: Gemini HTTP는 트랜잭션 밖에서 한 번에 묶고 저장만 `self.applyTeamTranslation`(독립 트랜잭션), 번역 대상 없으면 Gemini 미호출(멱등). 원본 이름이 바뀌면(미정 플레이스홀더→실제 팀) `Team.updateInfo`가 `nameKo`를 비워 재번역. 호출당 최대 `TRANSLATE_BATCH_MAX`(80)팀. `ai.translation.enabled`로 on/off. **`fotmob → ai` 의존**(단, `TranslationService`는 `GeminiClient`만 의존해 bean 순환 없음).
2. **데이터 폴링** (1분 tick, `interval-minutes` 간격으로 게이트): 킥오프 `lineup-window-minutes`분 전부터 `FotmobSyncService.syncMatch()`로 라인업·평점·이벤트·스코어·**포메이션**(`Match.homeFormation/awayFormation`)·**선수 피치좌표**(`LineupPlayer.posX/posY`)·**전·후반 추가시간**(`Match.firstHalfAddedTime/secondHalfAddedTime` — Python이 FotMob `type:"AddedTime"` 이벤트 `time=45/90`에서 추출, 값 있을 때만 갱신)을 갱신. 라인업이 뜨면 `markLineupSynced`, 종료되면 `markFinalized` + 해당 리그 순위(`FotmobStandingService`) 갱신.
3. **라이브 빠른 폴링** (`live.tick-ms`, 기본 2초마다 깨어남 + 경기별 `live.interval-seconds`(기본 20초) + **랜덤 지터 `live.jitter-min/max-ms`(300~500ms)** 게이트): IN_PLAY 경기만 `FotmobSyncService.syncLive()`로 **이벤트·스코어·status·하프타임(HT)·종료(FT)**를 초 단위로 즉시 반영(하프타임/골/종료가 분 단위 풀폴링보다 빨리 뜨게 하는 게 목적). **시계 앵커는 `updateLiveIfAbsent`로 1회만 설정(재앵커 X)** — 흐르는 시계는 안 흔들고 HT 라벨/앵커정리·이벤트·종료만 빠르게. 종료 감지 시 `applySyncResult`와 **공유하는 `finalizeIfFinished()`**(확정+예측채점은 트랜잭션 안 DB작업)를 호출하고, **무거운 후속작업(ntfy 종료알림·리그 순위 HTTP 크롤)은 `FinalizeOutcome`으로 넘겨 커밋 후 `runPostFinalize()`에서** 트랜잭션 밖에서 수행한다(HTTP-in-transaction 방지). 매 조회 후 다음 due = `지금 + interval-seconds + 랜덤(300~500ms)`로 재계산해 고정 주기를 피한다. `live.enabled`로 on/off. **동시성**: `poll`·`liveTick`·시계갱신이 같은 경기를 동시에 쓰지 않도록 `FotmobSyncService`가 matchId 스트라이프 락(32개)으로 트랜잭션 적용 구간만 직렬화한다(HTTP 크롤은 락 밖).
4. **라이브 시계 재앵커** (`clock-ms`, 기본 11분): IN_PLAY 경기만 `FotmobSyncService.refreshLiveClock()`로 진행시간/스코어만 가볍게(라인업·이벤트 안 건드림) **재앵커**해 누적 드리프트 보정. 아래 "라이브 시계" 참고.
5. **종료경기 상세 선반영(prewarm)** (`prewarm.tick-ms`, 기본 3분): 일정 동기화로 스코어만 들어오고 상세 크롤이 실패한 종료경기(`FINISHED && lineupSynced=false`, 최근 `since-days`일)를 **유저가 열기 전에 미리** `syncMatch`로 채운다 — request-time lazy 크롤(느림/타임아웃, Render free 등)을 회피하는 게 목적. **IN_PLAY 경기가 하나라도 있으면 통째로 건너뛴다**(라이브 크롤 지연 방지). 한 tick당 `limit`(기본 3)건만, 경기별 **인메모리 쿨다운**(`cooldown-hours`, 기본 6h)으로 빈 라인업(친선 등) 경기 반복 크롤을 막는다(성공·실패 모두 기록). `findDetailBackfillTargets`는 관리자 수동 일괄보강(`POST /api/fotmob/details/backfill`)과 공유. **주의**: 선반영이 오래된 종료경기를 뒤늦게 finalize할 수 있으므로, "경기 종료" ntfy 알림은 **킥오프 `NOTIFY_END_RECENCY_HOURS`(6h) 이내일 때만** 보낸다(`finalizeIfFinished`의 `notifyEnd` — 늦은 종료 푸시 방지, 수동 보강도 함께 보호). `fotmob.poll.prewarm.{enabled,tick-ms,since-days,limit,cooldown-hours}` config.

폴링 주기(`interval-minutes`, 기본 3)는 `POST /api/fotmob/poll-interval?minutes=`로 런타임 변경 가능. **모든 `@Scheduled`는 `spring.task.scheduling.pool.size`(기본 4) 스레드풀에서 돌아 라이브 빠른 폴링(크롤로 수 초 점유)이 다른 폴링/일정 동기화를 막지 않는다**(기본 단일 스레드면 굶음).

**라이브 시계(진행 분/초) 아키텍처** — FotMob `/api/matchDetails` 직접호출은 404로 차단돼 **SSR 스냅샷(`__NEXT_DATA__`)** 만 읽을 수 있고, 이 값은 실제보다 몇 분 지연된다. 그래서 시계는 **앵커 방식**으로 흐른다:
- 폴링 시 `Match.liveStartedAt = 지금(KST) - 경과초`를 저장. 이건 고정된 실제 시각이라 **프론트가 `지금 - 앵커`를 초 단위로 매초 계산**해 클라이언트에서 흘린다(서버 부하 0). **앵커는 반드시 KST 벽시계로 저장**(`LocalDateTime.now(KST)`) — matchTime처럼. 서버 JVM이 UTC(도커)면 `now()`가 9시간 어긋나 `"45+501"`/`"554:50"`처럼 표시되던 버그가 있었다(→ docker-compose `TZ: Asia/Seoul`로도 방어).
- **경과초(liveSeconds)는 SSR `liveTime.long`이 아니라 `status.halfs`(하프 실제 시작시각)로 계산**한다(Python `_live_seconds_from_halfs`). FotMob SSR `liveTime.long`은 실제보다 **0~7분, 일정치 않게 지연**돼 고정 보정으론 못 맞춘다(빨랐다↔느렸다). halfs 시작시각은 고정 실제 이벤트라 `경과초 = 2700*후반여부 + (지금 - 해당하프시작)`이 지연 없이 정확. halfs 문자열 타임존이 모호해 `utcTime`(신뢰 UTC)과의 차이를 **15분 배수로 반올림**해 오프셋을 구하고, **SSR 값과 10분 이상 어긋나면 파싱오류로 보고 SSR로 폴백**(HT/연장/종료도 폴백). 덕분에 **프론트 SSR 보정값(`FOTMOB_SSR_DELAY_COMPENSATION_SECONDS`)은 0**.
- **프론트는 `Match.liveStartedAtMs`(절대 epoch millis, `@Transient` 게터가 `liveStartedAt`을 KST로 해석해 변환)를 우선 사용**해야 한다 — `Date.now() - liveStartedAtMs`는 **브라우저/서버 타임존과 무관하게 정확**. `liveStartedAt`(타임존 없는 LocalDateTime 문자열)은 호환용으로 남았지만 브라우저 로컬로 파싱돼 KST 아닌 환경에서 어긋날 수 있다.
- **재앵커는 11분 `refreshLiveClock`만** 한다. 3분 풀폴링(`syncMatch`)·초 단위 라이브 빠른 폴링(`syncLive`) 둘 다 `updateLiveIfAbsent`로 **앵커가 없을 때만 1회 설정**(IN_PLAY 아니면 정리) — 잦은 재앵커가 시계를 뒤로 스냅하는 것을 방지(그래서 라이브 빠른 폴링을 20초로 돌려도 시계는 안 흔들린다). FotMob SSR도 ~10분 주기 갱신이라 11분이 맞다. **단, 기존 앵커가 경과초와 `ANCHOR_RESYNC_THRESHOLD_SEC`(30분)보다 크게 어긋나면 즉시 재앵커**(9시간 타임존 오류 같은 큰 오차만 교정, SSR 지연 ~10분은 임계값 아래라 무시) — 배포 후 진행 중 경기가 11분 안 기다리고 다음 폴링에 자가교정된다.
- `liveTime` 라벨은 `"67'"`/`"45+2'"`(추가시간)/`"HT"`(하프타임). **HT 등 숫자 없는(정지) 라벨이면 `updateLive`/`updateLiveIfAbsent`가 `liveStartedAt=null`로 비운다**(`isClockPaused`) — FotMob이 HT에 `liveSeconds=null`을 줘서 앵커를 못 지우면 프론트가 HT 직전 앵커로 계속 시계를 흘리는 버그가 있었기 때문. 후반 재개 시 숫자 라벨이 오면 앵커 재설정. 프론트는 `liveStartedAt`이 없으면 시계를 멈추고 라벨만 표시.
- **추가시간 표기**: 정규시간은 `mm:ss`로 흐르고, 스토피지(`minute >= base`)에 들어가면 **시계는 계속 `mm:ss`로 흐르면서 뒤에 부여 추가시간을 `"+N"` 배지로 붙인다**(예 `"92:30 +5"`). N은 **프론트가 증가시키지 않고 DB값 그대로** — `Match.liveAddedTime`(FotMob `liveTime.addedTime`) 우선, 없으면 `firstHalfAddedTime`/`secondHalfAddedTime`(AddedTime 이벤트 파생). **base(45/90)는 권위값 `Match.liveBasePeriod`(`liveTime.basePeriod`)로 판정**(라벨 숫자 추측 금지 — 1차 스토피지를 후반으로 오판해 깨졌었음). 셋 다 `updateLiveMeta`로 IN_PLAY만 채움. 과거 `90+1'→90+n'`처럼 프론트가 N을 임의 증가시키던 방식은 제거.
- **라이브 시계 의도적 지연**(`LIVE_CLOCK_LAG_SECONDS`, 프론트 `constants.js`, 기본 45초): 시계는 halfs로 실시간 정확한데 골·스코어는 폴링(20초)+SSR로 늦게 들어와 시계가 데이터보다 앞서므로, 시계를 그만큼 늦춰 골 표시와 동기화한다(정확도 소폭 희생). 너무 크면 시계가 눈에 띄게 느려짐.

### 예측 도메인 (`com.example.backend.prediction`)

`MatchController`/`MatchService` 패턴을 그대로 따른 예측 저장/조회 + 자동 채점.

- 엔드포인트: `predict?matchId=&predictedWinner=`(저장/수정), `myPrediction`, `findByMatch?matchId=`, `ratio?matchId=`(예측 분포 %) — **전부 로그인 필요(쿠키 동봉)**. 응답은 `PredictionView` DTO(User 비노출).
- 예측값은 `Winner` enum(`HOME_TEAM`/`AWAY_TEAM`/`DRAW`) — **`Match.winner`와 같은 어휘**라 채점 때 `.name()`으로 그대로 비교. 잘못된 값은 enum 바인딩 실패로 거절.
- 가드(순서대로): 비로그인 → 없는 경기 → **예측 허용 리그 아님**(`prediction.allowed-leagues` config, 기본 `77`=월드컵. 하드코딩 아님) → 킥오프 지남.
- `ratio`는 **본인이 예측한 경기만** 조회 가능(예측 전이면 거절) → 분포 노출이 선택을 편향시키지 않게.
- **자동 채점 경로는 두 가지** — 둘 다 `PredictionService.gradeMatch()`를 호출하며 `Prediction.isGraded()`로 멱등(중복 집계 방지):
  1. `FotmobSyncService.applySyncResult()` → 폴링으로 종료 감지 시 즉시 채점.
  2. `FotmobScheduleService.persistSchedule()` → 일정 동기화 중 이미 FINISHED 된 경기를 발견하면 채점(폴링 창 밖에서 끝난 경기 커버).
- 이 때문에 `fotmob → prediction` 단방향 의존이 있다.
- **포인트제(역배 가중)**: 채점 시 `computePoints()`가 **그 경기의 최초 AI 승률(`Match.aiInitialHome/Draw/AwayPct` — 킥오프 전 첫 예측, 없으면 실시간 `aiHomePct/...`로 폴백)** 순위로 차등 점수 — 실시간 `ai*Pct`는 종료 무렵 실제 결과로 쏠려 역배 판정이 무의미해지므로 **역배/정배 판정은 최초 예측 기준** — 유저가 고른 결과보다 AI 확률이 높은 결과 개수(`higher`, 0~2)로 `500 * 2^higher` = 정배(1위) 500점 / 중간(2위) 1000점 / 최대 역배(최저확률) 2000점, 틀리면 0점. **AI 예측 없는 경기는 적중 시 정배와 동일한 일괄 500점**. 획득 점수는 `Prediction.earnedPoints`에 기록하고 `User.scorePrediction(correct, points)`가 누적 `User.score`에 더한다 → `prediction → ai 데이터(Match)` 참조. 적중수/적중률(`correct_count`)도 그대로 유지(같이 표시).

### 유저/리더보드 (`com.example.backend.user`)

`UserController`/`UserService`(MatchController 스타일). `GET /api/user/me`(로그인, 내 전적+`score`+적중률+`role`), `PUT /api/user/me/name?name=`(로그인, 본인 닉네임 변경 — 2~20자·중복 비허용), `GET /api/user/leaderboard`(공개, **누적 포인트 `score` 내림차순** 랭킹). 응답은 `UserView`/`RankView` DTO. 집계 원천(`User.score`/`correct_count`/`matches_played`)은 위 예측 채점이 갱신한다.

**관리자 판별은 `role` 단일 기준** — 프론트는 `me()`의 `role == "ADMIN_USER"`로 관리자 UI 노출을 판단하고, 백엔드 관리자 엔드포인트는 전부 `@PreAuthorize("hasRole('ADMIN_USER')")`로 보호한다(과거 `ai.admin-emails` 화이트리스트·`UserView.admin` 플래그·`AdminGuard`는 제거됨).

**유저 관리(관리자)** — `GET /api/admin/users` · `PUT /{id}/role` · `PUT /{id}/status?active=&message=`. **정지(`active=false`) 시 `message`로 안내문을 함께 저장**(`User.banMessage`) — 정지된 유저가 로그인하면 `OAuth2SuccessHandler`가 `/home?error=banned&msg=<URL인코딩>`로 전달, 정지 해제 시 `activate()`가 메시지도 정리. 본인 권한/계정상태는 변경 불가.

### 공지사항 (`com.example.backend.notice`)

`Notice` 엔티티 + CRUD + **게시 예약**. **조회는 공개, 작성·수정·삭제는 `@PreAuthorize("hasRole('ADMIN_USER')")`** 보호.
- **게시창**: `publishAt`(게시 시각, null=즉시) ~ `expireAt`(내림 시각, null=무기한). **배치 없이 공개 조회 쿼리(`findVisible`)가 현재 시각으로 필터** — 시각이 되면 자동으로 보이고/내려간다. 공개 단건 조회도 게시창 밖이면 404(예약 공지 유출 방지).
- 조회(공개): `GET /api/notice`(게시 중만, 최신순 기본 8건) · `GET /api/notice/{id}`
- 관리(ADMIN_USER): `GET /api/admin/notice`(전체 — `status`=SCHEDULED/ACTIVE/EXPIRED) · `POST` · `PUT /{id}` · `DELETE /{id}` — 본문 `{title, content, publishAt?, expireAt?}`(ISO-8601). 수정 시 publishAt/expireAt는 보낸 값으로 교체라 `expireAt=now`로 즉시 내릴 수 있다.

### 댓글 (`com.example.backend.comment`)

경기별 댓글. `Comment` 엔티티(`user`/`match` LAZY ManyToOne + `content` ≤500자) + `CommentView` DTO(User 비노출, `mine`=현재 유저가 작성자인지). **조회는 공개, 작성·삭제는 로그인 필요**(`PredictionService`와 동일하게 `@AuthenticationPrincipal Long userId`를 받아 서비스에서 `notLogin` 검증 — `@PreAuthorize` 아님). **삭제는 본인 또는 관리자**(`comment.user.id == userId || user.role == ADMIN_USER`, 서비스에서 판정). 엔드포인트: `GET /api/match/{matchId}/comments`(공개, 최신순 기본 10) · `POST /api/match/{matchId}/comments`(본문 `{content}`) · `DELETE /api/comments/{commentId}`. `comment → user/match` 단방향 의존. 프론트는 `DetailScreen`의 `CommentSection`(+`api/comment.js`)이 표시.

### AI 기능 (`com.example.backend.ai`) — Google Gemini

승률 예측 + 골 요약. 모델은 `ai.gemini.model`(기본 `gemini-3.1-flash-lite`), 키는 `ai.gemini.api-key`. `GeminiClient`가 별도 SDK 없이 `generateContent` REST를 RestClient로 호출(429/503 자동 재시도). **이 도메인은 `ai → fotmob`(FotmobClient/Standing) 의존이 있다.**

- **승률 예측 + 예상 스코어** (`AiPredictionService`, `POST /api/admin/ai/predict?matchId=&force=`): **관리자만 "생성"**(`@PreAuthorize ROLE_ADMIN_USER`), 결과 조회는 누구나(값이 `Match`에 저장돼 일반 조회 응답에 포함). 입력 다이제스트 = **FIFA 랭킹(보조) + 리그 순위 + 최근 폼**(전부 DB에 있는 데이터, 추가 크롤 X). Gemini structured-output(JSON)으로 받아 **합 100·1% 단위**로 정규화해 `Match.aiHomePct/aiDrawPct/aiAwayPct`에 저장 + **예상 스코어 `aiHomeScore/aiAwayScore`**(0~9 클램프, 확률 최고 결과와 방향 어긋나면 보정). `predictionEnabled=true`가 되어 `allMatch`에서 최상단 정렬(`findAllByOrderByPredictionEnabledDescMatchTimeAsc`). 멱등(`aiPredictedAt != null`이면 force 없이는 재호출 안 함).
- **실시간 승률 갱신** (`AiLivePredictionScheduler`): `predictionEnabled && IN_PLAY` 경기를 `predict(matchId, force=true)`로 재예측. **다이제스트가 IN_PLAY면 현재 스코어·경과시간을 주입**(`buildDigest`)해 남은 결과 확률을 갱신하고 기존 값을 덮어쓴다. **트리거는 벽시계 주기가 아니라 킥오프 기준 경과시간 `interval-minutes`(기본 15분) 간격** — 경과 15·30·45·60·75·90분 경계를 넘을 때 1회 재예측. **하프타임 등 시계 정지 구간은 제외, 전·후반(시계가 흐를 때)에만 동작** — `Match.isClockRunning()`(IN_PLAY && `liveStartedAt != null`)로 판별하고 경과분은 `liveStartedAt` 앵커로 계산. 스케줄러는 `tick-ms`(기본 1분)마다 깨어나 경과분을 `interval-minutes` 버킷으로 나눠 경계 통과를 검사하고, 경기별 마지막 버킷을 메모리에 들되 처음 본 경기는 현재 버킷만 기록(재시작/중간 진입 시 즉시 재예측 방지). `ai.live-prediction.{enabled,interval-minutes,tick-ms}` config. 대상이 '관리자가 켠 + 진행 중 + 전·후반'으로 한정돼 Gemini 호출이 과하지 않다. **런타임 on/off**는 `GET /api/admin/ai/live-prediction`(공개, `{enabled,intervalMinutes,liveTargets}`)·`POST /api/admin/ai/live-prediction?enabled=`(관리자)로 — `enabled`가 `volatile`이라 즉시 반영(재시작 시 yml 값으로 초기화). poll-interval과 같은 패턴.
- **골 요약** (`AiSummaryService`, `GET /api/match/{id}/ai/summary?force=`, 공개): **종료 경기**만. 1순위로 **FotMob 라이브티커(ltc) 골 해설**(영문)을 `FotmobClient.getCommentary()`로 가져와 Gemini가 **한국어 해설 말투로 번역·요약**, 없으면 저장된 `MatchEvent`로 폴백. DB-first lazy(없으면 1회 생성 후 `Match.aiSummary`에 캐시). **생성 실패 시 5분 쿨다운** — 이 시간 안에 재요청이 와도 Gemini를 재호출하지 않고 빈 값을 반환(ltc 크롤+재시도 폭주 방지).
- **FIFA 랭킹**: `resources/fifa-rankings.json`(팀명→순위, 수정 쉬운 근사 스냅샷)을 `FifaRankingService`가 부팅 시 로드. 팀명은 FotMob 표기와 매칭.

### 인증 흐름 (기존 유지)

1. 프론트가 `/oauth2/authorization/google`로 리다이렉트. 세션이 **STATELESS**라 OAuth2 인가요청 state를 서버 세션 대신 **쿠키에 저장**한다(`HttpCookieOAuth2AuthorizationRequestRepository`) — 클라우드(다중 인스턴스/콜드스타트)에서 콜백 시 state 유실 방지.
2. **Google은 OIDC라 `CustomOidcUserService`(OidcUserService 확장)가 프로필로 `User` upsert**한다 — `CustomOAuth2UserService`는 비-OIDC 제공자용 경로라 Google 로그인엔 호출되지 않는다(둘 다 등록돼 있으니 수정 시 OIDC 쪽을 건드릴 것).
3. `OAuth2SuccessHandler`가 **새 세션(`User.sessionId`=UUID)을 발급·저장**하고 JWT(`sid` 클레임 포함)를 HTTP-only 쿠키로 설정한 뒤 **`app.frontend-base-url`(기본 `http://localhost:5173`)로 리다이렉트**. 정지 계정이면 토큰 발급 거부 후 `{frontend-base-url}/?error=banned[&msg=]`.
4. `JwtFiller`(서블릿 필터)가 매 요청마다 쿠키를 검증해 `SecurityContext`에 등록(토큰 없으면 익명 통과).

> **크로스도메인 배포 주의** — CSRF는 메서드 레퍼런스로만 disable(`AbstractHttpConfigurer::disable`, 람다형은 무시돼 POST가 302됨). CORS Origin은 `app.cors.allowed-origins`(쉼표구분, 기본 `http://localhost:*`)로 주입. 프론트(Vercel)와 백엔드가 다른 도메인이면 쿠키 전송을 위해 `app.cookie.same-site=None` + `app.cookie.secure=true`(HTTPS)로 줘야 한다(기본 `Lax`/`false`는 동일 도메인·로컬용). 셀프호스트 배포 절차는 `docs/LINUX_SELFHOST_DEPLOY.md` 참고.

**동시 로그인 차단(새 로그인이 기존을 밀어냄)** — 로그인할 때마다 `sessionId`를 새로 발급하므로 JWT의 `sid`는 마지막 로그인 기기 것만 DB와 일치한다. `JwtFiller`는 토큰 `sid` ≠ `User.sessionId`면 쿠키를 만료시키고 **`401 {code:"SESSION_REPLACED"}`** 로 즉시 응답(프론트 경고창용). DB `sessionId=null`(구버전 세션)이면 검사 생략 — 재로그인 시 sid가 부여되며 활성화. 정지·삭제 계정 차단(쿠키 삭제 후 익명 통과)은 종전대로.

컨트롤러에서 **현재 로그인 유저는 `@AuthenticationPrincipal Long userId`로 받는다** — JwtFiller가 principal에 `userId`(Long)를 넣기 때문(User 객체 아님).

**전역 예외 처리**: `global/exceptopn`에 `BusinessException`(상태코드 보유) 기반 커스텀 예외 계층 — `BadRequestException(400)`/`NotFoundException(404)`/`UnauthorizedException(401)`. `GlobalExceptionHandler`(`@RestControllerAdvice`)가 이들을 `CommonResponse.fail(msg)` + 해당 상태코드로, 그 외 일반 `RuntimeException`은 400 안전망으로 변환한다. **검증 실패는 이 커스텀 예외로 던질 것**(`throw new RuntimeException`은 코드베이스에서 제거됨) — 핸들러가 없으면 예외가 500 → `/error` 포워드 → (보안상 `/error` 미허용) → **OAuth 리다이렉트로 둔갑**한다.

## 개발 실행

### 방법 A — 도커 한 방 (DB + Python + 백엔드 한 번에)

루트 `docker-compose.yml`이 **MySQL + Python 스크래퍼 + 백엔드**를 한 번에 올리고 내린다(프론트는 Vite 개발서버라 제외). 서비스 간 주소는 컨테이너 네트워크 이름(`mysql`/`fotmob`)으로 자동 연결되고, `application.yml`의 localhost 값은 compose의 환경변수(`SPRING_DATASOURCE_URL`/`FOTMOB_API_BASE_URL`)가 덮어쓴다.

```powershell
cd C:\ballix
docker compose up -d --build        # 전부 빌드+기동 (DB·fotmob healthy 후 backend 시작)
docker compose logs -f backend      # 로그
docker compose down                 # 한 번에 내림 (DB 볼륨 유지)
docker compose down -v              # DB 볼륨까지 삭제(완전 초기화)

# 프론트는 그대로 로컬에서
cd C:\ballix\frontend; npm install; npm run dev
```

> ⚠️ 3306을 이미 점유한 기존 컨테이너/로컬 MySQL이 있으면 충돌한다 — 옛 `backend/docker-compose.yml`로 띄운 mysql 컨테이너(`backend`)를 쓰고 있었다면 `docker stop backend` 후 위 명령을 쓴다. 도커 DB는 별도 볼륨(`ballix_mysql-data`)이라 기존 데이터는 안 넘어오지만, 부팅 시 일정 동기화 + lazy 크롤로 다시 채워진다.

### 방법 B — 개별 프로세스 (4개, 순서 중요)

백엔드의 일정 동기화가 동작하려면 MySQL과 Python 서비스가 **먼저** 떠 있어야 한다.

```powershell
# 1. MySQL (DB만 도커로)
cd C:\ballix\backend; docker compose up -d

# 2. Python FotMob 서비스 (전용 venv 사용 — 시스템 python 아님)
cd C:\ballix\fotmob_scraper; .venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8800

# 3. 백엔드
cd C:\ballix\backend; .\gradlew.bat bootRun

# 4. 프론트
cd C:\ballix\frontend; npm install; npm run dev
```

### 기타 명령어

```powershell
# 백엔드 테스트
.\gradlew.bat test
.\gradlew.bat test --tests "com.example.backend.SomeTest"   # 단일 클래스
.\gradlew.bat compileJava                                    # 컴파일만 확인

# 프론트 (frontend/)
cd C:\ballix\frontend; npm run build ; npm run lint

# Python 스크래퍼 CLI (FastAPI와 별개, Excel 내보내기용)
.venv\Scripts\python.exe main.py <matchId>                   # output/*.xlsx
.venv\Scripts\python.exe main.py search "Korea" "Czechia" --comp "World Cup"
```

## 주요 API (백엔드)

- `GET /api/match/{id}/fotmob` · `/lineup` · `/events` — 경기별 라인업/이벤트 조회
- `POST /api/match/{id}/fotmob/sync` — 단일 경기 즉시 동기화(스케줄 대기 없이)
- `POST /api/fotmob/schedule/sync?pastDays=&futureDays=` , `.../sync/{YYYYMMDD}` — 일정 동기화 트리거
- `POST /api/fotmob/playoff/sync`(관리자) — 예상 브래킷(토너먼트 대진) 동기화 트리거. FotMob `playoff`(리그 상세 `/api/data/leagues`)에서 라운드별 예상 대진을 받아 **기존 토너먼트 경기에 `Match.stage`(라운드명)·`bracketOrder`(슬롯순서)·예상 팀(32강 한정)을 반영**(`FotmobScheduleService.syncPlayoffLeagues`). 일정 동기화가 `stage=null`로 덮으므로 **반드시 그 뒤에** 돈다(스케줄러도 `syncFullLeagues` 다음에 호출). 32강(`stage "1/16"`)만 실제 예상 팀(`tbd=false`)이고 16강 이후는 미정(placeholder, 단계만 채움). `fotmob.schedule.playoff-leagues`(비우면 `full-season-leagues` 따름)
- `POST /api/fotmob/teams/translate`(관리자) — 팀(나라) 이름 전체 재번역. `nameKo` 비어있는 팀만 골라 `TranslationService`로 번역(`FotmobScheduleService.translateMissingTeamNames`, 배치 반복·진척 없으면 종료). '전체 재번역' 버튼용
- `POST /api/fotmob/details/backfill?sinceDays=&limit=`(관리자) — 상세(라인업·이벤트) 누락 종료/진행 경기 일괄 보강. `lineupSynced=false`인 경기를 최신순 `limit`(기본 8)건 재크롤(`syncService.backfillMissingDetails`). 스케줄러 선반영(prewarm)과 대상 쿼리(`findDetailBackfillTargets`) 공유 — 둘 다 request-time lazy 크롤 타임아웃 회피용
- `GET /api/fotmob/standings/{competitionId}` , `POST .../sync` — 리그 순위(조별)
- `GET /api/fotmob/player-stats/{leagueId}`(공개) , `POST .../sync`(관리자) — 리그 개인 기록(득점왕/도움왕). **안정적인 `fotmobLeagueId`(예: 77)로 키잉**(내부 Competition PK는 환경마다 달라 불안정). `FotmobPlayerStatService`가 DB-first lazy + **TTL 3h**(기록은 경기 결과로 바뀌어 무기한 캐시 부적절)로 캐시, `PlayerStat`(table `player_stat`, `stat_type`=GOALS/ASSISTS)에 리그 단위 일괄 교체 저장. 프론트 **개인성적 탭**(`PlayerStatsScreen`, `WORLD_CUP_LEAGUE_ID`=77)이 득점왕/도움왕 표로 표시(`fotmobPlayerId`로 선수 사진 URL 직접 구성)
- `GET|POST /api/fotmob/poll-interval` — 폴링 주기 조회/변경(관리자)
- `GET /api/fotmob/preview/{fotmobMatchId}` — DB 미저장 미리보기(프록시)
- `GET /api/fotmob/player/{playerId}` — 선수 상세 정보(프로필 + 주 리그 시즌 스탯). DB 미저장 프록시(Python `/player/{id}`). 프론트 라인업에서 선수 클릭 시 모달로 표시. `fotmobPlayerId`로 조회.
- `POST /api/prediction/predict?matchId=&predictedWinner=` · `GET /api/prediction/{myPrediction,findByMatch?matchId=,ratio?matchId=}` — 예측·분포(로그인 필요)
- `GET /api/match/allMatch` · `/findByCompId?id=` · `/MatchDay?date=YYYY-MM-DD` · `/upcoming?compId=` — 경기 목록 조회(`upcoming`=미래 경기만, compId 옵션). **`MatchDay`는 DB-first lazy-crawl**(없는 날짜 조회 시 그 날짜를 즉석 크롤·저장 후 반환).
- `POST /api/admin/ai/predict?matchId=&force=`(관리자) · `GET /api/match/{id}/ai/summary?force=`(공개) — AI 승률 예측 / 골 요약
- `GET /api/user/me`(로그인, `score`·`role` 포함) · `PUT /api/user/me/name?name=`(로그인, 닉네임 변경) · `GET /api/user/leaderboard`(공개, **포인트순**) — 내 전적 / 랭킹
- `GET /api/notice`(공개, 게시 중만, 기본 8건) · `GET /api/notice/{id}` — 공지 목록/단건
- `GET|POST|PUT|DELETE /api/admin/notice`(ADMIN_USER) — 공지 CRUD + 게시 예약(`publishAt`/`expireAt`)
- `PUT /api/admin/match/{id}/replay?youtube=` · `DELETE .../replay`(ADMIN_USER) — 유튜브 다시보기 등록/해제(종료 경기만, videoId 또는 URL 입력). `Match.replayYoutubeId`로 직렬화 → 프론트가 `youtube.com/embed/{id}` 임베드
- `GET /api/match/{id}/highlight`(공개) — 종료 경기 하이라이트 유튜브 영상. **DB-first lazy** — `replayYoutubeId` 없으면 `MatchHighlightService`가 Python `/youtube/search`로 1회 검색해 가장 적합한 영상을 골라 `Match.replayYoutubeId`에 저장 후 반환. 수동 등록 영상이 있으면 우선(자동은 비어있을 때만). 검색 실패/후보 없음은 30분 쿨다운. 팀 검색어는 `"{home} vs {away} highlights"`. **선택은 채널 점수화** — 한국 방송사(KBS/SBS/MBC/JTBC/SPOTV/쿠팡 등) +100, **FIFA 공식 -200**(외부 임베드가 막혀있어 사실상 제외), highlight/하이라이트 키워드 +20, 팀명(마지막 단어) +8씩, 야구/농구 등 타종목 -100. 점수 높은 순으로 상위 5개까지 Python `/youtube/embeddable/{id}`(watch 페이지 `playabilityStatus.playableInEmbed`)로 **실제 임베드 가능 여부를 확인해 첫 가능 영상**을 고른다. `ai → fotmob`처럼 `match → youtube` 단방향 의존.
- `GET /api/admin/users`(ADMIN_USER, 기본 8건) · `PUT /api/admin/users/{id}/role?role=` · `PUT /api/admin/users/{id}/status?active=&message=` — 유저 목록·권한·계정상태 관리(정지 시 `message`=정지 안내문 저장)

> 프론트 연동용 전체 응답 스키마/예시는 루트 **`API_SPEC.md`** 참고(프론트엔드 담당자 전달용).

**Python 스크래퍼(`fotmob_scraper/api.py`) 엔드포인트**: `/match/{id}`(라인업·이벤트·평점·**liveTime/liveSeconds**·포메이션·posX/posY·**venue**=구장이름 `infoBox.Stadium.name`), `/player/{id}`(선수 상세 — 선수 페이지 `/players/{id}`에서 내부 API `/api/data/playerData` fetch, 실패 시 `__NEXT_DATA__` 폴백. `playerInformation`→`info[{label,value}]`, `mainLeague.stats`→`stats[{title,value}]`로 평탄화), `/schedule`, `/league/{id}/table`, `/league/{id}/player-stats?limit=`(득점왕/도움왕 — leagues raw의 `stats.players`에서 `goals`·`goal_assist` 카테고리를 찾아 각 `fetchAllUrl`(전체 랭킹 JSON)을 받아 상위 N명 반환, 실패 시 `topThree` 폴백), `/league/{id}/fixtures`(시즌 전체 경기 — 결승까지, `syncFullLeagues` 전용), `/league/{id}/playoff`(토너먼트 예상 브래킷 — 리그 상세 raw의 `playoff.rounds[].matchups[]`를 매치 단위로 평탄화, stage·drawOrder·tbd 포함, `syncPlayoffLeagues` 전용), `/commentary/{id}`(라이브티커 골 해설 — 골 요약용), `/search`, `/youtube/search?q=`(유튜브 동영상 검색 — 하이라이트 찾기용, `window.ytInitialData`에서 추출), `/youtube/embeddable/{id}`(영상 임베드 가능 여부 — watch 페이지 `playabilityStatus`). **선수 사진은 백엔드에 저장 안 한다** — 프론트가 `fotmobPlayerId`로 `https://images.fotmob.com/image_resources/playerimages/{id}.png` URL을 직접 구성.

**크롤 간격 제한(throttle)**: 모든 크롤 엔드포인트는 시작 시 `crawl_throttle()`(api.py)로 **직전 크롤과 300~500ms 랜덤 간격**(예: 352ms·421ms·367ms)을 강제한다 — 락 + 마지막 크롤 시각(`_last_crawl_ts`) 기반이라 동시/연속 요청이 몰려도 FotMob에 일정 텀을 두고 접근(차단 위험 ↓), 한가할 땐 지연 없음. 간격 범위는 `CRAWL_DELAY_MIN_MS`/`CRAWL_DELAY_MAX_MS`. **새 크롤 엔드포인트를 추가하면 본문 첫 줄에 `await crawl_throttle()`을 넣을 것.**

**메모리 절감(무료 512MB OOM 방지)**: ① 공유 컨텍스트에 `context.route`로 **페이지 렌더 전용 리소스(이미지·폰트·CSS·미디어)와 서드파티 광고·트래커 요청을 abort**한다 — 우리가 쓰는 데이터는 전부 same-origin `/api/data/*` fetch + HTML 내장 `__NEXT_DATA__`라 렌더 리소스가 불필요(스크립트·문서·XHR은 통과시켜 LIVE-FETCH/XHR-CAPTURE 신선경로 보존). ② **단일 세마포어(`_browser_sem`)로 모든 크롤을 직렬화**(동시에 페이지 1개만 렌더) → 일정 동기화·폴링·일괄보강이 몰려도 Chromium 피크 메모리가 안 터진다(대신 동시 크롤은 throttle 간격 두고 하나씩, 처리량보다 안정성 우선).

## 함정 / 주의사항 (이 코드베이스 특유)

- **`matche` 패키지는 `match`로 rename 완료됨**(과거 오타 정리). DB 테이블명은 `@Table`(예: `"matches"`)로 고정돼 패키지명과 무관하니, 엔티티 패키지 이동 시 import만 맞추면 된다.
- **Spring Security 7에서 CSRF disable은 메서드 레퍼런스로 해야 한다**: `.csrf(AbstractHttpConfigurer::disable)`. 람다형 `.csrf(c -> c.disable())`은 조용히 적용되지 않아 모든 POST가 302(OAuth 리다이렉트)된다. CORS는 `http://localhost:*` 전체 허용(Vite 포트 변동 대응).
- **api.py를 수정하면 uvicorn을 재시작해야 한다** — 코드 자동 리로드가 없다.
- **Spring Boot 4는 Jackson 3(`tools.jackson.databind`)를 쓴다.** RestClient의 메시지 컨버터가 Jackson 3라, 외부 응답을 **Jackson 2 타입(`com.fasterxml.jackson.databind.JsonNode`)으로 `.body()` 받으면 `Type definition error`로 깨진다**(GeminiClient에서 겪음). 외부 JSON은 `.body(Map.class)`로 받아 직접 탐색할 것. (참고: `jackson-databind`(2.x)를 직접 의존으로 추가해뒀고, 모델 출력 JSON 문자열 파싱엔 그 `ObjectMapper.readTree`를 독립 사용 — Spring 컨버터와 무관해 OK.)
- **`String.formatted()` 프롬프트에 리터럴 `%`를 넣지 말 것** — `%` 뒤 공백 등은 포맷 지정자로 해석돼 `UnknownFormatConversionException`. 한글 "1%"는 "1퍼센트"로 쓰거나 `%%` 이스케이프.
- **FotMob 평점은 스탯 커버 경기만** 준다(소규모 친선은 전 선수 `rating=null`). 라이브 진행시간도 SSR 지연으로 실제보다 몇 분 느림 — 둘 다 소스 한계지 버그 아님.
- **백엔드 재부팅 전 8080 포트의 기존 프로세스를 반드시 종료**하라. 안 그러면 새 빌드가 포트 충돌로 안 뜨고 구버전이 응답해 "엔드포인트가 302/404로 사라진 것처럼" 보인다.
- **Python은 3.12 전용 venv(`fotmob_scraper/.venv`)를 쓴다.** 시스템 Python 3.15(alpha)는 pydantic 빌드가 깨진다.
- **MySQL 포트**: 이 머신엔 로컬 MySQL 8.0이 **3306**을 점유 중이라, 루트 `docker-compose.yml`의 mysql은 **호스트 3307→컨테이너 3306**으로 매핑해 충돌을 피한다(backend는 컨테이너 네트워크 `mysql:3306`으로 붙으므로 무관). 접속정보는 동일(root/1234, DB `backend`). 도커 DB를 직접 볼 땐 `docker exec ballix-mysql mysql -uroot -p1234 backend -e "..."` 또는 호스트에서 `... -h127.0.0.1 -P3307`. 로컬 설치본은 `& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -uroot -p1234 backend`.
- 데이터 재적재 시: FotMob 데이터는 fotmobId 기준 upsert라 중복은 안 생기지만, 과거 다른 소스 데이터를 지우려면 `lineup_player, match_event, league_standing, matches, teams, competitions` 순으로 truncate(FK 때문).

## 설정

백엔드 시크릿/설정은 `backend/src/main/resources/application.yml`:
- `spring.datasource.*` — MySQL (docker-compose 기준 root/1234, DB `backend`)
- `spring.security.oauth2.client.registration.google.*` — Google OAuth
- `fotmob.api.base-url` — Python FastAPI 주소(기본 `http://127.0.0.1:8800`)
- `fotmob.schedule.{leagues,past-days,future-days,refresh-past-days}` — 날짜 ±N일 방식 수집 리그/범위(기본 `77,114` ±10일; 숫자=leagueId 정확매칭, 문자=이름 부분매칭). `refresh-past-days`(기본 2)는 **부팅 후 주기 재동기화의 과거 범위** — 과거는 거의 안 변해 줄여서 크롤 부하·차단위험을 낮춤(부팅 1회는 full `past-days`).
- `fotmob.schedule.full-season-leagues` — 시즌 전체 일정 수집 리그 leagueId(쉼표구분, 기본 비어있음). 설정하면 매 일정 동기화마다 `/league/{id}/fixtures`로 결승까지 모든 경기를 upsert(월드컵 등 토너먼트용 — 날짜 ±N일 방식만으론 먼 미래 경기를 못 가져옴).
- `fotmob.schedule.enabled` / `fotmob.poll.enabled` — 일정 동기화·폴링 전체 on/off(기본 true; 테스트 시 false로 끔)
- `fotmob.poll.{lineup-window-minutes,interval-minutes,clock-ms}` — 폴링 동작. `interval-minutes`(기본 3)=풀폴링, `clock-ms`(기본 660000=11분)=라이브 진행시간 재앵커
- `fotmob.poll.live.{enabled,interval-seconds,tick-ms,jitter-min-ms,jitter-max-ms}` — 라이브 빠른 폴링(IN_PLAY 경기 이벤트·HT·종료 초 단위 반영). `interval-seconds`(기본 20)=경기별 재조회 기준 간격, `tick-ms`(기본 2000)=스케줄러 due 체크 주기, `jitter-min/max-ms`(기본 300/500)=매 주기 더하는 랜덤 지터(고정 주기 회피). `interval-seconds`를 낮추면 더 빠르게(크롤 부하↑)
- `fotmob.poll.prewarm.{enabled,tick-ms,since-days,limit,cooldown-hours}` — 종료경기 상세 선반영(기본 on, 3분 주기, 최근 7일, tick당 3건, 쿨다운 6h). IN_PLAY 있으면 스킵. request-time lazy 크롤 타임아웃 회피용
- `spring.task.scheduling.pool.size`(기본 4) — `@Scheduled` 스레드풀. 라이브 빠른 폴링이 크롤로 스레드를 점유해도 다른 폴링/일정 동기화가 굶지 않게(기본 1이면 직렬화돼 지연)
- `prediction.allowed-leagues` — 예측 허용 리그 fotmobLeagueId(쉼표구분, 기본 `77`=월드컵)
- `ai.gemini.{api-key,model,base-url}` — Gemini(기본 `gemini-3.1-flash-lite`). 관리자 판별은 화이트리스트 없이 role=ADMIN_USER만 사용.
- `ai.live-prediction.{enabled,interval-minutes,tick-ms}` — 실시간 AI 승률 갱신(기본 on). `predictionEnabled && IN_PLAY` 경기를 **킥오프 기준 경과 `interval-minutes`(기본 15)분 간격**으로 라이브 상태 재예측. **하프타임 제외, 전·후반에만 동작**. `tick-ms`(기본 60000=1분)는 경계 확인 주기.
- `ai.translation.enabled` — 나라/팀명 한국어 번역(기본 on). 일정 동기화 시 `Team.nameKo` 없는 팀을 Gemini로 일괄 번역해 채움(번역 전 `Team.name` / 번역 후 `Team.nameKo` 둘 다 보관).
- `ntfy.{enabled,base-url,topic,start-window-minutes,start-tick-ms}` — ntfy 푸시 알림(`com.example.backend.notify`). `NtfyClient`가 `POST {base-url}/{topic}`으로 단일 토픽에 전송(셀프호스트/ntfy.sh 공용). **한글은 HTTP 헤더에서 깨지므로 본문(UTF-8)에 싣고, Title은 ASCII 라벨·Tags는 ntfy 이모지 단축명(ASCII)만** 쓴다. 전송 실패는 본 로직을 막지 않도록 `NtfyClient`가 내부에서 삼킨다(로그만). 알림 4종 — 경기 시작 임박(`NtfyNotifier` @Scheduled, 킥오프 N분 전 1회·메모리 중복방지) / 경기 종료(`FotmobSyncService.applySyncResult`, 첫 finalize시 **+ 킥오프 6h 이내일 때만** — 선반영/일괄보강의 늦은 종료 푸시 방지) / 예측 채점(`PredictionService.gradeMatch`, 예측별 적중·실패) / 공지 게시(`NoticeService.create`, 즉시 게시분만).

**배포(클라우드/셀프호스트) 전용 키** — `application.yml.example`엔 없고 `@Value` 기본값으로만 존재한다(로컬은 기본값으로 동작, 배포 시 환경변수/yml로 주입):
- `app.frontend-base-url`(기본 `http://localhost:5173`) — OAuth 로그인 성공 후 리다이렉트할 **프론트** 도메인(`OAuth2SuccessHandler`).
- `app.cors.allowed-origins`(기본 `http://localhost:*`) — 허용 Origin 패턴(쉼표구분). 운영은 실제 프론트 도메인만(와일드카드 지양).
- `app.cookie.{same-site,secure}`(기본 `Lax`/`false`) — 크로스도메인 배포면 `None`/`true`(`CookieUtil`·`HttpCookieOAuth2AuthorizationRequestRepository`가 공유). Google 콜백 URI는 `{백엔드도메인}/login/oauth2/code/google`.

JPA는 `ddl-auto: update`라 엔티티 추가 시 컬럼/테이블이 자동 생성된다(마이그레이션 불필요).
