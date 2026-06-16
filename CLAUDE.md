# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**Ballix**는 풀스택 축구 경기 예측 앱입니다. 저장소는 세 개의 독립 하위 프로젝트로 구성되며, **모든 축구 데이터는 FotMob에서 옵니다**(과거 football-data.org는 제거됨).

| 하위 프로젝트 | 스택 | 루트 | 포트 |
|---|---|---|---|
| REST API | Java 21, Spring Boot 4, Gradle, MySQL | `backend/` | 8080 |
| 웹 UI | React 19, Vite (JSX, TypeScript 없음) | `test-api/` | 5173(점유 시 5174) |
| FotMob 스크래퍼 | Python 3.12, Playwright, FastAPI | `fotmob_scraper/` | 8800 |

환경은 Windows + PowerShell입니다. gradlew는 `.\gradlew.bat` 형태로 호출하세요.

> `test-api/`는 풀 프론트엔드가 아닌 **관리자/테스트 UI**다 — `src/` 아래 `App.jsx`와 `FotmobTester.jsx` 두 파일뿐이다.

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

`FotmobPollScheduler`가 두 가지 `@Scheduled` 작업을 돌린다:

1. **일정 동기화** (부팅 10초 뒤 + 30분마다): 두 방식을 함께 돌린다 — (a) `syncRange()`가 `fotmob.schedule.leagues`(날짜 ±N일 방식, 기본 친선 `114`)를 과거/미래 N일치 날짜별로 upsert, (b) `syncFullLeagues()`가 `fotmob.schedule.full-season-leagues`(시즌 전체 일정 방식, 기본 월드컵 `77`)를 Python `/league/{id}/fixtures`로 **결승까지 전 경기 한 번에** upsert. 날짜 ±N일 방식만 쓰면 먼 미래(결승 등)를 못 가져오므로 토너먼트는 (b)로 받는다. 리그 필터는 Python `build_schedule`에서 적용(**토큰 숫자=leagueId 정확매칭, 문자=leagueName 부분매칭** — 여자/U21/클럽 파생 리그가 같은 이름을 써서 이름 매칭으론 못 거름 → 숫자 ID 권장). **기존 경기 upsert 시 팀(homeTeam/awayTeam)도 갱신**한다 — 토너먼트 대진이 확정되면 미정 플레이스홀더("Winner SF 1")가 실제 팀으로 자동 반영(`Match.updateTeams`). 일정 데이터엔 구장 정보가 없으므로 저장 후 `enrichScheduledVenues()`가 **venue 없는 예정 경기 중 향후 14일 이내만** 상세(`/match/{id}`)를 추가 크롤해 `Match.venue`를 1회 채운다(멱등·윈도우 제한 — 먼 경기는 가까워지면 채움). 진행/종료 경기 venue는 폴링이 채운다.
2. **데이터 폴링** (1분 tick, `interval-minutes` 간격으로 게이트): 킥오프 `lineup-window-minutes`분 전부터 `FotmobSyncService.syncMatch()`로 라인업·평점·이벤트·스코어·**포메이션**(`Match.homeFormation/awayFormation`)·**선수 피치좌표**(`LineupPlayer.posX/posY`)·**전·후반 추가시간**(`Match.firstHalfAddedTime/secondHalfAddedTime` — Python이 FotMob `type:"AddedTime"` 이벤트 `time=45/90`에서 추출, 값 있을 때만 갱신)을 갱신. 라인업이 뜨면 `markLineupSynced`, 종료되면 `markFinalized` + 해당 리그 순위(`FotmobStandingService`) 갱신.
3. **라이브 시계 갱신** (`clock-ms`, 기본 11분): IN_PLAY 경기만 `FotmobSyncService.refreshLiveClock()`로 진행시간/스코어만 가볍게(라인업·이벤트 안 건드림) 갱신. 아래 "라이브 시계" 참고.

폴링 주기(`interval-minutes`, 기본 3)는 `POST /api/fotmob/poll-interval?minutes=`로 런타임 변경 가능.

