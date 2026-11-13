import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import "./index.css";
import { StoreProvider } from "./lib/store";
import Anatomy from "./pages/Anatomy";
import Dashboard from "./pages/Dashboard";
import KnowledgeBase from "./pages/KnowledgeBase";
import Reasoning from "./pages/Reasoning";
import SmartTriage from "./pages/SmartTriage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="triage" element={<SmartTriage />} />
            <Route path="anatomy" element={<Anatomy />} />
            <Route path="reasoning" element={<Reasoning />} />
            <Route path="knowledge" element={<KnowledgeBase />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  </React.StrictMode>,
);
