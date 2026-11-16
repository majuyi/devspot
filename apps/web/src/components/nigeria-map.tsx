import { findCity } from "@devspot/schema";
import { dotRadius, MAP_HEIGHT, MAP_WIDTH, NIGERIA_OUTLINE, project } from "@/ui/map";
import type { Tone } from "@/ui/urgency";

export type MapPlace = { city: string; count: number; tone: Exclude<Tone, "closed"> };

// Literal class names so Tailwind's scanner generates them.
const FILL = { red: "fill-red", amber: "fill-amber", none: "fill-muted" };

/**
 * Static map (docs/07 §5): the outline, and a dot per city sized by open count and coloured
 * by the most urgent item there. An image, not a control: the dots are too small to tap, and
 * the place pills beside it are the links. The label carries what the picture shows.
 */
export function NigeriaMap({ places, className }: { places: MapPlace[]; className?: string }) {
  const dots = places
    .flatMap((p) => {
      const city = findCity(p.city);
      return city ? [{ ...p, name: city.name, ...project(city.lat, city.lng) }] : [];
    })
    // Largest first, so a small dot is never hidden under a big neighbour.
    .sort((a, b) => b.count - a.count);
  const label = dots.length
    ? `Map of Nigeria. ${dots.map((d) => `${d.name} ${d.count}`).join(", ")}.`
    : "Map of Nigeria. No city has open items right now.";
  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="img"
      aria-label={label}
      className={className}
    >
      <path
        d={NIGERIA_OUTLINE}
        className="fill-land stroke-land-line"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {dots.map((d) => (
        <circle
          key={d.city}
          data-city={d.city}
          cx={d.x}
          cy={d.y}
          r={dotRadius(d.count)}
          className={`${FILL[d.tone]} stroke-land`}
          strokeWidth="4"
        />
      ))}
    </svg>
  );
}