**라이브 시계(진행 분/초) 아키텍처** — FotMob `/api/matchDetails` 직접호출은 404로 차단돼 **SSR 스냅샷(`__NEXT_DATA__`)** 만 읽을 수 있고, 이 값은 실제보다 몇 분 지연된다. 그래서 시계는 **앵커 방식**으로 흐른다:
- 폴링 시 `Match.liveStartedAt = 지금 - 경과초`(FotMob `liveTime.long` mm:ss 환산)를 저장. 이건 고정된 실제 시각이라 **프론트가 `지금 - liveStartedAt`을 초 단위로 매초 계산**해 클라이언트에서 흘린다(서버 부하 0).
- **재앵커는 11분 `refreshLiveClock`만** 한다. 3분 풀폴링(`syncMatch`)은 `updateLiveIfAbsent`로 **앵커가 없을 때만 1회 설정**(IN_PLAY 아니면 정리) — 잦은 재앵커가 시계를 뒤로 스냅하는 것을 방지. FotMob SSR도 ~10분 주기 갱신이라 11분이 맞다.
- `liveTime` 라벨은 `"67'"`/`"45+2'"`(추가시간)/`"HT"`(하프타임). **HT 등 숫자 없는(정지) 라벨이면 `updateLive`/`updateLiveIfAbsent`가 `liveStartedAt=null`로 비운다**(`isClockPaused`) — FotMob이 HT에 `liveSeconds=null`을 줘서 앵커를 못 지우면 프론트가 HT 직전 앵커로 계속 시계를 흘리는 버그가 있었기 때문. 후반 재개 시 숫자 라벨이 오면 앵커 재설정. 프론트는 `liveStartedAt`이 없으면 시계를 멈추고 라벨만 표시. 추가시간은 `firstHalfAddedTime`/`secondHalfAddedTime`로 `"45+4'"`/`"90+N'"` 표기.

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
- **포인트제(역배 가중)**: 채점 시 `computePoints()`가 **그 경기의 AI 승률(`Match.aiHomePct/Draw/Away`)** 순위로 차등 점수 — 유저가 고른 결과보다 AI 확률이 높은 결과 개수 + 1 = 점수(본명 1점 / 2위 2점 / 최대 역배 3점), 틀리면 0점. **AI 예측 없는 경기는 적중 시 일괄 1점**. 획득 점수는 `Prediction.earnedPoints`에 기록하고 `User.scorePrediction(correct, points)`가 누적 `User.score`에 더한다 → `prediction → ai 데이터(Match)` 참조. 적중수/적중률(`correct_count`)도 그대로 유지(같이 표시).

### 유저/리더보드 (`com.example.backend.user`)

`UserController`/`UserService`(MatchController 스타일). `GET /api/user/me`(로그인, 내 전적+`score`+적중률+`role`), `PUT /api/user/me/name?name=`(로그인, 본인 닉네임 변경 — 2~20자·중복 비허용), `GET /api/user/leaderboard`(공개, **누적 포인트 `score` 내림차순** 랭킹). 응답은 `UserView`/`RankView` DTO. 집계 원천(`User.score`/`correct_count`/`matches_played`)은 위 예측 채점이 갱신한다.

**관리자 판별은 `role` 단일 기준** — 프론트는 `me()`의 `role == "ADMIN_USER"`로 관리자 UI 노출을 판단하고, 백엔드 관리자 엔드포인트는 전부 `@PreAuthorize("hasRole('ADMIN_USER')")`로 보호한다(과거 `ai.admin-emails` 화이트리스트·`UserView.admin` 플래그·`AdminGuard`는 제거됨).

**유저 관리(관리자)** — `GET /api/admin/users` · `PUT /{id}/role` · `PUT /{id}/status?active=&message=`. **정지(`active=false`) 시 `message`로 안내문을 함께 저장**(`User.banMessage`) — 정지된 유저가 로그인하면 `OAuth2SuccessHandler`가 `/home?error=banned&msg=<URL인코딩>`로 전달, 정지 해제 시 `activate()`가 메시지도 정리. 본인 권한/계정상태는 변경 불가.

### 공지사항 (`com.example.backend.notice`)

