# 프론트 미연결 API 명세서 (백엔드 → 프론트 전달용)

> 백엔드에는 구현돼 있으나 새 프론트(`frontend/`)에서 **아직 호출하지 않는** 기능 목록입니다.
> 프론트엔드 담당자가 연결할 때 참고하세요. 응답은 전부 공통 래퍼
> `{ "success": true, "msg": "...", "data": <아래 표의 형태> }` 로 내려옵니다.
> 페이지네이션 응답(`Page<>`)은 `data.content[]` + `data.totalElements` / `data.totalPages` / `data.number` 구조입니다.
>
> 인증: **로그인 필요** = HTTP-only JWT 쿠키 동봉(`credentials: "include"`, 프론트 `apiRequest`가 기본 적용).
> **관리자** = 로그인 + `role == "ADMIN_USER"`(미충족 시 401/403).

---

## 🔴 1. 우선순위 높음 — 사용자 화면 기능

### 1-1. 경기 하이라이트 자동 조회
- **`GET /api/match/{matchId}/highlight`** — 공개
- 종료 경기의 유튜브 하이라이트 영상 ID를 반환. DB에 없으면 **최초 조회 시 1회 유튜브 검색·저장 후 반환**(이후 캐시). 관리자가 수동 등록(`/replay`)한 영상이 있으면 그것을 우선.
- 응답 `data`:
  ```json
  { "matchId": 123, "youtubeId": "abcdEFG1234" }
  ```
- 프론트 활용: 종료 경기 상세에서 `youtubeId`가 있으면 `https://www.youtube.com/embed/{youtubeId}` 임베드.
  현재 `ReplayPanel`은 관리자 수동 등록/해제만 함 → 일반 사용자용 **자동 하이라이트 노출이 빠져 있음**.
- 참고: 검색 실패/후보 없음은 30분 쿨다운(빈 `youtubeId` 반환될 수 있음).

### 1-2. 선수 상세 정보 (라인업 선수 클릭 모달)
- **`GET /api/fotmob/player/{playerId}`** — 공개 (`playerId` = `LineupPlayer.fotmobPlayerId`)
- 선수 프로필 + 주 리그 시즌 스탯. DB 미저장 프록시(조회 시 크롤).
- 응답 `data`:
  ```json
  {
    "id": 12345, "name": "Son Heung-min",
    "teamId": 678, "teamName": "Tottenham", "teamCrest": "https://...",
    "onLoan": false, "position": "Forward", "photo": "https://...",
    "leagueName": "Premier League", "season": "2025/2026",
    "info":  [ { "label": "나이/Age", "value": "32" }, { "label": "키/Height", "value": "183cm" } ],
    "stats": [ { "title": "출전/Matches", "value": 12 }, { "title": "골/Goals", "value": 5 } ]
  }
  ```
- 프론트 활용: 라인업 `PitchPlayer`/벤치 선수 클릭 → 모달로 `info`/`stats` 표시.
  선수 사진은 별도 저장 안 함 — `https://images.fotmob.com/image_resources/playerimages/{playerId}.png` 직접 구성(기존 `PlayerPhoto` 방식과 동일).

---

## 🟡 2. 우선순위 중간 — 경기 목록/탐색

### 2-1. 다가오는 경기만 조회
- **`GET /api/match/upcoming?compId={compId}&page=0&size=8`** — 공개
- 미래(예정) 경기만. `compId` 옵션(예: 월드컵만 보려면 `6`). 미지정 시 전체 대회.
- 응답 `data`: `Page<Match>` (`/allMatch` 와 동일한 Match 객체 구조)
- 프론트 활용: 메인의 "예정 경기" 전용 섹션 — 현재는 전체/대회별/날짜별만 있고 "다가오는 경기" 필터가 없음.

### 2-2. 팀명으로 경기 검색 (DB)
- **`GET /api/match/search?q={검색어}&status={상태}&page=0&size=8`** — 공개
- 팀명 부분일치로 DB 경기 검색. `status` 옵션(예: `FINISHED`, `IN_PLAY`, `NOT_STARTED`).
- 응답 `data`: `Page<Match>`
- ⚠️ 관리자 데이터 탭에서 쓰는 `/api/fotmob/search`(FotMob 실시간 크롤 검색)와 **다름** — 이건 이미 저장된 DB 경기를 빠르게 찾는 용도.

