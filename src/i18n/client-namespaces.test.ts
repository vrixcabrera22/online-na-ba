import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
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

describe("client message namespaces", () => {
  const clientFiles = files("src").filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));

  it("finds the client components", () => {
    expect(clientFiles.length).toBeGreaterThan(0);
  });

  it.each(clientFiles)("%s only uses namespaces sent to the browser", (file) => {
    const used = [...readFileSync(file, "utf8").matchAll(/useTranslations\(\s*["'](\w+)["']/g)].map((m) => m[1]);
    for (const ns of used) expect(CLIENT_NAMESPACES).toContain(ns);
  });

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
