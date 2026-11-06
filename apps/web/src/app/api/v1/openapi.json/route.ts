import { handle, options } from "@/api/http";
import { openapiDocument } from "@/api/openapi";

export function GET(req: Request) {
  return handle(req, async () => openapiDocument());
}

export { options as OPTIONS };
