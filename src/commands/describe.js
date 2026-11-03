// kubectl describe (pods, nodes, the interceptor deployment).
// Layouts follow real kubectl output; a few long sections are abridged.

import { S, now, DAY, IMAGE, IMAGE_ID, dateAt, labels, matchSel, usedOn, intPods, runningCount } from '../cluster.js';
import { fmtCpu, fmtMem, age, table } from '../format.js';
import { out, err, notSim } from '../terminal.js';
import { badFlags, target, noRes, notFound } from '../args.js';

function qos(p) {
  const any = p.cpuReq != null || p.memReq != null || p.cpuLim != null || p.memLim != null;
  if (!any) return 'BestEffort';
  if (p.cpuLim != null && p.memLim != null && p.cpuLim === p.cpuReq && p.memLim === p.memReq) return 'Guaranteed';
  return 'Burstable';
}

// The Limits:/Requests: block shared by pod and deployment output.
function resBlock(p, ind) {
  const L = [], lim = [], req = [];
  if (p.cpuLim != null) lim.push(['cpu:', fmtCpu(p.cpuLim)]);
  if (p.memLim != null) lim.push(['memory:', fmtMem(p.memLim)]);
  if (p.cpuReq != null) req.push(['cpu:', fmtCpu(p.cpuReq)]);
  if (p.memReq != null) req.push(['memory:', fmtMem(p.memReq)]);
  if (lim.length) { L.push(ind + 'Limits:'); lim.forEach(([k, v]) => L.push(ind + '  ' + k.padEnd(12) + v)); }
  if (req.length) { L.push(ind + 'Requests:'); req.forEach(([k, v]) => L.push(ind + '  ' + k.padEnd(12) + v)); }
  return L;
}

function eventsBlock(obj) {
  const list = S.events.filter(e => e.obj === obj && now() - e.last < 3600).sort((a, b) => a.first - b.first);
  if (!list.length) return ['Events:' + ' '.repeat(14) + '<none>'];
  const rows = list.map(e => [
    e.type, e.reason,
    e.count > 1 ? `${age(now() - e.last)} (x${e.count} over ${age(now() - e.first)})` : age(now() - e.first),
    e.from, e.msg
  ]);
  return ['Events:', table([['Type', 'Reason', 'Age', 'From', 'Message'], ['----', '------', '----', '----', '-------'], ...rows], 2, '  ')];
}

function describePod(p) {
  const L = [];
  const f = (k, v) => L.push((k + ':').padEnd(18) + v);
  const n = p.node && S.nodes.find(x => x.name === p.node);

  f('Name', p.name);
  f('Namespace', p.ns);
  f('Priority', p.ns === 'kube-system' ? '2000001000' : '0');
  f('Service Account', p.ns === 'default' ? 'default' : p.app);
  f('Node', n ? `${n.name}/${n.ip}` : '<none>');
  if (p.started != null) f('Start Time', dateAt(p.started));
  const lab = Object.entries(labels(p)).map(([k, v]) => `${k}=${v}`);
  f('Labels', lab[0]);
  lab.slice(1).forEach(x => L.push(' '.repeat(18) + x));
  f('Annotations', '<none>');
  f('Status', p.node ? 'Running' : 'Pending');
  f('IP', p.ip || '');
  if (p.ip) { L.push('IPs:'); L.push('  IP:           ' + p.ip); } else f('IPs', '<none>');
  f('Controlled By', p.owner);

  // An unscheduled pod has no container status: no ID, State, Ready, or Restart Count.
  L.push('Containers:');
  L.push(`  ${p.cname}:`);
  const c = (k, v) => L.push('    ' + (k + ':').padEnd(16) + v);
  if (p.node) c('Container ID', p.cid);
  c('Image', p.image);
  if (p.node) c('Image ID', p.app === 'interceptor' ? IMAGE_ID : p.image.split(':')[0] + '@sha256:' + 'c3f1'.repeat(16));
  c('Port', p.port || '<none>');
  c('Host Port', p.port ? '0/TCP' : '<none>');
  if (p.node) {
    c('State', 'Running');
    L.push('      ' + 'Started:'.padEnd(14) + dateAt(p.started));
    c('Ready', 'True');
    c('Restart Count', '0');
  }
  L.push(...resBlock(p, '    '));
  c('Environment', '<none>');
  L.push('    Mounts:');
  L.push(`      /var/run/secrets/kubernetes.io/serviceaccount from kube-api-access-${p.name.slice(-5)} (ro)`);

  L.push('Conditions:');
  const conds = p.node
    ? ['PodReadyToStartContainers', 'Initialized', 'Ready', 'ContainersReady', 'PodScheduled'].map(t => [t, 'True'])
    : [['PodScheduled', 'False']];
  L.push(table([['Type', 'Status'], ...conds], 3, '  '));
  L.push('Volumes:');
  L.push(`  kube-api-access-${p.name.slice(-5)}:`);
  L.push('    Type:                    Projected (a volume that contains injected data from multiple sources)');
  const g = (k, v) => L.push((k + ':').padEnd(29) + v);
  g('QoS Class', qos(p));
  g('Node-Selectors', '<none>');
  g('Tolerations', 'node.kubernetes.io/not-ready:NoExecute op=Exists for 300s');
  L.push(' '.repeat(29) + 'node.kubernetes.io/unreachable:NoExecute op=Exists for 300s');
  L.push(...eventsBlock('pod/' + p.name));
  return L.join('\n');
}

