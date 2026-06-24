# Ballix 발표 가이드 (DEMO GUIDE)

> 발표·시연용 문서. **"무엇을 보여줄지 / 어떤 순서로 / 무슨 말을 할지"** 를 정리했다.
> 기능별 동작 근거는 이 세션에서 **로컬 전 스택을 실제로 띄우고 가상 경기로 검증**한 결과에 기반한다([검증 결과](#5-검증-결과-이-문서의-근거) 참고).

---

## 0. 한 줄 소개

**Ballix** — FotMob 실시간 데이터로 돌아가는 **풀스택 축구 경기 예측 앱**. 라이브 경기를 초 단위로 따라가고, **Gemini AI가 승률을 실시간으로 갱신**하며, 유저는 **역배일수록 높은 점수**를 받는 포인트제로 경쟁한다.

```
FotMob ──Playwright──> Python FastAPI(:8800) ──HTTP──> Spring Boot(:8080) ──> MySQL
                          (stateless 수집)          (스케줄·DB·폴링·AI 소유)        │
                                                                          React(:5173)
```

| 레이어 | 스택 | 한 줄 역할 |
|---|---|---|
| 프론트 | React 18 + Vite (JSX) | 상태기반 라우팅, axios 인터셉터로 공통 응답 언래핑 |
| 백엔드 | Java 21 · Spring Boot 4 | 스케줄·폴링·DB·AI·인증의 단일 소유자 |
| 스크래퍼 | Python 3.12 · Playwright · FastAPI | FotMob SSR(`__NEXT_DATA__`) 추출 전담(stateless) |
| DB | MySQL (배포: TiDB Serverless) | `ddl-auto: update` 자동 스키마 |

---

## 1. 발표 시연 시나리오 (권장 순서)

> 데모용 가상 데이터는 `backend/seed_virtual.sql` 로 한 번에 심을 수 있다(아래 [부록 A](#부록-a-가상-경기로-시연-환경-띄우기)). 월드컵 결승 **대한민국 2:1 브라질(종료)** + 4강 **일본 vs 독일(진행 중)** 시나리오가 준비된다.

### ① 메인 화면 — "라이브가 살아있다"
- **진행 중 경기 카드의 시계가 실제로 흐른다**(`66:09 → 66:10 …`). 서버 부하 0 — 프론트가 `Date.now() - liveStartedAtMs`(절대 epoch)로 매초 클라이언트에서 계산.
- 상단 **공지 배너**(예약 게시), **AI 승률 켜진 경기 상단 정렬**, 날짜/리그/AI 필터.
- 멘트 포인트: *"이 시계는 FotMob이 주는 게 아니라, 하프 시작 실제 시각을 앵커로 잡아 우리가 흘립니다. 그래서 SSR 지연(0~7분)에도 안 흔들려요."*

### ② 경기 상세 — "AI가 경기 흐름을 읽는다" (⭐ 핵심)
대한민국 2:1 브라질 상세 → **AI 패널**로 스크롤:
- **승률 변화 히스토리**: 경기 전 → 15·30·45·60·75·90분 단계별로
  - 그 시점 **승률 3종(홈/무/원정)** + **당시 스코어** + **변동 화살표**(▲홈 18%p) + **변동 사유(한국어)**
  - 예) *"전반 27분 손흥민 선제골로 한국 승률 약 18%p 상승"*, *"후반 72분 한국 추가골 — 승률 역전(홈 64%)"*
- 멘트 포인트: *"경기 전엔 AI가 브라질 58%로 봤어요. 골이 들어갈 때마다 Gemini가 직전 승률과 골·카드 이벤트를 받아 다시 예측하고, **왜 바뀌었는지 이유까지** 남깁니다."*
- 같은 패널에 **골 요약(AI)**, **예상 스코어**, 라인업/이벤트(피치 좌표 기반 포메이션).

### ③ 예측하기 — "맞히는 것보다 '역배'가 중요하다" (⭐ 차별점)
- 로그인 후 결승 예측 → **역배 가중 포인트제**:
  | 고른 결과의 AI 순위 | 점수 |
  |---|---|
  | 정배(최고 확률) 적중 | **500점** |
  | 중간 순위 적중 | **1000점** |
  | 최대 역배(최저 확률) 적중 | **2000점** |
  | 오답 | 0점 |
- 멘트 포인트: *"모두가 브라질을 찍을 때 한국을 찍어 맞히면 4배 점수. AI 확률을 역이용하는 메타가 생깁니다."*

### ④ 랭킹 — "누적 포인트로 경쟁"
- **포인트 내림차순** 리더보드, 적중/적중률 병기, **5경기 미만은 비공식(회색)**, **가상 AI 유저도 참가**.

### ⑤ 선수 카드 뽑기 + 스쿼드 — "수집·구성의 재미"
- 가챠형 **6등급 카드**(아마추어→레전드), 등급 공개 연출, 10연차.
- **오버롤은 FotMob 시즌 스탯 기반 포지션별 가중식**으로 산출(GK/CB/풀백/DM/공격 공식 상이).
- 뽑은 카드를 **4-2-3-1 피치에 드래그 배치**(스쿼드 빌더).

### ⑥ 관리자 기능 (시간 남으면)
- AI 승률 **생성/실시간 갱신 on·off**, 공지 **예약 게시**, 유저 권한·정지(+안내문), **유튜브 하이라이트** 자동 검색(한국 방송사 우선).

---

## 2. 기술적 하이라이트 (질문 대비)

발표에서 "기술적으로 뭐가 어렵냐"는 질문에 꺼낼 카드들.

### 2-1. 라이브 시계 앵커 아키텍처
- FotMob은 공개 API가 없고 `/api/matchDetails` 직접 호출을 **차단** → Playwright로 SSR 스냅샷만 읽음. 이 값은 **0~7분 불규칙 지연**.
- 해결: `status.halfs`(하프 실제 시작 시각)로 `경과초 = 2700·후반여부 + (지금 − 하프시작)` 계산 → 지연 제거. 타임존 모호성은 신뢰 UTC(`utcTime`)와의 차이를 **15분 배수로 반올림**해 보정.
- 앵커(`liveStartedAt`)는 1회만 설정(재앵커는 11분 주기), 프론트는 **절대 epoch(`liveStartedAtMs`)** 로 받아 타임존 무관하게 매초 계산.
- HT/연장/승부차기 등 **정지 구간은 앵커를 비워** 시계를 멈춘다.

### 2-2. HTTP-in-transaction 방지 패턴
- 크롤(네트워크 I/O)을 트랜잭션 안에서 하면 커넥션을 오래 점유 → `@Lazy self` 프록시 주입으로 **HTTP는 트랜잭션 밖, DB 저장만 독립 트랜잭션**.

### 2-3. DB-first lazy-cache + prewarm
- 순위·상세·하이라이트·AI요약은 **DB에 없을 때만 1회 크롤 후 캐시**. 종료 경기 상세는 유저가 열기 전 **백그라운드 선반영(prewarm)** 으로 request-time 지연 회피.

### 2-4. 라이브 빠른 폴링 + 지터
- IN_PLAY 경기만 20초 + **랜덤 지터(300~500ms)** 로 이벤트·HT·종료를 초 단위 반영. 크롤 엔드포인트는 **300~500ms throttle + 단일 세마포어**로 직렬화(무료 512MB OOM 방지).

### 2-5. AI 실시간 재예측 트리거
- 벽시계가 아니라 **킥오프 기준 경과시간 버킷**(15·30·45·60·75·90분)으로 트리거 → HT 제외, 전·후반에만. 매 재예측이 **스냅샷 1행 + 변동 사유**를 쌓음(②의 히스토리).

### 2-6. 공통 응답 규약
- `CommonResponse<T>{success,msg,data}` 엔벨로프 + axios 인터셉터가 `data`만 언래핑. 응답 메시지는 `ResponseMessage` 상수로 단일 관리.

---

## 3. 숫자로 보는 규모

- 백엔드 도메인 패키지: fotmob / prediction / ai / user / notice / comment / playercard / squad / match …
- 공개·관리자 REST 엔드포인트 **40+**
- Python 스크래퍼 엔드포인트 **15+** (match / player / schedule / table / fixtures / playoff / commentary / youtube …)
- `@Scheduled` 작업 **5종**(일정 동기화 / 데이터 폴링 / 라이브 빠른 폴링 / 시계 재앵커 / 종료경기 선반영)

---

## 4. 데모 중 자주 나오는 질문 & 답

- **Q. AI는 매 순간 호출하나요?** → 아니요. 관리자가 켠 경기에 한해, 경과 15분 버킷 경계에서만. Gemini 호출이 과하지 않게 제한.
- **Q. 데이터는 어디서?** → 전부 FotMob. 직접 차단돼서 Playwright로 SSR을 읽는 Python 수집기를 따로 둡니다.
- **Q. 시계가 왜 안 틀리죠?** → 하프 실제 시작 시각 앵커 + 절대 epoch 전달(2-1).
- **Q. 점수가 왜 역배에 가중?** → 변별력. 다 같은 픽이면 순위가 안 갈려서, AI 확률을 역이용하게 설계.

---

## 5. 검증 결과 (이 문서의 근거)

이 세션에서 **로컬에 전 스택을 띄우고 가상 경기로 실제 검증**한 항목:

| 레이어 | 방법 | 결과 |
|---|---|---|
| Python 순수 로직 | `fotmob_scraper/test_live_clock.py` (Playwright 없이 시계·상태 파싱 함수 직접 호출) | **22/22 PASS** (앵커 경과초, HT/연장/승부차기 정지, 상태 정규화) |
| 백엔드 단위/통합 | `./gradlew.bat test` (Mockito 채점·시계 + **풀 컨텍스트 부팅+DB 연결**) | **BUILD SUCCESSFUL** |
| 백엔드 HTTP | 로컬 MySQL + 가상 시드로 엔드포인트 직접 호출 | allMatch·AI히스토리·리더보드·공지·compId·MatchDay·댓글 **200 + 엔벨로프 정상**, 인증가드 **401**, 관리자가드 **403** |
| DB | `ddl-auto` 자동 스키마 | 16개 테이블 생성, 가상 데이터 왕복 정상 |
| 라이브 시계 | `liveStartedAtMs` 경과 계산 | 시드 62분 → 화면 63~66분 정확히 흐름 |
| 프론트 | `npm run build` / `npm run lint` | 빌드 성공, **lint 0 error** |
| 프론트 렌더 | 데스크톱 + **모바일 375px** 라이브 프리뷰 | 홈·상세·AI히스토리·리더보드 정상, **가로 오버플로 0px** |

---

## 부록 A. 가상 경기로 시연 환경 띄우기

> 인터넷/FotMob 없이도 **결승·4강 가상 시나리오**로 전 기능을 시연할 수 있다. 스케줄러를 꺼서 헛크롤이 없다.

```powershell
# 1) 로컬 MySQL에 시연용 DB 생성
& "C:\Program Files\MySQL\MySQL Server 9.6\bin\mysql.exe" -uroot -p1234 -e "CREATE DATABASE IF NOT EXISTS ballix_test CHARACTER SET utf8mb4;"

# 2) 백엔드: 로컬 DB + 스케줄러/AI/번역 OFF 로 기동
cd C:\Users\User\Desktop\ballix\backend
$env:SPRING_DATASOURCE_URL="jdbc:mysql://127.0.0.1:3306/ballix_test?serverTimezone=Asia/Seoul&characterEncoding=UTF-8"
$env:SPRING_DATASOURCE_USERNAME="root"; $env:SPRING_DATASOURCE_PASSWORD="1234"
$env:FOTMOB_SCHEDULE_ENABLED="false"; $env:FOTMOB_POLL_ENABLED="false"
$env:AI_LIVE_PREDICTION_ENABLED="false"; $env:AI_TRANSLATION_ENABLED="false"; $env:NTFY_ENABLED="false"
.\gradlew.bat bootRun    # "Started BackendApplication" 뜨면 준비 완료

# 3) 가상 경기 시드(테이블 생성된 뒤 1회)
& "C:\Program Files\MySQL\MySQL Server 9.6\bin\mysql.exe" -uroot -p1234 --default-character-set=utf8mb4 ballix_test < seed_virtual.sql

# 4) 프론트
cd C:\Users\User\Desktop\ballix\frontend ; npm run dev   # http://localhost:5173
```

심어지는 데이터: 월드컵(77) / 팀 4(한국·브라질·일본·독일) / **종료 경기 1(한국 2:1 브라질, AI 히스토리 7단계)** / **진행 경기 1(일본 1:1 독일, 라이브 시계)** / 유저 4(리더보드) / 예측 3건(채점 완료) / 공지 1.

> 실제 라이브/AI/번역까지 보려면 스케줄러 ON + Python 스크래퍼(`:8800`) + Gemini 키가 필요하다(개발 실행은 루트 `CLAUDE.md` 참고).