### 2-3. 대회(리그) 전체 목록
- **`GET /api/comp/allComp?page=0&size=8`** — 공개
- 등록된 대회(Competition) 목록.
- 응답 `data`: `Page<Competition>` (`fotmobLeagueId`, 이름 등)
- 프론트 활용: 대회별 필터 드롭다운을 하드코딩 대신 동적으로 구성할 때.

---

## 🟢 3. 관리자 기능 (현재 부분/미연결)

### 3-1. 관리자 공지 목록 (예약·만료 포함) — **현재 누락**
- **`GET /api/admin/notice?page=0&size=8`** — 관리자
- 게시 전(SCHEDULED)·게시 중(ACTIVE)·내려간(EXPIRED) 공지를 **상태 필드와 함께 전부** 반환.
- 응답 `data`: `Page<Notice>` (각 항목에 `status` 포함)
- ⚠️ **현재 문제**: `AdminNoticeTab`이 공개용 `GET /api/notice`(게시 중만)를 호출 중 → **관리자가 예약 공지·만료 공지를 볼 수 없음**. 이 엔드포인트로 교체 필요.

### 3-2. 유저 정지 시 안내 메시지 — **파라미터 누락**
- **`PUT /api/admin/users/{id}/status?active=false&message={정지 안내문}`** — 관리자
- 정지(`active=false`) 시 `message`로 안내문을 함께 저장. 정지된 유저가 로그인하면 이 메시지가 노출됨. 정지 해제(`active=true`) 시 메시지 자동 정리.
- ⚠️ **현재 문제**: 프론트 `changeUserStatus(userId, active)`가 `message`를 안 보냄 → 정지 사유를 입력/저장 못 함. 정지 시 사유 입력 UI + `message` 파라미터 추가 필요.

### 3-3. 유저 이름 검색 — **파라미터 누락**
- **`GET /api/admin/users?q={이름}&page=0&size=8`** — 관리자
- `q` 주면 이름 부분일치 검색.
- ⚠️ 현재 프론트 `listUsers`가 `q`를 안 보냄 → 유저 검색창 추가 시 `q` 파라미터만 붙이면 됨.

### 3-4. 팀(나라)명 전체 재번역
- **`POST /api/fotmob/teams/translate`** — 관리자
- `nameKo`(한국어명)가 비어 있는 팀만 골라 Gemini로 일괄 번역해 채움.
- 응답 `data`: 번역 처리 결과(처리 팀 수 등)
- 프론트 활용: 관리자 데이터 탭에 "팀 이름 전체 재번역" 버튼.

---

## ⚪ 4. 참고 — 의도적으로 안 쓰는 것 (연결 불필요)

| 엔드포인트 | 이유 |
|---|---|
| `GET /api/match/{id}/fotmob/lineup` | `GET /api/match/{id}/fotmob`(getFotmobView) 응답에 lineup이 이미 포함 |
| `GET /api/match/{id}/fotmob/events` | 위와 동일하게 events가 이미 포함 |
| `POST /api/auth/signup` | 로그인은 구글 OAuth만 사용 |

---

## 부록 — 현재 연결 상태 한눈에 보기

| 분류 | 엔드포인트 | 상태 |
|---|---|---|
| 사용자 | `GET /api/match/{id}/highlight` | 🔴 미연결 |
| 사용자 | `GET /api/fotmob/player/{id}` | 🔴 미연결 |
| 사용자 | `GET /api/match/upcoming` | 🟡 미연결 |
| 사용자 | `GET /api/match/search` | 🟡 미연결 |
| 사용자 | `GET /api/comp/allComp` | 🟡 미연결 |
| 관리자 | `GET /api/admin/notice` | 🟢 미연결(공개 목록으로 대체 중) |
| 관리자 | `PUT /api/admin/users/{id}/status` (`message`) | 🟢 부분연결(message 누락) |
| 관리자 | `GET /api/admin/users` (`q`) | 🟢 부분연결(q 누락) |
| 관리자 | `POST /api/fotmob/teams/translate` | 🟢 미연결 |

> 전체 API의 상세 응답 스키마/예시는 루트 **`API_SPEC.md`** 참고.
