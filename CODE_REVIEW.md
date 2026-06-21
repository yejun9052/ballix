# Ballix 기능 점검 / 취약점 분석

점검일: 2026-06-10
범위: 이번 세션에서 추가·수정한 기능(AI 예측/요약, 라이브 시계, 라인업 강화, 예측·유저 도메인, 인증/보안 설정) 전체.
방법: 백엔드 소스 정적 분석(권한·트랜잭션·동시성·입력검증·정규화 로직).

> 요약: **치명적 버그는 없으나, 비용·자원을 소모하는 트리거 엔드포인트들이 권한 없이 공개되어 있는 것이 가장 큰 위험**이다. 학습/단기 프로젝트 기준으로는 동작하지만, 외부에 노출하면 FotMob 차단·Gemini 쿼터 소진·DB 커넥션 고갈로 쉽게 마비될 수 있다.

> ✅ **업데이트(2026-06-21): H1~H3(권한 없는 트리거) 해결됨.** 크롤·AI 트리거가 전부 `@PreAuthorize("hasRole('ADMIN_USER')")`로 보호됨 — `FotmobController#sync`, `AiAdminController#predict`, AI 골요약은 로그인 필수·강제재생성 미제공(`AiController#summary`), `@EnableMethodSecurity` 활성(`SecurityConfig`). 아래 H1~H3 항목은 이력으로만 남김.

---

## 심각도 한눈에

| ID | 심각도 | 항목 | 영향 |
|---|---|---|---|
| H1 | 높음 | 크롤/관리 트리거 엔드포인트 무인증 | FotMob 강제 크롤 → 차단/자원고갈 |
| H2 | 높음 | AI 요약 `force=true` 공개 | Gemini 무료 쿼터 소진(익명 무한 재생성) |
| H3 | 높음 | `MatchDay` lazy-crawl 공개(임의 날짜) | 임의 날짜 크롤 폭주 |
| M1 | 중간 | `@Transactional` 안에서 장시간 외부 HTTP | DB 커넥션 풀 고갈 |
| M2 | 중간 | AI 확률 정규화 음수 가능(반올림 엣지) | 홈 확률 -1% 저장 가능 |
| M3 | 중간 | 쿠키 `SameSite`/`Secure` 미설정 | 배포 시 CSRF/쿠키 전송 문제 |
| L1 | 낮음 | CORS `localhost:*` + credentials | 배포 전 도메인 고정 필요 |
| L2 | 낮음 | 라이브 시계 클라이언트 시계 의존 | 단말 시계 틀어지면 진행시간 드리프트 |
| L3 | 낮음 | `allMatch` 무페이징 | 데이터 증가 시 응답 비대 |
| L4 | 낮음 | 채점 동시성(스케줄러 풀 확장 시) | 현재는 안전, 확장 시 중복집계 |

> 참고(양호): `application.yml`은 `.gitignore` 처리되어 git에 추적되지 않으며(`.example`만 커밋), **API 키·DB 비밀번호·JWT 시크릿이 git 히스토리에 없음**을 확인했다.

---

## 높음 (High)

### H1. 크롤/관리 트리거 엔드포인트에 권한 가드가 없다
`FotmobDebugController`(`/api/fotmob/**`)와 `FotmobController`(`/api/match/{id}/fotmob/sync`)의 변경/트리거 엔드포인트가 `SecurityConfig`에서 `/api/**` permitAll로 열려 있고 별도 `AdminGuard`도 없다.

무인증으로 호출 가능한 위험 엔드포인트:
- `POST /api/fotmob/poll-interval?minutes=` — 주석엔 "(관리자)"라고 적혀 있지만 **실제 권한 검사 없음**. 누구나 폴링 주기를 1분으로 낮춰 크롤 부하·차단 위험을 키울 수 있다.
- `POST /api/fotmob/schedule/sync?pastDays=&futureDays=` — `pastDays`/`futureDays`에 상한이 없어 `?pastDays=3650&futureDays=3650`처럼 거대한 범위를 넣으면 날짜별 크롤이 수천 건 발생.
- `POST /api/fotmob/schedule/sync/{date}`, `POST /api/fotmob/standings/{id}/sync`, `POST /api/match/{id}/fotmob/sync` — 임의 즉시 크롤 트리거.
- `GET /api/fotmob/preview/{fotmobId}`, `GET /api/fotmob/search` — 임의 FotMob 프록시 크롤.

**영향**: 외부 노출 시 익명 사용자가 반복 호출만으로 Python 스크래퍼를 과부하시키고 FotMob에 차단당하게 만들 수 있다(서비스 전체 데이터 소스가 죽음).

**권장**:
- 상태를 바꾸거나 크롤을 유발하는 모든 엔드포인트에 `AdminGuard.requireAdmin(userId)` 적용(AI 예측이 이미 쓰는 패턴 재사용).
- 또는 `SecurityConfig`에서 `/api/fotmob/**`, `/api/match/*/fotmob/sync`를 `authenticated()`/관리자 권한으로 분리.
- `schedule/sync`의 `pastDays`/`futureDays`에 상한(예: 30) 클램프.

