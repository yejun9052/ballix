# Claude Code 전달용 프론트 점검 문서

작성일: 2026-06-15  
대상: `frontend/` React 프론트엔드  
목적: Claude Code가 현재 프론트 상태를 빠르게 이해하고, 무엇을 어떤 순서로 고치면 좋은지 판단할 수 있게 정리한다.

> 이 문서는 코드 수정 없이 작성된 리뷰/작업 지시 문서다. 실제 수정 전에는 반드시 현재 작업트리 상태를 확인하고, 사용자 변경사항을 덮어쓰지 않는다.

---

## 1. 가장 중요한 전제

현재 실제 프론트는 루트의 `frontend/` 폴더다.

기존 `CLAUDE.md`에는 `test-api/`를 웹 UI로 설명하는 오래된 내용이 남아 있다. 지금 사용자가 보고 있는 화면과 우리가 개발한 Ballix 프론트는 `frontend/` 기준이다.

현재 프론트 스택:

```text
frontend/
  React 18.3.1
  Vite
  JSX
  react-router-dom 설치됨
  lucide-react 설치됨
```

중요 파일:

```text
frontend/src/App.jsx             약 3500줄
frontend/src/styles.css          약 3944줄
frontend/src/services/api.js     약 159줄
frontend/vite.config.js
```

최근 점검 기준:

```text
npm run lint  통과
npm run build 통과
```

현재 git 상태 기준으로 프론트 변경 파일:

```text
M frontend/src/App.jsx
M frontend/src/styles.css
M frontend/vite.config.js
```

---

## 2. 현재 구현된 주요 기능

### 메인 화면

- 로그인하지 않아도 경기 일정 확인 가능
- DB 경기 전체 목록을 불러와 일정 카드로 표시
- 홈팀/원정팀 이미지 표시
- 일부 국가명 한국어 번역
- 경기 카드 클릭 시 상세 페이지로 이동
- 필터 제공
  - 경기 종류: 전체, 월드컵, 친선, PL
  - 월드컵 선택 시 조 필터
  - 날짜 필터
  - AI 승률 있음/없음 필터
- 로그인 상태 표시
- 관리자면 닉네임 옆에 `관리자` 배지 표시

### 상세 페이지

- 선택한 경기 상세 표시
- 홈팀/원정팀, 시간, 상태, 스코어 표시
- FotMob 상세 데이터 기반 라인업/이벤트 표시 구조 있음
- 라인업 박스, 교체 명단, AI 승률, 승부예측 박스 접기/펼치기
- AI 승률이 없는 경기는 일반 사용자에게 AI 승률 박스 미노출
- 관리자 계정은 AI 승률 생성/재예측 기능 접근 가능

### 로그인/권한

- Google OAuth 로그인 연결
- `GET /api/user/me`로 현재 사용자 조회
- 관리자 판단은 기본적으로 DB `users.role === "ADMIN_USER"` 기준
- 일반 사용자는 관리자 배지 없음

### 예측

- 로그인 후 상세 페이지에서 승/무/패 예측 가능
- 예측 후 비율 조회
- 경기 시작 이후 예측 비활성화
- AI 승률이 있는 경기와 사용자 예측 UI가 분리되어 있음

### 관리자

- 관리자 전용 화면 있음
- 유저 관리, 공지 관리, FotMob 동기화/관리 기능 포함
- AI 승률 생성 버튼 포함

---

## 3. 냉정한 총평

현재 프론트는 기능 구현량은 많고 데모로 보여주기에는 충분히 발전했다.

다만 구조적으로는 `App.jsx` 하나에 거의 모든 기능이 들어간 상태다. 지금은 돌아가지만, 앞으로 기능을 조금만 더 붙여도 유지보수 난이도가 급격히 올라간다. 특히 Claude Code와 Codex가 번갈아 작업하는 환경에서는 단일 거대 파일이 충돌과 회귀 버그를 만들 가능성이 크다.

현재 상태를 한 문장으로 표현하면:

```text
기능은 많이 붙었지만, 아직 실서비스용 프론트 구조는 아니다.
```

가장 먼저 해야 할 일은 새 기능 추가가 아니라 구조 정리다.

