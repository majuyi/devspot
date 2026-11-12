import type { OpportunityKind } from "@devspot/schema";
import { FAMILY_TINT, KIND_FAMILY, KIND_LABEL } from "@/ui/kind";

/** The exact kind in its family's tint; grey when the item is closed. */
export function KindTag({ kind, closed = false }: { kind: OpportunityKind; closed?: boolean }) {
  const tint = closed ? "bg-raise text-faint" : FAMILY_TINT[KIND_FAMILY[kind]];
  return <span className={`text-tag rounded-tag px-[7px] py-0.5 ${tint}`}>{KIND_LABEL[kind]}</span>;
}