// The puzzle's key screen: "Allocated resources" shows requests, not usage.
function describeNode(n) {
  const L = [];
  const f = (k, v) => L.push((k + ':').padEnd(20) + v);
  f('Name', n.name);
  f('Roles', '<none>');
  f('Labels', 'fleet.local/class=carrier');
  ['kubernetes.io/arch=amd64', 'kubernetes.io/hostname=' + n.name, 'kubernetes.io/os=linux'].forEach(x => L.push(' '.repeat(20) + x));
  f('Annotations', 'node.alpha.kubernetes.io/ttl: 0');
  f('CreationTimestamp', dateAt(-(41 * DAY + 7200)));
  f('Taints', '<none>');
  f('Unschedulable', 'false');

  // Abridged: real output also has LastHeartbeatTime and LastTransitionTime columns.
  L.push('Conditions:');
  L.push(table([
    ['Type', 'Status', 'Reason', 'Message'], ['----', '------', '------', '-------'],
    ['MemoryPressure', 'False', 'KubeletHasSufficientMemory', 'kubelet has sufficient memory available'],
    ['DiskPressure', 'False', 'KubeletHasNoDiskPressure', 'kubelet has no disk pressure'],
    ['PIDPressure', 'False', 'KubeletHasSufficientPID', 'kubelet has sufficient PID available'],
    ['Ready', 'True', 'KubeletReady', 'kubelet is posting ready status']
  ], 3, '  '));
  L.push('Addresses:');
  L.push('  InternalIP:  ' + n.ip);
  L.push('  Hostname:    ' + n.name);
  L.push('Capacity:');
  L.push(table([['cpu:', fmtCpu(2000)], ['ephemeral-storage:', '101430960Ki'], ['memory:', '8131288Ki'], ['pods:', '110']], 2, '  '));
  L.push('Allocatable:');
  L.push(table([['cpu:', fmtCpu(n.cpu)], ['ephemeral-storage:', '93478772582'], ['memory:', n.mem * 1024 + 'Ki'], ['pods:', '110']], 2, '  '));
  L.push('PodCIDR:'.padEnd(30) + n.cidr + '.0/24');

  const pods = S.pods.filter(p => p.node === n.name).sort((a, b) => a.ns.localeCompare(b.ns) || a.name.localeCompare(b.name));
  // kubectl truncates these percentages rather than rounding.
  const pc = (v, a) => Math.floor((100 * (v || 0)) / a);
  L.push('Non-terminated Pods:'.padEnd(30) + `(${pods.length} in total)`);
  L.push(table([
    ['Namespace', 'Name', 'CPU Requests', 'CPU Limits', 'Memory Requests', 'Memory Limits', 'Age'],
    ['---------', '----', '------------', '----------', '---------------', '-------------', '---'],
    ...pods.map(p => [
      p.ns, p.name,
      `${fmtCpu(p.cpuReq || 0)} (${pc(p.cpuReq, n.cpu)}%)`, `${fmtCpu(p.cpuLim || 0)} (${pc(p.cpuLim, n.cpu)}%)`,
      `${fmtMem(p.memReq || 0)} (${pc(p.memReq, n.mem)}%)`, `${fmtMem(p.memLim || 0)} (${pc(p.memLim, n.mem)}%)`,
      age(now() - p.created)
    ])
  ], 2, '  '));

  const u = usedOn(n.name);
  const lc = pods.reduce((a, p) => a + (p.cpuLim || 0), 0);
  const lm = pods.reduce((a, p) => a + (p.memLim || 0), 0);
  L.push('Allocated resources:');
  L.push('  (Total limits may be over 100 percent, i.e., overcommitted.)');
  L.push(table([
    ['Resource', 'Requests', 'Limits'], ['--------', '--------', '------'],
    ['cpu', `${fmtCpu(u.cpu)} (${pc(u.cpu, n.cpu)}%)`, `${fmtCpu(lc)} (${pc(lc, n.cpu)}%)`],
    ['memory', `${fmtMem(u.mem)} (${pc(u.mem, n.mem)}%)`, `${fmtMem(lm)} (${pc(lm, n.mem)}%)`],
    ['ephemeral-storage', '0 (0%)', '0 (0%)'],
    ['hugepages-1Gi', '0 (0%)', '0 (0%)'],
    ['hugepages-2Mi', '0 (0%)', '0 (0%)']
  ], 2, '  '));
  L.push('Events:' + ' '.repeat(14) + '<none>');
  return L.join('\n');
}

