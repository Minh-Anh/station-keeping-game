// The simulated cluster: nodes, pods, events, the interceptor Deployment, and
// the three controllers that matter for this puzzle (scheduler, ReplicaSet
// reconcile, Deployment rollout). Everything else is just output formatting.

export const ALPH = 'bcdfghjklmnpqrstvwxz2456789'; // the alphabet Kubernetes uses for generated names
export const DAY = 86400;
export const IMAGE = 'registry.fleet.local/interceptor:2.4.1';
export const USER = 'sector7-operator';
export const START_HASH = '6b8c4d9f7';
export const NAMESPACES = ['default', 'kube-node-lease', 'kube-public', 'kube-system'];

// name, InternalIP, pod CIDR prefix
const NODE_DEFS = [
  ['carrier-alpha', '10.0.4.11', '10.244.1'],
  ['carrier-bravo', '10.0.4.12', '10.244.2'],
  ['carrier-charlie', '10.0.4.13', '10.244.3']
];

// Game clock: times are seconds relative to the moment the puzzle started
// (negative = before the puzzle began).
export let T0 = 0;
export let S = null;
export const now = () => (Date.now() - T0) / 1000;

export const r = n => Math.floor(Math.random() * n);
export const rnd = n => Array.from({ length: n }, () => ALPH[r(ALPH.length)]).join('');
export const hex = n => Array.from({ length: n }, () => '0123456789abcdef'[r(16)]).join('');
export const IMAGE_ID = 'registry.fleet.local/interceptor@sha256:' + hex(64);

// RFC1123-ish timestamp in the viewer's timezone, as kubectl describe prints it.
export function dateAt(sec) {
  const d = new Date(T0 + sec * 1000);
  const D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = n => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset(), oa = Math.abs(off);
  return `${D[d.getDay()]}, ${p(d.getDate())} ${M[d.getMonth()]} ${d.getFullYear()} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${off >= 0 ? '+' : '-'}${p(Math.floor(oa / 60))}${p(oa % 60)}`;
}

