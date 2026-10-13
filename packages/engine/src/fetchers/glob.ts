/**
 * The registry's `include` glob, matched against a whole URL: `*` is any run of characters
 * within one path segment, `**` crosses segments, `?` is one character. Nothing else is
 * special, so the dots and slashes in a URL need no escaping in YAML.
 */
export function globToRegExp(glob: string): RegExp {
  let pattern = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string;
    if (c === "*" && glob[i + 1] === "*") {
      pattern += ".*";
      i++;
    } else if (c === "*") pattern += "[^/]*";
    else if (c === "?") pattern += "[^/]";
    else pattern += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${pattern}$`);
}
