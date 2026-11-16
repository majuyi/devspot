import { OpportunityDto } from "@devspot/schema";
import { describe, expect, it } from "vitest";
import { actionLabel, closedLine, deadlineView } from "@/ui/deadline";
import { opportunityIcs } from "@/ui/ics";
import { jsonLdScript, opportunityJsonLd } from "@/ui/jsonld";
import { DATE_ONLY, dto, EVENT } from "./dto";

const NOW = new Date("2026-11-04T12:00:00Z");
const lines = (ics: string | null) => (ics ?? "").replace(/\r\n /g, "").trimEnd().split("\r\n");
const prop = (ics: string | null, name: string) =>
  lines(ics).filter((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));

describe("the test fixture", () => {
  it("is a valid public opportunity", () => {
    expect(OpportunityDto.parse(dto())).toEqual(dto());
    expect(OpportunityDto.parse(dto(EVENT))).toEqual(dto(EVENT));
  });
});

describe("deadline view (docs/01 §1 Deadlines)", () => {
  it("a deadline with a time: the time is the figure, the date goes above it", () => {
    expect(deadlineView(dto())).toEqual({
      type: "dated",
      label: "Closes",
      date: "Thu 5 Nov 2026",
      figure: "04:45",
      unit: "WAT",
      line: "Closes Thu 5 Nov 2026, 04:45 WAT",
    });
  });

  it("a date with no time: the day is the figure and no time is invented", () => {
    const view = deadlineView(dto({ deadlineAt: DATE_ONLY }));
    expect(view).toMatchObject({ figure: "Sat 7 Nov", unit: null, line: "Closes Sat 7 Nov 2026" });
    expect(JSON.stringify(view)).not.toContain("23:59");
  });

  it("an event counts to its start; rounds say so", () => {
    expect(deadlineView(dto(EVENT))).toMatchObject({
      label: "Starts",
      line: "Starts Fri 6 Nov 2026, 10:00 WAT",
    });
    expect(deadlineView(dto({ deadlineKind: "multiRound" }))).toMatchObject({
      label: "Multiple rounds, next",
    });
  });

  it.each([
    [{ deadlineKind: "unknown", deadlineAt: null }, "Not stated on the source page"],
    [{ deadlineKind: "rolling", deadlineAt: null }, "Rolling applications"],
    [{ deadlineKind: "multiRound", deadlineAt: null }, "Multiple rounds"],
    // A date stored beside "unknown" or "rolling" is not a stated deadline.
    [{ deadlineKind: "unknown" }, "Not stated on the source page"],
    [{ deadlineKind: "rolling" }, "Rolling applications"],
    [{ ...EVENT, startsAt: null }, "Date not stated on the source page"],
  ] as const)("%o reads %s, with no date", (over, headline) => {
    const view = deadlineView(dto(over));
    expect(view).toMatchObject({ type: "undated", headline });
    expect(JSON.stringify(view)).not.toMatch(/2026/);
  });

  it("closed line and action label", () => {
    expect(closedLine(dto({ status: "closed", closedAt: "2026-11-05T06:00:00.000Z" }))).toBe(
      "Applications closed on Thu 5 Nov 2026",
    );
    expect(closedLine(dto({ status: "closed", deadlineAt: null }))).toBe("Applications closed");
    expect(closedLine(dto({ ...EVENT, status: "closed" }))).toBe("This event has ended");
    expect(actionLabel(dto())).toBe("Apply on devpost.com");
    expect(actionLabel(dto({ applyUrl: "https://www.apply.example/form" }))).toBe(
      "Apply on apply.example",
    );
    expect(actionLabel(dto(EVENT))).toBe("View on devpost.com");
    expect(actionLabel(dto({ status: "closed" }))).toBe("View on devpost.com");
  });
});

