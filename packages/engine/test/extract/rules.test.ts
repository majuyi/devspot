import { describe, expect, it } from "vitest";
import {
  ELIGIBILITY_WORDS,
  extractRules,
  RULES_PUBLISH_THRESHOLD,
  ruleApplyUrl,
  ruleDeadline,
  ruleKind,
  ruleLocation,
  ruleRegions,
  ruleRequirements,
  ruleSpan,
  ruleSummary,
  ruleTags,
  ruleVenue,
} from "../../src/extract/rules.js";

const REF = new Date("2026-10-13T12:00:00Z");
const NG_ORG = { category: "community", country: "NG" } as const;

describe("kind", () => {
  it.each([
    ["HNG Internship 15", "", "trainingProvider", "internship", 0.9],
    ["Chevening LSE Global Impact Fellowship", "", "scholarshipFunder", "fellowship", 0.9],
    ["PayPal AI Hackathon", "", "hackathonHost", "hackathon", 0.9],
    ["WarriorHacks 2.0", "", "hackathonHost", "hackathon", 0.9],
    ["Apply Now for Google Summer of Code!", "", "ossProgram", "ossProgram", 0.9],
    ["MTN Foundation Science and Technology Scholarship", "", "employer", "scholarship", 0.9],
    ["Call for Applications: Founders Accelerator", "", "community", "accelerator", 0.9],
    ["Data Science Bootcamp, Cohort 3", "", "trainingProvider", "bootcamp", 0.9],
    ["DevFest Lagos 2026", "", "community", "event", 0.9],
    ["Call for Expressions of Interest: Data Consultant", "", "accelerator", "job", 0.9],
    ["InnovateNaija ₦250 Million Challenge", "", "community", "competition", 0.9],
    ["Seed grants for climate startups", "", "community", "grant", 0.9],
    // Title names two kinds: the stronger wins, at lower confidence.
    ["Hackathon and Bootcamp weekend", "", "community", "hackathon", 0.6],
    // Text only.
    ["Opportunity alert", "Our fellowship opens in May.", "community", "fellowship", 0.6],
    // Organization prior only.
    ["Meet the 2026 contributors", "Numbers and stories.", "ossProgram", "ossProgram", 0.4],
    // Nothing at all, and no prior for this category.
    ["Leadership transition", "A new executive director.", "community", undefined, 0],
    // "shack" is not a hackathon.
    ["Shack renovation update", "", "government", undefined, 0],
  ] as const)("%j → %s", (title, text, category, kind, confidence) => {
    expect(ruleKind(title, text, category)).toEqual({ value: kind, confidence });
  });
});

describe("deadline", () => {
  it.each([
    ["Deadline: 19th October 2026, 5:00 PM WAT", "fixed", "2026-10-19T16:00:00.000Z", 0.85],
    ["Applications close 31 October 2026.", "fixed", "2026-10-31T22:59:00.000Z", 0.85],
    ["Apply by Nov 12, 2026 @ 12:00pm PST", "fixed", "2026-11-12T20:00:00.000Z", 0.85],
    ["Submissions due by 2026-11-01", "fixed", "2026-11-01T22:59:00.000Z", 0.85],
    [
      "The application window will remain open until February 3, 2027, at 18:00 UTC.",
      "fixed",
      "2027-02-03T18:00:00.000Z",
      0.85,
    ],
    ["Closing date: 03/11/2026", "fixed", "2026-11-03T22:59:00.000Z", 0.85],
    ["Applications close 16 November", "fixed", "2026-11-16T22:59:00.000Z", 0.6],
    [
      "Round 1 closes 1 November 2026. Round 2 closes 1 December 2026.",
      "multiRound",
      "2026-11-01T22:59:00.000Z",
      0.7,
    ],
    ["Applications are reviewed on a rolling basis.", "rolling", undefined, 0.7],
    ["We will recruit until the role is filled.", "rolling", undefined, 0.7],
  ] as const)("%j", (text, kind, at, confidence) => {
    const d = ruleDeadline(text, REF);
    expect(d.kind).toBe(kind);
    expect(d.at?.toISOString()).toBe(at);
    expect(d.confidence).toBe(confidence);
  });

  it.each([
    ["a closed listing with a past date", "Applications closed on 30 September 2026."],
    ["a date with no anchor", "The programme starts on 1 November 2026."],
    ["an anchor with the date too far away", `Deadline: ${"x".repeat(90)} 1 November 2026`],
    ["a news article", "The 2026 cohort met in Lagos on 3 October 2026 to celebrate."],
    ["rolling with no applications nearby", "The rolling hills of Jos."],
    ["registration closed with no date", "Registration Closed"],
  ])("unknown for %s", (_, text) => {
    expect(ruleDeadline(text, REF)).toEqual({ kind: "unknown", confidence: 0 });
  });

  it("drops dates before the publish date, then keeps the next anchored one", () => {
    const text =
      "Last year's deadline was 1 March 2026. This year applications close 1 March 2027.";
    expect(ruleDeadline(text, REF).at?.toISOString()).toBe("2027-03-01T22:59:00.000Z");
  });
});

