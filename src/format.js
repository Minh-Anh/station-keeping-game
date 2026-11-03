// Kubernetes quantity parsing/formatting, kubectl's duration format, and a
// tabwriter-style column formatter. No game state lives here.

// CPU is stored and always printed in millicores so every value shares a unit.
// Real kubectl prints whole cores without the "m" (1000m -> "1"); see README.
export const fmtCpu = m => (!m ? '0' : m + 'm');

// Memory is stored in MiB (possibly fractional for decimal suffixes like "128M").
export function fmtMem(mi) {
  if (mi == null || mi === 0) return '0';
  if (mi % 1024 === 0) return mi / 1024 + 'Gi';
  if (Number.isInteger(mi)) return mi + 'Mi';
  return Math.round(mi * 1024) + 'Ki';
}

export function parseCpu(s) {
  const m = /^(\d+(?:\.\d+)?)(m?)$/.exec(s || '');
  if (!m) return null;
  return m[2] ? Math.round(+m[1]) : Math.round(+m[1] * 1000);
}

export function parseMem(s) {
  const m = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|k|M|G|T)?$/.exec(s || '');
  if (!m) return null;
  const factor = {
    Ki: 1 / 1024, Mi: 1, Gi: 1024, Ti: 1048576,
    k: 1e3 / 1048576, M: 1e6 / 1048576, G: 1e9 / 1048576, T: 1e12 / 1048576
  }[m[2]];
  const v = +m[1] * (factor === undefined ? 1 / 1048576 : factor); // bare number = bytes
  return Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v;
}

export const QTY_ERR =
  "error: quantities must match the regular expression '^([+-]?[0-9.]+)([eEinumkKMGTP]*[-+]?[0-9]*)$'";

// Port of k8s.io/apimachinery duration.HumanDuration, which is why a 2h-old pod shows "120m".
export function age(sec) {
  const s = Math.max(0, Math.floor(sec));
  if (s < 120) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 10) return s % 60 ? `${m}m${s % 60}s` : `${m}m`;
  if (m < 180) return m + 'm';
  const h = Math.floor(s / 3600);
  if (h < 8) return m % 60 ? `${h}h${m % 60}m` : `${h}h`;
  if (h < 48) return h + 'h';
  if (h < 24 * 8) return h % 24 ? `${Math.floor(h / 24)}d${h % 24}h` : `${Math.floor(h / 24)}d`;
  return Math.floor(h / 24) + 'd';
}

// Left-aligned columns padded to the widest cell, like Go's tabwriter.
// kubectl get uses a gap of 3; kubectl describe uses 2.
export function table(rows, gap = 3, indent = '') {
  const w = [];
  rows.forEach(row => row.forEach((c, i) => { w[i] = Math.max(w[i] || 0, String(c).length); }));
  return rows
    .map(row => indent + row.map((c, i) => (i === row.length - 1 ? String(c) : String(c).padEnd(w[i] + gap))).join(''))
    .join('\n');
}
