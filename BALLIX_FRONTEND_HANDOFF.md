# Ballix 프론트 작업 인수인계 문서

최종 정리일: 2026-06-11  
목적: 지금까지 새로 만든 프론트와 백엔드 연결 수정 내용을 다음 작업자가 바로 이해하고 이어서 개발할 수 있게 정리한다.

---

## 1. 현재 프로젝트 상태

Ballix는 축구 경기 일정과 승부예측을 중심으로 하는 웹 서비스다.

현재 저장소에는 기존 백엔드와 테스트 프론트(`test-api`)가 있고, 우리가 새로 만든 실제 프론트는 루트의 `frontend/` 폴더에 있다.

주요 실행 구조:

```text
FotMob -> Python FastAPI(:8800) -> Spring Boot(:8080) -> MySQL
                                               |
                                           React frontend(:5173 또는 :5174)
```

현재 새 프론트 주요 파일:

```text
frontend/
  src/
    App.jsx
    styles.css
    services/api.js
```

주의:
- `frontend/`는 현재 Git 기준으로 아직 untracked 상태다.
- `.idea/` 변경도 작업트리에 남아 있다.
- 백엔드 인증/관리자 관련 파일은 일부 수정되어 있다.

---

## 2. 지금까지 만든 프론트 기능

### 메인 화면

메인 화면은 로그인하지 않아도 경기 일정을 볼 수 있는 구조다.

구현 내용:
- DB 경기 목록 조회
- 경기 카드 클릭 시 상세 페이지 이동
- 홈팀/원정팀 이미지 표시
- 국가명 일부 한국어 번역
- 경기 필터
  - 경기: 전체, 월드컵, 친선, PL
  - 월드컵 선택 시 조 필터 표시
  - 날짜 필터
  - AI 승률 있음/없음 필터
- 로그인 상태 표시
- 관리자 계정이면 닉네임 옆에 `관리자` 배지 표시
- 일반 사용자는 닉네임만 표시

현재 경기 목록 API:

```js
matchApi.getAllMatches({ page: 0, size: 100 })
```

백엔드 목록 응답은 Spring `Page` 구조라 실제 배열은 `data.content`에 있다.  
프론트에서는 `getPageContent()`로 배열 응답과 Page 응답을 모두 처리한다.

---

## 3. 상세 페이지

상세 페이지는 선택한 경기 정보를 기반으로 렌더링한다.

구현 내용:
- 경기 상단 매치업 표시
- 팀 이미지 표시
- 라인업 영역
- 교체 명단 영역
- AI 승률 영역
- 승부예측 영역
- 모든 주요 박스 접기/펼치기

현재 중요한 정책:
- AI 승률이 없는 경기는 일반 사용자에게 AI 승률 박스가 아예 보이지 않는다.
- AI 승률이 있는 경기만 `AI 승률` 박스가 보인다.
- 관리자 계정은 AI 승률이 없는 경기에서 `AI 승률 생성` 박스를 볼 수 있다.
- AI 승률이 있는 경기에서는 관리자만 `재예측` 버튼을 볼 수 있다.

아직 남은 중요 작업:
- 라인업은 아직 mock 데이터 기반이다.
- 다음 작업은 `GET /api/match/{matchId}/fotmob` 실제 데이터를 연결하는 것이다.

---

## 4. AI 승률 UI

AI 승률 UI는 이미지 참고 요청에 맞춰 한 줄 누적 바 형태로 바꿨다.

표시 내용:
- 경기 ID / 대회
- 경기 시간 / 상태
- 홈팀 vs 원정팀
- 홈승 / 무승부 / 원정승 누적 바
- 하단 범례
- 관리자일 때만 `재예측` 버튼

AI 승률 판단 기준:

```js
const hasAiPrediction =
  Number.isFinite(match.aiHomePct) &&
  Number.isFinite(match.aiDrawPct) &&
  Number.isFinite(match.aiAwayPct);
```

프론트 normalized match 필드:

```js
{
  hasAiPrediction,
  predictionEnabled,
  prediction: {
    home,
    draw,
    away
  }
}
```

---

## 5. 로그인 / 관리자 인식 방식

