import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ArenaPage } from "./ArenaPage";
import "./styles.css";
import { loadFonts } from "./sim/render/palette";

void loadFonts();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ArenaPage />
  </StrictMode>,
);
