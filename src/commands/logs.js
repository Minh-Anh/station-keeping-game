// kubectl logs. Healthy pods log steadily. During the raid, the logs look healthy
// and then stop mid-line, because the kernel kills the process without warning.

import { S, T0, now, memAt, podReady, matchSel, USER } from '../cluster.js';
import { out, err, note } from '../terminal.js';
import { badFlags, notFound } from '../args.js';

const HELP = 'Print the logs for a container in a pod or specified resource.\n\nExamples:\n  # Return snapshot logs from pod nginx\n  kubectl logs nginx\n\n  # Return snapshot logs from the previous terminated container\n  kubectl logs -p nginx\n\nUsage:\n  kubectl logs [-f] [-p] (POD | TYPE/NAME) [-c CONTAINER] [options]';
const STEP = 5; // seconds between log lines
const WINDOW = 120; // seconds of history kept

const stamp = t => new Date(T0 + t * 1000).toISOString().replace(/\.\d+Z$/, 'Z');

// Log text for one container run, ending at `end`. A killed run ends mid-line.
function render(p, run, end, killed) {
  const L = [];
  const first = Math.max(run.boot, end - WINDOW);
  const contacts = t => (p.w ? 20 + Math.round((memAt(p, run, t) - run.m0) * 5) : 20); // p.w: joined the raid
  if (first === run.boot) L.push(`${stamp(run.boot)} INFO  interceptor 2.4.1 starting, sensor feed connected`);
  for (let t = first + STEP; t <= end; t += STEP) {
    L.push(`${stamp(t)} INFO  tracker: contacts=${contacts(t)} ingest=48/s lag=3ms`);
  }
  if (killed) L.push(`${stamp(end)} INFO  tracker: contacts=${contacts(end)} ing`);
  return L;
}

export function kLogs(o) {
  if (o.help) return out(HELP);
  const prevShort = o.short.includes('p');
  const follow = o.short.includes('f') || o.flags.follow;
  o.short = o.short.filter(s => s !== 'p' && s !== 'f');
  if (badFlags(o, ['previous', 'follow', 'tail', 'timestamps'])) return;

  let name = o.pos[1];
  let list = S.pods.filter(p => p.ns === o.ns);
  if (!name && o.sel) {
    list = list.filter(p => matchSel(p, o.sel));
    if (!list.length) return out(`No resources found in ${o.ns} namespace.`);
    name = list[0].name;
  }
  if (!name) return err('error: expected \'logs [-f] [-p] (POD | TYPE/NAME) [-c CONTAINER]\'.\nPOD or TYPE/NAME is a required argument for the logs command');

  let p;
  if (name.includes('/')) {
    const [kind, n] = name.split('/');
    if (['pod', 'pods', 'po'].includes(kind)) p = list.find(x => x.name === n);
    else if (['deployment', 'deployments', 'deploy'].includes(kind) && n === 'interceptor' && o.ns === 'default') p = list.find(x => x.app === 'interceptor' && x.hash === S.dep.hash);
    else return notFound('deployments', n);
    if (!p) return notFound('pods', n);
  } else {
    p = list.find(x => x.name === name);
    if (!p) return notFound('pods', name);
  }

  if (p.ns === 'kube-system') return err(`Error from server (Forbidden): pods "${p.name}" is forbidden: User "${USER}" cannot get resource "pods/log" in API group "" in the namespace "kube-system"`);
  if (o.containers && !['*', p.cname].includes(o.containers)) return err(`error: container ${o.containers} is not valid for pod ${p.name}`);
  if (!p.node) return err(`Error from server (BadRequest): container "${p.cname}" in pod "${p.name}" is waiting to start: ContainerCreating`);

  const previous = prevShort || o.flags.previous;
  let lines;
  if (previous) {
    if (!p.prev) return err(`Error from server (BadRequest): previous terminated container "${p.cname}" in pod "${p.name}" not found`);
    lines = render(p, p.prev, p.prev.kill, true);
  } else if (podReady(p)) {
    lines = render(p, p.run || { boot: p.started }, now(), false);
  } else {
    lines = render(p, p.prev, p.prev.kill, true); // during back-off, the kubelet serves the last container's logs
  }
  const tail = parseInt(o.flags.tail, 10);
  if (tail >= 0) lines = tail ? lines.slice(-tail) : [];
  if (lines.length) out(lines.join('\n'));
  if (follow) note('Following logs is not simulated here, so this is a snapshot.');
}