### H2. AI 골 요약이 공개 + `force=true` 재생성 허용 → Gemini 쿼터 소진
`GET /api/match/{id}/ai/summary?force=true`(`AiController`)는 권한 검사가 없다. `force=true`면 `hasSummary()` 캐시를 무시하고 매번 Gemini를 다시 호출한다(`AiSummaryService.getOrGenerate`).

**영향**: 익명 사용자가 `force=true`로 반복 호출하면 무료 Gemini RPM/RPD 한도를 빠르게 소진시켜 정상적인 AI 기능을 마비시킬 수 있다. (요약 1회 = ltc 크롤 + Gemini 호출 비용)

**권장**: `force=true`는 `AdminGuard`로 제한하고(일반 조회 = 캐시만, 생성/재생성 = 관리자), 또는 최소한 종료 경기 + 캐시 없을 때만 1회 생성하도록 `force`를 관리자 전용 파라미터로 분리.

### H3. `MatchDay` 날짜 조회가 임의 날짜 lazy-crawl을 유발(공개)
`MatchService.findByDate`는 DB에 해당 날짜 경기가 없으면 그 자리에서 `scheduleService.syncDate()`로 크롤한다. `GET /api/match/MatchDay?date=YYYY-MM-DD`는 공개이고 날짜 검증이 없다.

**영향**: `date`를 매번 다른 값으로 바꿔가며 호출하면(`2000-01-01`, `2000-01-02`, …) 매 요청이 신규 크롤을 유발 → 스크래퍼 과부하·FotMob 차단. H1과 같은 부류의 자원 고갈 벡터다.

**권장**: lazy-crawl 대상 날짜를 합리적 범위(예: 오늘 ±30일)로 제한하고, 범위 밖이면 크롤 없이 빈 결과 반환. 과도한 미저장 날짜 요청에 캐시/쓰로틀 적용.

---

## 중간 (Medium)

### M1. `@Transactional` 트랜잭션 내부에서 장시간 외부 HTTP 호출
DB 커넥션을 잡은 채로 외부 네트워크 I/O를 기다리는 메서드들:
- `AiPredictionService.predict` (`@Transactional`) → `geminiClient.generate()` (재시도 포함 최대 ~2분: 30s read timeout × 4 시도 + 백오프).
- `AiSummaryService.getOrGenerate` (`@Transactional`) → FotMob ltc 크롤 + Gemini 호출.
- `FotmobSyncService.syncMatch` / `refreshLiveClock` (`@Transactional`) → `fotmobClient.getMatch()` (Playwright 크롤이라 수 초~수십 초).

**영향**: 외부 호출이 느리거나 동시 요청이 몰리면 HikariCP 커넥션이 묶여 풀이 고갈되고, 다른 요청이 커넥션 대기로 타임아웃난다. 일정 동기화(`syncRange`)는 이전에 같은 문제로 "크롤은 트랜잭션 밖, 저장만 트랜잭션"으로 이미 분리했는데, **AI 서비스와 단일 경기 sync에는 그 패턴이 적용되지 않았다.**

**권장**: "외부 호출 → 결과 확보 후 짧은 트랜잭션으로 저장"으로 분리. 예) `predict`에서 Gemini 호출을 트랜잭션 밖에서 수행하고, `match.applyPrediction(...) + save`만 별도 `@Transactional` 메서드로. 최소한 단기 프로젝트라면 HikariCP `maximum-pool-size`/`connection-timeout`을 명시해 폭주 시 빠르게 실패하도록.

### M2. AI 확률 정규화에서 홈 확률이 음수가 될 수 있다
`AiPredictionService.parseAndNormalize`:
```java
int dd = Math.round(d * 100f / sum);
int aa = Math.round(a * 100f / sum);
int hh = 100 - dd - aa;     // 클램프 없음
```
`homeWin=0`이고 draw·away가 비슷하게 큰 경우, 두 반올림이 모두 올림되면 `dd+aa = 101`이 되어 **`hh = -1`** 이 저장될 수 있다(예: h=0, d=99, a=99 → dd=50, aa=50은 안전하지만, h=0, d=101, a=100 등 합이 큰 분포에서 발생 가능). 음수 확률은 프론트 막대그래프에서 깨진 표시를 만든다.

**권장**: `hh = Math.max(0, 100 - dd - aa)` 클램프, 또는 합이 100을 넘으면 가장 큰 항목에서 차감. 추가로 음수/100 초과 입력 방지를 위해 각 값 `Math.max(0, …)` 처리.

### M3. 인증 쿠키에 `SameSite`/`Secure` 미설정
`CookieUtil.addCookie`는 `HttpOnly`만 설정하고 `SameSite`·`Secure`가 없다. `SecurityConfig`는 CSRF를 끄고 쿠키 기반 인증을 쓴다.

