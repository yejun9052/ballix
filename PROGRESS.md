# Ballix 진행상황

풀스택 축구 경기 예측 앱. 데이터는 전부 FotMob에서 수집.
최종 업데이트: 2026-06-10

> 아키텍처/명령어 상세는 `CLAUDE.md`, 프론트 연동 API는 `API_SPEC.md` 참고.

```
FotMob ──Playwright──> Python FastAPI(:8800) ──HTTP──> Spring Boot(:8080) ──> MySQL
                                                                          React(:5173)
```

---

## ✅ 완료

### 데이터 수집 (FotMob)
- [x] 일정·라인업·이벤트·평점·순위 자동 동기화 + 킥오프 주변 폴링
- [x] 리그 필터를 **leagueId 방식**으로(기본 `77`=월드컵, `114`=남자 친선) — 이름이 같은 여자/U21/클럽 파생 리그 정확히 배제
- [x] **DB-first lazy-cache** — 순위·경기상세 조회 시 비었으면 1회만 크롤+저장, 이후 DB
- [x] 크롤 부하 축소(`refresh-past-days`=2: 주기 재동기화는 과거 2일만)
- [x] 팀 엠블럼, KST 저장, 종료 시 순위 갱신

### 예측
- [x] 예측 저장/수정/조회 API (로그인 필요)
- [x] 검증 — `Winner` enum / 허용 리그(`prediction.allowed-leagues`) / 킥오프 지남 / 중복 수정
- [x] **예측 비율 %** (`/ratio`, 본인이 예측한 뒤에만 공개)
- [x] **자동 채점** — 경기 종료 시 `isCorrect` 기록 + 유저 전적(`matches_played`/`correct_count`) 갱신, 멱등

### 유저 / 랭킹
- [x] Google OAuth2 로그인 → JWT HTTP-only 쿠키, `@AuthenticationPrincipal Long userId`
- [x] `GET /api/user/me`(내 전적·적중률), `GET /api/user/leaderboard`(적중순 랭킹)

### 인프라 / 정리
- [x] 커스텀 예외 계층(`BusinessException`/BadRequest/NotFound/Unauthorized) + 전역 핸들러
- [x] 응답 DTO화(`PredictionView`/`UserView`/`RankView`) — User(email) 비노출
- [x] 패키지 정리: `matche → match` rename, `fotmob.{lineup,matchevent,league}` 하위 분리
- [x] lazy-proxy 직렬화 노이즈 제거(`BaseTimeEntity @JsonIgnoreProperties`)
- [x] 과거 잔재/중복 데이터 청소

### AI 기능 (Gemini · `gemini-3.1-flash-lite`) — 2026-06-10
- [x] **승률 예측** — 관리자가 선택한 경기만 생성(`POST /api/admin/ai/predict`). 근거 = FIFA 랭킹(보조)+순위+최근폼, **1% 단위** 합100. 결과는 `Match`에 저장돼 누구나 조회, 선택 경기 목록 최상단
- [x] **골 요약** — 종료 경기 `GET /api/match/{id}/ai/summary`. FotMob 라이브티커(ltc) **골 해설 크롤 → 해설 말투 한국어 요약**, 없으면 이벤트 폴백, DB 캐시(force 재생성)
- [x] **관리자 게이팅** — `/api/user/me`에 `role`/`admin` 추가(role=ADMIN_USER or 화이트리스트 이메일). 프론트가 `admin`으로 예측 UI 노출
- [x] Gemini 429/503 자동 재시도, 키 미설정 시 안전 거절

### 라이브 / 라인업 강화 — 2026-06-10
- [x] **진행시간** — `liveTime`("67'"/"45+2'"/"HT") + `liveStartedAt` 앵커. 프론트가 `지금-앵커`로 **초 단위 시계** 자체 흐름(서버부하 0), 추가시간·하프타임 처리
- [x] 시간 앵커 **11분 주기 갱신**(FotMob SSR ~10분 갱신) — 풀폴링은 재앵커 안 함(스냅백 방지). 폴링 기본 3분
- [x] **포메이션** + **선수 피치 좌표**(`posX/posY`) → 프론트 포메이션 배치도
- [x] **선수 사진** — `playerimages/{fotmobPlayerId}.png`(프론트 URL 구성, 백엔드 저장 X)
- [x] `MatchDay` **DB-first lazy-crawl**(없는 날짜 조회 시 즉석 크롤·저장)
- [x] 일정 7/20(결승)까지 적재

