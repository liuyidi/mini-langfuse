import { Link, Route, Routes } from "react-router-dom";
import TraceListPage from "./pages/TraceListPage";
import TraceDetailPage from "./pages/TraceDetailPage";

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white px-6 py-3 flex items-center gap-4">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          🔦 Mini Langfuse
        </Link>
        <nav className="text-sm text-neutral-600">
          <Link to="/" className="hover:text-neutral-900">Traces</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<TraceListPage />} />
          <Route path="/traces/:id" element={<TraceDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}