describe("starts and ends", () => {
  it.each([
    ["Dates: 23–28 August 2027", "2027-08-22T23:00:00.000Z", "2027-08-28T22:59:00.000Z", 0.8],
    ["3-5 October 2027", "2027-10-02T23:00:00.000Z", "2027-10-05T22:59:00.000Z", 0.8],
    ["18–20 November 2026 in Cotonou", "2026-11-17T23:00:00.000Z", "2026-11-20T22:59:00.000Z", 0.8],
    [
      "Cohort 1: 25 January – 5 March 2027",
      "2027-01-24T23:00:00.000Z",
      "2027-03-05T22:59:00.000Z",
      0.8,
    ],
    ["October 23 to 25, 2026", "2026-10-22T23:00:00.000Z", "2026-10-25T22:59:00.000Z", 0.8],
    ["Oct 30 - Nov 2, 2026", "2026-10-29T23:00:00.000Z", "2026-11-02T22:59:00.000Z", 0.8],
    ["Join us 3 to 5 December", "2026-12-02T23:00:00.000Z", "2026-12-05T22:59:00.000Z", 0.5],
    ["The meetup holds on Saturday, 7 November 2026.", "2026-11-06T23:00:00.000Z", undefined, 0.8],
    ["Date: 14 November", "2026-11-13T23:00:00.000Z", undefined, 0.5],
    ["We meet on 21 November 2026 at Yaba.", "2026-11-20T23:00:00.000Z", undefined, 0.8],
  ] as const)("%j", (text, starts, ends, confidence) => {
    const span = ruleSpan(text, REF);
    expect(span.starts?.toISOString()).toBe(starts);
    expect(span.ends?.toISOString()).toBe(ends);
    expect(span.confidence).toBe(confidence);
  });

  it.each(["No dates here.", "Founded in 2010.", "on our website"])("nothing in %j", (text) => {
    expect(ruleSpan(text, REF)).toEqual({ confidence: 0 });
  });
});

describe("location", () => {
  it.each([
    ["Remote Backend Internship", "", { mode: "remote", confidence: 0.9 }],
    ["Virtual DevFest", "Lagos chapter", { mode: "remote", confidence: 0.9 }],
    ["Hybrid meetup", "", { mode: "hybrid", confidence: 0.9 }],
    ["DevFest Lagos 2026", "", { mode: "onsite", city: "lagos", country: "NG", confidence: 0.9 }],
    [
      "Meetup",
      "Venue: Co-creation Hub, Yaba",
      { mode: "onsite", city: "lagos", country: "NG", confidence: 0.7 },
    ],
    ["Hackathon", "Location: Online", { mode: "remote", confidence: 0.7 }],
    [
      "Bootcamp",
      "A 12-week online cohort for Nigerian graduates.",
      { mode: "remote", country: "NG", confidence: 0.7 },
    ],
    [
      "Programme",
      "Held in Abuja, FCT.",
      { mode: "onsite", city: "abuja", country: "NG", confidence: 0.7 },
    ],
    [
      "Programme",
      "Classes run in a hybrid format from Ibadan.",
      { mode: "hybrid", city: "ibadan", country: "NG", confidence: 0.7 },
    ],
    ["Programme", "Open to applicants nationwide.", { country: "NG", confidence: 0 }],
  ] as const)("%j %j", (title, text, expected) => {
    expect(ruleLocation(title, text, { category: "community", country: "GB" })).toMatchObject(
      expected,
    );
  });

  it.each([
    ["apply online is not a remote programme", "Apply online through our portal."],
    ["no place at all", "We are excited to announce our new cohort."],
    ["a city inside another word", "Kanoodle and lagoscope are not places."],
  ])("nothing for %s", (_, text) => {
    expect(
      ruleLocation("Programme", text, { category: "community", country: "GB" }).mode,
    ).toBeUndefined();
  });

  it("falls back to the organization's city at 0.3", () => {
    expect(ruleLocation("Programme", "Nothing here.", { ...NG_ORG, city: "lagos" })).toEqual({
      mode: "onsite",
      city: "lagos",
      country: "NG",
      confidence: 0.3,
    });
  });
});

