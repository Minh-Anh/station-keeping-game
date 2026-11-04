// Commands typed at the prompt that aren't kubectl or a game command. A real
// operator might reach for these, and "command not found" would read as a broken
// console, so common tools get a pointer to what's possible here.

import { err, note } from '../terminal.js';

const HOST = "Carrier hosts aren't reachable from this console. kubectl describe node shows what each kubelet reports.";
const ONLY_KUBECTL = 'This console only runs kubectl, and there are no files here. To filter output, pipe it to grep.';

const SPECIFIC = {
  alias: 'k is already set up as an alias for kubectl.',
  sudo: "You don't need sudo here. Run the kubectl command on its own.",
  watch: "watch isn't simulated in this prototype. Run the command again to see the latest state.",
  man: 'Try kubectl <command> --help.',
  top: 'Did you mean kubectl top nodes or kubectl top pods?',
  helm: 'This cluster has no Helm releases. Everything here is managed with kubectl.',
  exit: 'To start over, use the Restart puzzle button or type reset.'
};
for (const c of ['ssh', 'scp', 'journalctl', 'systemctl', 'dmesg', 'crictl', 'ctr', 'docker', 'free', 'ps', 'htop', 'vmstat', 'iostat', 'df', 'du']) SPECIFIC[c] = HOST;
for (const c of ['ls', 'cat', 'cd', 'pwd', 'vi', 'vim', 'nano', 'emacs', 'less', 'more', 'head', 'tail', 'echo', 'printf', 'curl', 'wget', 'ping', 'nslookup', 'dig', 'nc', 'awk', 'sed', 'sort', 'uniq', 'wc', 'cut', 'tr', 'xargs', 'jq', 'yq', 'python', 'python3', 'node', 'git', 'whoami', 'id', 'env', 'export', 'history', 'source', 'bash', 'sh', 'zsh', 'for', 'while', 'if', 'date', 'sleep', 'egrep', 'fgrep', 'time', 'tee', 'touch', 'mkdir', 'rm', 'cp', 'mv']) SPECIFIC[c] = ONLY_KUBECTL;

export function shellCommand(cmd) {
  if (Object.hasOwn(SPECIFIC, cmd)) return note(SPECIFIC[cmd]);
  err(`bash: ${cmd}: command not found`);
  if (/^(ku?b|kc|ctl)/i.test(cmd)) note('Did you mean kubectl?');
}
