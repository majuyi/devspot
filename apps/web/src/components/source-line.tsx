import { checkedAgo, sourceDomain } from "@/ui/time";

/** Where the item came from and when we last read it (docs/07 §1, principle 3). */
export function SourceLine({
  url,
  lastVerifiedAt,
  now,
}: {
  url: string;
  lastVerifiedAt: string | null;
  now: Date;
}) {
  const checked = lastVerifiedAt ? ` · ${checkedAgo(new Date(lastVerifiedAt), now)}` : "";
  return (
    <span className="text-meta text-faint">
      {sourceDomain(url)}
      {checked}
    </span>
  );
}
