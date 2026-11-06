import { ApiListParams } from "@devspot/schema";
import { handle, options, queryOf } from "@/api/http";
import { listOpportunities } from "@/data/opportunities";

export function GET(req: Request) {
  return handle(req, () => listOpportunities(ApiListParams.parse(queryOf(req))));
}

export { options as OPTIONS };