describe("venue", () => {
  it.each([
    [
      "Venue: Landmark Event Centre, Victoria Island, Lagos",
      { name: "Landmark Event Centre", address: "Victoria Island, Lagos" },
    ],
    ["Location: CcHUB", { name: "CcHUB" }],
    ["venue:   Zone Tech Park ", { name: "Zone Tech Park" }],
    ["Details\nLocation: Windhoek", { name: "Windhoek" }],
  ])("%j", (text, expected) => {
    expect(ruleVenue(text)).toEqual({ ...expected, confidence: 0.6 });
  });

  it.each([
    "Location: Online",
    "Venue: TBA",
    "Location: remote",
    "Venue: virtual (Zoom)",
    "No venue line",
    "The venue is lovely.",
  ])("nothing for %j", (text) => {
    expect(ruleVenue(text)).toEqual({ confidence: 0 });
  });
});

describe("requirements", () => {
  it.each([
    [
      "Eligibility\n\n- Be 18 or older\n- Live in Nigeria\n\nHow to apply\n\nSend a CV.",
      "- Be 18 or older\n- Live in Nigeria",
    ],
    ["Requirements:\n\nA laptop.\n\nAbout us\n\nWe are a hub.", "A laptop."],
    ["Who can apply?\n\nFinal-year students.\n\nBenefits\n\nA stipend.", "Final-year students."],
    [
      "Who can participate\n\n- Ages 18+ only\n- Students only\n\nAbout the challenge\n\nBuild.",
      "- Ages 18+ only\n- Students only",
    ],
    [
      "Who we’re looking for\n\n- Strong SQL\n- Excel\n\nHow to apply\nForm.",
      "- Strong SQL\n- Excel",
    ],
    [
      "Selection criteria\n\nImpact, originality.\n\nMore text that is a sentence.",
      "Impact, originality.\n\nMore text that is a sentence.",
    ],
    [
      "Eligibility criteria\n\nIn addition to our standard criteria, you must:\n\n- Be a citizen of Nigeria\n\nFunding and benefits\n\nFees.",
      "In addition to our standard criteria, you must:\n\n- Be a citizen of Nigeria",
    ],
    [
      "Qualifications\n\nA degree in computing.\n\nSalary\n\nCompetitive.",
      "A degree in computing.",
    ],
  ])("%j", (text, expected) => {
    const r = ruleRequirements(text);
    expect(r).toEqual({ value: expected, confidence: 0.9, quote: expected });
    expect(text).toContain(r.value);
  });

  it("stops at 1,500 characters on a line break", () => {
    const lines = Array.from({ length: 60 }, (_, i) => `- Requirement number ${i} is long`).join(
      "\n",
    );
    const r = ruleRequirements(`Requirements\n\n${lines}`);
    expect(r.value?.length).toBeLessThanOrEqual(1500);
    expect(r.value?.endsWith("is long")).toBe(true);
  });

  it.each([
    "We are looking for great people. Requirements are on the site.",
    "Eligibility",
    "No heading anywhere.\n\nJust prose.",
    "Our requirements include a laptop.",
  ])("never synthesized: %j", (text) => {
    expect(ruleRequirements(text)).toEqual({ value: undefined, confidence: 0 });
  });
});

