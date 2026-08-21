'use strict';

/**
 * Builds the serializable benchmark report plus a per-algorithm summary.
 *
 * @param {object} input
 * @returns {object}
 */
const createBenchmarkReport = ({ scenarios, algorithms, results, repeats }) => {
  const summary = algorithms.map((algorithm) => {
    const own = results.filter((result) => result.algorithm === algorithm.name);
    const passed = own.filter((result) => result.score.passed).length;

    const capabilities = {
      reportsNodePaths: own.some((result) =>
        result.score.checks.some((check) => check.check === 'touched-nodes' && check.passed)
      ),
      detectsRenamesOrMoves: own.some((result) =>
        result.score.checks.some((check) => check.check === 'rename-move-pairing' && check.passed)
      ),
      detectsReorder: own.some((result) =>
        result.score.checks.some((check) => check.check === 'reorder-detection' && check.passed)
      ),
      emitsVerdict: own.some((result) => result.verdict !== null),
    };

    const durations = own.map((result) => result.medianMs).sort((left, right) => left - right);

    return {
      algorithm: algorithm.name,
      scenarios: own.length,
      passed,
      failed: own.length - passed,
      medianMs: durations[Math.floor(durations.length / 2)],
      totalMs: durations.reduce((total, value) => total + value, 0),
      capabilities,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    repeats,
    scenarioCount: scenarios.length,
    algorithms: algorithms.map((algorithm) => algorithm.name),
    summary,
    results,
  };
};

const pad = (value, width) => String(value).padEnd(width);
const padStart = (value, width) => String(value).padStart(width);

/**
 * Renders a human-readable console report: a capability/pass matrix first,
 * because correctness is the point, then the per-scenario failures.
 *
 * @param {object} report
 * @returns {string}
 */
const renderConsoleReport = (report) => {
  const lines = [];

  lines.push('');
  lines.push(`Form template diff benchmark  -  ${report.scenarioCount} scenarios, median of ${report.repeats} runs`);
  lines.push('='.repeat(96));
  lines.push('');

  lines.push(
    `${pad('ALGORITHM', 26)}${padStart('PASS', 8)}${padStart('FAIL', 6)}${padStart('MEDIAN ms', 12)}   PATHS  RENAME  ORDER  VERDICT`
  );
  lines.push('-'.repeat(96));

  for (const entry of report.summary) {
    const mark = (value) => (value ? '  yes ' : '   no ');
    lines.push(
      pad(entry.algorithm, 26) +
        padStart(entry.passed, 8) +
        padStart(entry.failed, 6) +
        padStart(entry.medianMs.toFixed(3), 12) +
        '  ' +
        mark(entry.capabilities.reportsNodePaths) +
        mark(entry.capabilities.detectsRenamesOrMoves) +
        mark(entry.capabilities.detectsReorder) +
        mark(entry.capabilities.emitsVerdict)
    );
  }

  lines.push('');
  lines.push('Per-scenario results');
  lines.push('-'.repeat(96));

  const scenarioNames = [...new Set(report.results.map((result) => result.scenario))];
  lines.push(pad('SCENARIO', 30) + report.algorithms.map((name) => padStart(name.slice(0, 12), 14)).join(''));

  for (const scenarioName of scenarioNames) {
    const cells = report.algorithms.map((algorithmName) => {
      const result = report.results.find(
        (entry) => entry.scenario === scenarioName && entry.algorithm === algorithmName
      );
      if (!result) return padStart('-', 14);
      return padStart(`${result.score.passed ? 'ok' : 'FAIL'} ${result.score.score}`, 14);
    });
    lines.push(pad(scenarioName, 30) + cells.join(''));
  }

  const failures = report.results.filter((result) => !result.score.passed);
  if (failures.length > 0) {
    lines.push('');
    lines.push(`Failure detail  (${failures.length})`);
    lines.push('-'.repeat(96));
    for (const failure of failures) {
      const failedChecks = failure.score.checks.filter((check) => check.passed === false);
      for (const check of failedChecks) {
        const detail =
          check.check === 'touched-nodes'
            ? `missing ${JSON.stringify(check.missing || [])}`
            : `expected ${JSON.stringify(check.expected)}, got ${JSON.stringify(check.actual)}`;
        lines.push(`  ${pad(failure.algorithm, 26)} ${pad(failure.scenario, 28)} ${check.check}: ${detail}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
};

module.exports = { createBenchmarkReport, renderConsoleReport };