---

## 4. 높은 우선순위 문제

### H1. `App.jsx`가 너무 크다

파일:

```text
frontend/src/App.jsx
```

현재 약 3500줄이다.

문제:

- 메인 화면, 상세 화면, 관리자 화면, 월드컵 화면, 라인업, 예측 패널, API 데이터 변환, 상태 관리가 한 파일에 섞여 있다.
- 기능 하나를 수정할 때 영향 범위를 파악하기 어렵다.
- Claude/Codex가 작업할 때 같은 파일을 계속 수정하게 되어 충돌 가능성이 높다.
- 테스트하기 어렵다.
- 디버깅할 때 화면 단위 책임이 불분명하다.

수정 방향:

```text
frontend/src/
  App.jsx
  pages/
    MainPage.jsx
    MatchDetailPage.jsx
    AdminPage.jsx
    WorldCupPage.jsx
    LoginPage.jsx
    LeaderboardPage.jsx
    MyPredictionsPage.jsx
    StandingsPage.jsx
  components/
    layout/
      AppHeader.jsx
      AuthControls.jsx
      BottomNavigation.jsx
    match/
      MatchScheduleList.jsx
      MatchScheduleItem.jsx
      MatchStatusBadge.jsx
      TeamCrest.jsx
      MatchHero.jsx
      PredictionPanel.jsx
      AiProbabilityCard.jsx
    lineup/
      LineupSection.jsx
      LineupPitch.jsx
      PitchPlayer.jsx
      BenchList.jsx
      PlayerPhoto.jsx
      EventBadge.jsx
    admin/
      AdminUsersTab.jsx
      AdminNoticeTab.jsx
      AdminDataTab.jsx
    worldcup/
      WorldCupGroups.jsx
      WorldCupBracket.jsx
  hooks/
    useAuth.js
    useMatches.js
    useIsNarrow.js
  utils/
    matchNormalize.js
    dateFormat.js
    countryNames.js
    statusLabel.js
```

주의:

- 한 번에 전부 갈아엎지 말고, 먼저 컴포넌트만 분리하고 동작은 그대로 유지한다.
- 분리 후 `npm run lint`, `npm run build`를 반드시 돌린다.

---

### H2. 예측 조회 실패를 모두 “예측 안 함”처럼 처리한다

파일:

```text
frontend/src/App.jsx
```

문제 위치:

```text
PredictionPanel 내부 findByMatch 호출 catch
```

현재 문제:

- `predictionApi.findByMatch(match.id)`가 실패하면 전부 `myPrediction = null`로 처리한다.
- 실제로는 아래 상황들이 전부 다르다.
  - 사용자가 아직 예측하지 않음
  - 로그인 세션 만료
  - 백엔드 서버 꺼짐
  - 네트워크 오류
  - 백엔드 500 오류

사용자 입장에서는 서버가 실패했는데도 “예측 안 했구나”처럼 보인다.

수정 방향:

- 404 또는 백엔드가 명확히 “예측 없음”으로 주는 에러만 `myPrediction = null`
- 401이면 로그인 만료 메시지
- 500/network면 오류 메시지
- `apiRequest`에서 status code를 보존하도록 개선

예상 구조:

```js
try {
  const prediction = await predictionApi.findByMatch(match.id);
  setMyPrediction(prediction);
} catch (error) {
  if (error.status === 404) {
    setMyPrediction(null);
    return;
  }
  setPredictionError("예측 정보를 불러오지 못했습니다.");
}
```

---

### H3. 경기 목록을 `size: 500`으로 한 번에 가져온다

파일:

```text
frontend/src/App.jsx
```

현재 구조:

```js
matchApi.getAllMatches({ size: 500 })
```

문제:

- DB 경기 수가 500개를 넘으면 일부 경기가 누락된다.
- 라이브 경기 있을 때 주기적으로 재조회하면 응답량이 커진다.
- 필터가 프론트에서만 동작하면 전체 데이터를 계속 들고 있어야 한다.

수정 방향:

1. 당장은 `size`를 명확히 상수화하고 주석을 단다.
2. 다음 단계에서는 백엔드 필터 API를 사용하거나 추가한다.
3. 메인 화면 필터는 서버 쿼리 기반으로 바꾼다.

