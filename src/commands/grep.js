// The right-hand side of `kubectl ... | grep ...`.
// Supports -i, -v, -c, -E, -e, -n, -w and the context options -A, -B, -C.

import { err, note, notSim } from '../terminal.js';
import { tokenize } from '../args.js';

const LONG = { '--ignore-case': 'i', '--invert-match': 'v', '--count': 'c', '--extended-regexp': 'E', '--line-number': 'n', '--word-regexp': 'w' };
const LONG_CONTEXT = { '--after-context': 'A', '--before-context': 'B', '--context': 'C' };
const USAGE = 'usage: grep [-cEinvw] [-A num] [-B num] [-C num] [-e pattern] [pattern]';
const SUPPORTED = 'Options you can use with grep: -i, -v, -c, -E, -e, -n, -w, -A, -B, -C.';
const REAL_SHORT = 'xqloHhsrFmLf'; // real grep options that aren't simulated

// Basic regular expressions treat | ( ) + ? { } as literals unless backslashed,
// which is the reverse of JavaScript's rules.
const basicToJs = p => p.replace(/\\([|()+?{}])|([|()+?{}])/g, (_, esc, bare) => esc ?? '\\' + bare);

// Prints matching lines with their context, the way grep does: neighbouring groups
// merge, separate groups get a "--" line, and -n marks matches with ":" and context with "-".
function withContext(lines, matched, before, after, numbered) {
  const res = [];
  let last = -1;
  lines.forEach((_, i) => {
    if (!matched[i]) return;
    const from = Math.max(i - before, last + 1);
    const to = Math.min(i + after, lines.length - 1);
    if (res.length && from > last + 1 && (before || after)) res.push('--');
    for (let j = from; j <= to; j++) {
      if (j <= last) continue;
      res.push(numbered ? `${j + 1}${matched[j] ? ':' : '-'}${lines[j]}` : lines[j]);
      last = j;
    }
  });
  return res;
}

// Parses grep's arguments into a line filter. Reports an error and returns null if invalid.
function parseGrep(args, extended) {
  const opts = new Set(extended ? ['E'] : []);
  const context = {};
  const pos = [];
  let pattern = null;
  const setContext = (key, value) => {
    if (!/^\d+$/.test(value ?? '')) { err(`grep: ${value ?? ''}: invalid context length argument`); return false; }
    context[key] = +value;
    return true;
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-e') { pattern = args[++i] ?? null; continue; }
    if (LONG[a]) { opts.add(LONG[a]); continue; }
    if (a.startsWith('--color')) continue; // colored output has no effect here
    if (a.startsWith('--')) {
      const [name, value] = a.split(/=(.*)/s);
      if (!LONG_CONTEXT[name]) { err(`grep: unrecognized option '${a}'\n${USAGE}`); return null; }
      if (!setContext(LONG_CONTEXT[name], value ?? args[++i])) return null;
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const f = a[j];
        if ('ABC'.includes(f)) { // -A3, -A 3, -iA3
          if (!setContext(f, a.slice(j + 1) || args[++i])) return null;
          break;
        }
        if (REAL_SHORT.includes(f)) { notSim(`grep -${f}`, `The command didn't run. ${SUPPORTED}`); return null; }
        if (!'ivcEnw'.includes(f)) { err(`grep: invalid option -- '${f}'\n${USAGE}`); return null; }
        opts.add(f);
      }
      continue;
    }
    pos.push(a);
  }
  if (pattern === null) pattern = pos.shift() ?? null;
  if (pattern === null) { err(USAGE); return null; }
  if (pos.length) { note('grep reads from the pipe here, and there are no files to search. If your pattern has spaces, put it in quotes.'); return null; }

  let re;
  try {
    const src = opts.has('E') ? pattern : basicToJs(pattern);
    re = new RegExp(opts.has('w') ? `(?<![A-Za-z0-9_])(?:${src})(?![A-Za-z0-9_])` : src, opts.has('i') ? 'i' : '');
  } catch {
    err('grep: invalid regular expression');
    return null;
  }
  const before = context.B ?? context.C ?? 0;
  const after = context.A ?? context.C ?? 0;
  return lines => {
    const matched = lines.map(l => re.test(l) !== opts.has('v'));
    if (opts.has('c')) return [String(matched.filter(Boolean).length)];
    return withContext(lines, matched, before, after, opts.has('n'));
  };
}

// Turns pipeline stages into one line filter, checked before anything runs.
// Reports the problem and returns null if a stage isn't usable.
export function buildPipeline(stages) {
  const filters = [];
  for (const stage of stages) {
    const [cmd, ...args] = tokenize(stage);
    if (cmd !== 'grep' && cmd !== 'egrep') {
      note(`${cmd} isn't available here, so the command didn't run. grep is the only command you can pipe to.`);
      return null;
    }
    const filter = parseGrep(args, cmd === 'egrep');
    if (!filter) return null;
    filters.push(filter);
  }
  return lines => filters.reduce((res, f) => f(res), lines);
}
