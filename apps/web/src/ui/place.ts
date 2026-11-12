import { findCity, type LocationMode } from "@devspot/schema";

type Located = { locationMode: LocationMode; country: string | null; city: string | null };

/** 01 §1 Location: `Remote`, `<City>`, `<City> · Hybrid`, `Nigeria`, `Global`. */
export function placeLabel(o: Located): string {
  if (o.locationMode === "remote") return "Remote";
  const city = o.city ? (findCity(o.city)?.name ?? o.city) : null;
  if (city) return o.locationMode === "hybrid" ? `${city} · Hybrid` : city;
  return o.country === "NG" ? "Nigeria" : "Global";
}
