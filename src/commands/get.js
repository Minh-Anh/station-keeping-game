// kubectl get

import { S, now, IMAGE, NAMESPACES, labels, matchSel, intPods, runningCount } from '../cluster.js';
import { age, table } from '../format.js';
import { out, err, notSim } from '../terminal.js';
import { badFlags, target, noRes, notFound } from '../args.js';

const HELP = 'Display one or many resources.\n\nUsage:\n  kubectl get [(-o|--output=)wide|name] (TYPE[.VERSION][.GROUP] [NAME | -l label] | TYPE[.VERSION][.GROUP]/NAME ...) [flags] [options]';
const NO_TYPE = 'You must specify the type of resource to get. Use "kubectl api-resources" for a complete list of supported resources.\n\nerror: Required resource not specified.\nUse "kubectl explain <resource>" for a detailed description of that resource (e.g. kubectl explain pods).\nSee \'kubectl get -h\' for help and examples';

export function kGet(o) {
  if (o.help) return out(HELP);
  if (badFlags(o)) return;
  const tg = target(o);
  if (!tg) return err(NO_TYPE);
  if (!tg.type) return err(`error: the server doesn't have a resource type "${tg.raw}"`);
  if (o.out && !['wide', 'name'].includes(o.out)) return notSim(`-o ${o.out}`);

  const wide = o.out === 'wide', asName = o.out === 'name';
  const nsCol = o.allNs ? ['NAMESPACE'] : [];
  // When names are given, return only those, printing NotFound for the rest.
  const pick = (list, kind) => {
    if (!tg.names.length) return list;
    const res = [];
    for (const n of tg.names) {
      const x = list.find(i => i.name === n);
      if (x) res.push(x); else notFound(kind, n);
    }
    return res;
  };

  switch (tg.type) {
    case 'pods': {
      let list = S.pods.filter(p => o.allNs || p.ns === o.ns);
      if (o.sel) list = list.filter(p => matchSel(p, o.sel));
      list = pick(list, 'pods');
      if (!list.length) { if (!tg.names.length) noRes(o); return; }
      list.sort((a, b) => a.ns.localeCompare(b.ns) || a.name.localeCompare(b.name));
      if (asName) return out(list.map(p => 'pod/' + p.name).join('\n'));
      const head = [...nsCol, 'NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE'];
      if (wide) head.push('IP', 'NODE', 'NOMINATED NODE', 'READINESS GATES');
      if (o.labels) head.push('LABELS');
      const rows = list.map(p => {
        const row = [...(o.allNs ? [p.ns] : []), p.name, p.node ? '1/1' : '0/1', p.node ? 'Running' : 'Pending', '0', age(now() - p.created)];
        if (wide) row.push(p.ip || '<none>', p.node || '<none>', '<none>', '<none>');
        if (o.labels) row.push(Object.entries(labels(p)).map(([k, v]) => `${k}=${v}`).join(','));
        return row;
      });
      return out(table([head, ...rows]));
    }

    case 'nodes': {
      const list = pick(S.nodes, 'nodes');
      if (!list.length) return;
      if (asName) return out(list.map(n => 'node/' + n.name).join('\n'));
      const head = ['NAME', 'STATUS', 'ROLES', 'AGE', 'VERSION'];
      if (wide) head.push('INTERNAL-IP', 'EXTERNAL-IP', 'OS-IMAGE', 'KERNEL-VERSION', 'CONTAINER-RUNTIME');
      if (o.labels) head.push('LABELS');
      return out(table([head, ...list.map(n => {
        const row = [n.name, 'Ready', '<none>', '41d', 'v1.33.2'];
        if (wide) row.push(n.ip, '<none>', 'Ubuntu 24.04.1 LTS', '6.8.0-1015-aws', 'containerd://1.7.24');
        if (o.labels) row.push(`fleet.local/class=carrier,kubernetes.io/arch=amd64,kubernetes.io/hostname=${n.name},kubernetes.io/os=linux`);
        return row;
      })]));
    }

    case 'deployments': {
      let list = o.allNs || o.ns === 'default' ? [{ name: 'interceptor' }] : [];
      list = pick(list, 'deployments');
      if (!list.length) { if (!tg.names.length) noRes(o); return; }
      if (asName) return out('deployment.apps/interceptor');
      const head = [...nsCol, 'NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE'];
      if (wide) head.push('CONTAINERS', 'IMAGES', 'SELECTOR');
      const run = runningCount();
      const upd = intPods().filter(p => p.hash === S.dep.hash).length;
      const row = [...(o.allNs ? ['default'] : []), 'interceptor', `${run}/${S.dep.replicas}`, String(upd), String(run), age(now() - S.dep.created)];
      if (wide) row.push('interceptor', IMAGE, 'app=interceptor');
      return out(table([head, row]));
    }

    case 'replicasets': {
      let list = o.allNs || o.ns === 'default' ? S.rs.map(x => ({ ...x, name: 'interceptor-' + x.hash })) : [];
      list = pick(list, 'replicasets');
      if (!list.length) { if (!tg.names.length) noRes(o); return; }
      if (asName) return out(list.map(x => 'replicaset.apps/' + x.name).join('\n'));
      const head = [...nsCol, 'NAME', 'DESIRED', 'CURRENT', 'READY', 'AGE'];
      return out(table([head, ...list.map(x => {
        const pods = S.pods.filter(p => p.hash === x.hash);
        const desired = x.hash === S.dep.hash ? S.dep.replicas : 0;
        return [...(o.allNs ? ['default'] : []), x.name, String(desired), String(pods.length), String(pods.filter(p => p.node).length), age(now() - x.created)];
      })]));
    }

    case 'daemonsets': {
      let list = o.allNs || o.ns === 'kube-system'
        ? [{ name: 'kube-proxy', sel: 'kubernetes.io/os=linux' }, { name: 'relay-agent', sel: '<none>' }]
        : [];
      list = pick(list, 'daemonsets');
      if (!list.length) { if (!tg.names.length) noRes(o); return; }
      if (asName) return out(list.map(x => 'daemonset.apps/' + x.name).join('\n'));
      const head = [...nsCol, 'NAME', 'DESIRED', 'CURRENT', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'NODE SELECTOR', 'AGE'];
      return out(table([head, ...list.map(x => [...(o.allNs ? ['kube-system'] : []), x.name, '3', '3', '3', '3', '3', x.sel, '41d'])]));
    }

    case 'events': {
      // Events expire after 1h, as with the API server's default TTL.
      const list = o.allNs || o.ns === 'default'
        ? S.events.filter(e => now() - e.last < 3600).sort((a, b) => a.last - b.last)
        : [];
      if (!list.length) return noRes(o);
      const head = [...nsCol, 'LAST SEEN', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE'];
      return out(table([head, ...list.map(e => [...(o.allNs ? ['default'] : []), age(now() - e.last), e.type, e.reason, e.obj, e.msg])]));
    }

    case 'services': {
      const all = [
        { ns: 'default', name: 'kubernetes', ip: '10.96.0.1', ports: '443/TCP' },
        { ns: 'kube-system', name: 'kube-dns', ip: '10.96.0.10', ports: '53/UDP,53/TCP,9153/TCP' }
      ];
      let list = all.filter(s => o.allNs || s.ns === o.ns);
      list = pick(list, 'services');
      if (!list.length) { if (!tg.names.length) noRes(o); return; }
      return out(table([
        [...nsCol, 'NAME', 'TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORT(S)', 'AGE'],
        ...list.map(s => [...(o.allNs ? [s.ns] : []), s.name, 'ClusterIP', s.ip, '<none>', s.ports, '41d'])
      ]));
    }

    case 'namespaces': {
      const list = pick(NAMESPACES.map(name => ({ name })), 'namespaces');
      if (!list.length) return;
      return out(table([['NAME', 'STATUS', 'AGE'], ...list.map(n => [n.name, 'Active', '41d'])]));
    }
  }
}
