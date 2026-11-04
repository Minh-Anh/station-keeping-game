// kubectl delete. Deleting interceptor pods works, but the ReplicaSet
// immediately replaces them (the "Stand Down" lesson). Everything else is
// refused with an RBAC error.

import { S, USER, reconcile, matchSel } from '../cluster.js';
import { out, err, notSim } from '../terminal.js';
import { badFlags, target, noRes, notFound, unknownType } from '../args.js';

// e.g. res = "deployments.apps" -> resource "deployments" in API group "apps"
function forbidden(verb, res, name, ns) {
  const [resource, ...group] = res.split('.');
  const scope = ns ? `in the namespace "${ns}"` : 'at the cluster scope';
  err(`Error from server (Forbidden): ${res} "${name}" is forbidden: User "${USER}" cannot ${verb} resource "${resource}" in API group "${group.join('.')}" ${scope}`);
}

export function kDelete(o) {
  if (o.help) return out('Delete resources by file names, stdin, resources and names, or by resources and label selector.\n\nUsage:\n  kubectl delete ([-f FILENAME] | [-k DIRECTORY] | TYPE [(NAME | -l label | --all)]) [options]');
  if (badFlags(o, ['force', 'grace-period', 'now', 'wait'])) return;
  const tg = target(o);
  if (!tg) return err('error: You must provide one or more resources by argument or filename.');
  if (!tg.type) return unknownType(tg.raw, o);
  if (!tg.names.length && !o.all && !o.sel) return err('error: resource(s) were provided, but no name was specified');

  if (tg.type === 'pods') {
    let list = S.pods.filter(p => p.ns === o.ns);
    if (o.sel) list = list.filter(p => matchSel(p, o.sel));
    if (!o.all && !o.sel) {
      const res = [];
      for (const n of tg.names) {
        const p = list.find(x => x.name === n);
        if (p) res.push(p); else notFound('pods', n);
      }
      list = res;
    }
    if (!list.length) { if (o.all || o.sel) noRes(o); return; }
    if (o.ns === 'kube-system') return forbidden('delete', 'pods', list[0].name, 'kube-system');
    for (const p of list) {
      S.pods = S.pods.filter(x => x !== p);
      out(`pod "${p.name}" deleted`);
    }
    reconcile();
    return;
  }

  const name = tg.names[0];
  if (tg.type === 'deployments') {
    const n = name || 'interceptor';
    if (o.ns !== 'default' || n !== 'interceptor') return notFound('deployments', n);
    return forbidden('delete', 'deployments.apps', n, 'default');
  }
  if (tg.type === 'nodes') return forbidden('delete', 'nodes', name || 'carrier-alpha', null);
  if (tg.type === 'replicasets') return forbidden('delete', 'replicasets.apps', name || 'interceptor', o.ns);
  if (tg.type === 'daemonsets') return forbidden('delete', 'daemonsets.apps', name || 'relay-agent', o.ns);
  notSim(`kubectl delete ${tg.raw}`);
}
