import type { OpportunityDto } from "@devspot/schema";
import type { Route } from "next";
import Link from "next/link";
import { placeLabel } from "@/ui/place";
import { formatDate } from "@/ui/time";
import { DeadlineText } from "./deadline-text";
import { CalendarAddIcon, NotStatedIcon } from "./icons";
import { KindTag } from "./kind-tag";
import { CountdownColumn, LiveStatus } from "./live";
import { LogoTile } from "./logo-tile";
import { SourceLine } from "./source-line";
import { StatusWord } from "./status-word";

export type RowItem = Pick<
  OpportunityDto,
  | "slug"
  | "title"
  | "kind"
  | "organization"
  | "canonicalUrl"
  | "deadlineAt"
  | "deadlineKind"
  | "startsAt"
  | "locationMode"
  | "country"
  | "city"
  | "status"
  | "lastVerifiedAt"
>;

// /o/[slug] arrives in M2.5; the cast goes then.
const href = (slug: string) => `/o/${slug}` as Route;

function Meta({ item }: { item: RowItem }) {
  return (
    <span
      className={`text-meta truncate ${item.status === "closed" ? "text-faint" : "text-muted"}`}
    >
      {item.organization.name} · {placeLabel(item)}
    </span>
  );
}

/**
 * A row with a countdown (docs/07 §5, board "Row states"): deadlines, events, multi-round.
 * `serverNow` is the render instant; the countdown and status word move to the client clock.
 * `previousDeadlineAt` shows "Deadline moved" once a deadline history exists.
 */
export function DatedRow({
  item,
  serverNow,
  previousDeadlineAt,
}: {
  item: RowItem;
  serverNow: string;
  previousDeadlineAt?: string | null;
}) {
  const closed = item.status === "closed";
  const isEvent = item.kind === "event";
  const at = isEvent ? item.startsAt : item.deadlineAt;
  const moved = !closed && !isEvent && previousDeadlineAt && previousDeadlineAt !== item.deadlineAt;
  return (
    <div
      className={`flex items-start gap-1 border-t border-line py-3.5 pl-4 hover:bg-raise ${closed ? "pr-4" : "pr-1.5"}`}
    >
      <Link href={href(item.slug)} className="flex min-w-0 flex-1 gap-3 no-underline">
        <CountdownColumn item={item} serverNow={serverNow} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <KindTag kind={item.kind} closed={closed} />
            {moved ? (
              <StatusWord tone="none">Deadline moved</StatusWord>
            ) : (
              <LiveStatus item={item} serverNow={serverNow} />
            )}
          </div>
          <span className={`text-row-title text-pretty ${closed ? "text-muted" : ""}`}>
            {item.title}
          </span>
          <Meta item={item} />
          {item.deadlineKind === "multiRound" && !isEvent && at && !closed ? (
            <span className="text-meta text-muted">
              Multiple rounds, next: <span className="text-date">{formatDate(new Date(at))}</span>
            </span>
          ) : at ? (
            <DeadlineText at={at} previous={moved ? previousDeadlineAt : null} closed={closed} />
          ) : null}
          {closed ? null : (
            <SourceLine
              url={item.canonicalUrl}
              lastVerifiedAt={item.lastVerifiedAt}
              now={new Date(serverNow)}
            />
          )}
        </div>
      </Link>
      {closed ? null : (
        <a
          href={`/o/${item.slug}/calendar.ics`}
          aria-label={`Add ${item.title} to calendar`}
          className="flex size-target shrink-0 items-center justify-center rounded-pill text-muted hover:bg-raise hover:text-fg"
        >
          <CalendarAddIcon />
        </a>
      )}
    </div>
  );
}

/** A row with no date to count down to: rolling or not stated. Logo tile in the left column. */
export function UndatedRow({
  item,
  serverNow,
  logoUrl,
}: {
  item: RowItem;
  serverNow: string;
  logoUrl?: string | null;
}) {
  const rolling = item.deadlineKind === "rolling";
  return (
    <Link
      href={href(item.slug)}
      className="flex gap-3 border-t border-line px-4 py-3.5 no-underline hover:bg-raise"
    >
      <LogoTile name={item.organization.name} logoUrl={logoUrl} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <KindTag kind={item.kind} />
          {rolling ? <StatusWord tone="none">Rolling applications</StatusWord> : null}
        </div>
        <span className="text-row-title text-pretty">{item.title}</span>
        <Meta item={item} />
        {rolling ? null : (
          <span className="text-meta flex items-center gap-1.5 text-faint">
            <NotStatedIcon />
            Deadline not stated on the source page
          </span>
        )}
        <SourceLine
          url={item.canonicalUrl}
          lastVerifiedAt={item.lastVerifiedAt}
          now={new Date(serverNow)}
        />
      </div>
    </Link>
  );
}

/** Picks the row for an item: dated when there is an instant to count down to. */
export function OpportunityRow(props: { item: RowItem; serverNow: string }) {
  const { item } = props;
  const dated =
    item.kind === "event"
      ? Boolean(item.startsAt)
      : Boolean(item.deadlineAt) &&
        (item.deadlineKind === "fixed" || item.deadlineKind === "multiRound");
  return dated || item.status === "closed" ? <DatedRow {...props} /> : <UndatedRow {...props} />;
}
