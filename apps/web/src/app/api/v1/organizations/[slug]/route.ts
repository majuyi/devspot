import { handle, options } from "@/api/http";
import { getOrganization } from "@/data/organizations";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(req, () => getOrganization(slug), "no organization has this slug");
}

export { options as OPTIONS };