describe("apply url", () => {
  const link = (text: string, href: string) => ({ text, href });
  it.each([
    [[link("Apply now", "https://e.org/apply")], "https://e.org/apply"],
    [[link("Home", "https://e.org/"), link("Register here", "https://e.org/r")], "https://e.org/r"],
    [[link("Submit your Expression of Interest", "https://forms.gle/x")], "https://forms.gle/x"],
    [[link("Sign up", "https://e.org/s")], "https://e.org/s"],
    [[link("Form", "https://docs.google.com/forms/d/1")], "https://docs.google.com/forms/d/1"],
    [[link("this link", "https://airtable.com/shr1")], "https://airtable.com/shr1"],
    [[link("here", "https://x.typeform.com/to/a")], "https://x.typeform.com/to/a"],
    [[link("Details", "https://e.org/careers/apply/42")], "https://e.org/careers/apply/42"],
    [[link("Read more", "https://e.org/a"), link("Apply", "https://e.org/b")], "https://e.org/b"],
    [[link("Registration", "https://e.org/reg")], "https://e.org/reg"],
  ])("%j", (links, href) => {
    expect(ruleApplyUrl({ links }).value).toBe(href);
  });

  it.each([
    [undefined],
    [{}],
    [{ links: "nope" }],
    [{ links: [{ text: "Apply", href: "mailto:hr@e.org" }] }],
    [{ links: [{ text: "Read the blog", href: "https://e.org/blog" }] }],
  ])("nothing for %j", (meta) => {
    expect(ruleApplyUrl(meta)).toEqual({ value: undefined, confidence: 0 });
  });
});

describe("tags", () => {
  it.each([
    ["Backend Engineer Intern", "", ["backend"]],
    ["", "Frontend and back-end roles", ["backend", "frontend"]],
    ["Flutter developers wanted", "", ["mobile"]],
    ["", "A data science track and machine learning", ["data", "ml"]],
    ["", "Build with AI agents", ["ml"]],
    ["", "UI/UX design and product management", ["design", "product"]],
    ["", "DevOps, cloud engineering and cybersecurity", ["devops", "security"]],
    ["Web3 builders grant", "", ["web3"]],
    [
      "",
      "For women in tech. Final-year students only. Monthly stipend.",
      ["women-in-tech", "students-only", "final-year", "stipend"],
    ],
    ["", "Fully funded, free to attend.", ["fully-funded", "free"]],
    ["", "Said, aid and maid are not tags", []],
    ["", "A plain announcement.", []],
  ])("%j %j", (title, text, tags) => {
    expect(ruleTags(title, text)).toEqual(tags);
  });
});

describe("regions", () => {
  it.each([
    ["", "Across Africa", ["africa"]],
    ["", "West African founders", ["west-africa", "africa"]],
    ["", "Young Nigerians", ["nigeria"]],
    ["Global AI Hackathon", "", ["global"]],
    ["", "Open worldwide", ["global"]],
    ["", "All countries/territories, excluding standard exceptions", ["global"]],
    ["", "Africa and Nigeria", ["africa", "nigeria"]],
    ["", "African startups globally", ["africa", "global"]],
    ["", "Lagos only", []],
    ["", "Nothing to see", []],
  ])("%j %j", (title, text, regions) => {
    expect(ruleRegions(title, text)).toEqual(regions);
  });
});

describe("summary", () => {
  const long = (n: number) => "Word ".repeat(n).trim();
  it.each([
    [
      "Short.\n\nThis programme trains early-career developers to build and ship real products.",
      "This programme trains early-career developers to build and ship real products.",
    ],
    [
      "Host: X\nStatus: open\n\nA global online hackathon inviting developers to build with payments and AI.",
      "A global online hackathon inviting developers to build with payments and AI.",
    ],
    [
      "- a list item that is long enough to count as a paragraph by length alone.\n\nThe fellowship funds six weeks of research at a UK university.",
      "The fellowship funds six weeks of research at a UK university.",
    ],
    [
      "This fellowship is open to all European countries and funds six weeks of study.\n\nFellows study leadership and security in a six-week programme.",
      "Fellows study leadership and security in a six-week programme.",
    ],
    [
      "Only candidates who qualify will be contacted for interview after review.\n\nThe internship lasts three months and pays a monthly stipend to interns.",
      "The internship lasts three months and pays a monthly stipend to interns.",
    ],
    [
      "You must be eligible to work in Nigeria to take this role at all.\n\nWe build payments infrastructure for African businesses of every size.",
      "We build payments infrastructure for African businesses of every size.",
    ],
  ])("%j", (text, summary) => {
    expect(ruleSummary(text).value).toBe(summary);
  });

  it("cuts at a sentence boundary under 280 characters", () => {
    const text = `${long(30)}. ${long(30)}. ${long(30)}.`;
    const s = ruleSummary(text).value ?? "";
    expect(s.length).toBeLessThanOrEqual(280);
    expect(s.endsWith(".")).toBe(true);
  });

  it("cuts at a word with an ellipsis when there is no sentence boundary", () => {
    const s = ruleSummary(`${long(80)}.`).value ?? "";
    expect(s.length).toBeLessThanOrEqual(280);
    expect(s.endsWith("…")).toBe(true);
  });

  it.each([
    "Too short.",
    "Heading without a full stop that goes on for quite some time but never ends",
    "Everyone is eligible for this exciting programme starting next month.",
    "This fellowship is open to all applicants from every country in the world.",
  ])("nothing for %j", (text) => {
    expect(ruleSummary(text).value).toBeUndefined();
  });
});