**영향**: 로컬(HTTP, 단일 출처)에서는 브라우저 기본 `SameSite=Lax`가 어느 정도 막아주지만, 다른 도메인으로 배포하면 (a) `Secure` 없으면 HTTPS 쿠키 정책에 걸리고 (b) CSRF disable + 쿠키 인증 조합이 상태변경 요청에 취약해진다.

**권장**: 배포 시 `SameSite=None; Secure`(크로스도메인) 또는 `SameSite=Strict/Lax`(동일도메인) 명시. CSRF를 끈 대신 상태변경은 쿠키가 아닌 `Authorization` 헤더 토큰을 쓰는 방안도 고려.

---

## 낮음 (Low)

- **L1. CORS `localhost:*` + `allowCredentials(true)`** (`SecurityConfig`): 개발 편의 설정. 배포 전 실제 프론트 출처로 고정 필요(와일드카드 출처 + credentials는 배포 환경에서 위험).
- **L2. 요약 소스 라벨 판별이 문자열 매칭에 의존**: `AiSummaryService`의 `prompt.contains("해설")`로 라이브티커/이벤트 폴백을 구분 — 프롬프트 문구를 바꾸면 로그가 틀어진다(로그 전용이라 기능 영향은 없음). 불리언 플래그로 교체 권장.
- **L3. `allMatch()` 무페이징**: 전체 경기를 한 번에 직렬화. 현재 데이터량(±10일, 2개 리그)에선 문제없지만 리그/기간 확장 시 페이지네이션 필요.
- **L4. 채점 동시성**: `gradeMatch`는 `isGraded()`로 멱등하지만, 단일 스레드 `@Scheduled`(기본 풀 1)라 현재는 경합이 없다. 스케줄러 풀을 키우거나 수동 트리거를 추가하면 같은 경기 동시 채점으로 전적 중복 집계 위험 → 행/유저 단위 락 또는 DB 유니크 제약 고려.
- **L5. 라이브 시계 단말 시계 의존**: 프론트가 `지금 - liveStartedAt`로 매초 계산하므로 클라이언트 시계가 서버와 크게 다르면 진행시간이 드리프트. (서버 한계 아님, 표시 정확도 이슈)
- **L6. `backend/boot.out.log` git 추적**: 임시 로그가 추적 중(이미 `PROGRESS.md` TODO). `.gitignore` + `git rm --cached` 권장.

---

## 정상 동작 확인된 부분 (양호)

- **시크릿 비노출**: `application.yml`은 gitignore 처리되어 추적 안 됨. Gemini 키·Google client-secret·DB 비밀번호·JWT 시크릿이 git 히스토리에 없음.
- **AI 승률 예측 권한**: `POST /api/admin/ai/predict`는 `AdminGuard.requireAdmin`으로 보호되고, 결과 조회만 공개 — 의도대로 동작.
- **예측 도메인 가드 순서**: 비로그인 → 없는 경기 → 허용 리그 아님 → 킥오프 지남 순으로 올바르게 검증(`PredictionService.predict`). `Winner` enum 바인딩으로 잘못된 값 자동 거절.
- **예측 비율 노출 차단**: `getRatio`는 본인이 예측한 뒤에만 분포 공개 — 선택 편향 방지 의도대로.
- **채점 멱등성**: `gradeMatch`가 `Prediction.isGraded()`로 재폴링 시 중복 집계 방지.
- **JWT 검증**: 만료·서명 위조 시 `validate()`가 false 반환 → 익명 처리(정보 노출 없음). 비로그인 시 `@AuthenticationPrincipal Long userId`가 null로 들어와 `notLogin` 가드가 정상 작동.
- **라이브 앵커 스냅백 방지**: 3분 풀폴링은 `updateLiveIfAbsent`로 앵커가 없을 때만 설정, 재앵커는 11분 작업만 — 시계 역행 방지 설계 정상.
- **AI 예측 멱등성**: `hasPrediction()`(`aiPredictedAt != null`)으로 `force=false` 시 토큰 0 재호출 차단.

---

## 권장 조치 우선순위

1. **H1·H2·H3** — 크롤/AI 생성 트리거에 `AdminGuard` 또는 인증 요구 + 입력 범위 클램프. (외부 노출 계획이 있다면 최우선)
2. **M1** — AI/단일 sync의 외부 HTTP를 트랜잭션 밖으로 분리, HikariCP 풀·타임아웃 명시.
3. **M2** — 확률 정규화 음수 클램프(한 줄 수정).
4. **M3·L1** — 배포 시 쿠키 `SameSite/Secure` + CORS 출처 고정.
5. 나머지 L 항목은 데이터·트래픽 증가 시점에 대응.

> M2(확률 클램프)와 H1/H2 권한 가드는 변경 폭이 작고 효과가 커서 먼저 적용할 가치가 있다. 적용을 원하면 해당 파일들을 바로 수정하겠다.
