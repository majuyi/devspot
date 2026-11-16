import { CITIES, type Preferences, TAGS } from "@devspot/schema";
import { FAMILIES, FAMILY_LABEL, KIND_PLURAL, kindsOf } from "@/ui/kind";
import { tagLabel } from "@/ui/prefs";
import { buttonClass } from "./blocks";

const LEGEND = "text-[12px] font-semibold text-muted";
const BOX = "size-[18px] shrink-0 accent-fg";
const OPTION = "flex min-h-target items-center gap-2.5 text-[14px]";

/**
 * The feed's preferences as a plain form posting to /api/prefs (docs/01 §2). Native
 * checkboxes and a select, so it works with no JavaScript and every control has a label.
 */
export function PrefsForm({ prefs, hasSaved }: { prefs: Preferences; hasSaved: boolean }) {
  return (
    <form method="post" action="/api/prefs" className="flex flex-col gap-6 px-4 pb-10">
      <input type="hidden" name="next" value="/feed" />

      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="text-section mb-1 p-0">What are you looking for?</legend>
        <p className="text-meta m-0 text-muted">Leave everything unticked to see every kind.</p>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {FAMILIES.map((f) => (
            <fieldset key={f} className="m-0 border-0 p-0">
              <legend className={LEGEND}>{FAMILY_LABEL[f]}</legend>
              {kindsOf(f).map((k) => (
                <label key={k} className={OPTION}>
                  <input
                    type="checkbox"
                    name="kinds"
                    value={k}
                    defaultChecked={prefs.kinds.includes(k)}
                    className={BOX}
                  />
                  {KIND_PLURAL[k]}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="city" className="text-section">
          Where are you?
        </label>
        <p className="text-meta m-0 text-muted">
          You will see what is in your city, what is open across Nigeria, and what is remote.
        </p>
        <select
          id="city"
          name="city"
          defaultValue={prefs.city ?? ""}
          // 16px: iOS zooms the page on focus for anything smaller.
          className="h-target max-w-[320px] rounded-tile border border-line bg-surface px-3 text-[16px] text-fg"
        >
          <option value="">No city</option>
          {CITIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <label className={OPTION}>
          <input
            type="checkbox"
            name="remote"
            value="1"
            defaultChecked={Boolean(prefs.remoteOnly)}
            className={BOX}
          />
          Remote only
        </label>
      </div>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="text-section mb-1 p-0">Topics</legend>
        <p className="text-meta m-0 text-muted">
          Tick any to see only items tagged with at least one of them. Many items carry no tag.
        </p>
        <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
          {TAGS.map((t) => (
            <label key={t} className={OPTION}>
              <input
                type="checkbox"
                name="tags"
                value={t}
                defaultChecked={prefs.tags.includes(t)}
                className={BOX}
              />
              {tagLabel(t)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonClass("primary")}>
          Save my feed
        </button>
        {hasSaved ? (
          <button type="submit" name="clear" value="1" className={buttonClass("secondary")}>
            Clear
          </button>
        ) : null}
      </div>
      <p className="m-0 max-w-[68ch] text-[12px] leading-[17px] text-faint">
        Your choices are kept in a cookie on this device for a year. There is no account, and
        nothing about you is stored on our side.
      </p>
    </form>
  );
}
