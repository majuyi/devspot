/**
 * `pnpm engine <command>`. Logs are JSON lines on stdout; the human summary goes to stderr.
 * Only record and replay exist so far; run, verify, health and snapshot arrive in M1.10.
 */
import { parseArgs } from "node:util";
import { fetchSource } from "./fetch.js";
import { recordSource } from "./fixtures/record.js";
import { acceptReplay, replaySource } from "./fixtures/replay.js";
import { findSource } from "./registry.js";

const USAGE = `usage:
  pnpm engine record --source <key>            record a fixture from the live network
  pnpm engine replay --source <key> [--update] diff the fetcher's output against the fixture`;

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields }));
}

async function main(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { source: { type: "string" }, update: { type: "boolean", default: false } },
  });
  const [command] = positionals;
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