권장 API 형태:

```text
GET /api/match/allMatch?page=0&size=30&competition=77&group=Group A&date=2026-06-12&ai=enabled
```

백엔드 API가 아직 없다면 프론트는 임시로 클라이언트 필터를 유지하되, TODO를 명확히 남긴다.

---

### H4. 메인 날짜 필터 기본값이 오늘이다

파일:

```text
frontend/src/App.jsx
```

문제:

- 사용자는 “전체 일정”을 기대하는데, 기본 날짜가 오늘이면 오늘 경기가 없을 때 빈 화면처럼 보인다.
- 일정 중심 사이트라면 기본은 “가까운 경기순 전체”가 더 자연스럽다.

수정 방향:

- 기본 날짜 필터를 빈 값으로 둔다.
- 날짜를 선택했을 때만 해당 날짜로 필터링한다.
- 상단에는 “전체 일정”, “오늘”, “내일”, “이번 주” 같은 빠른 필터를 둘 수 있다.

권장 UX:

```text
기본: 전체 일정 중 가까운 경기순
버튼: 전체 / 오늘 / 내일 / 이번 주
상세 필터: 날짜 직접 선택
```

---

### H5. 라이브 경기 시간이 프론트에서 `+180초` 보정된다

파일:

```text
frontend/src/App.jsx
```

현재 구조:

```js
const elapsed = Math.max(0, Math.floor((now - new Date(anchor).getTime()) / 1000)) + 180;
```

문제:

- 모든 라이브 시간이 실제보다 3분 앞서 보일 수 있다.
- 백엔드 문서상 라이브 시계는 `liveStartedAt` 앵커를 기준으로 프론트가 계산하는 구조다.
- 프론트에서 임의 보정을 넣으면 백엔드가 맞아도 화면이 틀어진다.

수정 방향:

- `+180` 제거를 검토한다.
- 만약 FotMob SSR 지연 보정이라면 백엔드에서 보정하거나, 프론트 상수에 이름과 주석을 붙인다.

예:

```js
const FOTMOB_SSR_DELAY_COMPENSATION_SECONDS = 180;
```

하지만 실서비스 기준으로는 프론트 하드코딩 보정보다 백엔드 기준 통일이 더 낫다.

---

### H6. API 기본 주소가 Vite proxy를 우회한다

파일:

```text
frontend/src/services/api.js
frontend/vite.config.js
```

현재:

```js
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
```

그리고 Vite proxy:

```js
proxy: {
  "/api": { target: "http://localhost:8080", changeOrigin: true },
  "/oauth2": { target: "http://localhost:8080", changeOrigin: true },
}
```

문제:

- 기본값이 `http://localhost:8080`이라 프론트 개발 서버의 proxy를 기본적으로 사용하지 않는다.
- 쿠키 로그인, CORS, 배포 환경에서 꼬일 수 있다.
- 로컬에서는 우연히 되지만 배포 시 설정이 불안정해진다.

수정 방향:

- 개발 기본값은 same-origin으로 둔다.
- API path는 `/api/...`, OAuth는 `/oauth2/...` 기준으로 호출한다.
- 외부 백엔드 주소가 필요한 배포에서만 `VITE_API_BASE_URL`을 사용한다.

예상:

```js
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
```

그리고 로그인:

```js
window.location.href = `${API_BASE_URL}/oauth2/authorization/google`;
```

---

## 5. 중간 우선순위 문제

### M1. `styles.css`가 너무 크고 전역 충돌 위험이 크다

파일:

```text
frontend/src/styles.css
```

현재 약 3944줄이다.

문제:

- 전역 클래스가 너무 많다.
- 이전 디자인 흔적과 현재 디자인이 섞였을 가능성이 높다.
- 모바일/PC 반응형을 수정할 때 어떤 규칙이 이기는지 추적하기 어렵다.
- 라인업, 브래킷, 관리자, 메인 화면 스타일이 한 파일에 섞여 있다.

수정 방향:

처음부터 CSS module로 전부 바꾸기보다, 우선 파일을 역할별로 분리한다.

