#!/usr/bin/env node
import * as esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
const watch = process.argv.includes("--watch");
async function clean() {
  await rm("dist", { recursive: true, force: true });
  await mkdir("dist", { recursive: true });
}
async function copyPublic() {
  await cp("public", "dist", { recursive: true });
}
const entries = {
  content: path.join("src", "content.ts"),
  background: path.join("src", "background.ts"),
  popup: path.join("src", "popup.ts"),
  options: path.join("src", "options.ts"),
};
async function buildOnce() {
  await clean();
  await copyPublic();
  const ctx = await esbuild.context({
    entryPoints: entries,
    bundle: true,
    outdir: "dist",
    target: "chrome118",
    format: "iife",
    platform: "browser",
    sourcemap: watch ? "inline" : false,
    minify: !watch,
    logLevel: "info",
  });
  await ctx.rebuild();
  if (!watch) await ctx.dispose();
  console.log(`[build] → dist/ (${watch ? "watch" : "once"})`);
  return ctx;
}
if (watch) {
  const ctx = await buildOnce();
  await ctx.watch();
  console.log("[watch] watching src/ and public/ for changes…");
  let debounce;
  const { watch: fsWatch } = await import("node:fs");
  if (existsSync("public")) {
    fsWatch("public", { recursive: true }, () => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        console.log("[watch] public changed → copying");
        await cp("public", "dist", { recursive: true });
      }, 150);
    });
  }
  process.on("SIGINT", async () => {
    await ctx.dispose();
    process.exit(0);
  });
} else {
  await buildOnce();
}
