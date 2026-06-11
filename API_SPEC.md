# Ballix API 명세서 (임시 · 여기까지)

> 축구 경기 예측 앱. 프론트 연동용 API 정리. **WC(월드컵) + 친선 데이터가 들어와 있고, 예측 기능은 월드컵만 대상.**
> 작성 시점 기준이라 이후 바뀔 수 있음.

---

## 0. 기본 정보

| 항목 | 값 |
|---|---|
| Base URL | `http://localhost:8080` |
| 응답 형식 | JSON (아래 공통 envelope) |
| 인증 | **HttpOnly 쿠키(`access_token`, JWT)** — Google OAuth 로그인 시 발급 |
| CORS | `http://localhost:*` 허용, **쿠키 동봉 필수** |

### 공통 응답 형식 (모든 API 공통)

성공/실패 모두 이 형태로 감싸서 옵니다.

```json
{
  "success": true,
  "msg": "데이터 조회 성공",
  "data": { ... }      // 또는 [ ... ], 실패 시 null
}
```

- `success: true` → `data` 사용
- `success: false` → `msg`에 에러 메시지 (예: "로그인이 필요합니다.")

### 페이지네이션 (목록 응답)

**목록을 반환하는 API는 Spring `Page` 형식**으로 옵니다. `data`가 배열이 아니라 아래 객체이고, **실제 목록은 `data.content`** 에 있습니다.

```json
{
  "success": true,
  "msg": "데이터 조회 성공",
  "data": {
    "content": [ /* 이 페이지 분량의 목록 */ ],
    "number": 0,             // 현재 페이지 번호 (0부터)
    "size": 8,               // 페이지당 개수
    "totalElements": 57,     // 전체 개수
    "totalPages": 8,         // 전체 페이지 수
    "first": true,
    "last": false,
    "numberOfElements": 8    // 이 페이지에 실제로 담긴 개수
  }
}
```

- 요청: **`?page={0부터}&size={개수}`** — 예 `?page=2&size=8`. **`size` 기본값 = 8.**
- 정렬: `?sort={필드},asc|desc` (예 `?sort=matchTime,asc`). 대부분 서버가 기본 정렬을 주므로 생략 가능.
- 페이지 버튼: `number`(현재)·`totalPages`(전체)로 그리고, `first`/`last`로 이전·다음 비활성화 판단.

**페이지네이션 적용 엔드포인트**: `allMatch` · `findByCompId` · `MatchDay` · `upcoming` · `myPrediction` · `leaderboard` · `comp/allComp` · `fotmob/lineup` · `fotmob/events` · `fotmob/standings/{id}`(+`/sync`)
**비페이지(단건 객체) 유지**: `/{id}/fotmob`(통합 뷰 — 포메이션 피치가 전체 라인업을 한 번에 필요) · `findByMatch` · `ratio` · `user/me` · `ai/predict` · `ai/summary`

> 아래 각 목록 API의 "응답: `data` = `Xxx[]`" 표기는 **`data.content`가 `Xxx[]`** 라는 의미입니다(나머지 페이지 메타는 위 형식 공통).

### 에러 처리

검증 실패·예외는 **HTTP 400 + `success:false`** 로 옵니다 (리다이렉트 아님).

```json
{ "success": false, "msg": "월드컵 경기만 예측할 수 있습니다.", "data": null }
```

프론트는 status code보다 **`json.success`로 분기**하면 됩니다.

### 인증이 필요한 호출은 쿠키를 같이 보내야 함

예측 관련 API는 로그인 쿠키가 필요합니다. `fetch`에 **`credentials: "include"`** 를 꼭 넣으세요.

```js
fetch("http://localhost:8080/api/prediction/myPrediction", { credentials: "include" })
```

> ⚠️ 프론트(5173)와 백엔드(8080)가 포트가 달라서(크로스 오리진) 쿠키 전송이 막힐 수 있음. 로그인했는데도 "로그인이 필요합니다"가 계속 뜨면 쿠키 SameSite 설정 이슈 → 백엔드에 알려주세요.