권장:

```text
frontend/src/styles/
  base.css
  layout.css
  main.css
  detail.css
  lineup.css
  prediction.css
  admin.css
  worldcup.css
  responsive.css
```

또는 컴포넌트 분리 후 CSS module을 사용한다.

주의:

- 디자인이 깨지기 쉬우므로 CSS 분리는 작은 단위로 진행한다.
- 분리 전후로 PC/모바일 화면을 반드시 확인한다.

---

### M2. 현재 화면 전환이 전부 `screen` 상태 기반이다

파일:

```text
frontend/src/App.jsx
```

문제:

- `react-router-dom`이 설치되어 있지만 실제 라우팅 구조가 약하다.
- 사용자가 새로고침하거나 URL을 공유했을 때 원하는 화면을 유지하기 어렵다.
- 상세 페이지가 URL 기반이 아니라 상태 기반이면 직접 접근성이 떨어진다.

수정 방향:

React Router를 실제로 사용한다.

권장 라우트:

```text
/                         메인 일정
/login                    로그인
/matches/:matchId         경기 상세
/leaderboard              랭킹
/my-predictions           내 예측
/standings                순위
/worldcup                 월드컵
/admin                    관리자
```

이렇게 바꾸면 사용자가 `/matches/123`으로 직접 들어와도 DB에서 경기 정보를 다시 가져올 수 있다.

---

### M3. 경기 상세가 선택 상태에 의존한다

현재 흐름:

```text
메인에서 카드 클릭
selectedMatch 설정
screen = "detail"
상세 렌더링
```

문제:

- 새로고침 시 선택 상태가 사라질 수 있다.
- 외부에서 상세 링크로 바로 들어가기 어렵다.
- 사용자가 뒤로가기/앞으로가기를 기대한 대로 쓰기 어렵다.

수정 방향:

- 상세 페이지는 `matchId` URL 파라미터를 기준으로 로드한다.
- `selectedMatch`가 있으면 우선 사용하고, 없으면 `/api/match/{id}` 또는 `/api/match/{id}/fotmob`로 조회한다.

---

### M4. 국가명 번역이 프론트 하드코딩에 의존한다

문제:

- 국가/클럽/대회가 늘어나면 번역 누락이 계속 생긴다.
- 같은 팀명이 여러 표기로 들어오면 매핑이 깨질 수 있다.

수정 방향:

단기:

```text
countryNames.js 같은 별도 파일로 분리
```

중기:

```text
백엔드 Team 응답에 koreanName 또는 displayName 추가
```

프론트는 아래 순서로 표시한다.

```js
team.koreanName || team.nameKo || COUNTRY_NAME_MAP[team.name] || team.name
```

---

### M5. 월드컵 브래킷이 stage 문자열에 강하게 의존한다

문제:

- `Round of 32`, `Round of 16`, `Quarter-final` 같은 문자열이 백엔드와 정확히 맞아야 한다.
- 백엔드가 `ROUND_OF_32`, `Round of 32 `, `16강`처럼 보내면 브래킷이 비어 보일 수 있다.

수정 방향:

- stage normalization 유틸을 만든다.
- 백엔드 stage 값을 enum처럼 안정적으로 주는 것이 가장 좋다.

예:

```js
normalizeStage(stage) {
  const value = String(stage || "").toLowerCase().trim();
  if (value.includes("32")) return "ROUND_OF_32";
  if (value.includes("16")) return "ROUND_OF_16";
  if (value.includes("quarter")) return "QUARTER_FINAL";
  if (value.includes("semi")) return "SEMI_FINAL";
  if (value.includes("third")) return "THIRD_PLACE";
  if (value.includes("final")) return "FINAL";
}
```

---

### M6. 관리자 동기화 기능이 강력한데 UX 보호가 부족하다

관리자 화면에는 크롤링/동기화/AI 생성 등 무거운 작업이 있다.

문제:

- 실수 클릭 비용이 크다.
- 진행 중인지, 실패했는지, 어떤 작업이 완료됐는지 더 명확해야 한다.
- 배포 후에는 관리자라도 조심스럽게 다뤄야 하는 기능이다.

