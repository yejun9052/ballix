import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";

// 렌더 전에 저장된 테마를 적용해 첫 화면 깜빡임(FOUC)을 막는다.
(() => {
  const saved = localStorage.getItem("ballix-theme");
  const theme =
    saved === "dark" || saved === "light"
      ? saved
      : window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  document.documentElement.dataset.theme = theme;
})();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
