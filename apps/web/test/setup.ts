import { inject } from "vitest";

// Before any test file imports @devspot/db, whose client reads DATABASE_URL once.
const url = inject("databaseUrl");
if (url) process.env.DATABASE_URL = url;
else delete process.env.DATABASE_URL;
process.env.NEXT_PUBLIC_SITE_URL = "https://devspot.test";
