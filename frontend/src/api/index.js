import axios from "axios";
import toast from "react-hot-toast";

const API = axios.create({
  baseURL: "http://localhost:8080",
  withCredentials: true,
});

API.interceptors.response.use(
  // 백엔드 CommonResponse{success,msg,data} 중 payload(data)만 꺼내 반환한다.
  // → 호출부는 await getX()로 바로 데이터를 받는다(껍데기 .data.data 불필요).
  (response) => response.data?.data,
  (error) => {
    // 실패 메시지는 CommonResponse의 `msg`로 내려온다.
    const data = error.response?.data;
    const message = data?.msg || "서버 오류가 발생했습니다.";
    // 다른 기기에서 로그인되어 이 세션이 무효화된 경우: 토스트는 항상 띄우고
    // 앱에 알려(로그아웃 + 로그인 화면 이동) 처리하게 한다. skipErrorToast 무시.
    if (data?.code === "SESSION_REPLACED") {
      toast.error(message);
      window.dispatchEvent(new CustomEvent("ballix:session-replaced"));
      return Promise.reject(error);
    }
    // 예상된 에러(예: 예측 전 400/404, 배너 조회 실패)는 호출 시
    // config.skipErrorToast로 토스트를 끌 수 있다.
    if (!error.config?.skipErrorToast) {
      toast.error(message);
    }
    return Promise.reject(error);
  },
);

export default API;
