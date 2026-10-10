import type { Item, PositionResult, Product, Unit } from "../api/types";
import { formatChf } from "../lib/format";
import { PositionRow } from "./PositionRow";

export interface SectionRowsProps {
  items: Item[];
  positionsById: Map<string, PositionResult>;
  products: Product[];
  selectedId: string | null;
  onSelect: (lvId: string) => void;
  onSave: (
    lvId: string,
    patch: {
      description_raw?: string;
      quantity?: number;
      unit?: Unit;
      product_id?: string;
    },
  ) => Promise<void>;
}

export interface ProjectCostLine {
  key: string;
  label: string;
  value: number;
}

function Rows({ variant, ...props }: SectionRowsProps & { variant: "material" | "labour" }) {
  return (
    <div className="rows">
      {props.items.map((item) => (
        <PositionRow
          key={item.lv_id}
          item={item}
          result={props.positionsById.get(item.lv_id)}
          products={props.products}
          selected={props.selectedId === item.lv_id}
          variant={variant}
          onSelect={() => props.onSelect(item.lv_id)}
          onSave={(patch) => props.onSave(item.lv_id, patch)}
        />
      ))}
      {props.items.length === 0 && <p className="muted rows__empty">Nessuna voce per questo filtro.</p>}
    </div>
  );
}

function SectionHead({
  title,
  total,
  count,
  warningCount,
  hint,
}: {
  title: string;
  total: number;
  count: number;
  warningCount: number;
  hint: string;
}) {
  return (
    <header className="section__head">
      <div>
        <h2>{title}</h2>
        <span className="section__hint">{hint}</span>
      </div>
      {warningCount > 0 && <span className="section__flag">⚠ {warningCount} da sistemare</span>}
      <span className="section__count">{count} voci</span>
      <span className="section__total">
        <small>Totale</small>
        {formatChf(total)}
      </span>
    </header>
  );
}

export function MaterialSection({
  total,
  warningCount,
  ...rows
}: SectionRowsProps & { total: number; warningCount: number }) {
  return (
    <section className="section section--material">
      <SectionHead
        title="Materiali"
        total={total}
        count={rows.items.length}
        warningCount={warningCount}
        hint="Prodotto di catalogo, quantità, costo unitario e costo materiale (scarto incluso)."
      />
      <Rows variant="material" {...rows} />
    </section>
  );
}

export function LabourSection({
  total,
  projectCostLines,
  projectCostsTotal,
  includeProjectCosts,
  onToggleProjectCosts,
  ...rows
}: SectionRowsProps & {
  total: number;
  projectCostLines: ProjectCostLine[];
  projectCostsTotal: number;
  includeProjectCosts: boolean;
  onToggleProjectCosts: () => void;
}) {
  return (
    <section className="section section--labour">
      <SectionHead
        title="Manodopera"
        total={total}
        count={rows.items.length}
        warningCount={0}
        hint="Tipo di lavoro, ore per unità, fattori di cantiere, ore totali, tariffa e costo."
      />
      <Rows variant="labour" {...rows} />

      <div className="project-costs">
        <div className="project-costs__head">
          <h3>Costi di progetto</h3>
          <label className="switch">
            <input
              type="checkbox"
              checked={includeProjectCosts}
              onChange={onToggleProjectCosts}
            />
            Includi nel prezzo
          </label>
        </div>
        <ul className="costlines">
          {projectCostLines.map((line) => (
            <li key={line.key}>
              <span>{line.label}</span>
              <span>{formatChf(line.value)}</span>
            </li>
          ))}
          <li className="costlines__total">
            <span>Totale costi di progetto</span>
            <span>{formatChf(projectCostsTotal)}</span>
          </li>
        </ul>
        {!includeProjectCosts && (
          <p className="caption">
            Esclusi dal prezzo: attiva l'interruttore per aggiungerli al costo diretto.
          </p>
        )}
      </div>
    </section>
  );
}