`Notice` 엔티티 + CRUD + **게시 예약**. **조회는 공개, 작성·수정·삭제는 `@PreAuthorize("hasRole('ADMIN_USER')")`** 보호.
- **게시창**: `publishAt`(게시 시각, null=즉시) ~ `expireAt`(내림 시각, null=무기한). **배치 없이 공개 조회 쿼리(`findVisible`)가 현재 시각으로 필터** — 시각이 되면 자동으로 보이고/내려간다. 공개 단건 조회도 게시창 밖이면 404(예약 공지 유출 방지).
- 조회(공개): `GET /api/notice`(게시 중만, 최신순 기본 8건) · `GET /api/notice/{id}`
- 관리(ADMIN_USER): `GET /api/admin/notice`(전체 — `status`=SCHEDULED/ACTIVE/EXPIRED) · `POST` · `PUT /{id}` · `DELETE /{id}` — 본문 `{title, content, publishAt?, expireAt?}`(ISO-8601). 수정 시 publishAt/expireAt는 보낸 값으로 교체라 `expireAt=now`로 즉시 내릴 수 있다.

### AI 기능 (`com.example.backend.ai`) — Google Gemini

승률 예측 + 골 요약. 모델은 `ai.gemini.model`(기본 `gemini-3.1-flash-lite`), 키는 `ai.gemini.api-key`. `GeminiClient`가 별도 SDK 없이 `generateContent` REST를 RestClient로 호출(429/503 자동 재시도). **이 도메인은 `ai → fotmob`(FotmobClient/Standing) 의존이 있다.**

- **승률 예측 + 예상 스코어** (`AiPredictionService`, `POST /api/admin/ai/predict?matchId=&force=`): **관리자만 "생성"**(`@PreAuthorize ROLE_ADMIN_USER`), 결과 조회는 누구나(값이 `Match`에 저장돼 일반 조회 응답에 포함). 입력 다이제스트 = **FIFA 랭킹(보조) + 리그 순위 + 최근 폼**(전부 DB에 있는 데이터, 추가 크롤 X). Gemini structured-output(JSON)으로 받아 **합 100·1% 단위**로 정규화해 `Match.aiHomePct/aiDrawPct/aiAwayPct`에 저장 + **예상 스코어 `aiHomeScore/aiAwayScore`**(0~9 클램프, 확률 최고 결과와 방향 어긋나면 보정). `predictionEnabled=true`가 되어 `allMatch`에서 최상단 정렬(`findAllByOrderByPredictionEnabledDescMatchTimeAsc`). 멱등(`aiPredictedAt != null`이면 force 없이는 재호출 안 함).
- **실시간 승률 갱신** (`AiLivePredictionScheduler`, `@Scheduled` 기본 15분): `predictionEnabled && IN_PLAY` 경기를 `predict(matchId, force=true)`로 재예측. **다이제스트가 IN_PLAY면 현재 스코어·경과시간을 주입**(`buildDigest`)해 남은 결과 확률을 갱신하고 기존 값을 덮어쓴다. `ai.live-prediction.{enabled,interval-ms}` config. 대상이 '관리자가 켠 + 진행 중'으로 한정돼 Gemini 호출이 과하지 않다.
- **골 요약** (`AiSummaryService`, `GET /api/match/{id}/ai/summary?force=`, 공개): **종료 경기**만. 1순위로 **FotMob 라이브티커(ltc) 골 해설**(영문)을 `FotmobClient.getCommentary()`로 가져와 Gemini가 **한국어 해설 말투로 번역·요약**, 없으면 저장된 `MatchEvent`로 폴백. DB-first lazy(없으면 1회 생성 후 `Match.aiSummary`에 캐시). **생성 실패 시 5분 쿨다운** — 이 시간 안에 재요청이 와도 Gemini를 재호출하지 않고 빈 값을 반환(ltc 크롤+재시도 폭주 방지).
- **FIFA 랭킹**: `resources/fifa-rankings.json`(팀명→순위, 수정 쉬운 근사 스냅샷)을 `FifaRankingService`가 부팅 시 로드. 팀명은 FotMob 표기와 매칭.

### 인증 흐름 (기존 유지)

1. 프론트가 `/oauth2/authorization/google`로 리다이렉트.
2. `CustomOAuth2UserService`가 Google 프로필로 `User` upsert.
3. `OAuth2SuccessHandler`가 **새 세션(`User.sessionId`=UUID)을 발급·저장**하고 JWT(`sid` 클레임 포함)를 HTTP-only 쿠키로 설정. 정지 계정이면 토큰 발급 거부 후 `/home?error=banned[&msg=]`.
4. `JwtFiller`(서블릿 필터)가 매 요청마다 쿠키를 검증해 `SecurityContext`에 등록(토큰 없으면 익명 통과).

