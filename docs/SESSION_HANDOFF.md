# Ballix 배포 & 작업 인수인계 (Session Handoff)

> 이 문서는 **다른 환경(집)에서 Claude Code가 이어서 작업**할 수 있게 현재 상태·다음 할 일·함정을 정리한 것이다.
> 로직 상세는 [docs/logic/](logic/README.md), 실행/규약은 루트 `CLAUDE.md` 참고.
> 작성 시점 기준 마지막 커밋: `962cc4a` 이후 (main 브랜치, GitHub `yejun9052/ballix`).

---

## 1. 현재 배포 상태 (어디에 뭐가)

| 조각 | 위치 | 주소 | 비고 |
|---|---|---|---|
| 프론트(React+Vite) | **Vercel** | `https://ballix-ochre.vercel.app` | Framework=Vite, Root=`frontend`. env `VITE_API_BASE_URL=https://ballix.onrender.com` |
| 백엔드(Spring) | **Render**(Free, Ohio) | `https://ballix.onrender.com` | Docker, Root Directory=`backend` |
| 스크래퍼(Python) | **Render**(Free) | `https://ballix-py.onrender.com` | Docker, Root Directory=`fotmob_scraper` |
| DB(MySQL 호환) | **TiDB Serverless**(Free, **us-east-1**) | `gateway01.us-east-1.prod.aws.tidbcloud.com:4000` | DB=`test`. (인도 Aiven에서 **콜로케이션 위해 이전함**) |

- **로그인 계정(관리자)**: 구글 `leey217423@gmail.com`. 로그인 후 `UPDATE test.users SET role='ADMIN_USER' WHERE email='leey217423@gmail.com';` (TiDB SQL Editor).
- **무료 플랜 한계**: Render Free는 15분 미사용 시 스핀다운(첫 요청 50초+), CPU 0.1코어(부팅 ~140초). 이게 "콜드스타트 느림"의 원인.

### Render 백엔드 핵심 env (값은 Render 대시보드에 있음 — 여기엔 이름만)
```
SPRING_DATASOURCE_URL=jdbc:mysql://gateway01.us-east-1.prod.aws.tidbcloud.com:4000/test?sslMode=VERIFY_IDENTITY&serverTimezone=Asia/Seoul&characterEncoding=UTF-8
SPRING_DATASOURCE_USERNAME / SPRING_DATASOURCE_PASSWORD   (TiDB, USERNAME은 프리픽스.root)
SPRING_JPA_HIBERNATE_DDL_AUTO=update                      ← 테이블 자동생성(필수)
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID / ...CLIENT_SECRET
JWT_SECRET, AI_GEMINI_API_KEY, TZ=Asia/Seoul
FOTMOB_API_BASE_URL=https://ballix-py.onrender.com
APP_FRONTEND_BASE_URL=https://ballix-ochre.vercel.app
APP_CORS_ALLOWED_ORIGINS=https://*.vercel.app
APP_COOKIE_SAME_SITE=None, APP_COOKIE_SECURE=true
LOGGING_LEVEL_ORG_SPRINGFRAMEWORK_SECURITY=DEBUG          ← 로그인 디버깅용(안정화 후 지워도 됨)
```
> ⚠️ `application.yml`은 **gitignore라 GitHub/배포 이미지에 없음** → 위 시크릿은 전부 env로 주입해야 부팅됨.

---

## 2. 이번 세션에 한 일 (배경)

1. **3D 라인업/테이블축구 이식** (`test-api` → `frontend`): `Stadium3D.jsx`/`Foosball.jsx`/`Lineup3DViewer.jsx`, DetailScreen에 연결. R3F v8(React18 호환).
2. **풀스택 배포**: Render(백엔드·스크래퍼) + Vercel(프론트) + DB.
3. **배포 로그인 5단계 디버깅** (전부 수정·푸시됨):
   - 프론트 baseURL → `VITE_API_BASE_URL`
   - CORS → `APP_CORS_ALLOWED_ORIGINS=https://*.vercel.app` (와일드카드, allowedOriginPatterns)
   - 콜백 403 → **OAuth state를 쿠키 저장**(`HttpCookieOAuth2AuthorizationRequestRepository`) + `/oauth2/**`·`/login/**`·`/error` permit (STATELESS+클라우드 세션 유실 대응)
   - 콜백 500 → **OIDC 유저 upsert**(`CustomOidcUserService`) + 성공핸들러 find-or-create (Google은 openid=OIDC라 기존 OAuth2 userService가 안 불림)
   - 리다이렉트 `/home` → 루트
