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

### FotMob 동기화/폴링 (`com.example.backend.fotmob`)

`FotmobPollScheduler`가 두 가지 `@Scheduled` 작업을 돌린다:

1. **일정 동기화** (부팅 10초 뒤 + 30분마다): `FotmobScheduleService.syncRange()`가 과거/미래 N일치 날짜별 경기 목록을 가져와 Team/Competition/Match를 upsert. 수집 리그는 `fotmob.schedule.leagues`(leagueName 부분매칭)로 필터.
2. **데이터 폴링** (1분 tick, `interval-minutes` 간격으로 게이트): 킥오프 `lineup-window-minutes`분 전부터 `FotmobSyncService.syncMatch()`로 라인업·평점·이벤트·스코어를 갱신. 라인업이 뜨면 `markLineupSynced`, 종료되면 `markFinalized` + 해당 리그 순위(`FotmobStandingService`) 갱신.

폴링 주기(`interval-minutes`, 기본 5)는 `POST /api/fotmob/poll-interval?minutes=`로 런타임 변경 가능.

### 인증 흐름 (기존 유지)

1. 프론트가 `/oauth2/authorization/google`로 리다이렉트.
2. `CustomOAuth2UserService`가 Google 프로필로 `User` upsert.
3. `OAuth2SuccessHandler`가 JWT를 생성해 HTTP-only 쿠키로 설정.
4. `JwtFiller`(서블릿 필터)가 매 요청마다 쿠키를 검증해 `SecurityContext`에 등록(토큰 없으면 익명 통과).

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

## 함정 / 주의사항 (이 코드베이스 특유)

- **`matche` 패키지명은 오타지만 그대로 둔다** — import와 DB 매핑을 함께 고치지 않는 단독 rename 금지.
- **Spring Security 7에서 CSRF disable은 메서드 레퍼런스로 해야 한다**: `.csrf(AbstractHttpConfigurer::disable)`. 람다형 `.csrf(c -> c.disable())`은 조용히 적용되지 않아 모든 POST가 302(OAuth 리다이렉트)된다. CORS는 `http://localhost:*` 전체 허용(Vite 포트 변동 대응).
- **api.py를 수정하면 uvicorn을 재시작해야 한다** — 코드 자동 리로드가 없다.
- **백엔드 재부팅 전 8080 포트의 기존 프로세스를 반드시 종료**하라. 안 그러면 새 빌드가 포트 충돌로 안 뜨고 구버전이 응답해 "엔드포인트가 302/404로 사라진 것처럼" 보인다.
- **Python은 3.12 전용 venv(`fotmob_scraper/.venv`)를 쓴다.** 시스템 Python 3.15(alpha)는 pydantic 빌드가 깨진다.
- 데이터 재적재 시: FotMob 데이터는 fotmobId 기준 upsert라 중복은 안 생기지만, 과거 다른 소스 데이터를 지우려면 `lineup_player, match_event, league_standing, matches, teams, competitions` 순으로 truncate(FK 때문).

## 설정

백엔드 시크릿/설정은 `backend/src/main/resources/application.yml`:
- `spring.datasource.*` — MySQL (docker-compose 기준 root/1234, DB `backend`)
- `spring.security.oauth2.client.registration.google.*` — Google OAuth
- `fotmob.api.base-url` — Python FastAPI 주소(기본 `http://127.0.0.1:8800`)
- `fotmob.schedule.{leagues,past-days,future-days}` — 수집 리그/범위(기본 "World Cup,Friendlies" ±10일)
- `fotmob.poll.{enabled,lineup-window-minutes,interval-minutes}` — 폴링 동작

JPA는 `ddl-auto: update`라 엔티티 추가 시 컬럼/테이블이 자동 생성된다(마이그레이션 불필요).
