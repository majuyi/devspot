import { EventListParams } from "@devspot/schema";
import { handle, options, queryOf } from "@/api/http";
import { lagosBound } from "@/api/params";
import { listEvents } from "@/data/events";

export function GET(req: Request) {
  return handle(req, () => {
    const p = EventListParams.parse(queryOf(req));
    return listEvents({ ...p, from: lagosBound(p.from, "start"), to: lagosBound(p.to, "end") });
  });
}

export { options as OPTIONS };
