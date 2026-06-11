import "./App.css";
import FotmobTester from "./FotmobTester.jsx";

function App() {
  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
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
