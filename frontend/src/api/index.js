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
    const message =
      error.response?.data?.msg || "서버 오류가 발생했습니다.";
    // 예상된 에러(예: 예측 전 400/404, 배너 조회 실패)는 호출 시
    // config.skipErrorToast로 토스트를 끌 수 있다.
    if (!error.config?.skipErrorToast) {
      toast.error(message);
    }
    return Promise.reject(error);
  },
);

export default API;