---

## 1. 인증 (Auth)

| 기능 | 방법 |
|---|---|
| 로그인 | 브라우저를 `http://localhost:8080/oauth2/authorization/google` 로 이동 (전체 페이지 리다이렉트) |
| 로그아웃 | `POST /api/auth/logout` (쿠키 동봉) → 쿠키 삭제 |

로그인 성공하면 쿠키가 자동 설정됩니다. 별도 토큰 헤더 처리 불필요.

---

## 2. 경기 (Match) — 인증 불필요

### `GET /api/match/allMatch`
전체 경기 목록.
- 응답: **페이지** — `data.content` = `Match[]` (페이지 메타 포함, `?page=&size=8`)

### `GET /api/match/findByCompId?id={competitionId}`
특정 대회의 경기 목록.
- `id`: 내부 competitionId (**월드컵 = 6**, 친선 = 1)
- 응답: **페이지** — `data.content` = `Match[]` (페이지 메타 포함, `?page=&size=8`)

### `GET /api/match/MatchDay?date={YYYY-MM-DD}`
특정 날짜의 경기 목록 (킥오프 빠른 순).
- 예: `/api/match/MatchDay?date=2026-06-13`
- 응답: **페이지** — `data.content` = `Match[]` (페이지 메타 포함, `?page=&size=8`)
- **DB-first lazy-crawl**: 그 날짜가 DB에 없으면 즉시 FotMob에서 크롤·저장 후 반환. 그래도 (등록 리그에) 경기 없으면 `success:false, msg:"날짜에 맞는 매치를 찾을 수 없습니다."`

### `GET /api/match/upcoming?compId={competitionId}`
**다가오는 경기**(킥오프 미래)만, 가까운 순. 예측 화면 메인용.
- `compId`: **선택** — 주면 그 대회만(**월드컵=6**), 없으면 전체
- 예: `/api/match/upcoming?compId=6` → 아직 안 시작한 월드컵 경기만
- 응답: **페이지** — `data.content` = `Match[]` (페이지 메타 포함, `?page=&size=8`)

---

## 3. 경기 상세 — 라인업 / 이벤트 (FotMob) — 인증 불필요

