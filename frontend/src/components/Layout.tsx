import { NavLink, Outlet } from "react-router-dom";
import { HealthBadge } from "./HealthBadge";

export function Layout() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__kicker">Equans · Sprintd</span>
          <h1>Bando → Preventivo</h1>
          <p className="brand__sub">Dal documento di gara al primo prezzo</p>
        </div>
        <nav>
          <NavLink to="/" end>
            <span aria-hidden>📁</span> Archivio bandi
          </NavLink>
          <NavLink to="/catalogo">
            <span aria-hidden>📚</span> Catalogo
          </NavLink>
        </nav>
        <div className="sidebar__foot">
          <p>
            Carichi un bando, rivedi ciò che è incerto, leggi il preventivo. Tutto
            tracciabile alla pagina del PDF.
          </p>
          <HealthBadge />
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
