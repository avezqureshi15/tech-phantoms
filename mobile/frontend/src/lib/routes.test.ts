import fs from "node:fs";
import path from "node:path";

/**
 * Every place the app navigates to a fixed address must have a screen file behind it. A missing one
 * shows the person "not found" at run time, which nothing else would catch before release.
 */
const SRC = path.join(__dirname, "..");
const APP = path.join(SRC, "app");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** The URL paths the screen files provide: groups like (app) and (tabs) do not appear in a URL. */
function routes(): Set<string> {
  const found = new Set<string>();
  for (const file of walk(APP)) {
    if (!/\.tsx$/.test(file) || file.endsWith("_layout.tsx")) continue;
    const url =
      "/" +
      path
        .relative(APP, file)
        .replace(/\.tsx$/, "")
        .split(path.sep)
        .filter((part) => !/^\(.*\)$/.test(part))
        .join("/")
        .replace(/\/?index$/, "");
    found.add(url === "/" ? "/" : url.replace(/\/$/, ""));
  }
  return found;
}

/** Fixed addresses passed to the router: push("/x"), replace("/x"), href: "/x", pathname: "/x". */
function targets(): { file: string; target: string }[] {
  const pattern =
    /(?:push|replace|navigate)\(\s*["'](\/[^"'`${}?]*)["']|(?:href|pathname)\s*[:=]\s*["'](\/[^"'`${}?]*)["']/g;
  const hits: { file: string; target: string }[] = [];
  for (const file of walk(SRC)) {
    if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(pattern)) {
      hits.push({ file: path.relative(SRC, file), target: match[1] ?? match[2]! });
    }
  }
  return hits;
}

describe("navigation targets", () => {
  const known = routes();

  it("finds the screens the app has (so this test cannot pass by finding nothing)", () => {
    for (const expected of ["/", "/voice", "/support", "/utsav", "/appearance", "/expense/new"]) {
      expect(known).toContain(expected);
    }
  });

  it("finds the places the app navigates to", () => {
    expect(targets().length).toBeGreaterThan(10);
    expect(targets().map((t) => t.target)).toContain("/support");
  });

  it("never sends a person to a screen that does not exist", () => {
    const missing = targets().filter(({ target }) => !known.has(target.replace(/\/$/, "") || "/"));
    expect(missing).toEqual([]);
  });

  it("registers the support screen in the navigator, as the other modals are", () => {
    const layout = fs.readFileSync(path.join(APP, "(app)", "_layout.tsx"), "utf8");
    expect(layout).toContain('name="support"');
  });
});