### 페이지네이션 — 2026-06-10
- [x] **목록 API 전부 Spring `Page<T>`로 전환** (페이지당 **8개**, `?page=&size=`). 응답 `data`가 `{ content[], number, size, totalElements, totalPages, first, last }`
- [x] 적용: `allMatch`·`findByCompId`·`MatchDay`·`upcoming`·`myPrediction`(최신순)·`leaderboard`·`comp/allComp`·`fotmob/{lineup,events}`·`fotmob/standings/{id}`(+`/sync`)
- [x] **리더보드 순위 연속성** — `rank`는 페이지 오프셋 기준(2페이지 첫 항목=9위)
- [x] **내부용 List 메서드 분리 유지** — 채점·예측분포(전체 예측)·AI 다이제스트(전체 순위/폼)·`getView`(포메이션 피치=전체 라인업)는 페이징하면 깨지므로 List 버전 그대로
- [x] 프론트 `FotmobTester.jsx`: 공통 `asPage()`·`Pager` 컴포넌트로 모든 목록 탭에 페이지 버튼(◀/▶) 적용, `data.content` 소비
- ⚠️ 순위는 8행 단위라 한 조(group)가 페이지 경계에서 쪼개질 수 있음 → 조 전체 보려면 `?size=100`

### 보안 보강 (취약점 점검 후) — 2026-06-10
- [x] **H1 크롤/관리 트리거 엔드포인트 관리자 잠금** — `@EnableMethodSecurity` + `@PreAuthorize("hasRole('ADMIN_USER')")` (poll-interval·schedule/sync·standings/sync·fotmob/sync·preview·search). `schedule/sync` 범위 상한(30) 클램프
- [x] **H2 AI 요약 공개 `force` 제거** — 순수 DB-first lazy(있으면 캐시, 없으면 1회 생성·저장). 익명의 Gemini 재생성 남용 차단
- [x] **H3 MatchDay lazy-crawl 통제** — 오늘 ±30일 범위 클램프 + 빈 날짜 음성 캐시(반복 요청 재크롤 방지, 동시요청 1회만)
- 점검 보고서: 루트 `CODE_REVIEW.md`
- ⚠️ H1 잠금 엔드포인트는 **DB role=ADMIN_USER + 재로그인** 필요(이메일 화이트리스트는 AI 예측에만 적용)

### 프론트 (테스트 콘솔 `FotmobTester.jsx`)
- [x] 탭: 📅 일정 · 🏆 순위 · 🎯 예측 · 🤖 AI · 🏅 랭킹 · 🛠 도구
- [x] 예측 탭(로그인→경기→예측→비율), 랭킹 탭(내 전적+리더보드), 도구 탭 일수 입력
- [x] 🤖 AI 탭(관리자 승률 예측 + 막대그래프 / 골 요약 / 날짜 필터), 일정 탭 라이브 초시계·포메이션 피치·선수 사진

### 문서
- [x] `CLAUDE.md`(아키텍처/함정), `API_SPEC.md`(프론트 전달용 응답 스키마) — AI/라이브/포메이션 필드 반영

### 알려진 한계 (FotMob 소스)
- 라이브 진행시간이 **실제보다 몇 분 지연** — FotMob `/api/matchDetails` 직접호출 404 차단, SSR 스냅샷만 가능. 친선은 ltc도 비어 더 신선한 소스 없음
- **평점은 FotMob 스탯 커버 경기만** 제공(소규모 친선은 전 선수 `null`) — 우리 버그 아님

---

## 🔜 다음 / TODO

| 우선 | 항목 | 메모 |
|---|---|---|
| — | 관리자 엔드포인트 권한 | **AI 예측=`AdminGuard`(role/이메일), 크롤·관리 트리거=`@PreAuthorize` ADMIN_USER**(H1). 조회성 `/api/**`은 permitAll |
| 낮 | admin 기준 통일 | H1은 role만, AdminGuard는 role+이메일 → 화이트리스트 이메일 계정은 H1 잠금 엔드포인트 못 씀. 기준 일원화 검토 |
| 낮 | 라이브 시간 지연 | FotMob SSR 한계 — 큰 경기는 ltc `elapsed` 우선 사용으로 일부 개선 가능 |
| 중 | 순위 stale 방지 | `LeagueStanding.createAt` 기준 TTL(예: 6h) 재크롤 |
| 중 | 5대리그 추가 | `leagues`에 `47`(PL)·`87`(라리가)·`42`(UCL) 추가 — **DB 변경 불필요**, 단 6월은 비시즌이라 경기 없음 |
| 낮 | OAuth 쿠키 `SameSite` | 로컬 OK, 다른 도메인 배포 시 `None; Secure` 필요 |
| 낮 | 테스트 코드 | `gradeMatch` 멱등·`predict` 가드·`getRatio`부터 |
| 낮 | `backend/boot.out.log` | 임시 로그가 git 추적 중 → `.gitignore` + `git rm --cached` |

---

## ⚙️ 실행 (4개 프로세스, 순서 중요)
1. MySQL (3306, DB `backend`)
2. Python: `fotmob_scraper/.venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8800`
3. 백엔드: `backend/.\gradlew.bat bootRun`
4. 프론트: `test-api/npm run dev`

> 설정 시크릿은 `backend/src/main/resources/application.yml`(gitignore). 템플릿은 `application.yml.example` 복사 후 채우기.
> AI 쓰려면 `ai.gemini.api-key`(Google AI Studio 키) 필요. 폴링 주기: `fotmob.poll.interval-minutes`(3분), 라이브시계 `fotmob.poll.clock-ms`(11분).