**동시 로그인 차단(새 로그인이 기존을 밀어냄)** — 로그인할 때마다 `sessionId`를 새로 발급하므로 JWT의 `sid`는 마지막 로그인 기기 것만 DB와 일치한다. `JwtFiller`는 토큰 `sid` ≠ `User.sessionId`면 쿠키를 만료시키고 **`401 {code:"SESSION_REPLACED"}`** 로 즉시 응답(프론트 경고창용). DB `sessionId=null`(구버전 세션)이면 검사 생략 — 재로그인 시 sid가 부여되며 활성화. 정지·삭제 계정 차단(쿠키 삭제 후 익명 통과)은 종전대로.

컨트롤러에서 **현재 로그인 유저는 `@AuthenticationPrincipal Long userId`로 받는다** — JwtFiller가 principal에 `userId`(Long)를 넣기 때문(User 객체 아님).

**전역 예외 처리**: `global/exceptopn`에 `BusinessException`(상태코드 보유) 기반 커스텀 예외 계층 — `BadRequestException(400)`/`NotFoundException(404)`/`UnauthorizedException(401)`. `GlobalExceptionHandler`(`@RestControllerAdvice`)가 이들을 `CommonResponse.fail(msg)` + 해당 상태코드로, 그 외 일반 `RuntimeException`은 400 안전망으로 변환한다. **검증 실패는 이 커스텀 예외로 던질 것**(`throw new RuntimeException`은 코드베이스에서 제거됨) — 핸들러가 없으면 예외가 500 → `/error` 포워드 → (보안상 `/error` 미허용) → **OAuth 리다이렉트로 둔갑**한다.

## 개발 실행 (4개 프로세스, 순서 중요)

백엔드의 일정 동기화가 동작하려면 MySQL과 Python 서비스가 **먼저** 떠 있어야 한다.

```powershell
# 1. MySQL
cd C:\ballix\backend; docker compose up -d

# 2. Python FotMob 서비스 (전용 venv 사용 — 시스템 python 아님)
cd C:\ballix\fotmob_scraper; .venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8800

# 3. 백엔드
cd C:\ballix\backend; .\gradlew.bat bootRun

# 4. 프론트
cd C:\ballix\test-api; npm install; npm run dev
```

### 기타 명령어

```powershell
# 백엔드 테스트
.\gradlew.bat test
.\gradlew.bat test --tests "com.example.backend.SomeTest"   # 단일 클래스
.\gradlew.bat compileJava                                    # 컴파일만 확인

# 프론트
npm run build ; npm run lint

# Python 스크래퍼 CLI (FastAPI와 별개, Excel 내보내기용)
.venv\Scripts\python.exe main.py <matchId>                   # output/*.xlsx
.venv\Scripts\python.exe main.py search "Korea" "Czechia" --comp "World Cup"
```

## 주요 API (백엔드)

- `GET /api/match/{id}/fotmob` · `/lineup` · `/events` — 경기별 라인업/이벤트 조회
- `POST /api/match/{id}/fotmob/sync` — 단일 경기 즉시 동기화(스케줄 대기 없이)
- `POST /api/fotmob/schedule/sync?pastDays=&futureDays=` , `.../sync/{YYYYMMDD}` — 일정 동기화 트리거
- `GET /api/fotmob/standings/{competitionId}` , `POST .../sync` — 리그 순위(조별)
- `GET|POST /api/fotmob/poll-interval` — 폴링 주기 조회/변경(관리자)
- `GET /api/fotmob/preview/{fotmobMatchId}` — DB 미저장 미리보기(프록시)
- `POST /api/prediction/predict?matchId=&predictedWinner=` · `GET /api/prediction/{myPrediction,findByMatch?matchId=,ratio?matchId=}` — 예측·분포(로그인 필요)
- `GET /api/match/allMatch` · `/findByCompId?id=` · `/MatchDay?date=YYYY-MM-DD` · `/upcoming?compId=` — 경기 목록 조회(`upcoming`=미래 경기만, compId 옵션). **`MatchDay`는 DB-first lazy-crawl**(없는 날짜 조회 시 그 날짜를 즉석 크롤·저장 후 반환).
- `POST /api/admin/ai/predict?matchId=&force=`(관리자) · `GET /api/match/{id}/ai/summary?force=`(공개) — AI 승률 예측 / 골 요약
- `GET /api/user/me`(로그인, `score`·`role` 포함) · `PUT /api/user/me/name?name=`(로그인, 닉네임 변경) · `GET /api/user/leaderboard`(공개, **포인트순**) — 내 전적 / 랭킹
- `GET /api/notice`(공개, 게시 중만, 기본 8건) · `GET /api/notice/{id}` — 공지 목록/단건
- `GET|POST|PUT|DELETE /api/admin/notice`(ADMIN_USER) — 공지 CRUD + 게시 예약(`publishAt`/`expireAt`)
- `PUT /api/admin/match/{id}/replay?youtube=` · `DELETE .../replay`(ADMIN_USER) — 유튜브 다시보기 등록/해제(종료 경기만, videoId 또는 URL 입력). `Match.replayYoutubeId`로 직렬화 → 프론트가 `youtube.com/embed/{id}` 임베드
- `GET /api/admin/users`(ADMIN_USER, 기본 8건) · `PUT /api/admin/users/{id}/role?role=` · `PUT /api/admin/users/{id}/status?active=&message=` — 유저 목록·권한·계정상태 관리(정지 시 `message`=정지 안내문 저장)

