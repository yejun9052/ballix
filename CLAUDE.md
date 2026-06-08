# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**Ballix**는 풀스택 축구 경기 예측 앱입니다. 저장소는 세 개의 독립 하위 프로젝트로 구성되며, **모든 축구 데이터는 FotMob에서 옵니다**(과거 football-data.org는 제거됨).

| 하위 프로젝트 | 스택 | 루트 | 포트 |
|---|---|---|---|
| REST API | Java 21, Spring Boot 4, Gradle, MySQL | `backend/` | 8080 |
| 웹 UI | React 19, Vite | `test-api/` | 5173(점유 시 5174) |
| FotMob 스크래퍼 | Python 3.12, Playwright, FastAPI | `fotmob_scraper/` | 8800 |

환경은 Windows + PowerShell입니다. gradlew는 `.\gradlew.bat` 형태로 호출하세요.

## 핵심 아키텍처 (먼저 이해할 것)

데이터 흐름은 한 방향입니다:

```
FotMob ──Playwright──> Python FastAPI(:8800) ──HTTP──> Spring Boot(:8080) ──> MySQL
                          (stateless 수집)          (스케줄·DB·폴링 소유)        │
                                                                          React(:5174)
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

`FotmobPollScheduler`가 두 가지 `@Scheduled` 작업을 돌린다:

1. **일정 동기화** (부팅 10초 뒤 + 30분마다): `FotmobScheduleService.syncRange()`가 과거/미래 N일치 날짜별 경기 목록을 가져와 Team/Competition/Match를 upsert. 수집 리그는 `fotmob.schedule.leagues`로 필터하며, 실제 필터링은 Python `api.py`의 `build_schedule`에서 한다 — **토큰이 숫자면 leagueId 정확매칭, 문자면 leagueName 부분매칭**. 기본값은 `77,114`(남자 FIFA 월드컵 + 남자 A매치 친선). FotMob은 여자/U21/클럽 파생 리그를 같은 이름("Friendlies", "World Cup")으로 주므로 **이름 매칭으론 못 거른다 → 숫자 leagueId 화이트리스트를 써야 한다**.
2. **데이터 폴링** (1분 tick, `interval-minutes` 간격으로 게이트): 킥오프 `lineup-window-minutes`분 전부터 `FotmobSyncService.syncMatch()`로 라인업·평점·이벤트·스코어를 갱신. 라인업이 뜨면 `markLineupSynced`, 종료되면 `markFinalized` + 해당 리그 순위(`FotmobStandingService`) 갱신.

폴링 주기(`interval-minutes`, 기본 5)는 `POST /api/fotmob/poll-interval?minutes=`로 런타임 변경 가능.

### 예측 도메인 (`com.example.backend.prediction`)

`MatchController`/`MatchService` 패턴을 그대로 따른 예측 저장/조회 + 자동 채점.

- 엔드포인트: `predict?matchId=&predictedWinner=`(저장/수정), `myPrediction`, `findByMatch?matchId=`, `ratio?matchId=`(예측 분포 %) — **전부 로그인 필요(쿠키 동봉)**. 응답은 `PredictionView` DTO(User 비노출).
- 예측값은 `Winner` enum(`HOME_TEAM`/`AWAY_TEAM`/`DRAW`) — **`Match.winner`와 같은 어휘**라 채점 때 `.name()`으로 그대로 비교. 잘못된 값은 enum 바인딩 실패로 거절.
- 가드(순서대로): 비로그인 → 없는 경기 → **예측 허용 리그 아님**(`prediction.allowed-leagues` config, 기본 `77`=월드컵. 하드코딩 아님) → 킥오프 지남.
- `ratio`는 **본인이 예측한 경기만** 조회 가능(예측 전이면 거절) → 분포 노출이 선택을 편향시키지 않게.
- **자동 채점**: `FotmobSyncService`가 경기 종료(`markFinalized`) 시 `PredictionService.gradeMatch()` 호출 → 예측 `isCorrect` 기록 + `User.scorePrediction()`으로 전적(`matches_played`/`correct_count`) 갱신. `Prediction.isGraded()`로 멱등(재폴링 시 중복 집계 방지). 이 때문에 `fotmob → prediction` 단방향 의존이 있다.

### 유저/리더보드 (`com.example.backend.user`)

`UserController`/`UserService`(MatchController 스타일). `GET /api/user/me`(로그인, 내 전적+적중률), `GET /api/user/leaderboard`(공개, 적중수 내림차순 랭킹). 응답은 `UserView`/`RankView` DTO. 집계 원천(`User.correct_count`/`matches_played`)은 위 예측 채점이 갱신한다.

### 인증 흐름 (기존 유지)

1. 프론트가 `/oauth2/authorization/google`로 리다이렉트.
2. `CustomOAuth2UserService`가 Google 프로필로 `User` upsert.
3. `OAuth2SuccessHandler`가 JWT를 생성해 HTTP-only 쿠키로 설정.
4. `JwtFiller`(서블릿 필터)가 매 요청마다 쿠키를 검증해 `SecurityContext`에 등록(토큰 없으면 익명 통과).

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
- `GET /api/match/allMatch` · `/findByCompId?id=` · `/MatchDay?date=YYYY-MM-DD` · `/upcoming?compId=` — 경기 목록 조회(`upcoming`=미래 경기만, compId 옵션)
- `GET /api/user/me`(로그인) · `GET /api/user/leaderboard`(공개) — 내 전적 / 적중순 랭킹

> 프론트 연동용 전체 응답 스키마/예시는 루트 **`API_SPEC.md`** 참고(프론트엔드 담당자 전달용).

## 함정 / 주의사항 (이 코드베이스 특유)

- **`matche` 패키지는 `match`로 rename 완료됨**(과거 오타 정리). DB 테이블명은 `@Table`(예: `"matches"`)로 고정돼 패키지명과 무관하니, 엔티티 패키지 이동 시 import만 맞추면 된다.
- **Spring Security 7에서 CSRF disable은 메서드 레퍼런스로 해야 한다**: `.csrf(AbstractHttpConfigurer::disable)`. 람다형 `.csrf(c -> c.disable())`은 조용히 적용되지 않아 모든 POST가 302(OAuth 리다이렉트)된다. CORS는 `http://localhost:*` 전체 허용(Vite 포트 변동 대응).
- **api.py를 수정하면 uvicorn을 재시작해야 한다** — 코드 자동 리로드가 없다.
- **백엔드 재부팅 전 8080 포트의 기존 프로세스를 반드시 종료**하라. 안 그러면 새 빌드가 포트 충돌로 안 뜨고 구버전이 응답해 "엔드포인트가 302/404로 사라진 것처럼" 보인다.
- **Python은 3.12 전용 venv(`fotmob_scraper/.venv`)를 쓴다.** 시스템 Python 3.15(alpha)는 pydantic 빌드가 깨진다.
- **MySQL은 docker-compose(`backend/docker-compose.yml`) 또는 로컬 설치본 중 3306을 잡은 쪽에 붙는다.** 이 머신엔 로컬 MySQL 8.0이 3306을 점유 중이라 `docker compose up`이 포트 충돌날 수 있다. 어느 쪽이든 접속정보는 동일(root/1234, DB `backend`). DB를 직접 볼 땐 `& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -uroot -p1234 backend`.
- 데이터 재적재 시: FotMob 데이터는 fotmobId 기준 upsert라 중복은 안 생기지만, 과거 다른 소스 데이터를 지우려면 `lineup_player, match_event, league_standing, matches, teams, competitions` 순으로 truncate(FK 때문).

## 설정

백엔드 시크릿/설정은 `backend/src/main/resources/application.yml`:
- `spring.datasource.*` — MySQL (docker-compose 기준 root/1234, DB `backend`)
- `spring.security.oauth2.client.registration.google.*` — Google OAuth
- `fotmob.api.base-url` — Python FastAPI 주소(기본 `http://127.0.0.1:8800`)
- `fotmob.schedule.{leagues,past-days,future-days,refresh-past-days}` — 수집 리그/범위(기본 `77,114` ±10일; 숫자=leagueId 정확매칭, 문자=이름 부분매칭). `refresh-past-days`(기본 2)는 **부팅 후 주기 재동기화의 과거 범위** — 과거는 거의 안 변해 줄여서 크롤 부하·차단위험을 낮춤(부팅 1회는 full `past-days`).
- `fotmob.poll.{enabled,lineup-window-minutes,interval-minutes}` — 폴링 동작
- `prediction.allowed-leagues` — 예측 허용 리그 fotmobLeagueId(쉼표구분, 기본 `77`=월드컵)

JPA는 `ddl-auto: update`라 엔티티 추가 시 컬럼/테이블이 자동 생성된다(마이그레이션 불필요).