function describeDeploy() {
  const L = [];
  const f = (k, v) => L.push((k + ':').padEnd(24) + v);
  const t = S.dep.tpl;
  const run = runningCount();
  const cur = intPods().filter(p => p.hash === S.dep.hash).length;
  const total = intPods().length;

  f('Name', 'interceptor');
  f('Namespace', 'default');
  f('CreationTimestamp', dateAt(S.dep.created));
  f('Labels', 'app=interceptor');
  f('Annotations', 'deployment.kubernetes.io/revision: ' + S.dep.revision);
  f('Selector', 'app=interceptor');
  f('Replicas', `${S.dep.replicas} desired | ${cur} updated | ${total} total | ${run} available | ${Math.max(0, S.dep.replicas - run)} unavailable`);
  f('StrategyType', 'RollingUpdate');
  f('MinReadySeconds', '0');
  f('RollingUpdateStrategy', '25% max unavailable, 25% max surge');
  L.push('Pod Template:');
  L.push('  Labels:  app=interceptor');
  L.push('  Containers:');
  L.push('   interceptor:');
  const c = (k, v) => L.push('    ' + (k + ':').padEnd(12) + v);
  c('Image', IMAGE);
  c('Port', '8080/TCP');
  c('Host Port', '0/TCP');
  L.push(...resBlock(t, '    '));
  L.push('    Environment:  <none>');
  L.push('    Mounts:       <none>');
  L.push('  Volumes:        <none>');
  L.push('  Node-Selectors: <none>');
  L.push('  Tolerations:    <none>');

  // Available needs replicas - maxUnavailable pods up (25% of 5, rounded down, is 1).
  const minAvail = S.dep.replicas - Math.floor(S.dep.replicas * 0.25);
  L.push('Conditions:');
  L.push(table([
    ['Type', 'Status', 'Reason'], ['----', '------', '------'],
    ['Available', run >= minAvail ? 'True' : 'False', run >= minAvail ? 'MinimumReplicasAvailable' : 'MinimumReplicasUnavailable'],
    ['Progressing', 'True', run === S.dep.replicas ? 'NewReplicaSetAvailable' : 'ReplicaSetUpdated']
  ], 2, '  '));
  const olds = S.rs.filter(x => x.hash !== S.dep.hash && S.pods.some(p => p.hash === x.hash));
  f('OldReplicaSets', olds.length ? olds.map(x => `interceptor-${x.hash}`).join(', ') : '<none>');
  f('NewReplicaSet', `interceptor-${S.dep.hash} (${cur}/${S.dep.replicas} replicas created)`);
  L.push(...eventsBlock('deployment/interceptor'));
  return L.join('\n');
}

export function kDescribe(o) {
  if (o.help) return out('Show details of a specific resource or group of resources.\n\nUsage:\n  kubectl describe (-f FILENAME | TYPE [NAME_PREFIX | -l label] | TYPE/NAME) [options]');
  if (badFlags(o)) return;
  const tg = target(o);
  if (!tg) return err('You must specify the type of resource to describe. Use "kubectl api-resources" for a complete list of supported resources.\n\nerror: Required resource not specified.');
  if (!tg.type) return err(`error: the server doesn't have a resource type "${tg.raw}"`);

  // Like real kubectl describe: exact name first, then treat the name as a prefix.
  const resolve = (list, kind) => {
    if (!tg.names.length) return list;
    const res = [];
    for (const n of tg.names) {
      const exact = list.filter(x => x.name === n);
      const hits = exact.length ? exact : list.filter(x => x.name.startsWith(n));
      if (hits.length) res.push(...hits); else notFound(kind, n);
    }
    return res;
  };

  if (tg.type === 'pods') {
    let list = S.pods.filter(p => o.allNs || p.ns === o.ns);
    if (o.sel) list = list.filter(p => matchSel(p, o.sel));
    list = resolve(list, 'pods').sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) { if (!tg.names.length) noRes(o); return; }
    return out(list.map(describePod).join('\n\n\n'));
  }
  if (tg.type === 'nodes') {
    const list = resolve(S.nodes, 'nodes');
    if (list.length) out(list.map(describeNode).join('\n\n\n'));
    return;
  }
  if (tg.type === 'deployments') {
    const list = resolve(o.allNs || o.ns === 'default' ? [{ name: 'interceptor' }] : [], 'deployments');
    if (!list.length) { if (!tg.names.length) noRes(o); return; }
    return out(describeDeploy());
  }
  notSim(`kubectl describe ${tg.raw}`);
}
