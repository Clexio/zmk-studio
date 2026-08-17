import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { LanguageProvider } from "./i18n";
import { ToastProvider } from "./misc/Toast";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ToastProvider>
  </React.StrictMode>
);
