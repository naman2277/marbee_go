// Decision Studio — ML Primitives
// Statistical and ML utility functions used across the decision engine.
// All functions are pure — no side effects, no state, fully testable.

// ─── Beta-Binomial Bayesian Shrinkage ──────────────────────────────
// For small-sample empirical rates (e.g., 3 opens out of 4 sends).
// Shrinks the observed rate toward a prior, weighted by sample size.
//
// The Beta distribution is parameterized by (alpha, beta) where:
//   alpha = prior_successes (pseudo-count of successes before seeing data)
//   beta  = prior_failures  (pseudo-count of failures)
// Posterior mean = (observed_successes + alpha) / (n + alpha + beta)

export function bayesianShrinkage(
  observed_successes: number,
  observed_total: number,
  prior_rate: number,
  prior_strength: number = 20,
): { rate: number; sample_size: number; shrinkage_weight: number } {
  const alpha = prior_rate * prior_strength;
  const beta = (1 - prior_rate) * prior_strength;

  const posterior_rate = (observed_successes + alpha) / (observed_total + alpha + beta);
  const shrinkage_weight = prior_strength / (observed_total + prior_strength);

  return {
    rate: posterior_rate,
    sample_size: observed_total,
    shrinkage_weight,
  };
}

// ─── Isotonic Regression (for probability calibration) ─────────────
// Given sorted (predicted_probability, actual_outcome) pairs, fits a
// monotonically non-decreasing function that maps raw scores to
// calibrated probabilities. This is the Pool Adjacent Violators (PAV)
// algorithm.
//
// In production, this would be trained offline on a held-out calibration
// set. Here we implement it as a pure function for the bootstrap phase.

export type CalibrationBin = {
  bin_start: number;
  bin_end: number;
  predicted_mean: number;
  actual_rate: number;
  count: number;
};

export function buildCalibrationMap(
  predictions: number[],
  actuals: boolean[],
  num_bins: number = 10,
): CalibrationBin[] {
  if (predictions.length !== actuals.length || predictions.length === 0) return [];

  const paired = predictions.map((p, i) => ({ p, a: actuals[i] ? 1 : 0 }));
  paired.sort((a, b) => a.p - b.p);

  const bins: CalibrationBin[] = [];
  const bin_size = Math.ceil(paired.length / num_bins);

  for (let i = 0; i < num_bins; i++) {
    const start = i * bin_size;
    const end = Math.min(start + bin_size, paired.length);
    if (start >= paired.length) break;

    const slice = paired.slice(start, end);
    const pred_mean = slice.reduce((s, x) => s + x.p, 0) / slice.length;
    const actual_rate = slice.reduce((s, x) => s + x.a, 0) / slice.length;

    bins.push({
      bin_start: slice[0].p,
      bin_end: slice[slice.length - 1].p,
      predicted_mean: pred_mean,
      actual_rate: actual_rate,
      count: slice.length,
    });
  }

  // PAV: enforce monotonicity
  for (let i = 1; i < bins.length; i++) {
    if (bins[i].actual_rate < bins[i - 1].actual_rate) {
      const merged_rate =
        (bins[i - 1].actual_rate * bins[i - 1].count + bins[i].actual_rate * bins[i].count) /
        (bins[i - 1].count + bins[i].count);
      bins[i - 1].actual_rate = merged_rate;
      bins[i].actual_rate = merged_rate;
    }
  }

  return bins;
}

export function calibrateScore(raw: number, calibration: CalibrationBin[]): number {
  if (calibration.length === 0) return raw;

  for (const bin of calibration) {
    if (raw >= bin.bin_start && raw <= bin.bin_end) {
      return bin.actual_rate;
    }
  }

  if (raw < calibration[0].bin_start) return calibration[0].actual_rate;
  return calibration[calibration.length - 1].actual_rate;
}

export function expectedCalibrationError(bins: CalibrationBin[]): number {
  const total = bins.reduce((s, b) => s + b.count, 0);
  if (total === 0) return 0;
  return bins.reduce((s, b) => s + (b.count / total) * Math.abs(b.actual_rate - b.predicted_mean), 0);
}

