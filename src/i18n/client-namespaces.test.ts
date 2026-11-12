import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import fil from "../../messages/fil.json";
import en from "../../messages/en.json";
import { CLIENT_NAMESPACES } from "./client-namespaces";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

/** Resolve a local import ("./x", "@/components/x") to a .tsx file, if any. */
function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = resolve("src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const candidate of [`${base}.tsx`, join(base, "index.tsx")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Every .tsx file that ends up running in the browser: "use client" files plus
 * everything they import (a server-style component imported by a client
 * component runs in the browser too, e.g. StatusBadge inside MonitorCard).
 */
function browserFiles(): string[] {
  const all = files("src").map((f) => resolve(f));
  const seen = new Set<string>();
  const queue = all.filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)) {
      const dep = resolveImport(file, m[1]);
      if (dep && !seen.has(dep)) queue.push(dep);
    }
  }
  return [...seen];
}

describe("client message namespaces", () => {
  const inBrowser = browserFiles();

  it("finds the browser components", () => {
    expect(inBrowser.length).toBeGreaterThan(0);
  });

  it.each(inBrowser.map((f) => [f.replace(/.*[\\/]src[\\/]/, "src/"), f]))(
    "%s only uses namespaces sent to the browser",
    (_label, file) => {
      const used = [...readFileSync(file, "utf8").matchAll(/useTranslations\(\s*["'](\w+)["']/g)].map((m) => m[1]);
      for (const ns of used) expect(CLIENT_NAMESPACES).toContain(ns);
    },
  );

  it("every client namespace exists in both languages", () => {
    for (const ns of CLIENT_NAMESPACES) {
      expect(fil).toHaveProperty(ns);
      expect(en).toHaveProperty(ns);
    }
  });
});

describe("messages", () => {
  // Every key in Filipino has an English counterpart and vice versa.
  function keys(obj: object, prefix = ""): string[] {
    return Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
    );
  }
  it("fil.json and en.json have the same keys", () => {
    expect(keys(fil).sort()).toEqual(keys(en).sort());
  });
});
