/**
 * @param {number} ms
 */
export function formatPerfSeconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * @param {string} label
 * @param {number} ms
 */
export function logIgPerf(label, ms) {
  console.log(`[IG PERF] ${label}: ${formatPerfSeconds(ms)}`);
}

/**
 * @typedef {{
 *   detectMs: number,
 *   replyMs: number,
 *   downloadMs: number,
 *   probeInputMs: number,
 *   ffmpegMs: number,
 *   probeOutputMs: number,
 *   telegramMs: number,
 * }} IgPerfTotals
 */

export function createIgPerfTotals() {
  return {
    detectMs: 0,
    replyMs: 0,
    downloadMs: 0,
    probeInputMs: 0,
    ffmpegMs: 0,
    probeOutputMs: 0,
    telegramMs: 0,
  };
}

/**
 * @param {IgPerfTotals} totals
 * @param {number} totalMs
 */
export function logIgPerfSummary(totals, totalMs) {
  logIgPerf('detect', totals.detectMs);
  logIgPerf('reply', totals.replyMs);
  logIgPerf('download', totals.downloadMs);
  logIgPerf('probeInput', totals.probeInputMs);
  logIgPerf('ffmpeg', totals.ffmpegMs);
  logIgPerf('probeOutput', totals.probeOutputMs);
  logIgPerf('telegram', totals.telegramMs);
  logIgPerf('total', totalMs);
}