> 프론트 연동용 전체 응답 스키마/예시는 루트 **`API_SPEC.md`** 참고(프론트엔드 담당자 전달용).

**Python 스크래퍼(`fotmob_scraper/api.py`) 엔드포인트**: `/match/{id}`(라인업·이벤트·평점·**liveTime/liveSeconds**·포메이션·posX/posY·**venue**=구장이름 `infoBox.Stadium.name`), `/schedule`, `/league/{id}/table`, `/league/{id}/fixtures`(시즌 전체 경기 — 결승까지, `syncFullLeagues` 전용), `/commentary/{id}`(라이브티커 골 해설 — 골 요약용), `/search`. **선수 사진은 백엔드에 저장 안 한다** — 프론트가 `fotmobPlayerId`로 `https://images.fotmob.com/image_resources/playerimages/{id}.png` URL을 직접 구성.

## 함정 / 주의사항 (이 코드베이스 특유)

- **`matche` 패키지는 `match`로 rename 완료됨**(과거 오타 정리). DB 테이블명은 `@Table`(예: `"matches"`)로 고정돼 패키지명과 무관하니, 엔티티 패키지 이동 시 import만 맞추면 된다.
- **Spring Security 7에서 CSRF disable은 메서드 레퍼런스로 해야 한다**: `.csrf(AbstractHttpConfigurer::disable)`. 람다형 `.csrf(c -> c.disable())`은 조용히 적용되지 않아 모든 POST가 302(OAuth 리다이렉트)된다. CORS는 `http://localhost:*` 전체 허용(Vite 포트 변동 대응).
- **api.py를 수정하면 uvicorn을 재시작해야 한다** — 코드 자동 리로드가 없다.
- **Spring Boot 4는 Jackson 3(`tools.jackson.databind`)를 쓴다.** RestClient의 메시지 컨버터가 Jackson 3라, 외부 응답을 **Jackson 2 타입(`com.fasterxml.jackson.databind.JsonNode`)으로 `.body()` 받으면 `Type definition error`로 깨진다**(GeminiClient에서 겪음). 외부 JSON은 `.body(Map.class)`로 받아 직접 탐색할 것. (참고: `jackson-databind`(2.x)를 직접 의존으로 추가해뒀고, 모델 출력 JSON 문자열 파싱엔 그 `ObjectMapper.readTree`를 독립 사용 — Spring 컨버터와 무관해 OK.)
- **`String.formatted()` 프롬프트에 리터럴 `%`를 넣지 말 것** — `%` 뒤 공백 등은 포맷 지정자로 해석돼 `UnknownFormatConversionException`. 한글 "1%"는 "1퍼센트"로 쓰거나 `%%` 이스케이프.
- **FotMob 평점은 스탯 커버 경기만** 준다(소규모 친선은 전 선수 `rating=null`). 라이브 진행시간도 SSR 지연으로 실제보다 몇 분 느림 — 둘 다 소스 한계지 버그 아님.
- **백엔드 재부팅 전 8080 포트의 기존 프로세스를 반드시 종료**하라. 안 그러면 새 빌드가 포트 충돌로 안 뜨고 구버전이 응답해 "엔드포인트가 302/404로 사라진 것처럼" 보인다.
- **Python은 3.12 전용 venv(`fotmob_scraper/.venv`)를 쓴다.** 시스템 Python 3.15(alpha)는 pydantic 빌드가 깨진다.
- **MySQL은 docker-compose(`backend/docker-compose.yml`) 또는 로컬 설치본 중 3306을 잡은 쪽에 붙는다.** 이 머신엔 로컬 MySQL 8.0이 3306을 점유 중이라 `docker compose up`이 포트 충돌날 수 있다. 어느 쪽이든 접속정보는 동일(root/1234, DB `backend`). DB를 직접 볼 땐 `& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -uroot -p1234 backend`.
- 데이터 재적재 시: FotMob 데이터는 fotmobId 기준 upsert라 중복은 안 생기지만, 과거 다른 소스 데이터를 지우려면 `lineup_player, match_event, league_standing, matches, teams, competitions` 순으로 truncate(FK 때문).

