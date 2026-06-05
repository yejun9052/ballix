import "./App.css";
import FotmobTester from "./FotmobTester.jsx";

function App() {
  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      <div style={{ padding: "8px 24px", textAlign: "right" }}>
        <button
          type="button"
          style={{ fontSize: 13, padding: "4px 10px", cursor: "pointer" }}
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