// pod-template-hash: a stable name for each distinct pod template. The starting
// template keeps the hash shown in the puzzle brief.
function hashTpl(t) {
  const key = [t.cpuReq, t.memReq, t.cpuLim, t.memLim].join('|');
  if (key === '1000|256||256') return START_HASH;
  let h = 2166136261 >>> 0, s = '';
  for (const ch of key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  for (let i = 0; i < 10; i++) { h = Math.imul(h ^ (i + 7), 2654435761) >>> 0; s += ALPH[h % ALPH.length]; }
  return s;
}

function podIp(n) {
  S.ipc[n.name] = (S.ipc[n.name] || 10) + 1;
  return `${n.cidr}.${S.ipc[n.name]}`;
}

// A new interceptor pod stamped from the Deployment's current template.
// `use` is what the container actually consumes; the scheduler never sees it.
function mkPod(name, created) {
  const t = S.dep.tpl;
  const p = {
    name, ns: 'default', app: 'interceptor', cname: 'interceptor', image: IMAGE, port: '8080/TCP',
    owner: 'ReplicaSet/interceptor-' + S.dep.hash, hash: S.dep.hash,
    cpuReq: t.cpuReq, memReq: t.memReq, cpuLim: t.cpuLim, memLim: t.memLim,
    node: null, ip: null, created, started: null, cid: null,
    use: { cpu: 94 + r(14), mem: 166 + r(22) }
  };
  if (p.cpuLim != null) p.use.cpu = Math.min(p.use.cpu, p.cpuLim); // CPU limits throttle
  if (S.raid) joinRaid(p);
  return p;
}

// DaemonSet pods in kube-system. kube-proxy runs on the host network.
function sysPod(app, image, cpuReq, memReq, n, hostNet, created, use) {
  const p = {
    name: `${app}-${rnd(5)}`, ns: 'kube-system', app, cname: app, image, port: null,
    owner: 'DaemonSet/' + app, hash: null, cpuReq, memReq, cpuLim: null, memLim: null,
    node: n.name, ip: null, created, started: created, cid: 'containerd://' + hex(64), use
  };
  p.ip = hostNet ? n.ip : podIp(n);
  return p;
}

export function labels(p) {
  return p.app === 'interceptor' ? { app: 'interceptor', 'pod-template-hash': p.hash } : { 'k8s-app': p.app };
}

// Supports k=v, k!=v and bare-key selectors, comma-separated.
export function matchSel(p, sel) {
  const l = labels(p);
  return sel.split(',').every(kv => {
    const [k, v] = kv.split(/!?=+/);
    const neg = kv.includes('!=');
    return neg ? l[k] !== v : v === undefined ? k in l : l[k] === v;
  });
}

// Sum of *requests* on a node. This is the number the scheduler uses.
export function usedOn(name) {
  let cpu = 0, mem = 0;
  for (const p of S.pods) if (p.node === name) { cpu += p.cpuReq || 0; mem += p.memReq || 0; }
  return { cpu, mem };
}

export function ev(type, reason, obj, from, msg, t = now()) {
  S.events.push({ type, reason, obj, from, msg, first: t, last: t, count: 1 });
}

function bind(p, n, t, events = true) {
  p.node = n.name; p.ip = podIp(n); p.started = t; p.cid = 'containerd://' + hex(64);
  if (!events) return;
  const o = 'pod/' + p.name;
  ev('Normal', 'Scheduled', o, 'default-scheduler', `Successfully assigned default/${p.name} to ${n.name}`, t);
  ev('Normal', 'Pulled', o, 'kubelet', `Container image "${IMAGE}" already present on machine`, t);
  ev('Normal', 'Created', o, 'kubelet', 'Created container interceptor', t);
  ev('Normal', 'Started', o, 'kubelet', 'Started container interceptor', t);
}

// Scheduler: filter nodes where requests fit, then pick the node with the most
// free CPU. Pods are instantly Running once bound (no image pull, no probes).
export function schedule(t = now()) {
  const pending = S.pods.filter(p => !p.node).sort((a, b) => a.created - b.created);
  for (const p of pending) {
    const fits = [];
    let cpuFail = 0, memFail = 0;
    for (const n of S.nodes) {
      const u = usedOn(n.name);
      const okC = n.cpu - u.cpu >= (p.cpuReq || 0);
      const okM = n.mem - u.mem >= (p.memReq || 0);
      if (!okC) cpuFail++;
      if (!okM) memFail++;
      if (okC && okM) fits.push({ n, free: n.cpu - u.cpu });
    }
    if (fits.length) {
      fits.sort((a, b) => b.free - a.free);
      bind(p, fits[0].n, t);
      continue;
    }
    const N = S.nodes.length, parts = [];
    if (cpuFail) parts.push(`${cpuFail} Insufficient cpu`);
    if (memFail) parts.push(`${memFail} Insufficient memory`);
    const msg = `0/${N} nodes are available: ${parts.join(', ')}. preemption: 0/${N} nodes are available: ${N} No preemption victims found for incoming pod.`;
    const ex = S.events.find(e => e.obj === 'pod/' + p.name && e.reason === 'FailedScheduling' && e.msg === msg);
    if (ex) { ex.count++; ex.last = t; } else ev('Warning', 'FailedScheduling', 'pod/' + p.name, 'default-scheduler', msg, t);
  }
}

// ReplicaSet controller: keep `replicas` pods of the current template alive.
export function reconcile() {
  const cur = S.pods.filter(p => p.app === 'interceptor' && p.hash === S.dep.hash);
  for (let i = cur.length; i < S.dep.replicas; i++) {
    const p = mkPod(`interceptor-${S.dep.hash}-${rnd(5)}`, now());
    S.pods.push(p);
    ev('Normal', 'SuccessfulCreate', 'replicaset/interceptor-' + S.dep.hash, 'replicaset-controller', 'Created pod: ' + p.name);
  }
  schedule();
}

// Deployment controller. Simplification: the old ReplicaSet's pods are replaced
// all at once instead of in maxSurge/maxUnavailable batches.
export function rollout(tpl) {
  const oldHash = S.dep.hash, newHash = hashTpl(tpl);
  S.dep.tpl = tpl;
  if (newHash === oldHash) return;
  S.dep.hash = newHash;
  S.dep.revision++;
  if (!S.rs.find(x => x.hash === newHash)) S.rs.push({ hash: newHash, created: now(), tpl });
  const n = S.pods.filter(p => p.hash === oldHash).length;
  S.pods = S.pods.filter(p => p.hash !== oldHash);
  ev('Normal', 'ScalingReplicaSet', 'deployment/interceptor', 'deployment-controller', `Scaled up replica set interceptor-${newHash} from 0 to ${S.dep.replicas}`);
  ev('Normal', 'ScalingReplicaSet', 'deployment/interceptor', 'deployment-controller', `Scaled down replica set interceptor-${oldHash} from ${n} to 0`);
  reconcile();
}

export const intPods = () => S.pods.filter(p => p.app === 'interceptor');
export const podReady = p => p.waitUntil == null; // false while a crashed container waits to restart
export const runningCount = () => intPods().filter(p => p.node && podReady(p) && p.hash === S.dep.hash).length;

// --- Information Overload: the raid and the OOM crash loop ---
// Each container's working set climbs as it loads contacts, then levels off at
// p.w. If the memory limit is below p.w, the container is killed on reaching
// the limit and restarts after an exponential back-off. All of this is computed
// from the clock, so sync() can catch the pods up to any moment.

export const SKIP_CPU_REQUEST = 200; // the No Room on Deck fix applied when skipping it
const RAID_GAP = 300; // seconds of game time between the two puzzles
const RAID_LEAD = 60; // the raid began this many seconds before the puzzle opens
const RAID_LIMIT_FLOOR = 256;
const RAID_MAX_START_LIMIT = 1024; // above this, the raid can't plausibly reach the limit

let checkpoint = null;

function joinRaid(p) {
  p.w = Math.round((S.raid.w * (96 + r(7))) / 100); // 96-102% of the raid's working set
  p.rate = 5 + r(3); // Mi per second
  p.crashes = 0; p.restarts = 0; p.waitUntil = null; p.prev = null; p.run = null;
}

const newRun = t => ({ boot: t, grow: t, m0: 165 + r(15) });

export const memAt = (p, run, t) => Math.min(p.w, run.m0 + p.rate * Math.max(0, t - run.grow));

function killAt(p, run) {
  if (p.memLim == null || p.memLim >= p.w) return Infinity;
  return run.grow + Math.max(3, (p.memLim - run.m0) / p.rate);
}

function tally(type, reason, obj, from, msg, t) {
  const e = S.events.find(x => x.obj === obj && x.reason === reason && x.msg === msg);
  if (e) { e.count++; e.last = t; } else ev(type, reason, obj, from, msg, t);
}

function advance(p, t) {
  if (!p.run) p.run = newRun(p.started);
  const o = 'pod/' + p.name;
  for (;;) {
    if (p.waitUntil != null) {
      if (t < p.waitUntil) return;
      const s = p.waitUntil;
      p.waitUntil = null;
      p.restarts++;
      p.run = newRun(s);
      tally('Normal', 'Created', o, 'kubelet', 'Created container interceptor', s);
      tally('Normal', 'Started', o, 'kubelet', 'Started container interceptor', s);
      continue;
    }
    const k = killAt(p, p.run);
    if (t < k) { p.use.mem = Math.round(memAt(p, p.run, t)); return; }
    p.prev = { ...p.run, kill: k };
    p.waitUntil = k + Math.min(300, 10 * 2 ** p.crashes);
    p.crashes++;
    tally('Warning', 'BackOff', o, 'kubelet', `Back-off restarting failed container interceptor in pod ${p.name}_default`, k);
  }
}

// Bring every interceptor up to the current moment. A no-op outside the raid.
export function sync(t = now()) {
  if (!S.raid) return;
  for (const p of intPods()) if (p.node) advance(p, t);
}

// STATUS column for a bound pod. OOMKilled shows briefly before the back-off.
export function podStatus(p) {
  if (podReady(p)) return 'Running';
  return now() - p.prev.kill < 2 ? 'OOMKilled' : 'CrashLoopBackOff';
}

export const raidHasTarget = () => S.dep.tpl.memLim != null && S.dep.tpl.memLim <= RAID_MAX_START_LIMIT;

// The raid hits the pods the player just fixed. Requires raidHasTarget().
export function enterOverload() {
  T0 -= RAID_GAP * 1000; // time passes between puzzles, so the rollout predates the raid
  const t = now();
  S.raid = { start: t - RAID_LEAD, w: Math.round(1.6 * Math.max(S.dep.tpl.memLim, RAID_LIMIT_FLOOR)) };
  S.won = false; S.cmds = 0; S.hints = 0;
  for (const p of intPods()) {
    joinRaid(p);
    p.run = { boot: p.started, grow: S.raid.start + r(30), m0: p.use.mem };
  }
  sync(t);
  checkpoint = { state: structuredClone(S), at: t };
}

// Jump straight to Information Overload, with No Room on Deck solved for the player.
export function skipToOverload() {
  newGame();
  rollout({ ...S.dep.tpl, cpuReq: SKIP_CPU_REQUEST });
  enterOverload();
}

// Restart Information Overload from the moment it opened, keeping the 3a fix.
export function restartOverload() {
  S = structuredClone(checkpoint.state);
  T0 = Date.now() - checkpoint.at * 1000;
}

// Won as soon as every pod is running with a limit that clears its working set.
export function overloadState() {
  const pods = intPods().filter(p => p.hash === S.dep.hash);
  const won = pods.length === S.dep.replicas && pods.every(p => p.node && podReady(p) && p.run && killAt(p, p.run) === Infinity);
  return { won, restarts: pods.reduce((a, p) => a + (p.restarts || 0), 0) };
}

// Puzzle setup. Each carrier: 1900m allocatable, 600m held by relay-agent,
// 1000m by one interceptor -> 300m left, so the 4th and 5th interceptors
// (1000m each) can't land anywhere even though real usage is ~10%.
export function newGame() {
  T0 = Date.now();
  S = {
    nodes: NODE_DEFS.map(([name, ip, cidr]) => ({ name, ip, cidr, cpu: 1900, mem: 7168, base: { cpu: 34 + r(10), mem: 1040 + r(60) } })),
    pods: [], events: [], ipc: {}, cmds: 0, hints: 0, won: false, raid: null,
    dep: {
      replicas: 5, created: -(41 * DAY + 5400), revision: 1, hash: START_HASH,
      tpl: { cpuReq: 1000, memReq: 256, cpuLim: null, memLim: 256 }
    },
    rs: [{ hash: START_HASH, created: -(41 * DAY + 5400), tpl: { cpuReq: 1000, memReq: 256, cpuLim: null, memLim: 256 } }]
  };

  const sysAge = -(41 * DAY + 3600);
  for (const n of S.nodes) {
    S.pods.push(sysPod('kube-proxy', 'registry.k8s.io/kube-proxy:v1.33.2', null, null, n, true, sysAge, { cpu: 2 + r(3), mem: 15 + r(6) }));
    S.pods.push(sysPod('relay-agent', 'registry.fleet.local/relay-agent:1.9.0', 600, 128, n, false, sysAge, { cpu: 38 + r(12), mem: 86 + r(12) }));
  }

  const old = -(4 * 3600 + 17 * 60);
  ['x2k9p', 'm7qtr', 'zl4bn'].forEach((s, i) => {
    const p = mkPod(`interceptor-${START_HASH}-${s}`, old);
    bind(p, S.nodes[i], old, false); // events older than 1h have expired, as in a real cluster
    S.pods.push(p);
  });
  ['r4dnc', 'hh2vs'].forEach(s => S.pods.push(mkPod(`interceptor-${START_HASH}-${s}`, -35)));

  ev('Normal', 'ScalingReplicaSet', 'deployment/interceptor', 'deployment-controller', `Scaled up replica set interceptor-${START_HASH} from 3 to 5`, -35);
  for (const s of ['r4dnc', 'hh2vs']) {
    ev('Normal', 'SuccessfulCreate', 'replicaset/interceptor-' + START_HASH, 'replicaset-controller', `Created pod: interceptor-${START_HASH}-${s}`, -35);
  }
  schedule(-35);
}
