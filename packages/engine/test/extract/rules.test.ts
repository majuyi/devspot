import { RULES_ONLY_PUBLISH_THRESHOLD } from "@devspot/schema";
import { describe, expect, it } from "vitest";
import {
  ELIGIBILITY_WORDS,
  extractRules,
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
    // Application periods (GSoC): the end of the range is the deadline.
    ["Application Period: March 16 – March 31", "fixed", "2027-03-31T22:59:00.000Z", 0.6],
    [
      "Applications for the GSoC Contributors are open March 24 - April 8, 2027",
      "fixed",
      "2027-04-08T22:59:00.000Z",
      0.85,
    ],
    [
      "Contributor application window: 2 November to 20 November 2026",
      "fixed",
      "2026-11-20T22:59:00.000Z",
      0.85,
    ],
    // A four-digit time before a zone.
    ["the hard deadline March 31, 1800 UTC", "fixed", "2027-03-31T18:00:00.000Z", 0.6],
    // A header line wins over body dates that only look like rounds (Zindi).
    [
      "Deadline: 10 November 2026, 18:29 UTC\nTrain.csv will be updated on 31 October and 5 November. Do not round your probabilities.",
      "fixed",
      "2026-11-10T18:29:00.000Z",
      0.85,
    ],
    [
      "The final round closes 1 November 2026; the first round closed 1 October 2026 and round two 20 October 2026.",
      "fixed",
      "2026-11-01T22:59:00.000Z",
      0.85,
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
    ["an event's date range with no application label", "Event dates: 5 – 7 November 2026"],
    ["an application period with only a start", "Applications open 2 November 2026."],
    [
      "a period headed as for organisations",
      "Join GSoC as a Mentoring Organization\n\nApplication Period: November 19 – December 3",
    ],
    [
      "a header deadline that has passed, with later milestones in the body",
      "Deadline: Oct 1, 2026 @ 1:00pm UTC\nYour project should stay live until winners are announced on or around November 16th.",
    ],
  ])("unknown for %s", (_, text) => {
    expect(ruleDeadline(text, REF)).toEqual({ kind: "unknown", confidence: 0 });
  });

  it("takes the reader's period, not the organisations' one, from a post with both (GSoC)", () => {
    const text =
      "Be a GSoC mentoring organization\n\nApplication period: January 27 – Feb 11\n\nInterested organizations can learn more. Be a GSoC contributor\n\nApplication period: March 24 - April 8";
    const d = ruleDeadline(text, new Date("2027-01-14T20:00:00Z"));
    expect(d.at?.toISOString()).toBe("2027-04-08T22:59:00.000Z");
  });

  describe("a deadline that has passed", () => {
    const outreachy =
      "Host: Outreachy\nLocation: Remote\nDeadline: Aug. 31, 2026 at 4pm UTC (initial application)\n\nInitial applications are closed";

    it("is kept from the header line when the page has no publish date, so it can close", () => {
      expect(ruleDeadline(outreachy, REF, { pastStands: true })).toMatchObject({
        kind: "fixed",
        confidence: 0.5,
      });
      expect(ruleDeadline(outreachy, REF, { pastStands: true }).at?.toISOString()).toBe(
        "2026-08-31T16:00:00.000Z",
      );
    });

    it("is dropped against a publish date: an earlier date is history", () => {
      expect(ruleDeadline(outreachy, REF)).toEqual({ kind: "unknown", confidence: 0 });
    });

    it("is not taken from body text, which is too often someone else's (Chevening)", () => {
      const text =
        "Applications for the Chevening Western Balkans Cyber Security Fellowship are open until 6 March 2024.";
      expect(ruleDeadline(text, REF, { pastStands: true })).toEqual({
        kind: "unknown",
        confidence: 0,
      });
    });

    it("needs its year: a year-less header date rolls forward, never back", () => {
      const text = "Deadline: Aug 31\nLocation: Remote";
      const d = ruleDeadline(text, REF, { pastStands: true });
      expect(d.at?.toISOString()).toBe("2027-08-31T22:59:00.000Z");
    });
  });

  describe("a Devpost submission period", () => {
    const at = (text: string, opts = {}) => ruleDeadline(text, REF, opts).at?.toISOString();
    it.each([
      ["Dec 06 - 20, 2026", "2026-12-20T22:59:00.000Z"],
      ["Jan 27 - Feb 24, 2027", "2027-02-24T22:59:00.000Z"],
      ["Dec 19, 2026 - Jan 06, 2027", "2027-01-06T22:59:00.000Z"],
      ["Nov 21, 2026", "2026-11-21T22:59:00.000Z"],
    ])("ends %s on its last day", (period, end) => {
      const d = ruleDeadline(
        `Host: X\nStatus: upcoming\nSubmission period: ${period}\nLocation: Online`,
        REF,
      );
      expect(d).toMatchObject({ kind: "fixed", confidence: 0.85, quote: period });
      expect(d.at?.toISOString()).toBe(end);
    });

    it("gives way to the Deadline: line, which has the time and zone", () => {
      const text = "Submission period: Oct 01 - Nov 30, 2026\nDeadline: Nov 30, 2026 @ 5:00pm EST";
      expect(at(text)).toBe("2026-11-30T22:00:00.000Z");
    });

    it("is no date when its end has no year", () => {
      expect(ruleDeadline("Submission period: Dec 06 - 20", REF)).toEqual({
        kind: "unknown",
        confidence: 0,
      });
    });

    it("stands once over only for a page with no publish date, so the item closes", () => {
      const text = "Submission period: Sep 01 - 30, 2026";
      expect(at(text, { pastStands: true })).toBe("2026-09-30T22:59:00.000Z");
      expect(ruleDeadline(text, REF, { pastStands: true }).confidence).toBe(0.5);
      expect(ruleDeadline(text, REF)).toEqual({ kind: "unknown", confidence: 0 });
    });
  });

  it("does not read the verb round as rounds", () => {
    const text =
      "Do not round your scores. Entries close 1 November 2026. Late entries close 5 November 2026.";
    expect(ruleDeadline(text, REF).kind).toBe("fixed");
  });

  it("lets a stated deadline win over the end of a period", () => {
    const text = "Application period: March 16 - March 31. Deadline: March 30, 2027.";
    expect(ruleDeadline(text, REF).at?.toISOString()).toBe("2027-03-30T22:59:00.000Z");
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
      { mode: "onsite", city: "lagos", country: "NG", confidence: 0.85 },
    ],
    ["Hackathon", "Location: Online", { mode: "remote", confidence: 0.85 }],
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
    ["Programme", "Host: GDG\nLocation: Online\nThemes: AI", { mode: "remote", confidence: 0.85 }],
    [
      "Programme",
      "Venue: Yaba Tech Hub\nWe also run remote sessions.",
      { mode: "onsite", city: "lagos", confidence: 0.85 },
    ],
    ["Programme", "Location: Hybrid", { mode: "hybrid", confidence: 0.85 }],
    // Nigeria with no city means nationwide only when the text says so; otherwise the city is
    // one we do not know, and a person sets it in review.
    [
      "Programme",
      "Location: Hybrid, Warri\nOpen to Nigerian graduates.",
      { mode: "hybrid", country: "NG", confidence: 0.5 },
    ],
    [
      "Programme",
      "Location: Hybrid, anywhere in Nigeria",
      { mode: "hybrid", country: "NG", confidence: 0.85 },
    ],
    [
      "Fellowship",
      "Hybrid: monthly meetups in all 36 states for Nigerian graduates.",
      { mode: "hybrid", country: "NG", confidence: 0.7 },
    ],
    [
      "Programme",
      "Location: Hybrid, Ikeja\nFor Nigerian students.",
      { mode: "hybrid", city: "lagos", country: "NG", confidence: 0.85 },
    ],
    // A place the dictionary does not know says nothing about the mode.
    ["Programme", "Location: Windhoek\nStart here.", { confidence: 0 }],
    ["Programme", "Our location: is secret. Join online sessions.", { confidence: 0.7 }],
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

  it("reads nationwide as Nigeria only for a Nigerian organization", () => {
    const text = "Location: Online\nCustomers nationwide.";
    expect(ruleLocation("Programme", text, NG_ORG)).toMatchObject({ country: "NG" });
    const abroad = { category: "community", country: "ZA" } as const;
    expect(ruleLocation("Challenge", text, abroad)).not.toHaveProperty("country");
    expect(ruleLocation("Challenge", `${text} Nigerian teams.`, abroad).country).toBe("NG");
  });

  it("does not put a role in the organization's city when it states somewhere unknown", () => {
    const text =
      "Department: Brand & Marketing\nLocation: Accra, Ghana\n\nChowdeck is a Lagos-based delivery company.";
    expect(ruleLocation("Brand & Graphic Designer", text, { ...NG_ORG, city: "lagos" })).toEqual({
      confidence: 0,
    });
  });

  it("still reads remote from the text past an unknown stated location", () => {
    const text = "Location: Accra, Ghana\n\nThis role is fully remote. Our office is in Lagos.";
    expect(ruleLocation("Designer", text, { ...NG_ORG, city: "lagos" })).toMatchObject({
      mode: "remote",
      confidence: 0.7,
    });
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
    expect(confidence).toBe(0.89);
    expect(confidence).toBeGreaterThanOrEqual(RULES_ONLY_PUBLISH_THRESHOLD);
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

  it("sends a hybrid Nigerian item with a city we do not know to review, without a city", () => {
    const text =
      "Applications close 31 October 2026.\nLocation: Hybrid, Warri\nFor Nigerian graduates.\n\nRequirements\n\n- A degree";
    const unknown = extractRules(item("Product Design Fellowship", text));
    expect(unknown.draft).toMatchObject({ locationMode: "hybrid", country: "NG" });
    expect(unknown.draft.city).toBeUndefined();
    expect(unknown.confidence).toBeLessThan(RULES_ONLY_PUBLISH_THRESHOLD);
    const nationwide = extractRules(
      item("Product Design Fellowship", text.replace("Warri", "anywhere in Nigeria")),
    );
    expect(nationwide.confidence).toBeGreaterThanOrEqual(RULES_ONLY_PUBLISH_THRESHOLD);
  });

  it("keeps the stated time zone", () => {
    const { draft } = extractRules(
      item("Hackathon", "Deadline: Nov 12, 2026 @ 12:00pm PST\nLocation: Online"),
    );
    expect(draft.deadlineTimezone).toBe("America/Los_Angeles");
  });

  it("weights the fields (docs/05 §2): requirements are worth 0.15 of the score", () => {
    const text = "Applications close 31 October 2026.";
    const without = extractRules(item("Remote Internship", text)).confidence;
    const withReqs = extractRules(
      item("Remote Internship", `${text}\n\nRequirements\n\n- Go or Node`),
    ).confidence;
    // deadline 0.85·0.35 + kind 0.9·0.25 + location 0.9·0.15 + title 0.1, then + 0.9·0.15.
    expect(without).toBe(0.76);
    expect(withReqs).toBe(0.89);
  });

  it("holds an item with a weak core field for review, however strong the rest", () => {
    // Organisation default location only (0.3): the mean alone would publish it.
    const { confidence } = extractRules(
      item("Backend Engineer", "Applications close 31 October 2026.\n\nRequirements\n\n- Go"),
    );
    expect(confidence).toBeLessThan(RULES_ONLY_PUBLISH_THRESHOLD);
  });

  it.each([
    [
      "an invite-only listing",
      "Hackathon",
      "Deadline: Nov 30, 2026 @ 5:00pm EST\nLocation: Online\nInvite only. Club members only",
    ],
    [
      "a members-only listing",
      "Fall 2026 Projects",
      "Submission period: Nov 15 - 16, 2026\nLocation: Online\n\nSemester long projects for Product@TAMU Members.",
    ],
    ...[
      "Ages 13 to 18 only",
      "Ages 13 to 21 only",
      "Ages 14–18 only",
      "High school students only",
      "UIUC students only",
      "Universidad Veracruzana students only",
      "US only",
      "Only specific countries/territories included (India)",
      "Only specific countries/territories included (Canada, United Kingdom, United States)",
    ].map((line) => [
      `a listing limited by its own words (${line})`,
      "Hackathon",
      `Deadline: Nov 30, 2026 @ 5:00pm EST\nLocation: Online\n\nWho can participate\n\n- ${line}\n- Companies excluded`,
    ]),
    [
      "a round-up post",
      "GSoC 2025: It's a wrap!",
      "Deadline: Nov 30, 2026 @ 5:00pm EST\nLocation: Online",
    ],
    [
      "a final-results post",
      "Google Summer of Code 2026 Final Results!",
      "Deadline: Nov 30, 2026 @ 5:00pm EST\nLocation: Online",
    ],
  ])("holds %s for review", (_, title, text) => {
    expect(extractRules(item(title, text)).confidence).toBeLessThan(RULES_ONLY_PUBLISH_THRESHOLD);
  });

  it.each([
    "As the global body for mobile operators, the GSMA delivers for its members across three pillars.",
    "The hackathon is open to members of the public.",
    "Team required: 2 to 4 members",
  ])("does not hold a listing that only mentions members: %s", (sentence) => {
    const text = `Deadline: Nov 30, 2026 @ 5:00pm EST\nLocation: Online\n\n${sentence}`;
    expect(extractRules(item("Hackathon", text)).confidence).toBeGreaterThanOrEqual(
      RULES_ONLY_PUBLISH_THRESHOLD,
    );
  });

  it.each([
    "- Students only",
    "- College students only",
    "- College and university students only",
    "- Ages 13+ only",
    "- Ages 18+ only",
    "- Ages 18 to 35 only",
    "- Team required: 2 to 4 members",
    "- Only specific countries/territories included (Ghana, Kenya, Nigeria)",
    "- All countries/territories, excluding standard exceptions (Brazil, Crimea, Cuba, Iran)",
    "- Specific countries/territories excluded (Argentina, Italy)",
    "An international hackathon that encourages high school students to use technology.",
    "Cosmo Hacks is for middle school, high school and college students aged 13+.",
    "Launchly connects student volunteers (ages 13–18) with opportunities.",
  ])("does not hold a listing that is not limited to pupils or one school: %s", (line) => {
    const text = `Deadline: Nov 30, 2026 @ 5:00pm EST\nLocation: Online\n\nWho can participate\n\n${line}`;
    expect(extractRules(item("Hackathon", text)).confidence).toBeGreaterThanOrEqual(
      RULES_ONLY_PUBLISH_THRESHOLD,
    );
  });

  it("publishes the same listing when it is open to all", () => {
    const text = "Deadline: Nov 30, 2026 @ 5:00pm EST\nLocation: Online";
    expect(extractRules(item("Hackathon", text)).confidence).toBeGreaterThanOrEqual(
      RULES_ONLY_PUBLISH_THRESHOLD,
    );
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
    expect(confidence).toBeLessThan(RULES_ONLY_PUBLISH_THRESHOLD);
  });

  it("does not publish a closed listing whose date has passed", () => {
    const { draft, confidence } = extractRules(
      item(
        "Remote Fellowship",
        "Applications closed on 30 September 2026.\n\nEligibility\n\nAnyone.",
      ),
    );
    expect(draft.deadlineKind).toBe("unknown");
    expect(draft.deadlineAt).toBeUndefined();
    expect(confidence).toBeLessThan(RULES_ONLY_PUBLISH_THRESHOLD);
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
