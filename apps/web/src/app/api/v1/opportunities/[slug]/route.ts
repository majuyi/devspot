import { handle, options } from "@/api/http";
import { getOpportunity } from "@/data/opportunities";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle(req, () => getOpportunity(slug), "no published opportunity has this slug");
}

export { options as OPTIONS };