수정 방향:

- 위험 작업에는 확인 모달 추가
- 진행 중 버튼 disabled
- 결과 로그 표시
- 실패 메시지는 사용자 친화적으로 표시
- 가능하면 최근 실행 시간/결과 저장

예:

```text
"2026-06-15 일정을 다시 동기화합니다. FotMob 크롤링이 실행됩니다. 계속할까요?"
```

---

## 6. 낮은 우선순위지만 정리하면 좋은 부분

### L1. 이모지 아이콘 제거

관리자 탭, 범례 등에 이모지 아이콘이 섞여 있다.

문제:

- 현재 디자인 톤은 정보성 스포츠 사이트라 이모지가 약간 가벼워 보인다.
- OS/브라우저마다 표시가 달라진다.

수정 방향:

- `lucide-react` 아이콘으로 통일
- 버튼/탭에는 텍스트 + lucide 아이콘 사용

---

### L2. 날짜 포맷의 타임존 기준이 불명확하다

문제:

- 브라우저 로컬 타임존 기준으로 표시될 수 있다.
- 한국 서비스라면 `Asia/Seoul` 기준을 명확히 해야 한다.

수정 방향:

```js
new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
```

---

### L3. 관리자 날짜 기본값 생성에 UTC 기준 사용 가능성

문제:

`new Date().toISOString().slice(0, 10)`를 사용하면 한국 시간 새벽에 날짜가 하루 어긋날 수 있다.

수정 방향:

- KST 기준 `formatDateInputValue(new Date())` 같은 유틸로 통일
- 날짜 유틸을 하나로 모아 중복 제거

---

### L4. 접근성 보강

확인할 부분:

- 클릭 가능한 카드가 키보드로 접근 가능한지
- Enter뿐 아니라 Space도 처리하는지
- 이미지 alt가 의미 있게 들어가는지
- 버튼 disabled 상태가 명확한지
- 모바일에서 터치 영역이 충분한지

권장:

- 진짜 이동은 `<button>` 또는 `<a>` 사용
- 카드 전체 클릭은 `role="button"`만 쓰기보다 내부 구조를 명확히 한다.

---

### L5. `dist/`, `node_modules/` 관리 확인

로컬에는 `frontend/dist`, `frontend/node_modules`가 있을 수 있다.

확인:

```bash
git status --short frontend/dist frontend/node_modules
```

권장:

- `node_modules`는 절대 커밋하지 않는다.
- `dist`도 배포 방식이 명확하지 않으면 커밋하지 않는다.

---

## 7. API 레이어 개선 방향

파일:

```text
frontend/src/services/api.js
```

현재 좋은 점:

- API 호출이 한 파일로 모여 있다.
- `credentials: "include"`로 쿠키 로그인 흐름을 고려했다.
- 주요 API 도메인이 구분되어 있다.

개선 필요:

### 7.1 HTTP status 보존

현재는 에러 메시지 중심이라 status 구분이 어렵다.

권장:

```js
class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}
```

### 7.2 JSON 없는 응답 처리

`204 No Content` 또는 HTML 에러 페이지가 오면 안정적으로 처리해야 한다.

권장:

```js
const contentType = response.headers.get("content-type") || "";
const payload = contentType.includes("application/json")
  ? await response.json()
  : null;
```

### 7.3 GET 요청의 Content-Type

GET 요청에도 `Content-Type: application/json`이 붙는다.

큰 문제는 아니지만 더 깔끔하게 하려면 body가 있는 요청에만 붙인다.

### 7.4 AbortController

화면 이동 중 요청이 끝나면 unmounted state 업데이트 문제가 생길 수 있다.

권장:

- `apiRequest`가 `signal`을 받을 수 있게 한다.
- `useEffect` cleanup에서 abort한다.

---

## 8. 권장 작업 순서

### Phase 0. 안전 확인

수정 전 실행:

```bash
git status --short
```

확인할 것:

- 사용자가 수정한 파일을 덮어쓰지 않는다.
- 백엔드는 요청 없으면 건드리지 않는다.
- 프론트 수정만으로 해결 가능한 것은 프론트에서 해결한다.

---

### Phase 1. 구조 분리만 먼저 하기

