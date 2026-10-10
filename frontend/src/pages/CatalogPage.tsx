import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Product, ProductivityRule } from "../api/types";
import { formatChf, formatNumber } from "../lib/format";

type Tab = "catalogo" | "produttivita" | "parametri";

export function CatalogPage() {
  const [tab, setTab] = useState<Tab>("catalogo");
  const [products, setProducts] = useState<Product[]>([]);
  const [rules, setRules] = useState<ProductivityRule[]>([]);
  const [parameters, setParameters] = useState<Record<string, unknown> | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void api.catalog().then(setProducts).catch(() => undefined);
    void api.productivity().then(setRules).catch(() => undefined);
    void api.parameters().then(setParameters).catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) =>
      [product.product_id, product.category, product.subcategory, product.description, product.model]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [products, query]);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2>Catalogo e dati di prezzatura</h2>
          <p className="page__sub">
            Da qui si capisce su cosa si basa il prezzo: prodotti, regole di
            produttività e parametri di progetto.
          </p>
        </div>
      </header>

      <div className="tabs">
        <button
          type="button"
          className={tab === "catalogo" ? "is-active" : ""}
          onClick={() => setTab("catalogo")}
        >
          Catalogo ({products.length})
        </button>
        <button
          type="button"
          className={tab === "produttivita" ? "is-active" : ""}
          onClick={() => setTab("produttivita")}
        >
          Regole di produttività ({rules.length})
        </button>
        <button
          type="button"
          className={tab === "parametri" ? "is-active" : ""}
          onClick={() => setTab("parametri")}
        >
          Parametri di progetto
        </button>
      </div>

      {tab === "catalogo" && (
        <section className="card table-card">
          <header className="table-card__head">
            <h3>Prodotti</h3>
            <input
              className="search"
              placeholder="Cerca per descrizione, categoria, modello…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </header>
          <div className="table-scroll">
            <table className="items">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Categoria</th>
                  <th>Descrizione</th>
                  <th>Modello</th>
                  <th>Unità</th>
                  <th className="num">Costo netto</th>
                  <th>Install code</th>
                  <th>Fonte</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => (
                  <tr key={product.product_id}>
                    <td className="mono">{product.product_id}</td>
                    <td>{product.category}</td>
                    <td>{product.description}</td>
                    <td className="mono">{product.model}</td>
                    <td>{product.unit}</td>
                    <td className="num">{formatChf(product.net_cost_chf, true)}</td>
                    <td className="mono">{product.install_code}</td>
                    <td>
                      {product.supplier_quote_required ? (
                        <span className="tag tag--warn">preventivo fornitore</span>
                      ) : (
                        <span className="tag">catalogo</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "produttivita" && (
        <section className="card table-card">
          <header className="table-card__head">
            <h3>Regole di produttività</h3>
          </header>
          <div className="table-scroll">
            <table className="items">
              <thead>
                <tr>
                  <th>Install code</th>
                  <th>Lavoro</th>
                  <th>Unità</th>
                  <th className="num">Ore/unità</th>
                  <th>Ruolo</th>
                  <th className="num">Tariffa CHF/h</th>
                  <th>Fattori</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.install_code}>
                    <td className="mono">{rule.install_code}</td>
                    <td>{rule.work_type}</td>
                    <td>{rule.unit}</td>
                    <td className="num">{formatNumber(rule.base_hours_per_unit)}</td>
                    <td>{rule.labour_role}</td>
                    <td className="num">{rule.default_hourly_rate_chf}</td>
                    <td className="mono small">{rule.factor_keys.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "parametri" && (
        <section className="card">
          <h3>Parametri di progetto</h3>
          <pre className="json">{JSON.stringify(parameters, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}
