import React from "react";
import ReactDOM from "react-dom/client";
import S3InvoiceViewer from "./components/viewer/S3InvoiceViewer";
import { TooltipProvider } from "./components/ui/tooltip";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider>
      <S3InvoiceViewer />
    </TooltipProvider>
  </React.StrictMode>
);
