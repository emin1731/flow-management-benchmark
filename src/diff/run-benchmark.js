'use strict';

const { performance } = require('node:perf_hooks');
const { algorithms } = require('./algorithms');
const { buildScenarios } = require('./scenarios');
const { normalizeForm } = require('./normalize-form');
const { collectNodePaths, scoreResult } = require('./scoring');
const { createBenchmarkReport, renderConsoleReport } = require('./report');

const REPEATS = Number(process.env.BENCHMARK_REPEATS || 5);

/**
 * Runs every registered algorithm against every ground-truth scenario,
 * recording both correctness and timing.
 *
 * Timing is the median of REPEATS runs: a single run on a 200 KB template is
 * dominated by JIT warm-up and would rank algorithms by luck.
 *
 * @returns {object} the benchmark report
 */
function runBenchmark(options = {}) {
  const scenarios = buildScenarios();
  const selected = options.only
    ? algorithms.filter((algorithm) => algorithm.name === options.only)
    : algorithms;

  if (selected.length === 0) {
    throw new Error(
      `Unknown algorithm "${options.only}". Registered: ${algorithms.map((a) => a.name).join(', ')}`
    );
  }

  const results = [];

  for (const scenario of scenarios) {
    const knownNodePaths = collectNodePaths(
      normalizeForm(scenario.previous),
      normalizeForm(scenario.current)
    );

    for (const algorithm of selected) {
      const durations = [];
      let result;

      for (let run = 0; run < REPEATS; run += 1) {
        const startedAt = performance.now();
        result = algorithm.compare(scenario.previous, scenario.current);
        durations.push(performance.now() - startedAt);
      }

      durations.sort((left, right) => left - right);
      const medianMs = durations[Math.floor(durations.length / 2)];

      const score = scoreResult(scenario, result, knownNodePaths);

      results.push({
        algorithm: algorithm.name,
        scenario: scenario.name,
        group: scenario.group,
        medianMs,
        changeCount: (result.changes || []).length,
        equal: result.equal,
        verdict: result.verdict ? result.verdict.verdict : null,
        reordered: Boolean(result.ordering && result.ordering.reordered),
        metadata: result.metadata || {},
        score,
      });
    }
  }

  return createBenchmarkReport({ scenarios, algorithms: selected, results, repeats: REPEATS });
}

if (require.main === module) {
  const onlyArgument = process.argv.find((argument) => argument.startsWith("--only="));
  const report = runBenchmark({ only: onlyArgument ? onlyArgument.split("=")[1] : null });

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderConsoleReport(report));
  }

  const anyFailure = report.summary.some((entry) => entry.failed > 0);
  process.exitCode = process.argv.includes('--strict') && anyFailure ? 1 : 0;
}

module.exports = { runBenchmark };
