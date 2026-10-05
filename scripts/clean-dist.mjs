import { rm } from "node:fs/promises";
import { basename, resolve } from "node:path";

const outputDir = resolve(process.cwd(), "dist");

// Keep the cleanup narrowly scoped to the generated output directory.
if (basename(outputDir) !== "dist") {
  throw new Error(`Refusing to clean unexpected output path: ${outputDir}`);
}

await rm(outputDir, { recursive: true, force: true });
