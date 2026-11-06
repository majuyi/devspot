import { OrganizationListParams } from "@devspot/schema";
import { handle, options, queryOf } from "@/api/http";
import { listOrganizations } from "@/data/organizations";

export function GET(req: Request) {
  return handle(req, () => listOrganizations(OrganizationListParams.parse(queryOf(req))));
}

export { options as OPTIONS };
