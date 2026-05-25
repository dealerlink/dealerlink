// Latency statistics helpers. Percentiles use the nearest-rank method on the
// sorted sample, which is the conventional choice for load-test latency
// reporting and is stable for small samples.

/** Nearest-rank percentile (p in 0..100) over a numeric array. */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(rank, sorted.length) - 1];
}

export function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stddev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Round to 1 dp for compact JSON. */
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

/** Summarize a set of latency samples (ms) into the reported metric block. */
export function summarize(samplesMs) {
  return {
    n: samplesMs.length,
    min: r1(samplesMs.length ? Math.min(...samplesMs) : null),
    mean: r1(mean(samplesMs)),
    stddev: r1(stddev(samplesMs)),
    p50: r1(percentile(samplesMs, 50)),
    p95: r1(percentile(samplesMs, 95)),
    p99: r1(percentile(samplesMs, 99)),
    max: r1(samplesMs.length ? Math.max(...samplesMs) : null),
  };
}

/** Pretty one-line metric for console output. */
export function fmtSummary(label, s) {
  return `${label.padEnd(26)} n=${String(s.n).padStart(4)}  p50=${String(s.p50).padStart(7)}ms  p95=${String(s.p95).padStart(7)}ms  p99=${String(s.p99).padStart(7)}ms  max=${String(s.max).padStart(7)}ms`;
}