목표:

```text
동작 변경 없이 App.jsx를 분리한다.
```

추천 순서:

1. `services/api.js`는 그대로 둔다.
2. 유틸 함수부터 `utils/`로 분리한다.
3. 작은 컴포넌트부터 `components/`로 분리한다.
4. 마지막에 화면 단위 `pages/`로 분리한다.

분리 추천:

```text
TeamCrest
StatusBadge
NoticeBanner
PredictionPanel
AiProbabilityCard
LineupSection
PitchPlayer
BenchList
ScheduleItem
ScheduleList
AdminUsersTab
AdminNoticeTab
AdminDataTab
WorldCupBracket
```

검증:

```bash
cd frontend
npm run lint
npm run build
```

---

### Phase 2. API 에러 처리 개선

목표:

```text
서버 실패와 데이터 없음 상태를 구분한다.
```

작업:

- `ApiError` 추가
- `apiRequest`에서 status 보존
- `PredictionPanel`에서 404/401/500/network 구분
- 로그인 만료 시 UI 표시

검증:

- 백엔드 끈 상태에서 메인 접속
- 로그인 안 된 상태에서 예측 시도
- 이미 예측한 경기 조회
- 예측 안 한 경기 조회

---

### Phase 3. 라우팅 정리

목표:

```text
URL로 화면 상태가 표현되게 한다.
```

추천 라우트:

```text
/                         MainPage
/login                    LoginPage
/matches/:matchId         MatchDetailPage
/leaderboard              LeaderboardPage
/my-predictions           MyPredictionsPage
/standings                StandingsPage
/worldcup                 WorldCupPage
/admin                    AdminPage
```

주의:

- 기존 `screen` 상태를 한 번에 제거하지 말고 라우터로 천천히 대체한다.
- 상세 페이지는 `matchId`로 직접 조회 가능해야 한다.

---

### Phase 4. 메인 일정 UX 개선

목표:

```text
일정 중심 사이트로 보이게 정리한다.
```

작업:

- 기본 날짜 필터를 전체로 변경
- 가까운 경기순 정렬
- 날짜 빠른 필터 추가
- 서버 필터 API 준비 또는 프론트 필터 명확화
- AI 승률 필터 상태를 더 직관적으로 표시

권장 기본값:

```text
대회: 전체
조: 전체
날짜: 전체
AI 승률: 전체
정렬: 경기 시간 오름차순
```

---

### Phase 5. CSS 분리 및 반응형 점검

목표:

```text
PC와 모바일이 각각 자연스럽게 보이도록 한다.
```

작업:

- CSS 역할별 분리
- 라인업 pitch 모바일 세로 레이아웃 재점검
- 일정 카드 PC 레이아웃과 모바일 레이아웃 분리
- 관리자 화면 PC 테이블형 레이아웃 강화

필수 확인 화면:

```text
desktop 1440x900
desktop 1920x1080
tablet 768x1024
iPhone 14 Pro Max 430x932
iPhone SE급 375x667
```

---

## 9. 디자인 관점에서 수정하면 좋은 점

### PC 메인

현재 일정 카드 중심 구조는 모바일 앱 느낌이 아직 남아 있다.

PC에서는 다음이 더 적합하다.

```text
상단: sticky header
좌측/상단: 필터
중앙: 일정 리스트
우측: 라이브 경기, 공지, 랭킹 요약
```

카드는 완전히 없애기보다, 테두리보다 배경색 차이로 구분하는 현재 방향은 유지해도 좋다.

### 모바일 메인

Piqq 참고 디자인처럼 앱형 구조를 유지해도 된다.

중요:

- 하단 네비게이션 유지
- 일정 카드는 터치 영역 넓게
- 필터는 가로 스크롤 또는 접이식

### 상세 페이지

상세 페이지는 FotMob 스타일을 참고하되 Ballix 목적에 맞게 우선순위를 둔다.

권장 순서:

```text
1. 경기 기본 정보
2. 라인업
3. 교체/이벤트
4. AI 승률
5. 사용자 승부예측
6. 댓글/커뮤니티
```

