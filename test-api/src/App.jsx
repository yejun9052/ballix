import "./App.css";
import FotmobTester from "./FotmobTester.jsx";

// OAuth 리다이렉트로 돌아올 때 ?error=banned 가 붙어오면 정지 안내를 보여준다.
function loginError() {
  const e = new URLSearchParams(window.location.search).get("error");
  if (e === "banned") return "정지된 계정입니다. 관리자에 의해 이용이 제한되어 로그인할 수 없습니다.";
  return null;
}

function App() {
  const errorMsg = loginError();

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      {errorMsg && (
        <div
          role="alert"
          style={{
            margin: "12px 24px", padding: "10px 14px",
            background: "#7f1d1d", color: "#fecaca",
            border: "1px solid #b91c1c", borderRadius: 8, fontSize: 14,
          }}
        >
          {errorMsg}
        </div>
      )}
      <div style={{ padding: "8px 24px", textAlign: "right" }}>
        <button
          type="button"
          style={{
            fontSize: 13, padding: "4px 10px", cursor: "pointer",
            background: "#334155", color: "#e2e8f0",
            border: "1px solid #475569", borderRadius: 6,
          }}
          onClick={() => {
            location.href = "http://localhost:8080/oauth2/authorization/google";
          }}
        >
          구글 로그인
        </button>
      </div>
      <FotmobTester />
    </div>
  );
}

export default App;
