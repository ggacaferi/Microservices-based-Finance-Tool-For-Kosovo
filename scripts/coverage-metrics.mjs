#!/usr/bin/env node
/**
 * Coverage gate for this TypeScript/Nest monorepo (Istanbul via Jest).
 *
 * Mappings (JavaScript has no standalone MC/DC engine like Bullseye for C):
 *
 * 1) Statement coverage — Istanbul `statements` from coverage-summary.json.
 *
 * 2) Decision coverage — Istanbul **branch** percentage (`branches` in the summary).
 *    In JS tooling this is the practical analogue to “decision / branch coverage” because
 *    `if` nodes are often instrumented with a single edge counter.
 *
 * 3) Condition coverage — share of **binary-expr** and **cond-expr** branch *locations*
 *    in coverage-final.json that executed at least once (logical / ternary operands).
 *
 * 4) Decision/condition coverage — harmonic mean of (2) and (3), a single scalar that
 *    requires both overall branches and logical-operand branches to stay healthy.
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const coverageDir = path.join(root, 'coverage');
const summaryPath = path.join(coverageDir, 'coverage-summary.json');
const finalPath = path.join(coverageDir, 'coverage-final.json');

const CONDITION_TYPES = new Set(['binary-expr', 'cond-expr']);

function readJson(p) {
  if (!fs.existsSync(p)) {
    console.error(`Missing coverage file: ${p}\nRun: npm run test:cov`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function pct(covered, total) {
  if (total === 0) return 100;
  return (100 * covered) / total;
}

function accumulateBranchSlots(fileCov, typePredicate) {
  const { branchMap = {}, b = {} } = fileCov;
  let slots = 0;
  let covered = 0;
  for (const [id, meta] of Object.entries(branchMap)) {
    if (!typePredicate(meta.type)) continue;
    const hits = b[id];
    if (!Array.isArray(hits) || !Array.isArray(meta.locations)) continue;
    for (let i = 0; i < hits.length; i++) {
      slots += 1;
      if (hits[i] > 0) covered += 1;
    }
  }
  return { slots, covered };
}

function aggregateConditionOnly(finalJson) {
  let cSlots = 0;
  let cCov = 0;
  for (const fileKey of Object.keys(finalJson)) {
    const data = finalJson[fileKey];
    if (!data || typeof data !== 'object' || !data.path) continue;
    const norm = String(data.path).replace(/\\/g, '/');
    if (!norm.includes('/src/')) continue;
    const cond = accumulateBranchSlots(data, (t) => CONDITION_TYPES.has(t));
    cSlots += cond.slots;
    cCov += cond.covered;
  }
  return { cSlots, cCov, conditionPct: pct(cCov, cSlots) };
}

function harmonicMean(a, b) {
  if (a <= 0 || b <= 0) return 0;
  return (2 * a * b) / (a + b);
}

const summary = readJson(summaryPath);
const finalJson = readJson(finalPath);
const total = summary.total;

const statementPct = total.statements.pct;
const decisionPct = total.branches.pct;

const { conditionPct, cSlots } = aggregateConditionOnly(finalJson);
const decisionConditionPct = harmonicMean(decisionPct, conditionPct);

const rows = [
  ['Statement coverage', statementPct, total.statements.covered, total.statements.total],
  ['Decision coverage (Istanbul branch %)', decisionPct, total.branches.covered, total.branches.total],
  ['Condition coverage (binary-expr / cond-expr locations)', conditionPct, null, cSlots],
  ['Decision/condition coverage (harmonic mean of decision + condition)', decisionConditionPct, null, null],
];

console.log('\n=== Coverage metrics (src/, respecting collectCoverageFrom in jest.config.cjs) ===\n');
console.log(`${'Metric'.padEnd(62)} ${'%'.padStart(8)}  (detail)`);
for (const [name, pctVal, cov, tot] of rows) {
  const detail =
    cov != null && tot != null
      ? `covered ${cov} / ${tot}`
      : tot != null
        ? `branch slots counted: ${tot}`
        : '—';
  console.log(`${name.padEnd(62)} ${pctVal.toFixed(2).padStart(7)}%  ${detail}`);
}
console.log('');

const MIN = 70;
const checks = [
  ['Statement coverage', statementPct],
  ['Decision coverage', decisionPct],
  ['Condition coverage', conditionPct],
  ['Decision/condition coverage', decisionConditionPct],
];

const failed = checks.filter(([, v]) => v < MIN);
if (failed.length) {
  console.error(`Threshold ${MIN}% failed for:`);
  for (const [n, v] of failed) console.error(`  - ${n}: ${v.toFixed(2)}%`);
  process.exit(1);
}

console.log(`All listed metrics are at or above ${MIN}%.\n`);
