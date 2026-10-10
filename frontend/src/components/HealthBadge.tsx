import { useEffect, useState } from "react";
import { api } from "../api/client";

// Ticket 01: the app shows the contract version and whether the backend is
// reachable, so anyone can tell at a glance that the two sides agree.
export function HealthBadge() {
  const [state, setState] = useState<{ ok: boolean; version?: string }>({ ok: false });

  useEffect(() => {
    api
      .health()
      .then((health) => setState({ ok: true, version: health.contract_version }))
      .catch(() => setState({ ok: false }));
  }, []);

  return (
    <div className={`health ${state.ok ? "health--ok" : "health--down"}`}>
      <span className="health__dot" aria-hidden />
      {state.ok ? `Contratto v${state.version} · backend ok` : "Backend non raggiungibile"}
    </div>
  );
}