4. **라이브 시계/HT 개선**: 하프 경계 근처 폴링 10초(App.jsx), `LIVE_CLOCK_LAG_SECONDS` 45→20.
5. **스크래퍼 HT 신선도**: `/api/matchDetails`(404) → **`/api/data/matchDetails`**(신선). + 데이터소스 경로 로그(LIVE-FETCH/SSR-FALLBACK) 항상 출력.
6. **N+1 최적화**: 경기 목록 6개 조회에 `@EntityGraph(homeTeam/awayTeam/competition)`.
7. **DB 이전**: Aiven(India) → TiDB Serverless(us-east-1) — 쿼리 왕복 ~250ms→~5ms 목적.
8. **로직 문서화**: `docs/logic/` 6종.

---

## 3. 다음에 할 일 (집에서 — 방금 받은 피드백 / TODO)

### ⭐ A. 경기 "상세"가 느림 (목록은 빠름) — 서버 문제 vs DB 관계 문제
**증상**: 경기 목록(`allMatch`)은 빠른데 **경기 상세** 진입이 느림.
**조사 리드** (가능성 순):
1. **DB-first lazy-crawl**: `getFotmobView(matchId)`는 해당 경기 라인업/이벤트가 DB에 없으면 **그 자리에서 스크래퍼를 HTTP 크롤**(Playwright ~1~3초 + 스크래퍼 콜드스타트). 처음 보는 경기/오래된 경기일수록 느림. → `FotmobQueryService.getView/getLineup/getEvents` 확인.
2. **N+1 (상세 직렬화)**: 라인업 직렬화 시 `LineupPlayer.player`(LAZY) → Player, 이벤트 등에서 경기당 수십 쿼리. 목록은 `@EntityGraph`로 고쳤지만 **상세/라인업 경로는 아직 안 함**. → `LineupPlayer`/`MatchEvent` 연관 fetch + 직렬화 쿼리 프로파일.
3. **순차 lazy 호출 누적**: 상세 화면이 `getFotmobView` + `getAiSummary` + `getHighlight`를 각각 호출, 각자 lazy-crawl/Gemini/유튜브 검색 트리거 → 합산 지연.
4. **TiDB 이전 후 재측정**: DB가 us-east-1로 와서 쿼리 자체는 빨라졌을 것 → N+1이 남았는지 다시 봐야.
**할 일**: 상세 진입 시 백엔드 로그로 (a) 크롤이 도는지(lazy) (b) 쿼리 수(N+1) 확인 → 크롤이면 캐시/사전크롤, N+1이면 상세 경로에도 `@EntityGraph`/fetch join.

### ⭐ B. 동시 접속 시 같은 경기를 여러 번 크롤하나? (크롤 중복/단일비행)
**질문**: 여러 명이 동시에 **아직 안 긁힌 경기 상세**를 열면 크롤이 N번 도는가?
**현재 구조**: 스크래퍼는 `crawl_throttle`(300~500ms 간격)만 있고 **요청 dedup 없음**. 백엔드 DB-first lazy는 `lineupSynced` 플래그 + `FotmobSyncService` matchId 스트라이프 락(32개)이 있지만, **HTTP 크롤은 락 밖**이라 동시 첫조회 시 중복 크롤 가능성 있음.
**할 일**: 경기별 **single-flight(같은 matchId 진행 중이면 결과 공유)** 도입 검토 — 백엔드(`FotmobQueryService`)에 in-flight 맵/락, 또는 스크래퍼에 matchId별 dedup. (차단위험·부하·속도 다 개선)

