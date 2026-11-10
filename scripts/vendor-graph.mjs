#!/usr/bin/env node
// Bundles React and React Flow into one same-origin ES module for the roadmap
// graph view. Dev-only: run `npm run vendor` after upgrading either package and
// commit the output. The app itself still has no build step; this file is a
// vendored artefact like assets/vendor/anime.esm.min.js, and it is only fetched
// when someone opens the graph view.

import { build } from "esbuild";
import { copyFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(ROOT, "assets", "vendor", "graph.bundle.js");

await build({
  stdin: {
    resolveDir: ROOT,
    contents: `
      export { createElement, useState, useEffect, useCallback, useMemo, memo } from "react";
      export { createRoot } from "react-dom/client";
      export {
        ReactFlow, Background, Controls, MiniMap, Handle, Position, MarkerType,
        useNodesState, useEdgesState,
      } from "@xyflow/react";
    `,
  },
  bundle: true,
  format: "esm",
  minify: true,
  target: "es2020",
  legalComments: "eof",
  define: { "process.env.NODE_ENV": '"production"' },
  outfile: out,
});
copyFileSync(join(ROOT, "node_modules", "@xyflow", "react", "dist", "style.css"), join(ROOT, "assets", "vendor", "reactflow.css"));
console.log(`OK: graph.bundle.js ${(statSync(out).size / 1024).toFixed(0)} KB, reactflow.css copied.`);
