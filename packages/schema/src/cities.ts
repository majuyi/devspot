import { z } from "zod";

export type City = {
  slug: string;
  name: string;
  state: string;
  lat: number;
  lng: number;
  /** Lowercase aliases matched by the rules extractor (districts, old names, abbreviations). */
  aliases: string[];
};

// Launch list for Nigeria. Adding a city is a one-line PR. Coordinates are city centres.
export const CITIES: readonly City[] = [
  {
    slug: "lagos",
    name: "Lagos",
    state: "Lagos",
    lat: 6.5244,
    lng: 3.3792,
    aliases: ["lagos", "ikeja", "yaba", "lekki", "victoria island", "v.i.", "surulere", "ikoyi"],
  },
  {
    slug: "abuja",
    name: "Abuja",
    state: "FCT",
    lat: 9.0579,
    lng: 7.4951,
    aliases: ["abuja", "fct", "garki", "wuse", "maitama"],
  },
  {
    slug: "ibadan",
    name: "Ibadan",
    state: "Oyo",
    lat: 7.3775,
    lng: 3.947,
    aliases: ["ibadan", "bodija"],
  },
  {
    slug: "port-harcourt",
    name: "Port Harcourt",
    state: "Rivers",
    lat: 4.8156,
    lng: 7.0498,
    aliases: ["port harcourt", "port-harcourt", "ph city", "rivers state"],
  },
  { slug: "enugu", name: "Enugu", state: "Enugu", lat: 6.4584, lng: 7.5464, aliases: ["enugu"] },
  { slug: "kano", name: "Kano", state: "Kano", lat: 12.0022, lng: 8.592, aliases: ["kano"] },
  {
    slug: "benin-city",
    name: "Benin City",
    state: "Edo",
    lat: 6.335,
    lng: 5.6037,
    aliases: ["benin city", "benin-city", "edo state"],
  },
  {
    slug: "kaduna",
    name: "Kaduna",
    state: "Kaduna",
    lat: 10.5105,
    lng: 7.4165,
    aliases: ["kaduna"],
  },
  {
    slug: "jos",
    name: "Jos",
    state: "Plateau",
    lat: 9.8965,
    lng: 8.8583,
    aliases: ["jos", "plateau state"],
  },
  {
    slug: "calabar",
    name: "Calabar",
    state: "Cross River",
    lat: 4.9757,
    lng: 8.3417,
    aliases: ["calabar"],
  },
  {
    slug: "uyo",
    name: "Uyo",
    state: "Akwa Ibom",
    lat: 5.0377,
    lng: 7.9128,
    aliases: ["uyo", "akwa ibom"],
  },
  { slug: "owerri", name: "Owerri", state: "Imo", lat: 5.485, lng: 7.0351, aliases: ["owerri"] },
  {
    slug: "abeokuta",
    name: "Abeokuta",
    state: "Ogun",
    lat: 7.1475,
    lng: 3.3619,
    aliases: ["abeokuta"],
  },
  { slug: "ilorin", name: "Ilorin", state: "Kwara", lat: 8.4966, lng: 4.5421, aliases: ["ilorin"] },
  { slug: "akure", name: "Akure", state: "Ondo", lat: 7.2571, lng: 5.2058, aliases: ["akure"] },
  {
    slug: "ile-ife",
    name: "Ile-Ife",
    state: "Osun",
    lat: 7.4905,
    lng: 4.5521,
    aliases: ["ile-ife", "ife", "oau"],
  },
] as const;

export const CITY_SLUGS = CITIES.map((c) => c.slug) as [string, ...string[]];
export const CitySlug = z.enum(CITY_SLUGS);
export type CitySlug = z.infer<typeof CitySlug>;

export function findCity(slug: string): City | undefined {
  return CITIES.find((c) => c.slug === slug);
}