describe("calendar file (RFC 5545)", () => {
  it("a timed deadline is the hour ending at the deadline, with a reminder the day before", () => {
    const ics = opportunityIcs(dto(), NOW);
    expect(lines(ics)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//devspot//opportunities//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:opp_1@devspot.test",
      "DTSTAMP:20261104T120000Z",
      "DTSTART:20261105T024500Z",
      "DTEND:20261105T034500Z",
      "SUMMARY:Deadline: Girls Who Code HHS Hackathon 2026",
      "DESCRIPTION:Closes Thu 5 Nov 2026\\, 04:45 WAT.\\nDevpost · Remote\\nApply: https://devpost.com/hackathons/gwc\\nListed at https://devspot.test/o/gwc-hackathon-26\\nCheck the source page before you rely on this date.",
      "URL:https://devspot.test/o/gwc-hackathon-26",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Deadline: Girls Who Code HHS Hackathon 2026",
      "TRIGGER:-P1D",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ]);
  });

  it("uses CRLF, ends with one, and folds every line to 75 octets", () => {
    const ics = opportunityIcs(
      dto({ title: "Ọpọlọpọ àwọn ànfààní fún àwọn akẹ́kọ̀ọ́ ní Nàìjíríà, 2026; apá kìíní" }),
      NOW,
    );
    expect(ics).toMatch(/\r\n$/);
    expect(ics?.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const line of (ics ?? "").split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    // Unfolded, the title is whole, with its comma and semicolon escaped.
    expect(prop(ics, "SUMMARY")[0]).toBe(
      "SUMMARY:Deadline: Ọpọlọpọ àwọn ànfààní fún àwọn akẹ́kọ̀ọ́ ní Nàìjíríà\\, 2026; apá kìíní",
    );
  });

  it("a date-only deadline is an all-day entry on that day in Lagos, with no time", () => {
    const ics = opportunityIcs(dto({ deadlineAt: DATE_ONLY }), NOW);
    expect(prop(ics, "DTSTART")).toEqual(["DTSTART;VALUE=DATE:20261107"]);
    expect(prop(ics, "DTEND")).toEqual(["DTEND;VALUE=DATE:20261108"]);
    expect(prop(ics, "TRIGGER")).toEqual(["TRIGGER:-PT15H"]);
    expect(ics).not.toContain("23:59");
    expect(ics).not.toContain("T225900Z");
  });

  it("an event keeps its own start, end and venue", () => {
    const ics = opportunityIcs(dto(EVENT), NOW);
    expect(prop(ics, "SUMMARY")).toEqual(["SUMMARY:DevFest Ilorin 2026"]);
    expect(prop(ics, "DTSTART")).toEqual(["DTSTART:20261106T090000Z"]);
    expect(prop(ics, "DTEND")).toEqual(["DTEND:20261106T160000Z"]);
    expect(prop(ics, "LOCATION")).toEqual(["LOCATION:Kwara Hotel\\, Ahmadu Bello Way\\, Ilorin"]);
    expect(prop(opportunityIcs(dto({ ...EVENT, endsAt: null }), NOW), "DTEND")).toEqual([]);
  });

  it("nothing to put in a calendar gives no file", () => {
    expect(opportunityIcs(dto({ deadlineKind: "unknown", deadlineAt: null }), NOW)).toBeNull();
    expect(opportunityIcs(dto({ deadlineKind: "rolling" }), NOW)).toBeNull();
    expect(opportunityIcs(dto({ ...EVENT, startsAt: null }), NOW)).toBeNull();
  });
});

describe("JSON-LD (docs/01 §1 Sharing)", () => {
  it("a job is a JobPosting with its place and deadline, and no invented salary", () => {
    const ld = opportunityJsonLd(
      dto({
        kind: "job",
        title: "iOS Engineer",
        locationMode: "hybrid",
        country: "NG",
        city: "lagos",
      }),
    );
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "iOS Engineer",
      datePosted: "2026-10-21T08:00:00.000Z",
      validThrough: "2026-11-05T03:45:00.000Z",
      hiringOrganization: { "@type": "Organization", name: "Devpost" },
      jobLocation: { address: { addressLocality: "Lagos", addressCountry: "NG" } },
      directApply: false,
    });
    expect(ld).not.toHaveProperty("baseSalary");
    expect(ld).not.toHaveProperty("jobLocationType");
  });

  it("a remote internship with no deadline claims no closing date", () => {
    const ld = opportunityJsonLd(
      dto({ kind: "internship", deadlineKind: "unknown", deadlineAt: null, country: "NG" }),
    );
    expect(ld).toMatchObject({
      "@type": "JobPosting",
      employmentType: "INTERN",
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: { "@type": "Country", name: "NG" },
    });
    expect(ld).not.toHaveProperty("validThrough");
    expect(ld).not.toHaveProperty("jobLocation");
  });

  it("an event is an Event; without a start it falls back to an Article", () => {
    expect(opportunityJsonLd(dto(EVENT))).toMatchObject({
      "@type": "Event",
      name: "DevFest Ilorin 2026",
      startDate: "2026-11-06T09:00:00.000Z",
      endDate: "2026-11-06T16:00:00.000Z",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: { "@type": "Place", name: "Kwara Hotel", address: { addressLocality: "Ilorin" } },
    });
    expect(opportunityJsonLd(dto({ ...EVENT, locationMode: "remote" })).location).toEqual({
      "@type": "VirtualLocation",
      url: "https://devpost.com/hackathons/gwc",
    });
    expect(opportunityJsonLd(dto({ ...EVENT, startsAt: null }))["@type"]).toBe("Article");
  });

  it("everything else is an Article", () => {
    expect(opportunityJsonLd(dto())).toMatchObject({
      "@type": "Article",
      headline: "Girls Who Code HHS Hackathon 2026",
      datePublished: "2026-10-21T08:00:00.000Z",
      dateModified: "2026-11-04T10:00:00.000Z",
      description: "A weekend hackathon for students.",
    });
  });

  it("cannot close its own script tag", () => {
    const out = jsonLdScript(opportunityJsonLd(dto({ title: "</script><script>alert(1)" })));
    expect(out).not.toContain("<");
    expect(JSON.parse(out).headline).toBe("</script><script>alert(1)");
  });
});
