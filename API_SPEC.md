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
- 응답: `data` = `Match[]`

### `GET /api/match/findByCompId?id={competitionId}`
특정 대회의 경기 목록.
- `id`: 내부 competitionId (**월드컵 = 6**, 친선 = 1)
- 응답: `data` = `Match[]`

### `GET /api/match/MatchDay?date={YYYY-MM-DD}`
특정 날짜의 경기 목록 (킥오프 빠른 순).
- 예: `/api/match/MatchDay?date=2026-06-13`
- 응답: `data` = `Match[]`

### `GET /api/match/upcoming?compId={competitionId}`
**다가오는 경기**(킥오프 미래)만, 가까운 순. 예측 화면 메인용.
- `compId`: **선택** — 주면 그 대회만(**월드컵=6**), 없으면 전체
- 예: `/api/match/upcoming?compId=6` → 아직 안 시작한 월드컵 경기만
- 응답: `data` = `Match[]`

---

## 3. 경기 상세 — 라인업 / 이벤트 (FotMob) — 인증 불필요

### `GET /api/match/{matchId}/fotmob`
경기 통합 뷰 (기본정보 + 라인업 + 이벤트).
- 응답: `data` = [`MatchFotmobView`](#matchfotmobview)

### `GET /api/match/{matchId}/fotmob/lineup`
라인업만.
- 응답: `data` = [`LineupPlayer[]`](#lineupplayer)

### `GET /api/match/{matchId}/fotmob/events`
이벤트(골/카드/교체)만.
- 응답: `data` = [`MatchEvent[]`](#matchevent)

### `POST /api/match/{matchId}/fotmob/sync`
스케줄 안 기다리고 즉시 동기화 후 통합 뷰 반환 (라인업이 없을 때 강제 갱신용).
- 응답: `data` = [`MatchFotmobView`](#matchfotmobview)

> 라인업은 보통 **킥오프 1시간 전부터** 공개됩니다. 그 전엔 `lineup`이 빈 배열일 수 있음.

---

## 4. 리그 순위 (Standings) — 인증 불필요

### `GET /api/fotmob/standings/{competitionId}`
조별 리그 순위. (월드컵 `competitionId = 6`)
- 응답: `data` = [`LeagueStanding[]`](#leaguestanding)
- 조별리그는 `groupName`("Grp. A" 등)으로 묶어서 보여주면 됨. 친선전은 순위표가 없어 빈 배열.

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
내 예측 전부.
- 응답: `data` = [`Prediction[]`](#prediction) (없으면 빈 배열)

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
{ "id": 1, "name": "yejun Lee", "matchesPlayed": 12, "correctCount": 7, "accuracy": 58 }
```
- `accuracy`: 적중률 0~100 정수 (`correctCount/matchesPlayed`), 참여 0이면 0

### `GET /api/user/leaderboard`  *(공개)*
적중수 내림차순 랭킹.
- 응답: `data` = `RankView[]`
```json
[
  { "rank": 1, "name": "yejun Lee", "matchesPlayed": 12, "correctCount": 7, "accuracy": 58 }
]
```
- 동률이면 경기수 적은 쪽이 위. 예측이 채점돼야 집계됨(`correctCount`는 경기 종료 시 자동 갱신).

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
  "fotmobMatchId": 4667751,
  "lineupSynced": true,
  "fotmobFinalized": false,
  "createAt": "2026-06-05T14:52:42.816878"
}
```
- `status`: `SCHEDULED` | `IN_PLAY` | `FINISHED` | `CANCELLED` (문자열)
- `winner`: `HOME_TEAM` | `AWAY_TEAM` | `DRAW` | `null` (경기 끝나면 채워짐) → **미시작 판단은 `winner==null` 또는 `status` 로**
- `homeScore`/`awayScore`: **경기 전엔 `0`** 으로 옴 (null 아님). 진행/종료 시 실제 스코어로 갱신
- `tla`, `emblem`, `shortName` 은 비어있거나 name과 같을 수 있음 — UI엔 `name` + `crest` 사용 권장

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
  "lineupSynced": true,
  "finalized": true,
  "lineup": [ /* LineupPlayer[] */ ],
  "events": [ /* MatchEvent[] */ ]
}
```

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
  "home": true,
  "starter": true,
  "rating": 7.2,
  "subInMinute": null,
  "subOutMinute": null,
  "createAt": "2026-06-05T14:55:15.257077"
}
```
- `home`: true=홈, false=원정 / `starter`: true=선발, false=후보
- `rating`: FotMob 평점 (경기 전/직후 `null` 가능)
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
| 월드컵 ID | competitionId=`6`, fotmobLeagueId=`77` | 예측·순위·경기조회 |

---

## 8. 화면 흐름 추천 (참고)

1. **경기 목록** — `GET /api/match/findByCompId?id=6` (월드컵) → 카드로 표시
2. **경기 클릭** — `GET /api/match/{id}/fotmob` → 라인업/이벤트/스코어
3. **예측** — 로그인 후 `POST /api/prediction/predict` (홈/무/원정 버튼, 라벨은 팀 이름)
4. **내 예측/결과** — `GET /api/prediction/myPrediction` → 적중 여부 표시
5. **순위** — `GET /api/fotmob/standings/6`
