import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@vercel/functions", () => ({ invalidateByTag: vi.fn(async () => {}) }));

const post = (secret?: string) =>
  new Request("https://devspot.test/api/revalidate", {
    method: "POST",
    headers: secret === undefined ? {} : { "x-revalidate-secret": secret },
  });

describe("POST /api/revalidate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("refuses a missing or wrong secret, and refuses everything when none is configured", async () => {
    const { POST } = await import("../../src/app/api/revalidate/route");
    const { revalidatePath } = await import("next/cache");
    vi.stubEnv("REVALIDATE_SECRET", "s3cret");
    expect((await POST(post())).status).toBe(401);
    expect((await POST(post("wrong"))).status).toBe(401);
    vi.stubEnv("REVALIDATE_SECRET", "");
    expect((await POST(post(""))).status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("with the secret, refreshes every page and the API's CDN entries", async () => {
    const { POST } = await import("../../src/app/api/revalidate/route");
    const { revalidatePath } = await import("next/cache");
    const { invalidateByTag } = await import("@vercel/functions");
    vi.stubEnv("REVALIDATE_SECRET", "s3cret");
    const res = await POST(post("s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ revalidated: true });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(invalidateByTag).toHaveBeenCalledWith("api-v1");
  });
});