AI 승률과 승부예측은 너무 위에 있으면 경기 정보 사이트 느낌보다 베팅 서비스처럼 보일 수 있다. 현재처럼 상세 아래쪽에 배치하는 방향은 괜찮다.

---

## 10. 보안/권한 관련 프론트 주의사항

프론트에서 관리자 UI를 숨기는 것은 편의 기능일 뿐이다.

반드시 백엔드가 최종 권한을 검사해야 한다.

프론트에서 할 일:

- `currentUser.role === "ADMIN_USER"` 기준으로 관리자 메뉴 표시
- API 실패 시 403이면 “관리자 권한이 필요합니다” 표시
- 관리자 화면 진입 전 `userApi.me()` 결과 확인
- 로그아웃 후 관리자 상태 즉시 초기화

하지 말아야 할 것:

- 프론트에서만 관리자 권한을 믿고 위험 기능 허용
- 이메일 문자열로 관리자 판단
- localStorage에 관리자 여부 저장

---

## 11. Claude Code에게 추천하는 실제 작업 단위

한 번에 너무 크게 고치지 말 것.

추천 PR/커밋 단위:

### 작업 1

```text
App.jsx 유틸 함수 분리
```

파일 예:

```text
src/utils/dateFormat.js
src/utils/statusLabel.js
src/utils/countryNames.js
src/utils/matchNormalize.js
```

### 작업 2

```text
반복 UI 컴포넌트 분리
```

파일 예:

```text
src/components/match/TeamCrest.jsx
src/components/match/MatchStatusBadge.jsx
src/components/match/AiProbabilityCard.jsx
```

### 작업 3

```text
PredictionPanel 분리 및 에러 처리 개선
```

가장 실제 버그 가능성이 큰 부분이다.

### 작업 4

```text
LineupSection 분리
```

라인업은 크롤링 데이터 구조 변화에 민감하므로 독립 컴포넌트로 빼는 것이 좋다.

### 작업 5

```text
MainPage 분리 및 필터 UX 정리
```

여기서 날짜 기본값과 일정 표시 방식을 같이 정리한다.

### 작업 6

```text
React Router 적용
```

구조 분리 후 라우팅을 적용하는 것이 안전하다.

### 작업 7

```text
CSS 분리
```

컴포넌트가 나뉜 뒤 CSS를 나누는 것이 덜 위험하다.

---

## 12. 작업 후 반드시 확인할 명령

```bash
cd frontend
npm run lint
npm run build
```

가능하면 브라우저에서 확인:

```text
http://127.0.0.1:5173/
http://127.0.0.1:5173/matches/{실제 matchId}
```

확인 체크리스트:

```text
[ ] 로그인 안 해도 경기 일정이 보이는가
[ ] 로그인 버튼이 정상 동작하는가
[ ] 로그인 후 닉네임이 보이는가
[ ] ADMIN_USER 계정만 관리자 배지가 보이는가
[ ] 일반 사용자는 관리자 배지가 안 보이는가
[ ] 경기 카드 클릭 시 상세로 이동하는가
[ ] AI 승률 없는 경기는 일반 사용자에게 AI 박스가 숨겨지는가
[ ] AI 승률 있는 경기는 승률 표가 정상 표시되는가
[ ] 예측 전/후 UI가 정상 동작하는가
[ ] 백엔드 꺼졌을 때 에러가 이상하게 숨겨지지 않는가
[ ] 모바일에서 오른쪽이 잘리지 않는가
[ ] 라인업 선수들이 겹치지 않는가
```

---

## 13. 결론

현재 프론트는 기능적으로 많이 발전했지만, 다음 단계는 기능 추가가 아니라 구조 안정화다.

가장 중요한 작업은 다음 세 가지다.

```text
1. App.jsx 분리
2. API 에러 처리 개선
3. 메인 일정/상세 페이지를 URL 기반 구조로 정리
```

이 세 가지를 먼저 끝내면 이후 관리자 기능, 댓글, 마이페이지, 커뮤니티, AI 결과 고도화 작업이 훨씬 안전해진다.

Claude Code는 새 기능부터 추가하지 말고, 위 우선순위대로 작은 단위로 리팩터링하는 것이 좋다.
