import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App.jsx";
import "./styles.css";

document.documentElement.removeAttribute("data-theme");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      {/* API 인터셉터의 toast.error를 화면에 렌더링 */}
      <Toaster position="top-center" />
    </BrowserRouter>
  </React.StrictMode>,
);
