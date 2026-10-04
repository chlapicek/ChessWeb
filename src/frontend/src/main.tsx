import { createRoot } from "react-dom/client";
import App from "./App";
import "./i18n";
// Fallback for sonner's runtime <style> injection, which the CSP only allows for its current exact content.
import "sonner/dist/styles.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