describe("extractRules", () => {
  const item = (title: string, text: string, extra = {}) => ({
    item: {
      title,
      text,
      canonicalUrl: "https://e.org/x",
      publishedAt: new Date("2026-10-01T00:00:00Z"),
      ...extra,
    },
    org: NG_ORG,
    now: REF,
  });

  it("publishes an item with kind in the title, a dated deadline, a place and requirements", () => {
    const { draft, confidence } = extractRules(
      item(
        "Remote Backend Internship",
        "Applications close 31 October 2026.\n\nRequirements\n\n- Go or Node\n\nAbout\n\nWe pay a monthly stipend to every intern we take on for the cohort.",
        { meta: { links: [{ text: "Apply now", href: "https://e.org/apply" }] } },
      ),
    );
    expect(confidence).toBe(0.85);
    expect(confidence).toBeGreaterThanOrEqual(RULES_PUBLISH_THRESHOLD);
    expect(draft).toMatchObject({
      kind: "internship",
      deadlineKind: "fixed",
      deadlineAt: "2026-10-31T22:59:00.000Z",
      locationMode: "remote",
      requirementsText: "- Go or Node",
      applyUrl: "https://e.org/apply",
      tags: ["backend", "stipend"],
      summary: "We pay a monthly stipend to every intern we take on for the cohort.",
    });
    expect(draft.deadlineTimezone).toBeUndefined();
    expect(draft.evidence.map((e) => e.field)).toEqual([
      "deadline",
      "locationMode",
      "requirementsText",
      "applyUrl",
    ]);
  });

  it("keeps the stated time zone", () => {
    const { draft } = extractRules(
      item("Hackathon", "Deadline: Nov 12, 2026 @ 12:00pm PST\nLocation: Online"),
    );
    expect(draft.deadlineTimezone).toBe("America/Los_Angeles");
  });

  it("takes 0.15 off without requirements, and stays below the threshold", () => {
    const { confidence } = extractRules(
      item("Remote Internship", "Applications close 31 October 2026."),
    );
    expect(confidence).toBe(0.7);
  });

  it("does not publish a news article", () => {
    const { draft, confidence } = extractRules(
      item(
        "AfriLabs announces leadership transition",
        "After ten years, our director steps down. A new chapter begins in Abuja.",
      ),
    );
    expect(draft.deadlineKind).toBe("unknown");
    expect(draft.deadlineAt).toBeUndefined();
    expect(confidence).toBeLessThan(RULES_PUBLISH_THRESHOLD);
  });

  it("does not publish a closed listing whose date has passed", () => {
    const { draft, confidence } = extractRules(
      item(
        "Remote Fellowship",
        "Applications closed on 30 September 2026.\n\nEligibility\n\nAnyone.",
      ),
    );
    expect(draft.deadlineKind).toBe("unknown");
    expect(confidence).toBe(0);
  });

  it("fills start and end only for events and bootcamps", () => {
    const text = "Join us 18–20 November 2026 at Landmark, Lagos.";
    expect(extractRules(item("DevFest Lagos", text)).draft.startsAt).toBe(
      "2026-11-17T23:00:00.000Z",
    );
    expect(extractRules(item("Lagos Fellowship", text)).draft.startsAt).toBeUndefined();
  });

  it("never writes a summary with an eligibility word", () => {
    const { draft } = extractRules(
      item("Fellowship", "This is open to everyone who can qualify for a visa to the UK in time."),
    );
    expect(draft.summary === undefined || !ELIGIBILITY_WORDS.test(draft.summary)).toBe(true);
  });
});
