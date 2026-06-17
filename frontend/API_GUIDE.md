# 프론트엔드 API 레이어 가이드 (`src/api/`)

이 문서는 `frontend/`의 API 호출 구조를 설명한다. 모든 백엔드 호출은 **axios 기반 `src/api/` 모듈**을 거친다(직접 `fetch` 금지).

> 구버전 `src/services/api.js`(fetch + `apiRequest` + `ApiError`)는 제거됨. 이 구조로 일원화한다.

## 핵심 구조

```
src/api/
├─ index.js          # axios 인스턴스 + 공통 인터셉터 (모든 도메인이 import)
├─ auth.js           # 로그인/로그아웃
├─ user.js           # 내 정보·닉네임·리더보드
├─ match.js          # 경기 목록·상세·AI요약·하이라이트
├─ prediction.js     # 예측 저장/조회/분포
├─ notice.js         # 공지(공개)
├─ standings.js      # 리그 순위
├─ fotmobAdmin.js    # 일정·순위 동기화, 폴링, 검색, 번역 (관리자)
├─ admin.js          # AI 생성·유저·공지 관리 (관리자)
└─ matchAdmin.js     # 다시보기 등록/해제 (관리자)
```

## `index.js` — 공통 모듈

```js
import axios from "axios";
import toast from "react-hot-toast";

const API = axios.create({
  baseURL: "http://localhost:8080",
  withCredentials: true,            // JWT HTTP-only 쿠키 동봉
});

API.interceptors.response.use(
  // 성공: CommonResponse{success,msg,data} 중 payload(data)만 반환
  (response) => response.data?.data,
  (error) => {
    const message = error.response?.data?.msg || "서버 오류가 발생했습니다.";
    if (!error.config?.skipErrorToast) {
      toast.error(message);
    }
    return Promise.reject(error);
  },
);

export default API;
```

규칙 3가지(반드시 숙지):

1. **반환값은 언래핑된 payload(`data`)다.** 인터셉터가 `response.data.data`를 반환하므로 호출부는 `await getX()`로 **바로 데이터**를 받는다. axios 응답 껍데기(`.data.data`)를 다시 풀 필요 없다.
2. **에러 메시지는 `msg`에 있다.** 백엔드 `CommonResponse`는 실패 메시지를 `msg`로 내려준다(`message` 아님). 실패는 HTTP 4xx/5xx로 와서 axios가 reject → 인터셉터가 자동으로 `toast.error(msg)`.
3. **`skipErrorToast`로 토스트를 끌 수 있다.** 예상된 에러(예: 예측 전 400/404)나 조용히 실패해야 하는 조회(배너 등)는 호출 시 config로 토스트를 억제한다.

## 도메인 파일 작성 형식

각 파일은 `index`의 `API`를 가져와 **네임드 함수**로 엔드포인트를 노출한다.

```js
// api/match.js
import API from "./index";

export const getAllMatches = ({ page = 0, size = 100 } = {}) =>
  API.get(`/api/match/allMatch?page=${page}&size=${size}`);

export const getFotmobView = (matchId) =>
  API.get(`/api/match/${matchId}/fotmob`);
```

- 함수명은 동작 기준(`get*`/`sync*`/`create*` …), POST 바디는 axios 2번째 인자 객체로(자동 JSON 직렬화).
- 토스트 억제가 필요한 함수는 **마지막 인자로 axios `config`를 받아 그대로 넘긴다**:
  ```js
  export const getPredictionRatio = (matchId, config) =>
    API.get(`/api/prediction/ratio?matchId=${matchId}`, config);
  ```

## 호출부(컴포넌트) 사용법

```js
import { getAllMatches } from "../api/match.js";
import { changeMyName } from "../api/user.js";

// 조회 — 바로 payload
const page = await getAllMatches({ size: 100 });
const rows = page.content;           // 백엔드 Page 객체

// 에러 메시지는 err.response?.data?.msg 에서 꺼낸다
try {
  await changeMyName(next);
} catch (e) {
  setError(e.response?.data?.msg || "변경에 실패했습니다.");
}

// 예상된 에러(예측 전 등)는 토스트 억제
getPredictionByMatch(matchId, { skipErrorToast: true }).catch(() => {});
```

- HTTP 상태가 필요하면 `err.response?.status`(네트워크 오류면 `err.response`가 없으니 `?? 0`).
- 전역 토스트가 자동으로 뜨므로, 인라인 `setError`는 화면에 남겨두고 싶을 때만 추가로 둔다(중복 표기 허용).

## Toaster 마운트

인터셉터의 `toast.error`가 렌더링되려면 `src/main.jsx`에 `<Toaster />`가 있어야 한다(이미 마운트됨).

```jsx
import { Toaster } from "react-hot-toast";
// ...
<App />
<Toaster position="top-center" />
```

## 의존성

```
axios, react-hot-toast   # package.json dependencies
```

## 참고 / TODO

- `baseURL`은 현재 `http://localhost:8080` 하드코딩이다. cross-origin + `withCredentials`라 쿠키 SameSite 이슈가 생기면, `vite.config.js` 프록시(`/api`·`/oauth2` → :8080) + `baseURL: ""`(same-origin) 방식으로 전환하거나 `import.meta.env.VITE_API_BASE_URL`로 분리한다.
