import { CITIES, DeadlineKind, LocationMode, OpportunityKind, TAGS } from "@devspot/schema";
import type { ReactNode } from "react";
import { KIND_LABEL } from "@/ui/kind";
import { tagLabel } from "@/ui/prefs";
import { formatDate } from "@/ui/time";
import type { Editable } from "./form";
import { lagosInputs } from "./form";

export const INPUT =
  "h-10 w-full rounded-tile border border-line bg-surface px-2.5 text-[14px] text-fg";
const AREA = "w-full rounded-tile border border-line bg-surface px-2.5 py-2 text-[14px] text-fg";
const LABEL = "flex items-baseline justify-between gap-2 text-[12px] font-medium text-muted";

const DEADLINE_KIND: Record<DeadlineKind, string> = {
  unknown: "Not stated on the source page",
  fixed: "Fixed: the source states a date",
  rolling: "Rolling applications",
  multiRound: "Multiple rounds",
};
const LOCATION: Record<LocationMode, string> = {
  remote: "Remote",
  onsite: "On site",
  hybrid: "Hybrid",
};

/** A label with the extractor's confidence for that field, when it gave one. */
export function Label({
  htmlFor,
  children,
  sure,
}: {
  htmlFor: string;
  children: string;
  sure?: number;
}) {
  return (
    <label htmlFor={htmlFor} className={LABEL}>
      {children}
      {sure === undefined ? null : (
        <span className="text-date text-[11px] font-normal text-faint">sure {sure.toFixed(2)}</span>
      )}
    </label>
  );
}

export function Field({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-1">{children}</div>;
}

/** A date and an optional time, as the source states them, in Lagos time. */
function When({
  name,
  label,
  at,
  sure,
}: {
  name: string;
  label: string;
  at: Date | null;
  sure?: number;
}) {
  const v = lagosInputs(at);
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
      <legend className={`${LABEL} w-full p-0`}>
        {label}
        {sure === undefined ? null : (
          <span className="text-date text-[11px] font-normal text-faint">
            sure {sure.toFixed(2)}
          </span>
        )}
      </legend>
      <div className="flex gap-2">
        <input
          type="date"
          name={`${name}Date`}
          defaultValue={v.date}
          aria-label={`${label}, date`}
          className={INPUT}
        />
        <input
          type="time"
          name={`${name}Time`}
          defaultValue={v.time}
          aria-label={`${label}, time, only if the source states one`}
          className={`${INPUT} max-w-[130px]`}
        />
      </div>
    </fieldset>
  );
}

/**
 * The editable fields of an opportunity, shared by the review form and /admin/new, with the
 * extractor's confidence beside each field that has one.
 */
export function OpportunityFields({
  v,
  sure = {},
}: {
  v: Editable;
  sure?: Record<string, number | undefined>;
}) {
  return (
    <>
      <Field>
        <Label htmlFor="title" sure={sure.title}>
          Title
        </Label>
        <input id="title" name="title" required defaultValue={v.title} className={INPUT} />
      </Field>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field>
          <Label htmlFor="kind" sure={sure.kind}>
            Kind
          </Label>
          <select id="kind" name="kind" required defaultValue={v.kind ?? ""} className={INPUT}>
            <option value="">Not set</option>
            {OpportunityKind.options.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <Label htmlFor="locationMode" sure={sure.locationMode}>
            Location
          </Label>
          <select
            id="locationMode"
            name="locationMode"
            required
            defaultValue={v.locationMode ?? ""}
            className={INPUT}
          >
            <option value="">Not set</option>
            {LocationMode.options.map((m) => (
              <option key={m} value={m}>
                {LOCATION[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <Label htmlFor="country" sure={sure.country}>
            Country (two letters; empty if not tied to one)
          </Label>
          <input
            id="country"
            name="country"
            maxLength={2}
            defaultValue={v.country ?? ""}
            className={INPUT}
          />
        </Field>
        <Field>
          <Label htmlFor="city" sure={sure.city}>
            City (empty with NG means nationwide)
          </Label>
          <select id="city" name="city" defaultValue={v.city ?? ""} className={INPUT}>
            <option value="">None</option>
            {CITIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field>
        <Label htmlFor="deadlineKind" sure={sure.deadlineKind}>
          Deadline, only as the organisation's page states it
        </Label>
        <select
          id="deadlineKind"
          name="deadlineKind"
          defaultValue={v.deadlineKind}
          className={INPUT}
        >
          {DeadlineKind.options.map((k) => (
            <option key={k} value={k}>
              {DEADLINE_KIND[k]}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <When name="deadlineAt" label="Deadline date" at={v.deadlineAt} sure={sure.deadlineAt} />
        <Field>
          <Label htmlFor="deadlineTimezone">Time zone, if the source names one</Label>
          <input
            id="deadlineTimezone"
            name="deadlineTimezone"
            placeholder="Africa/Lagos"
            defaultValue={v.deadlineTimezone ?? ""}
            className={INPUT}
          />
        </Field>
        <When name="opensAt" label="Opens" at={v.opensAt} sure={sure.opensAt} />
        <When name="startsAt" label="Starts" at={v.startsAt} sure={sure.startsAt} />
        <When name="endsAt" label="Ends" at={v.endsAt} sure={sure.endsAt} />
      </div>
      <p className="m-0 text-[12px] text-faint">
        Dates and times are in Lagos time. Leave the time empty unless the source gives one.
        {v.deadlineAt ? ` Stored deadline: ${formatDate(v.deadlineAt, { time: true })}.` : ""}
      </p>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field>
          <Label htmlFor="venueName">Venue</Label>
          <input
            id="venueName"
            name="venueName"
            defaultValue={v.venueName ?? ""}
            className={INPUT}
          />
        </Field>
        <Field>
          <Label htmlFor="venueAddress">Venue address</Label>
          <input
            id="venueAddress"
            name="venueAddress"
            defaultValue={v.venueAddress ?? ""}
            className={INPUT}
          />
        </Field>
      </div>
      <Field>
        <Label htmlFor="applyUrl">Apply link, if different from the page above</Label>
        <input
          id="applyUrl"
          name="applyUrl"
          type="url"
          defaultValue={v.applyUrl ?? ""}
          className={INPUT}
        />
      </Field>
      <Field>
        <Label htmlFor="summary" sure={sure.summary}>
          Summary (280 characters at most; never says who qualifies)
        </Label>
        <textarea
          id="summary"
          name="summary"
          rows={3}
          maxLength={280}
          defaultValue={v.summary ?? ""}
          className={AREA}
        />
      </Field>
      <Field>
        <Label htmlFor="requirementsText" sure={sure.requirementsText}>
          Requirements, word for word from the source
        </Label>
        <textarea
          id="requirementsText"
          name="requirementsText"
          rows={7}
          defaultValue={v.requirementsText ?? ""}
          className={AREA}
        />
      </Field>
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className={`${LABEL} p-0`}>Topics</legend>
        <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
          {TAGS.map((t) => (
            <label key={t} className="flex min-h-9 items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                name="tags"
                value={t}
                defaultChecked={v.tags.includes(t)}
                className="size-4 accent-fg"
              />
              {tagLabel(t)}
            </label>
          ))}
        </div>
      </fieldset>
      <Field>
        <Label htmlFor="regionsTags">Region hints, comma separated</Label>
        <input
          id="regionsTags"
          name="regionsTags"
          defaultValue={v.regionsTags.join(", ")}
          className={INPUT}
        />
      </Field>
    </>
  );
}
