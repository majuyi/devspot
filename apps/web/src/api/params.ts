/** A date with no time means that whole day in Lagos: `from` its start, `to` its end. */
export function lagosBound(value: string | undefined, edge: "start" | "end"): string | undefined {
  if (value === undefined || value.includes("T")) return value;
  return new Date(
    `${value}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}+01:00`,
  ).toISOString();
}
