import { OrganizationOpportunitiesParams } from "@devspot/schema";
import { handle, options, queryOf } from "@/api/http";
import { listOpportunities } from "@/data/opportunities";
import { getOrganization } from "@/data/organizations";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(
    req,
    async () => {
      const p = OrganizationOpportunitiesParams.parse(queryOf(req));
      if (!(await getOrganization(slug))) return null;
      return listOpportunities({ ...p, org: slug });
    },
    "no organization has this slug",
  );
}

export { options as OPTIONS };
