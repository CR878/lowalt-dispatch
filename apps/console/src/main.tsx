import React from "react";
import ReactDOM from "react-dom/client";
import "./fonts.css";
import "./styles.css";
import Portal from "./portal/Portal";
import { ThemeProvider } from "./portal/Theme";
import "./portal/night.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <Portal />
    </ThemeProvider>
  </React.StrictMode>,
);
