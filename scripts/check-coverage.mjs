import fs from "fs";
import path from "path";

const threshold = Number(process.env.COVERAGE_THRESHOLD || "85");
const lcovPath = process.env.LCOV_PATH || "lcov.info";
const resolved = path.resolve(process.cwd(), lcovPath);

if (!fs.existsSync(resolved)) {
  console.error(`Coverage file not found: ${resolved}`);
  process.exit(1);
}

const content = fs.readFileSync(resolved, "utf8");
const ignorePrefixes = ["script/", "scripts/", "test/"];
let total = 0;
let covered = 0;
let includeFile = true;

for (const line of content.split("\n")) {
  if (line.startsWith("SF:")) {
    const filePath = line.slice(3);
    includeFile = !ignorePrefixes.some((prefix) => filePath.startsWith(prefix));
    continue;
  }
  if (!includeFile || !line.startsWith("DA:")) continue;
  const parts = line.slice(3).split(",");
  if (parts.length < 2) continue;
  total += 1;
  if (Number(parts[1]) > 0) {
    covered += 1;
  }
}

if (total === 0) {
  console.error("No coverage data found in lcov file.");
  process.exit(1);
}

const pct = (covered / total) * 100;
const pctDisplay = pct.toFixed(2);
console.log(`Line coverage: ${pctDisplay}% (threshold ${threshold}%)`);

if (pct < threshold) {
  process.exit(1);
}