// ─── Normalization ─────────────────────────────────────────────────
// All multiplicative terms in the scoring formula MUST be normalized to
// [0,1] before multiplying, or the formula is numerically meaningless.

export function normalizeMinMax(value: number, min: number, max: number): number {
  if (max <= min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

export function normalizeAcrossCatalog(
  values: number[],
): { normalized: number[]; min: number; max: number } {
  if (values.length === 0) return { normalized: [], min: 0, max: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    normalized: values.map(v => normalizeMinMax(v, min, max)),
    min,
    max,
  };
}

// Sigmoid squashing — ensures the final score stays in [0,1] even after
// penalties are subtracted. Prevents negative scores breaking ranking.
export function sigmoidSquash(x: number, midpoint: number = 0.5, steepness: number = 10): number {
  return 1 / (1 + Math.exp(-steepness * (x - midpoint)));
}

// ─── Logistic Regression (Bootstrap ConversionProbability Model) ───
// A simple, fully interpretable model for phase 1.
// Features: segment, item category, channel, recency, frequency.

export type LogisticWeights = Record<string, number>;

export function logisticPredict(features: Record<string, number>, weights: LogisticWeights): number {
  let z = weights['_intercept'] ?? 0;
  for (const [key, value] of Object.entries(features)) {
    if (key in weights) {
      z += weights[key] * value;
    }
  }
  return 1 / (1 + Math.exp(-z));
}

// Train via gradient descent on log-loss.
// In production, this runs offline on historical decision+outcome pairs.
// Here we provide an in-memory trainer for bootstrapping.
export function trainLogistic(
  data: { features: Record<string, number>; label: boolean }[],
  learning_rate: number = 0.01,
  epochs: number = 100,
  l2_lambda: number = 0.001,
): { weights: LogisticWeights; log_loss: number; auc: number } {
  if (data.length === 0) return { weights: { _intercept: 0 }, log_loss: Infinity, auc: 0.5 };

  const feature_keys = new Set<string>();
  for (const d of data) {
    for (const k of Object.keys(d.features)) feature_keys.add(k);
  }
  const keys = Array.from(feature_keys);

  const w: Record<string, number> = { _intercept: 0 };
  for (const k of keys) w[k] = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (const d of data) {
      const pred = logisticPredict(d.features, w);
      const error = pred - (d.label ? 1 : 0);

      w['_intercept'] -= learning_rate * error;
      for (const k of keys) {
        const fv = d.features[k] ?? 0;
        w[k] -= learning_rate * (error * fv + l2_lambda * w[k]);
      }
    }
  }

  // Compute log loss and AUC
  let ll = 0;
  const scored: { pred: number; label: number }[] = [];
  for (const d of data) {
    const p = Math.max(1e-7, Math.min(1 - 1e-7, logisticPredict(d.features, w)));
    ll += d.label ? -Math.log(p) : -Math.log(1 - p);
    scored.push({ pred: p, label: d.label ? 1 : 0 });
  }
  ll /= data.length;

  return { weights: w, log_loss: ll, auc: computeAUC(scored) };
}

function computeAUC(scored: { pred: number; label: number }[]): number {
  const sorted = [...scored].sort((a, b) => b.pred - a.pred);
  let tp = 0, fp = 0;
  const positives = sorted.filter(s => s.label === 1).length;
  const negatives = sorted.length - positives;
  if (positives === 0 || negatives === 0) return 0.5;

  let auc = 0;
  let prev_fp = 0;
  let prev_tp = 0;

  for (const s of sorted) {
    if (s.label === 1) tp++;
    else fp++;
    auc += (fp - prev_fp) * (tp + prev_tp) / 2;
    prev_fp = fp;
    prev_tp = tp;
  }

  return auc / (positives * negatives);
}

// ─── SHAP-like Feature Attribution ─────────────────────────────────
// For the multiplicative utility model, we compute "contribution" of
// each term as: term_value * weight / total_positive_score.
// This gives a percentage breakdown of why this score is what it is.

export type FeatureAttribution = {
  feature: string;
  value: number;
  weight: number;
  contribution: number;
  direction: 'positive' | 'negative';
};

export function computeAttributions(
  terms: { name: string; value: number; weight: number; is_penalty: boolean }[],
): FeatureAttribution[] {
  const positive_sum = terms
    .filter(t => !t.is_penalty)
    .reduce((s, t) => s + Math.abs(t.value * t.weight), 0);

  return terms.map(t => ({
    feature: t.name,
    value: t.value,
    weight: t.weight,
    contribution: positive_sum > 0
      ? (t.is_penalty ? -(Math.abs(t.value * t.weight) / positive_sum) : (t.value * t.weight) / positive_sum)
      : 0,
    direction: t.is_penalty ? 'negative' as const : 'positive' as const,
  }));
}

// ─── Thompson Sampling (Explore/Exploit) ───────────────────────────
// For each item, maintain a Beta distribution over its conversion rate.
// Sample from each item's posterior. The item with the highest sample
// gets shown. This naturally balances exploration (uncertain items get
// sampled high sometimes) and exploitation (proven items get sampled
// high reliably).

export function thompsonSample(alpha: number, beta: number): number {
  // Approximate Beta sampling using the Joehnk method
  const u1 = Math.pow(Math.random(), 1 / alpha);
  const u2 = Math.pow(Math.random(), 1 / beta);
  const sum = u1 + u2;
  if (sum === 0) return 0.5;
  return u1 / sum;
}

export function thompsonSampleForItem(
  successes: number,
  failures: number,
  prior_alpha: number = 1,
  prior_beta: number = 1,
): number {
  return thompsonSample(successes + prior_alpha, failures + prior_beta);
}

// ─── Population Stability Index (for model drift detection) ────────
// Compares the distribution of a feature between training and serving.
// PSI > 0.1 is a warning; PSI > 0.25 triggers retraining.

export function computePSI(
  expected: number[], // training distribution bin proportions
  actual: number[],   // serving distribution bin proportions
): number {
  if (expected.length !== actual.length) return Infinity;
  let psi = 0;
  for (let i = 0; i < expected.length; i++) {
    const e = Math.max(expected[i], 1e-6);
    const a = Math.max(actual[i], 1e-6);
    psi += (a - e) * Math.log(a / e);
  }
  return psi;
}

// ─── Lift Over Random ──────────────────────────────────────────────
// How much better the model is at finding conversions vs random selection.

export function liftOverRandom(
  predictions: number[],
  actuals: boolean[],
  top_percent: number = 0.2,
): number {
  if (predictions.length === 0) return 1;

  const paired = predictions.map((p, i) => ({ p, a: actuals[i] }));
  paired.sort((a, b) => b.p - a.p);

  const overall_rate = actuals.filter(Boolean).length / actuals.length;
  if (overall_rate === 0) return 1;

  const top_n = Math.max(1, Math.floor(paired.length * top_percent));
  const top_slice = paired.slice(0, top_n);
  const top_rate = top_slice.filter(s => s.a).length / top_slice.length;

  return top_rate / overall_rate;
}

// ─── Quantile Computation (for RFM binning) ────────────────────────

export function computeQuantiles(values: number[], num_bins: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const thresholds: number[] = [];

  for (let i = 1; i < num_bins; i++) {
    const idx = Math.floor((i / num_bins) * sorted.length);
    thresholds.push(sorted[Math.min(idx, sorted.length - 1)]);
  }

  return thresholds;
}

export function assignQuantile(value: number, thresholds: number[]): number {
  for (let i = 0; i < thresholds.length; i++) {
    if (value <= thresholds[i]) return i + 1;
  }
  return thresholds.length + 1;
}

// ─── Deterministic Hash (for holdout/experiment assignment) ────────
// Must produce the same result for the same inputs — idempotency.

export function deterministicHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function assignToExperimentGroup(
  customer_id: string,
  policy_id: string,
  holdout_percent: number,
): 'treatment' | 'holdout' {
  const hash = deterministicHash(customer_id + ':' + policy_id);
  return (hash % 100) < holdout_percent ? 'holdout' : 'treatment';
}

// ─── Replay Hash (for idempotency verification) ────────────────────

export function computeReplayHash(
  customer_id: string,
  placement: string,
  channel: string,
  model_version: string,
  item_ids: string[],
): string {
  const input = [customer_id, placement, channel, model_version, ...item_ids.sort()].join('|');
  return 'rh_' + deterministicHash(input).toString(36);
}
