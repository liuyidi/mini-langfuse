import { Link, NavLink, Route, Routes } from "react-router-dom";
import TraceListPage from "./pages/TraceListPage";
import TraceDetailPage from "./pages/TraceDetailPage";
import SessionListPage from "./pages/SessionListPage";
import SessionDetailPage from "./pages/SessionDetailPage";
import PromptListPage from "./pages/PromptListPage";
import PromptDetailPage from "./pages/PromptDetailPage";

export default function App() {
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `hover:text-neutral-900 ${isActive ? "text-neutral-900 font-medium" : "text-neutral-600"}`;

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white px-6 py-3 flex items-center gap-6">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          🔦 Mini Langfuse
        </Link>
        <nav className="text-sm flex gap-4">
          <NavLink to="/" end className={linkCls}>
            Traces
          </NavLink>
          <NavLink to="/sessions" className={linkCls}>
            Sessions
          </NavLink>
          <NavLink to="/prompts" className={linkCls}>
            Prompts
          </NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<TraceListPage />} />
          <Route path="/traces/:id" element={<TraceDetailPage />} />
          <Route path="/sessions" element={<SessionListPage />} />
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
          <Route path="/prompts" element={<PromptListPage />} />
          <Route path="/prompts/:name" element={<PromptDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}
