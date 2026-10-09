import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ArenaPage } from "./ArenaPage";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ArenaPage />
  </StrictMode>,
);