### C. 로드 밸런싱 서버 (피드백에서 언급됨)
- 맥락 확인 필요. 현재 단일 인스턴스(Render Free). 수요 늘면 다중 인스턴스 시 **세션/락이 인스턴스 로컬**이라 문제(라이브 폴링 중복, 스트라이프 락 무의미). 지금은 과제 아님 — 트래픽 생기면 그때.

### D. Render에 DB도 같이 올릴 수 있나? (재검토)
- **결론(이미 조사함)**: Render 무료 관리형 DB는 **PostgreSQL만**(MySQL 없음). MySQL 직접 띄우기는 **유료**(Private Service+디스크). 무료 Postgres는 30일 만료 + MySQL→Postgres 마이그레이션 필요.
- **그래서 TiDB Serverless(us-east-1)로 콜로케이션** 택함 = Render DB와 같은 속도, 무료, 마이그레이션 없음.
- 추가 조사할 거 있으면: Render Postgres 유료($7)로 가면 콜로케이션+안정. 비용 감수 시 옵션.

### E. HT "55분" 검증 (진행 중)
- HT 계산 로직은 즉시 반영하도록 돼 있음(→ [live-clock-and-halftime.md](logic/live-clock-and-halftime.md)). "55분"은 스크래퍼 stale 신호.
- **검증**: 라이브 경기 때 **Render 스크래퍼 Logs**에서 `source=` 줄 확인 — `SSR-FALLBACK`이면 신선fetch 실패(→ in-page fetch 견고화 필요), `LIVE-FETCH`/`XHR-CAPTURE`면 신선(원인 다른 데).

---

## 4. 핵심 함정 (fresh 세션이 꼭 알 것)

- **`application.yml` gitignore** → 배포 이미지에 없음. 모든 시크릿·`ddl-auto`는 Render env로. 로컬은 `backend/src/main/resources/application.yml`(이 PC에만 있음, `.example`이 템플릿).
- **Spring Boot 4 / Security 7**: `authorizeHttpRequests`에 매칭 안 되면 **DENY(403)**. CSRF disable은 메서드 레퍼런스(`AbstractHttpConfigurer::disable`).
- **Google=OIDC**: `userInfoEndpoint.oidcUserService(...)`가 실제 호출됨(`userService`는 비OIDC용). 유저 생성은 `CustomOidcUserService` + 성공핸들러 둘 다에서 보장.
- **크로스도메인 쿠키**: 프론트(vercel)≠백엔드(onrender) → `access_token` 쿠키 `SameSite=None;Secure` 필수. Safari/일부 Chrome은 서드파티 쿠키 차단 가능 → **로그인 유지가 불안정하면 커스텀 도메인**(app.x / api.x 서브도메인)이 근본해법.
- **스크래퍼 포트**: Render는 `$PORT` 바인딩 필요 → Dockerfile `CMD ... --port ${PORT:-8800}`(shell형). Chromium은 `--no-sandbox --disable-dev-shm-usage`.
- **api.py/scraper.py 수정 후** 스크래퍼 재배포(또는 로컬 uvicorn 재시작) 필요 — 자동 리로드 없음.
- **git**: 친구(`yejun9052`)가 같은 main에 자주 푸시함 → push 전 `git -c rebase.autoStash=true pull --rebase origin main` 습관. 미완성 작업(comment/AI 등)이 working tree에 섞여 있으니 **커밋은 파일 스코프 지정**해서.
- **Windows bash의 `python`은 MS Store 스텁**(빈 출력). 스크립트는 `fotmob_scraper/.venv/Scripts/python.exe` 사용.

---

## 5. 참고

- 로직 문서: [docs/logic/](logic/README.md) — 시계/HT, 크롤링, AI 프롬프트(+예시), 채점, 댓글.
- 규약/실행: 루트 `CLAUDE.md`.
- TiDB SQL Editor: 관리자 권한 변경 `UPDATE test.users SET role='ADMIN_USER' WHERE email='leey217423@gmail.com';`
- 우선순위 추천: **A(상세 느림) → B(중복 크롤) → E(HT 검증)** 순. C/D는 필요 시.
