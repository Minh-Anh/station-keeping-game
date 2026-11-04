// kubectl top: actual usage from the metrics pipeline. This is the view that
// misleads players: carriers look ~10% busy while 84% of CPU is reserved.

import { S, r, podReady } from '../cluster.js';
import { table } from '../format.js';
import { out, err } from '../terminal.js';
import { badFlags, normType, noRes, notFound } from '../args.js';
import { matchSel } from '../cluster.js';

const HELP = 'Display resource (CPU/memory) usage.\n\n This command provides a view of recent resource usage of nodes and pods.\n\nAvailable Commands:\n  node          Display resource (CPU/memory) usage of nodes\n  pod           Display resource (CPU/memory) usage of pods\n\nUsage:\n  kubectl top [flags] [options]';

const jitter = () => r(5) - 2; // a few millicores of noise per call

export function kTop(o) {
  const [, t, ...names] = o.pos;
  if (!t || o.help) return out(HELP);
  if (badFlags(o)) return;
  const k = normType(t);

  if (k === 'nodes') {
    let list = S.nodes;
    if (names.length) {
      list = [];
      for (const n of names) {
        const x = S.nodes.find(y => y.name === n);
        if (x) list.push(x); else notFound('nodes', n);
      }
      if (!list.length) return;
    }
    // Node usage = OS/kubelet baseline + what each pod actually uses.
    return out(table([['NAME', 'CPU(cores)', 'CPU(%)', 'MEMORY(bytes)', 'MEMORY(%)'], ...list.map(n => {
      const pods = S.pods.filter(p => p.node === n.name && podReady(p));
      const c = n.base.cpu + pods.reduce((a, p) => a + p.use.cpu, 0) + jitter();
      const m = Math.round(n.base.mem + pods.reduce((a, p) => a + p.use.mem, 0));
      return [n.name, c + 'm', Math.floor((100 * c) / n.cpu) + '%', m + 'Mi', Math.floor((100 * m) / n.mem) + '%'];
    })]));
  }

  if (k === 'pods') {
    let list = S.pods.filter(p => o.allNs || p.ns === o.ns);
    if (o.sel) list = list.filter(p => matchSel(p, o.sel));
    if (names.length) {
      const res = [];
      for (const n of names) {
        const p = list.find(x => x.name === n);
        if (!p) notFound('pods', n);
        else if (!p.node) err('error: metrics not available yet'); // Pending pods have no metrics
        else if (!podReady(p)) err(`Error from server (NotFound): podmetrics.metrics.k8s.io "${p.ns}/${p.name}" not found`); // no running container to measure
        else res.push(p);
      }
      if (!res.length) return;
      list = res;
    }
    list = list.filter(p => p.node && podReady(p)).sort((a, b) => a.ns.localeCompare(b.ns) || a.name.localeCompare(b.name));
    if (!list.length) return noRes(o);
    return out(table([
      [...(o.allNs ? ['NAMESPACE'] : []), 'NAME', 'CPU(cores)', 'MEMORY(bytes)'],
      ...list.map(p => [...(o.allNs ? [p.ns] : []), p.name, Math.max(1, p.use.cpu + jitter()) + 'm', p.use.mem + 'Mi'])
    ]));
  }

  err(`error: unknown command "${t}" for "kubectl top"`);
}