관리자/사용자 구분은 DB의 `users.role` 기준으로 통일했다.

역할 enum:

```java
COMMON_USER
ADMIN_USER
```

프론트 판단:

```js
const isAdmin = Boolean(currentUser?.admin || currentUser?.role === "ADMIN_USER");
```

백엔드 `/api/user/me` 응답 예시:

```json
{
  "id": 1,
  "name": "사용자 이름",
  "matchesPlayed": 0,
  "correctCount": 0,
  "accuracy": 0,
  "role": "ADMIN_USER",
  "admin": true
}
```

관리자 배지:
- 메인 헤더 오른쪽 닉네임 옆에 표시
- 상세 페이지 헤더 오른쪽 닉네임 옆에 표시
- 일반 사용자는 아무 배지도 표시하지 않는다.

---

## 6. 관리자 인식 오류 수정 내용

사용자가 "어드민 인식이 안돼"라고 요청해서 백엔드 인증 흐름을 점검했다.

발견한 문제:
- 기존에는 `users.role` 외에 `ai.admin-emails` 화이트리스트도 관리자 판단에 섞여 있었다.
- JWT 안에도 로그인 당시 role이 들어가므로, DB에서 role을 바꿔도 기존 쿠키의 role이 오래된 상태일 수 있었다.

수정한 백엔드 파일:

```text
backend/src/main/java/com/example/backend/user/UserService.java
backend/src/main/java/com/example/backend/ai/AdminGuard.java
backend/src/main/java/com/example/backend/auth/jwt/JwtFiller.java
backend/src/main/java/com/example/backend/auth/jwt/JwtProvider.java
```

수정 내용:
- `/api/user/me`의 `admin` 값을 DB의 `users.role == ADMIN_USER`만 보고 계산
- `AdminGuard`도 DB의 `users.role == ADMIN_USER`만 허용
- `JwtFiller`가 토큰 속 role을 그대로 믿지 않고, 매 요청마다 DB에서 최신 role을 다시 읽어 권한 생성
- `JwtProvider`는 role claim을 문자열로 안정화

중요:
- 백엔드 서버를 재시작해야 이 수정이 적용된다.
- DB에서 해당 유저의 `role`이 정확히 `ADMIN_USER`여야 한다.

DB 확인 쿼리:

```sql
select id, email, name, role, is_active from users;
```

관리자로 바꾸는 쿼리:

```sql
update users
set role = 'ADMIN_USER'
where email = '관리자이메일@gmail.com';
```

---

## 7. API 연결 상태

### 인증

```js
authApi.loginWithGoogle()
authApi.logout()
userApi.me()
```

로그인 방식:

```text
GET http://localhost:8080/oauth2/authorization/google
```

로그인 성공 후 백엔드가 JWT를 HttpOnly 쿠키 `access_token`으로 내려준다.

프론트 API 요청은 모두:

```js
credentials: "include"
```

를 포함한다.

### 경기

```js
matchApi.getAllMatches({ page = 0, size = 100 })
matchApi.getWorldCupMatches({ page = 0, size = 100 })
matchApi.getMatchesByDate(date, { page = 0, size = 100 })
matchApi.getFotmobView(matchId)
```

현재 메인은 `getAllMatches()`를 사용한다.

### 관리자 AI

```js
adminApi.predictAi(matchId, { force = false })
```

실제 엔드포인트:

```text
POST /api/admin/ai/predict?matchId={id}&force={bool}
```

관리자만 사용 가능하다.

### 예측

```js
predictionApi.predict(matchId, predictedWinner)
predictionApi.getMyPredictions()
```

예측 전송 값:

```text
HOME_TEAM
DRAW
AWAY_TEAM
```

---

## 8. 디자인 결정 사항

초기에는 네온/다크 스타일을 시도했지만, 최종 방향은 밝고 정보성 사이트에 가까운 디자인이다.

현재 디자인 방향:
- 기본 배경은 밝은 톤
- 흰색/연한 회색 기반
- 연두색은 포인트로 제한
- 모바일에서는 piqq 앱 같은 카드형 참고
- PC에서는 모바일 앱처럼 보이지 않도록 넓은 레이아웃
- 박스 테두리는 최소화하고 색 면으로 구분
- 상단 헤더는 sticky

