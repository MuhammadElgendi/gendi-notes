#!/usr/bin/env node
/* Parity check for the dashboard's lint: `node site/admin/test.mjs`
   Runs every real note through the dashboard pipeline (analyze → buildNote →
   lint) exactly as if it were re-uploaded to its current category, and fails
   if the dashboard would reject a note build.mjs accepts, or would change a
   note beyond its `updated:` date. Run it after changing either linter. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, buildNote, lint, indexTree } from "./note.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist"].includes(e.name) || e.name === ".git") continue;
    const p = path.join(dir, e.name);
    const rel = path.relative(ROOT, p).split(path.sep).join("/");
    if (e.isDirectory()) { acc.push({ path: rel, type: "tree" }); walk(p, acc); }
    else acc.push({ path: rel, type: "blob", sha: "0" });
  }
  return acc;
}

const index = indexTree(walk(ROOT));
let failures = 0;

for (const [slug, rel] of index.slugs) {
  const raw = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const a = analyze(raw, path.basename(rel));
  const parts = rel.split("/");
  const built = buildNote(a, {
    domain: parts[0],
    folder: parts.slice(1, -1).join("/"),
    slug: a.slug, title: a.title, type: a.type, level: a.level, status: a.status,
    tags: a.tags, summary: a.summary, updated: a.data.updated,
  });
  const errors = lint(a, built, index).filter(p => p.sev === "error");
  const same = built.content === raw.replace(/\r\n?/g, "\n");

  if (built.path !== rel || errors.length || !same) {
    failures++;
    console.log(`✗ ${rel}`);
    if (built.path !== rel) console.log(`    path became ${built.path}`);
    for (const e of errors) console.log(`    ${e.msg}`);
    if (!same) console.log(`    re-upload would change the file`);
  }
}

console.log(`\n${index.slugs.size} notes — ${failures} failure(s).`);
process.exitCode = failures ? 1 : 0;
