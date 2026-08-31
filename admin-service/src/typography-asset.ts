import { existsSync, readFileSync } from "node:fs";

// The service runs from src/ during development and dist/src/ after compilation.
// Both deployments retain the repository's shared static asset.
const source = [
  new URL("../../static/js/typography.js", import.meta.url),
  new URL("../../../static/js/typography.js", import.meta.url),
].find((candidate) => existsSync(candidate));

if (!source) throw new Error("Missing shared typography script");
export const typographyJs = readFileSync(source, "utf8");
