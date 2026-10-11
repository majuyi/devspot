/**
 * Line diff for `engine replay`: "-" lines are in expected only, "+" lines in actual only,
 * with three lines of context around each change. Fixtures are small, so plain LCS is fine.
 */
export function unifiedDiff(expected: string, actual: string, context = 3): string {
  const a = expected.split("\n");
  const b = actual.split("\n");
  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..].
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  const at = (i: number, j: number) => lcs[i]?.[j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--) {
    const row = lcs[i] as number[];
    for (let j = b.length - 1; j >= 0; j--)
      row[j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  }

  const ops: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push(`  ${a[i]}`);
      i++;
      j++;
    } else if (i < a.length && (j >= b.length || at(i + 1, j) >= at(i, j + 1))) {
      ops.push(`- ${a[i++]}`); // deletions before insertions, as diff(1) prints them
    } else {
      ops.push(`+ ${b[j++]}`);
    }
  }

  const keep = ops.map(() => false);
  ops.forEach((op, k) => {
    if (op.startsWith("  ")) return;
    for (let c = Math.max(0, k - context); c <= Math.min(ops.length - 1, k + context); c++)
      keep[c] = true;
  });
  const out: string[] = [];
  ops.forEach((op, k) => {
    if (keep[k]) out.push(op);
    else if (keep[k - 1]) out.push("  ...");
  });
  return out.join("\n");
}