사용자가 싫어한 것:
- 네온 과다
- 가독성 낮은 색상
- PC에서 모바일 앱처럼 좁아 보이는 UI
- 너무 많은 테두리
- 불필요한 계정 안내 박스

---

## 9. 아직 mock인 부분

반드시 이어서 실제 API로 바꿔야 할 부분:

### 라인업

현재 `lineupTemplate`과 `benchTemplate`은 `App.jsx` 내부 mock 데이터다.

바꿔야 할 API:

```text
GET /api/match/{matchId}/fotmob
```

응답 주요 필드:

```json
{
  "matchId": 16,
  "homeFormation": "4-3-3",
  "awayFormation": "4-4-2",
  "lineup": [],
  "events": []
}
```

`LineupPlayer` 필드:

```json
{
  "fotmobPlayerId": 433265,
  "name": "Hyeon-Woo Jo",
  "shirtNumber": 21,
  "posX": 0.1,
  "posY": 0.5,
  "home": true,
  "starter": true,
  "rating": 7.2,
  "subInMinute": null,
  "subOutMinute": null
}
```

선수 사진 URL:

```text
https://images.fotmob.com/image_resources/playerimages/{fotmobPlayerId}.png
```

주의:
- 소규모 친선은 rating이 null일 수 있다.
- 라인업은 킥오프 약 1시간 전부터만 공개될 수 있다.
- `posX`, `posY`가 null이면 포메이션 문자열 기반 fallback 배치가 필요하다.

---

## 10. 실행 / 검증 명령

프론트:

```bash
cd frontend
npm run lint
npm run build
npm run dev
```

백엔드 컴파일:

```bash
cd backend
sh gradlew compileJava
```

권한 문제로 Gradle wrapper가 `~/.gradle`에 접근하지 못하면, Codex에서 escalated 권한이 필요할 수 있다.

백엔드 재시작이 필요한 경우:
- 인증/관리자 관련 Java 코드를 수정한 뒤
- OAuth redirect 설정을 수정한 뒤
- API 컨트롤러/서비스를 수정한 뒤

---

## 11. 최근 검증 결과

마지막으로 확인한 검증:

```text
frontend npm run lint: 성공
frontend npm run build: 성공
backend sh gradlew compileJava: 성공
```

---

## 12. 다음 작업 추천 순서

1. 백엔드 서버 재시작 후 `/api/user/me` 응답 확인
   - `role: "ADMIN_USER"`
   - `admin: true`
2. 관리자 계정으로 로그인했을 때 헤더 닉네임 옆 `관리자` 배지 확인
3. 관리자 계정으로 AI 승률 없는 경기 상세 진입
   - `AI 승률 생성` 박스가 보이는지 확인
4. `AI 승률 생성` 버튼 클릭
   - `/api/admin/ai/predict` 성공 확인
   - 성공 후 AI 승률 박스가 표시되는지 확인
5. 라인업 mock 제거
   - `GET /api/match/{id}/fotmob` 연결
   - 실제 `lineup`, `events`, `rating`, `posX/posY`, player image 렌더링
6. 승부예측 실제 저장 연결
   - `POST /api/prediction/predict`
   - 비로그인 blur 처리 유지
   - 예측 후 비율 조회 정책 반영

---

## 13. 현재 작업트리 참고

현재 변경으로 남아 있는 주요 항목:

```text
M backend/src/main/java/com/example/backend/ai/AdminGuard.java
M backend/src/main/java/com/example/backend/auth/OAuth2SuccessHandler.java
M backend/src/main/java/com/example/backend/auth/jwt/JwtFiller.java
M backend/src/main/java/com/example/backend/auth/jwt/JwtProvider.java
M backend/src/main/java/com/example/backend/user/UserService.java
?? frontend/
```

`OAuth2SuccessHandler.java`는 프론트 리다이렉트 URL을 설정값으로 받도록 바뀌어 있다.

```java
@Value("${app.frontend-url:http://localhost:5174}")
private String frontendUrl;
```

로그인 후 다른 포트로 튄다면 `application.yml`의 `app.frontend-url` 또는 현재 Vite 포트를 확인해야 한다.

