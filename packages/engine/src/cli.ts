/**
 * `pnpm engine <command>`. Logs are JSON lines on stdout; the human summary goes to stderr.
 * snapshot arrives in M4.4 and `--llm` with the LLM extractor in M3.
 */
import { parseArgs } from "node:util";
import { dryRun } from "./dry-run.js";
import { formatReport, loadEvalSet, runEval } from "./eval.js";
import { fetchSource } from "./fetch.js";
import { recordSource } from "./fixtures/record.js";
import { acceptReplay, replaySource } from "./fixtures/replay.js";
import { HttpClient } from "./http.js";
import { log } from "./log.js";
import { findSource } from "./registry.js";
import { verifyPublished } from "./verify.js";

const USAGE = `usage:
  pnpm engine run [--source <key>] [--org <slug>] [--dry-run] [--limit N]
                                               fetch, extract and load; --limit is items per source
  pnpm engine health                           print each source's state
  pnpm engine record --source <key>            record a fixture from the live network
  pnpm engine replay --source <key> [--update] diff the fetcher's output against the fixture
  pnpm engine eval                             score the rules extractor on test/eval/items.json
  pnpm engine verify [--all]                   re-check published opportunities, close finished ones`;

async function main(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      source: { type: "string" },
      update: { type: "boolean", default: false },
      all: { type: "boolean", default: false },
      org: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      limit: { type: "string" },
    },
  });
  const [command] = positionals;
  if (command === "eval") {
    const report = runEval(loadEvalSet());
    log("eval.finished", report);
    console.error(formatReport(report));
    return 0;
  }
  if (command === "run" || command === "health") {
    const limit = values.limit === undefined ? undefined : Number(values.limit);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      console.error(USAGE);
      return 2;
    }
    const filter = {
      ...(values.source ? { source: values.source } : {}),
      ...(values.org ? { org: values.org } : {}),
      ...(limit ? { limit } : {}),
    };
    if (command === "run" && values["dry-run"]) {
      const result = await dryRun({ ...filter, http: new HttpClient() });
      console.error(`dry run: ${result.drafts} drafts from ${result.sources} sources`);
      return result.errors ? 1 : 0;
    }
    // Imported here because importing them needs DATABASE_URL, which the other commands do not.
    const { db, syncRegistry } = await import("@devspot/db");
    const { runEngine, sourceStates } = await import("./run.js");
    if (command === "health") {
      const states = await sourceStates(db);
      await db.$disconnect();
      log("health.finished", { sources: states });
      for (const s of states) console.error(`${s.health.padEnd(9)} ${s.key}`);
      return 0;
    }
    log("registry.synced", { ...(await syncRegistry(db)) });
    const { summary, turnedErroring } = await runEngine({ db, http: new HttpClient(), ...filter });
    await db.$disconnect();
    console.error(
      `${summary.sources} sources: ${summary.ok} ok, ${summary.errors} failed, ${summary.new} new, ${summary.changed} changed, ${summary.published} published, ${summary.review} to review`,
    );
    for (const key of turnedErroring) console.error(`now erroring: ${key}`);
    return turnedErroring.length ? 1 : 0;
  }
  if (command === "verify") {
    const { db } = await import("@devspot/db");
    const summary = await verifyPublished(db, new HttpClient(), { all: values.all });
    await db.$disconnect();
    log("verify.finished", summary);
    console.error(
      `verified ${summary.verified}, closed ${summary.closed}, unreachable ${summary.unreachable} of ${summary.checked}`,
    );
    return 0;
  }
  if ((command !== "record" && command !== "replay") || !values.source) {
    console.error(USAGE);
    return 2;
  }
  const source = findSource(values.source);

  if (command === "record") {
    const result = await recordSource({ source, fetch: fetchSource });
    log("fixture.recorded", { source: source.key, ...result });
    console.error(`recorded ${source.key}: ${result.items} items, ${result.exchanges} responses`);
    for (const url of result.oversized)
      console.error(`  over 300 KB, trim it in the adapter: ${url}`);
    return 0;
  }

  const result = await replaySource({ source, fetch: fetchSource });
  log("fixture.replayed", { source: source.key, equal: result.equal });
  if (result.equal) {
    console.error(`${source.key}: matches expected.json`);
    return 0;
  }
  console.error(result.diff);
  if (values.update) {
    acceptReplay(source, result.actual);
    console.error(`${source.key}: expected.json updated`);
    return 0;
  }
  console.error(`${source.key}: differs from expected.json (rerun with --update to accept)`);
  return 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    log("cli.error", {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
    });
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
