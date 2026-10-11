import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initialize } from "./data/db";
import "./styles.css";
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="p-8">
        <h1>데이터를 불러오지 못했습니다.</h1>
        <p>
          브라우저 저장 공간과 IndexedDB 사용 허용을 확인한 뒤 새로고침하세요.
          저장된 데이터를 자동 삭제하지 않습니다.
        </p>
      </main>
    ) : (
      this.props.children
    );
  }
}
const root = createRoot(document.getElementById("root")!);
initialize()
  .then(() =>
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>,
    ),
  )
  .catch(() =>
    root.render(
      <main className="p-8">
        <h1>기기 저장소에 접근할 수 없습니다.</h1>
        <p>
          브라우저의 저장소 허용 설정을 확인하세요. 기존 데이터는 삭제하지
          않았습니다.
        </p>
      </main>,
    ),
  );
