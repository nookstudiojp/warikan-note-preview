'use strict';

const sharePrefix = '#share=';
const maxShareLength = 64000;
const memberColors = ['#5978b9', '#bc5680', '#42866c', '#b97331', '#885db2', '#a16b64', '#557b8c'];

function sharedGroupFromUrl() {
  if (!location.hash.startsWith(sharePrefix)) return null;
  const encoded = location.hash.slice(sharePrefix.length);
  if (!encoded.length || encoded.length > maxShareLength || !/^[\w-]+$/.test(encoded)) throw new Error();
  const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'));
  const { v, group } = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(binary, char => char.charCodeAt(0))));
  const text = value => typeof value === 'string' && value.length > 0 && value.length <= 100;
  if (v !== 1 || !group || !text(group.name) ||
      !Array.isArray(group.members) || !Array.isArray(group.payments) ||
      !roundingUnits.includes(group.rounding ?? 1) || !Array.isArray(group.paidTransfers ?? [])) throw new Error();
  const ids = new Set();
  for (const member of group.members) {
    if (!member || !text(member.id) || !text(member.name) || ids.has(member.id)) throw new Error();
    ids.add(member.id);
  }
  for (const payment of group.payments) {
    if (!payment || !ids.has(payment.payer) || !Array.isArray(payment.participants) ||
        payment.participants.some(id => !ids.has(id))) throw new Error();
  }
  calculate(group, group.rounding);
  return group;
}

function shareLink(group) {
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, group }));
  const encoded = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  if (encoded.length > maxShareLength) throw new Error('データが多すぎるため共有リンクを作成できません。');
  const url = new URL(location.href);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('共有リンクは公開版から作成してください。');
  }
  url.hash = sharePrefix.slice(1) + encoded;
  return url.href;
}
