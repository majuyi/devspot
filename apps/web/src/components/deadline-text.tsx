import { formatDate } from "@/ui/time";

/** The mono date line; with `previous`, the old date struck through above it (Deadline moved). */
export function DeadlineText({
  at,
  previous,
  closed = false,
}: {
  at: string;
  previous?: string | null;
  closed?: boolean;
}) {
  const date = formatDate(new Date(at), { time: true });
  if (closed) {
    return (
      <span className="text-date text-faint">
        <del>{date}</del>
      </span>
    );
  }
  return (
    <span className="text-date flex flex-col text-muted">
      {previous ? (
        <del className="text-faint">
          <span className="sr-only">Was </span>
          {formatDate(new Date(previous), { time: true })}
        </del>
      ) : null}
      <span>{date}</span>
    </span>
  );
}
