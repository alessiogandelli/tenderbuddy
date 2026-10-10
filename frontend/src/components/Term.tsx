import { GLOSSARY } from "../lib/flags";

// A domain term with a short glossary definition. Adoption by non-technical
// users depends on never leaving jargon unexplained.
export function Term({ children }: { children: string }) {
  const definition = GLOSSARY[children];
  if (!definition) return <>{children}</>;
  return (
    <span className="term" title={definition} tabIndex={0}>
      {children}
    </span>
  );
}
