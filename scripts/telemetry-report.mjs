#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const inputPath = args[0] ?? process.env.NIKA_TELEMETRY_FILE;

if (!inputPath) {
  console.error("Usage: node scripts/telemetry-report.mjs <telemetry-file>");
  console.error("       or set NIKA_TELEMETRY_FILE=/path/to/log.jsonl");
  process.exit(1);
}

async function main() {
  const resolvedPath = path.resolve(process.cwd(), inputPath);
  let raw;

  try {
    raw = await readFile(resolvedPath, "utf8");
  } catch (error) {
    console.error(`[nika] Failed to read telemetry file: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const entries = parseTelemetry(raw);
  if (entries.length === 0) {
    console.log(`[nika] No telemetry entries found in ${resolvedPath}.`);
    return;
  }

  printSummary(resolvedPath, entries);
}

function parseTelemetry(raw) {
  const lines = raw.split(/\r?\n/);
  const entries = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const entry = JSON.parse(trimmed);
      if (typeof entry === "object" && entry !== null) {
        entries.push(entry);
      }
    } catch (error) {
      console.warn(
        `[nika] Skipping invalid telemetry line: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return entries;
}

function printSummary(resolvedPath, entries) {
  const successes = entries.filter((entry) => entry.success === true);
  const failures = entries.filter((entry) => entry.success === false);
  const workingSetValues = successes
    .map((entry) => toNumber(entry.workingSetMb))
    .filter((value) => Number.isFinite(value));
  const managedValues = successes
    .map((entry) => toNumber(entry.managedMemoryMb))
    .filter((value) => Number.isFinite(value));
  const durations = successes
    .map((entry) => toNumber(entry.elapsedMs))
    .filter((value) => Number.isFinite(value));
  const memoryBudgetMb = toNumber(entries.at(-1)?.memoryBudgetMb) || 512;

  const percentileStats = {
    workingSet: computePercentiles(workingSetValues),
    managed: computePercentiles(managedValues),
    duration: computePercentiles(durations)
  };

  const guardTrips = failures.filter((entry) => entry.errorCode === "MEMORY_BUDGET_EXCEEDED").length;
  const errorCounts = countBy(failures.map((entry) => entry.errorCode ?? entry.error ?? "unknown"));

  console.log(`\n[nika] Telemetry summary for ${resolvedPath}`);
  console.log("------------------------------------------------------------");
  console.log(`Entries: ${entries.length} (${successes.length} successes, ${failures.length} failures)`);
  console.log(`Configured memory budget: ${memoryBudgetMb} MB`);

  if (workingSetValues.length > 0) {
    const { p50, p95, p99, max } = percentileStats.workingSet;
    console.log("\nWorking set (MB):");
    console.log(`  p50=${formatNumber(p50)}  p95=${formatNumber(p95)}  p99=${formatNumber(p99)}  max=${formatNumber(max)}`);
    if (p95) {
      const recommended = Math.ceil(p95 * 1.2);
      console.log(`  Suggested budget (p95 * 1.2): ${recommended} MB`);
    }
  } else {
    console.log("\nWorking set (MB): no data");
  }

  if (managedValues.length > 0) {
    const { p50, p95, p99, max } = percentileStats.managed;
    console.log("\nManaged memory (MB):");
    console.log(`  p50=${formatNumber(p50)}  p95=${formatNumber(p95)}  p99=${formatNumber(p99)}  max=${formatNumber(max)}`);
  } else {
    console.log("\nManaged memory (MB): no data");
  }

  if (durations.length > 0) {
    const { p50, p95, p99, max } = percentileStats.duration;
    console.log("\nFormatting duration (ms):");
    console.log(`  p50=${formatNumber(p50)}  p95=${formatNumber(p95)}  p99=${formatNumber(p99)}  max=${formatNumber(max)}`);
  }

  if (failures.length > 0) {
    console.log("\nFailure breakdown:");
    const sortedFailures = [...errorCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [key, count] of sortedFailures.slice(0, 10)) {
      console.log(`  ${key}: ${count}`);
    }
  }

  if (guardTrips > 0) {
    console.log(`\nMemory guard trips recorded: ${guardTrips}`);
  }

  console.log("\n[nika] Analysis complete.");
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function computePercentiles(values) {
  if (!values || values.length === 0) {
    return { p50: null, p95: null, p99: null, max: null };
  }

  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1]
  };
}

function percentile(sortedValues, fraction) {
  if (sortedValues.length === 0) {
    return null;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.round(fraction * (sortedValues.length - 1)))
  );
  return sortedValues[index];
}

function countBy(keys) {
  const map = new Map();
  for (const key of keys) {
    const normalized = typeof key === "string" && key.length > 0 ? key : "unknown";
    map.set(normalized, (map.get(normalized) ?? 0) + 1);
  }

  return map;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return value.toFixed(1);
}

main().catch((error) => {
  console.error(`[nika] Telemetry analysis failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
