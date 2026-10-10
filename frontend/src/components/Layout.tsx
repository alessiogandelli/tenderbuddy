import { Link, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="topbar__brand">
          <span className="topbar__mark" aria-hidden />
          <span className="topbar__name">
            Bando<span className="topbar__arrow">→</span>Preventivo
          </span>
        </Link>
        <span className="topbar__kicker">Equans · Sprintd Zurich</span>
      </header>
      <main className="app__main">
        <Outlet />
      </main>
    </div>
  );
}
