import { handle, options } from "@/api/http";
import { getMeta } from "@/data/meta";

export function GET(req: Request) {
  return handle(req, () => getMeta());
}

export { options as OPTIONS };