### `GET /api/match/{matchId}/fotmob`
경기 통합 뷰 (기본정보 + 라인업 + 이벤트).
- 응답: `data` = [`MatchFotmobView`](#matchfotmobview)

### `GET /api/match/{matchId}/fotmob/lineup`
라인업만 (페이지). **포메이션 피치는 전체 라인업이 필요하니 통합 뷰(`GET .../fotmob`)를 쓰세요.**
- 응답: **페이지** — `data.content` = [`LineupPlayer[]`](#lineupplayer) (`?page=&size=8`)

### `GET /api/match/{matchId}/fotmob/events`
이벤트(골/카드/교체)만 (페이지).
- 응답: **페이지** — `data.content` = [`MatchEvent[]`](#matchevent) (`?page=&size=8`)

### `POST /api/match/{matchId}/fotmob/sync`
스케줄 안 기다리고 즉시 동기화 후 통합 뷰 반환 (라인업이 없을 때 강제 갱신용).
- 응답: `data` = [`MatchFotmobView`](#matchfotmobview)

> 라인업은 보통 **킥오프 1시간 전부터** 공개됩니다. 그 전엔 `lineup`이 빈 배열일 수 있음.

---

## 4. 리그 순위 (Standings) — 인증 불필요

### `GET /api/fotmob/standings/{competitionId}`
조별 리그 순위 (페이지). (월드컵 `competitionId = 6`)
- 응답: **페이지** — `data.content` = [`LeagueStanding[]`](#leaguestanding) (`?page=&size=8`)
- 조별리그는 `groupName`("Grp. A" 등)으로 묶어서 보여주면 됨. 친선전은 순위표가 없어 `content`가 빈 배열.
- ⚠️ **페이지당 8행이라 한 조(group)가 페이지 경계에서 쪼개질 수 있음.** 조 전체를 한 화면에 보려면 `size`를 크게 주세요(예: `?size=100`).

---

## 5. 예측 (Prediction) — **로그인 필요 (쿠키 동봉)**

예측 값은 **`HOME_TEAM` / `AWAY_TEAM` / `DRAW`** 세 가지 enum 문자열.
화면엔 팀 이름(예: "대한민국 승")으로 보여주되 **서버엔 이 enum 값을 전송**하세요. (팀이 누군지는 Match에 이미 있음)

### `POST /api/prediction/predict?matchId={id}&predictedWinner={WINNER}`
예측 저장. **이미 예측했으면 수정**됩니다.
- 쿼리 파라미터: `matchId` (Long), `predictedWinner` (`HOME_TEAM`|`AWAY_TEAM`|`DRAW`)
- 응답: `data` = [`Prediction`](#prediction)
- 실패 케이스:

| 상황 | msg |
|---|---|
| 비로그인 | "로그인이 필요합니다." |
| 없는 경기 | "경기를 찾을 수 없습니다." |
| 월드컵 아닌 경기 | "월드컵 경기만 예측할 수 있습니다." |
| 킥오프 지남 | "이미 시작된 경기는 예측할 수 없습니다." |
| 잘못된 winner 값 | "요청 값이 올바르지 않습니다. (predictedWinner)" |

### `GET /api/prediction/myPrediction`
내 예측 전부 (페이지, 최신순).
- 응답: **페이지** — `data.content` = [`Prediction[]`](#prediction) (없으면 `content`가 빈 배열) (`?page=&size=8`)

### `GET /api/prediction/findByMatch?matchId={id}`
특정 경기에 대한 내 예측 1건.
- 응답: `data` = [`Prediction`](#prediction)
- 예측 안 했으면: `success:false, msg:"해당 경기에 대한 예측이 없습니다."`

### `GET /api/prediction/ratio?matchId={id}`
그 경기의 **예측 분포(%)**. **본인이 예측한 경기만** 조회 가능(예측 전엔 거절).
- 응답: `data` = `PredictionRatio`
```json
{
  "total": 12,
  "homePercent": 50, "drawPercent": 17, "awayPercent": 33,
  "homeCount": 6, "drawCount": 2, "awayCount": 4
}
```
- `percent`는 0~100 정수(반올림). 예측 안 했으면: `success:false, msg:"예측 후 비율을 볼 수 있습니다."`

---

## 5-2. 유저 / 리더보드

### `GET /api/user/me`  *(로그인 필요)*
내 정보 + 전적.
- 응답: `data` = `UserView`
```json
{ "id": 1, "name": "yejun Lee", "matchesPlayed": 12, "correctCount": 7, "accuracy": 58, "role": "ADMIN_USER" }
```
- `accuracy`: 적중률 0~100 정수 (`correctCount/matchesPlayed`), 참여 0이면 0
- `role`: `COMMON_USER` | `ADMIN_USER` — **관리자 UI 노출 판단은 `role === "ADMIN_USER"`로 검증**(과거 `admin` 불리언 필드는 제거됨)

### `GET /api/user/leaderboard`  *(공개)*
적중수 내림차순 랭킹 (페이지).
- 응답: **페이지** — `data.content` = `RankView[]` (`?page=&size=8`)
```json
{
  "content": [
    { "rank": 1, "name": "yejun Lee", "matchesPlayed": 12, "correctCount": 7, "accuracy": 58 }
  ],
  "number": 0, "size": 8, "totalElements": 23, "totalPages": 3, "first": true, "last": false
}
```
- `rank`는 **페이지를 넘겨도 연속**됩니다(서버가 페이지 오프셋 기준으로 매김 — 2페이지 첫 항목은 9위).
- 동률이면 경기수 적은 쪽이 위. 예측이 채점돼야 집계됨(`correctCount`는 경기 종료 시 자동 갱신).

---

## 5-3. AI 기능 (Gemini) — 승률 예측 / 골 요약

> AI 값은 **Google Gemini**(`gemini-3.1-flash-lite`)로 생성. 키는 백엔드 `application.yml`(`ai.gemini.api-key`).
> **승률 예측은 관리자만 "생성"**(트리거)하고, **결과 조회는 누구나** 가능 — 값이 `Match`에 저장돼 일반 경기 조회 응답에 그대로 포함됩니다.

### `POST /api/admin/ai/predict?matchId={id}&force={bool}`  *(관리자 전용, 쿠키 동봉)*
관리자가 고른 경기의 승률을 생성. 성공 시 `predictionEnabled=true`가 되어 목록 최상단으로 정렬.
- `force=true`면 재생성(기본 `false`: 이미 있으면 그대로 반환).
- 근거: **FIFA 랭킹(보조) + 리그 순위 + 최근 폼**. 합 100으로 정규화한 **1% 단위** 확률.
- 응답: `data` = [`Match`](#match) (`aiHomePct`/`aiDrawPct`/`aiAwayPct` 채워짐)
- 관리자 판별: `GET /api/user/me`의 `role === "ADMIN_USER"`. 비관리자는 403(권한 없음) 응답.
- 종료/취소 경기는 거절: `"종료/취소된 경기는 승률 예측 대상이 아닙니다."`

### `GET /api/match/{matchId}/ai/summary`  *(공개)*
**종료 경기**의 골 내용 AI 요약(한국어 해설 말투). **DB-first lazy** — 있으면 그대로 반환, 없으면 최초 1회 생성 후 캐시.
- 1순위: FotMob 라이브티커 골 해설(영문) → Gemini가 번역·요약. 없으면 저장된 이벤트로 폴백.
- 공개 엔드포인트라 **강제 재생성(`force`)은 제거**됨(Gemini 쿼터 남용 방지).
- 응답: `data` = `{ "matchId": 103, "summary": "...", "generatedAt": "2026-06-09T12:07:20" }`
- 진행 전 경기는 거절: `"아직 종료되지 않은 경기는 요약할 수 없습니다."`

---

## 5-4. 공지사항 (Notice)

> 관리자가 "공지를 때리는" 기능. **조회는 공개, 작성/수정/삭제는 관리자(`ROLE_ADMIN_USER`) 전용.**

### `GET /api/notice`  *(공개)*
공지 목록 (최신순, 페이지).
- 응답: **페이지** — `data.content` = `NoticeView[]` (`?page=&size=8`)

### `GET /api/notice/{id}`  *(공개)*
공지 단건.
- 응답: `data` = `NoticeView`
- 없으면: `success:false, msg:"공지를 찾을 수 없습니다."`

### `POST /api/admin/notice`  *(관리자 전용, 쿠키 동봉)*
공지 등록. **본문 JSON** `{ "title": "...", "content": "..." }`
- 예: `{ "title": "월드컵 개막!", "content": "다가오는 12일 11시에 진행하는 한국 vs 체코 많은 응원 부탁드립니다." }`
- 응답: `data` = `NoticeView`
- 제목/내용 비어있으면: `"제목과 내용을 입력하세요."` / 비관리자는 403(권한 없음)

### `PUT /api/admin/notice/{id}`  *(관리자 전용)*
공지 수정. 본문 `{ title, content }` (빈 값은 무시).
- 응답: `data` = `NoticeView`

### `DELETE /api/admin/notice/{id}`  *(관리자 전용)*
공지 삭제.
- 응답: `data` = 삭제된 `id`

**NoticeView**
```json
{ "id": 3, "title": "월드컵 개막!", "content": "다가오는 12일 11시...", "authorName": "yejun Lee", "createAt": "2026-06-10T15:20:00" }
```

---

## 5-5. 관리자 — 유저 관리 (Admin Users)

> **전부 관리자(`ROLE_ADMIN_USER`) 전용, 쿠키 동봉.** 관리자만 보므로 email까지 노출됨.

### `GET /api/admin/users`
유저 목록 (페이지).
- 응답: **페이지** — `data.content` = `AdminUserView[]` (`?page=&size=8`)

### `PUT /api/admin/users/{id}/role?role={ROLE}`
권한 변경. `role`: `ADMIN_USER` | `COMMON_USER`
- 응답: `data` = `AdminUserView`
- **본인 권한은 변경 불가**: `"본인 권한은 변경할 수 없습니다."`

### `PUT /api/admin/users/{id}/status?active={bool}`
계정상태 변경. `active=true`(활성) / `false`(정지 — `banType=ADMIN` 기록).
- 응답: `data` = `AdminUserView`
- **본인 계정상태는 변경 불가**: `"본인 계정상태는 변경할 수 없습니다."`
- **정지된 계정은 다음 로그인(OAuth) 시 토큰 발급이 차단**되어 로그인 거부됨(`/home?error=suspended`로 리다이렉트). 단, 이미 발급된 쿠키는 만료(1시간)까지 유효.

**AdminUserView**
```json
{
  "id": 1, "name": "yejun Lee", "email": "yejun0441@hanmail.net",
  "role": "ADMIN_USER", "active": true, "banType": null,
  "matchesPlayed": 12, "correctCount": 7, "createAt": "2026-06-05T14:52:42"
}
```
- `role`: `COMMON_USER` | `ADMIN_USER` / `active`: 계정상태(true=활성, false=정지) / `banType`: `ADMIN`(관리자 정지) | `SELF`(자진 탈퇴) | `null`

---

## 6. 데이터 모델

> 모든 엔티티는 공통으로 `id` (Long), `createAt` (ISO 시간 문자열) 포함.
> 시간은 **한국시간(KST)** 기준.

### Match
실제 응답 (`GET /api/match/findByCompId?id=6` 의 한 항목):
```json
{
  "id": 196,
  "competition": {
    "id": 6,
    "fotmobLeagueId": 77,
    "code": "77",
    "name": "World Cup",
    "type": "CUP",
    "emblem": "",
    "createAt": "2026-06-05T14:52:42.812023"
  },
  "homeTeam": {
    "id": 29,
    "fotmobTeamId": 6710,
    "name": "Mexico",
    "shortName": "Mexico",
    "tla": "",
    "crest": "https://images.fotmob.com/image_resources/logo/teamlogo/6710.png",
    "createAt": "2026-06-05T14:52:26.150003"
  },
  "awayTeam": {
    "id": 13,
    "fotmobTeamId": 6316,
    "name": "South Africa",
    "shortName": "South Africa",
    "tla": "",
    "crest": "https://images.fotmob.com/image_resources/logo/teamlogo/6316.png",
    "createAt": "2026-06-05T14:52:23.292091"
  },
  "matchTime": "2026-06-12T04:00:00",
  "stage": null,
  "groupName": "Grp. A",
  "matchday": null,
  "status": "SCHEDULED",
  "homeScore": 0,
  "awayScore": 0,
  "winner": null,
  "venue": "Estadio Akron",
  "fotmobMatchId": 4667751,
  "lineupSynced": true,
  "fotmobFinalized": false,

  "liveTime": null,
  "liveStartedAt": null,
  "homeFormation": null,
  "awayFormation": null,

  "predictionEnabled": false,
  "aiHomePct": null,
  "aiDrawPct": null,
  "aiAwayPct": null,
  "aiSummary": null,
  "aiPredictedAt": null,
  "aiSummaryAt": null,

  "createAt": "2026-06-05T14:52:42.816878"
}
```
- `status`: `SCHEDULED` | `IN_PLAY` | `FINISHED` | `CANCELLED` (문자열)
- `winner`: `HOME_TEAM` | `AWAY_TEAM` | `DRAW` | `null` (경기 끝나면 채워짐) → **미시작 판단은 `winner==null` 또는 `status` 로**
- `homeScore`/`awayScore`: **경기 전엔 `0`** 으로 옴 (null 아님). 진행/종료 시 실제 스코어로 갱신
- `venue`: 구장 이름 예 `"Estadio Akron"`. **경기 상세 동기화(폴링/lazy-crawl) 후 채워짐** — 그 전엔 `null`. 일부 소규모 경기는 FotMob에 구장 정보가 없어 계속 `null`일 수 있음
- `tla`, `emblem`, `shortName` 은 비어있거나 name과 같을 수 있음 — UI엔 `name` + `crest` 사용 권장

**라이브 / 포메이션 (진행 중·라인업 공개 시):**
- `liveTime`: 진행 분 라벨 예 `"67'"`, 추가시간이면 `"45+2'"`, 하프타임 `"HT"`. IN_PLAY 아니면 `null`
- `liveStartedAt`: **진행시간 앵커**(폴링시각 − 경과초, KST). 프론트가 `지금 − liveStartedAt`을 초 단위로 계산해 시계를 흘림. 하프타임("HT")이면 시계 멈추고 라벨 표시
- `homeFormation`/`awayFormation`: 포메이션 문자열 예 `"4-3-3"` (라인업 공개 후)

**AI (관리자가 예측 생성한 경기만 채워짐):**
- `predictionEnabled`: AI 승률 예측 대상으로 선택됨 → **이 경기가 목록 최상단** (`allMatch`은 이 값 내림차순 정렬)
- `aiHomePct`/`aiDrawPct`/`aiAwayPct`: 홈승/무/원정승 확률(정수, 합 100). 미생성이면 `null`
- `aiSummary`: 종료 경기 골 요약 텍스트(한국어). 미생성이면 `null` (`/ai/summary`로 생성)
- `aiPredictedAt`/`aiSummaryAt`: 각 생성 시각

### Team
```json
{
  "id": 29,
  "fotmobTeamId": 6710,
  "name": "Mexico",
  "shortName": "Mexico",
  "tla": "",
  "crest": "https://images.fotmob.com/image_resources/logo/teamlogo/6710.png",
  "createAt": "2026-06-05T14:52:26.150003"
}
```
- `crest`: 엠블럼(로고) 이미지 URL → `<img src={team.crest}>`
- `shortName`/`tla` 는 비어있거나 name과 동일할 수 있음

### Competition
```json
{
  "id": 6,
  "fotmobLeagueId": 77,
  "code": "77",
  "name": "World Cup",
  "type": "CUP",
  "emblem": "",
  "createAt": "2026-06-05T14:52:42.812023"
}
```
- `type`: `CUP` 등 대회 유형 / `emblem` 은 비어있을 수 있음

### MatchFotmobView
`GET /api/match/{id}/fotmob` 응답 (종료된 경기 예시, 한국 5-0):
```json
{
  "matchId": 16,
  "fotmobMatchId": 5628900,
  "status": "FINISHED",
  "homeScore": 5,
  "awayScore": 0,
  "homeFormation": "4-3-3",
  "awayFormation": "4-4-2",
  "lineupSynced": true,
  "finalized": true,
  "lineup": [ /* LineupPlayer[] */ ],
  "events": [ /* MatchEvent[] */ ]
}
```
- `homeFormation`/`awayFormation`: 포메이션 문자열(라인업 없으면 `null`)

### LineupPlayer
실제 응답 (`lineup[0]`):
```json
{
  "id": 201,
  "matchId": 16,
  "fotmobPlayerId": 433265,
  "name": "Hyeon-Woo Jo",
  "shirtNumber": 21,
  "positionId": 11,
  "posX": 0.1,
  "posY": 0.5,
  "home": true,
  "starter": true,
  "rating": 7.2,
  "subInMinute": null,
  "subOutMinute": null,
  "createAt": "2026-06-05T14:55:15.257077"
}
```
- `home`: true=홈, false=원정 / `starter`: true=선발, false=후보
- `posX`/`posY`: **피치 좌표(0~1)** — `posX`=깊이(0=GK쪽,1=공격), `posY`=좌우. 포메이션 배치도용. 좌표 없는 경기는 `null`
- **선수 사진**: `https://images.fotmob.com/image_resources/playerimages/{fotmobPlayerId}.png` (백엔드 저장 X, `fotmobPlayerId`로 프론트가 URL 구성. 없으면 onError 처리)
- `rating`: FotMob 평점 — **FotMob 스탯 커버 경기만** 있음(소규모 친선은 `null`). 경기 전/초반에도 `null`, 진행되며 채워짐
- `subInMinute`/`subOutMinute`: 교체 투입/아웃 분 (해당 없으면 null)

### MatchEvent
실제 응답 (`events[0]`):
```json
{
  "id": 66,
  "matchId": 16,
  "type": "GOAL",
  "minute": 40,
  "addedTime": null,
  "home": true,
  "fotmobPlayerId": 212867,
  "playerName": "Heung-Min Son",
  "detail": ""
}
```
- `type`: `GOAL` | `CARD` | `SUB`
- `detail`: GOAL→어시스트(없으면 `""`) / CARD→`"Yellow"`·`"Red"` / SUB→`"out:나간선수명"`

### LeagueStanding
실제 응답 (`GET /api/fotmob/standings/6` 의 한 항목):
```json
{
  "id": 49,
  "competitionId": 6,
  "groupName": "Best 3rd placed teams",
  "rankNo": 1,
  "fotmobTeamId": 8255,
  "teamName": "Austria",
  "crest": "https://images.fotmob.com/image_resources/logo/teamlogo/8255.png",
  "played": 0,
  "wins": 0,
  "draws": 0,
  "losses": 0,
  "goalDiff": 0,
  "points": 0,
  "createAt": "2026-06-08T08:38:22.345922"
}
```
- 월드컵(compId=6)은 **대회 시작 전에도 그룹 순위표가 0으로 채워져** 옵니다(예: "Grp. A", "Best 3rd placed teams"). `groupName` 으로 묶어서 렌더.
- 친선(compId=1)은 순위표가 없어 **빈 배열**.

### Prediction (응답 DTO = `PredictionView`)
`predict` / `myPrediction` / `findByMatch` 응답. User 등 민감정보 없이 필요한 것만 내려갑니다.
```json
{
  "id": 3,
  "matchId": 197,
  "homeTeamName": "South Korea",
  "awayTeamName": "Czechia",
  "predictedWinner": "HOME_TEAM",
  "isCorrect": null
}
```
- `predictedWinner`: `HOME_TEAM` | `AWAY_TEAM` | `DRAW`
- `isCorrect`: `null`(경기 안 끝남) | `true`(적중) | `false`(실패) — 경기 종료 시 자동 채점됨
- `homeTeamName`/`awayTeamName`: 화면 라벨용(예: "대한민국 승" 표시) — 전송 값은 enum

---

## 7. enum / 값 정리

| 이름 | 값 | 쓰는 곳 |
|---|---|---|
| 예측/승자 | `HOME_TEAM` `AWAY_TEAM` `DRAW` | `Prediction.predictedWinner`, `Match.winner` |
| 경기 상태 | `SCHEDULED` `IN_PLAY` `FINISHED` `CANCELLED` | `Match.status` |
| 이벤트 타입 | `GOAL` `CARD` `SUB` | `MatchEvent.type` |
| 유저 권한 | `COMMON_USER` `ADMIN_USER` | `UserView.role`, `AdminUserView.role`, 관리자 API 권한 |
| 밴 타입 | `ADMIN`(관리자 정지) `SELF`(자진 탈퇴) `null` | `AdminUserView.banType` |
| 월드컵 ID | competitionId=`6`, fotmobLeagueId=`77` | 예측·순위·경기조회 |

---

## 8. 화면 흐름 추천 (참고)

1. **경기 목록** — `GET /api/match/findByCompId?id=6` (월드컵) → 카드로 표시
2. **경기 클릭** — `GET /api/match/{id}/fotmob` → 라인업/이벤트/스코어
3. **예측** — 로그인 후 `POST /api/prediction/predict` (홈/무/원정 버튼, 라벨은 팀 이름)
4. **내 예측/결과** — `GET /api/prediction/myPrediction` → 적중 여부 표시
5. **순위** — `GET /api/fotmob/standings/6`
