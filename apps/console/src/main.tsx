import React from "react";
import ReactDOM from "react-dom/client";
import "./fonts.css";
import "./styles.css";
import Portal from "./portal/Portal";
import { ThemeProvider } from "./portal/Theme";
import "./portal/night.css";

const Demo = React.lazy(() => import("./demo/Demo"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      {location.pathname === "/demo" ? (
        <React.Suspense fallback={<div>Loading AERIS…</div>}>
          <Demo />
        </React.Suspense>
      ) : (
        <Portal />
      )}
    </ThemeProvider>
  </React.StrictMode>,
);