## 설정

백엔드 시크릿/설정은 `backend/src/main/resources/application.yml`:
- `spring.datasource.*` — MySQL (docker-compose 기준 root/1234, DB `backend`)
- `spring.security.oauth2.client.registration.google.*` — Google OAuth
- `fotmob.api.base-url` — Python FastAPI 주소(기본 `http://127.0.0.1:8800`)
- `fotmob.schedule.{leagues,past-days,future-days,refresh-past-days}` — 날짜 ±N일 방식 수집 리그/범위(기본 `77,114` ±10일; 숫자=leagueId 정확매칭, 문자=이름 부분매칭). `refresh-past-days`(기본 2)는 **부팅 후 주기 재동기화의 과거 범위** — 과거는 거의 안 변해 줄여서 크롤 부하·차단위험을 낮춤(부팅 1회는 full `past-days`).
- `fotmob.schedule.full-season-leagues` — 시즌 전체 일정 수집 리그 leagueId(쉼표구분, 기본 비어있음). 설정하면 매 일정 동기화마다 `/league/{id}/fixtures`로 결승까지 모든 경기를 upsert(월드컵 등 토너먼트용 — 날짜 ±N일 방식만으론 먼 미래 경기를 못 가져옴).
- `fotmob.schedule.enabled` / `fotmob.poll.enabled` — 일정 동기화·폴링 전체 on/off(기본 true; 테스트 시 false로 끔)
- `fotmob.poll.{lineup-window-minutes,interval-minutes,clock-ms}` — 폴링 동작. `interval-minutes`(기본 3)=풀폴링, `clock-ms`(기본 660000=11분)=라이브 진행시간 갱신
- `prediction.allowed-leagues` — 예측 허용 리그 fotmobLeagueId(쉼표구분, 기본 `77`=월드컵)
- `ai.gemini.{api-key,model,base-url}` — Gemini(기본 `gemini-3.1-flash-lite`). 관리자 판별은 화이트리스트 없이 role=ADMIN_USER만 사용.
- `ai.live-prediction.{enabled,interval-ms}` — 실시간 AI 승률 갱신(기본 on, 900000=15분). `predictionEnabled && IN_PLAY` 경기를 주기마다 라이브 상태로 재예측.
- `ntfy.{enabled,base-url,topic,start-window-minutes,start-tick-ms}` — ntfy 푸시 알림(`com.example.backend.notify`). `NtfyClient`가 `POST {base-url}/{topic}`으로 단일 토픽에 전송(셀프호스트/ntfy.sh 공용). **한글은 HTTP 헤더에서 깨지므로 본문(UTF-8)에 싣고, Title은 ASCII 라벨·Tags는 ntfy 이모지 단축명(ASCII)만** 쓴다. 전송 실패는 본 로직을 막지 않도록 `NtfyClient`가 내부에서 삼킨다(로그만). 알림 4종 — 경기 시작 임박(`NtfyNotifier` @Scheduled, 킥오프 N분 전 1회·메모리 중복방지) / 경기 종료(`FotmobSyncService.applySyncResult`, 첫 finalize시) / 예측 채점(`PredictionService.gradeMatch`, 예측별 적중·실패) / 공지 게시(`NoticeService.create`, 즉시 게시분만).

JPA는 `ddl-auto: update`라 엔티티 추가 시 컬럼/테이블이 자동 생성된다(마이그레이션 불필요).
