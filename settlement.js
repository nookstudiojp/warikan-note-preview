'use strict';

const roundingUnits = [1, 10, 100, 500];
const weightUnits = [1, 2, 4]; // Half-person units.

function calculate(group, rounding = 1) {
  const balances = group.members.map(({ id, name }) => ({ id, name, paid: 0, share: 0, net: 0 }));
  const byId = new Map(balances.map(balance => [balance.id, balance]));
  let total = 0;

  for (const payment of group.payments) {
    const participants = balances.filter(balance => payment.participants.includes(balance.id));
    if (!participants.length || !byId.has(payment.payer) ||
        !Number.isSafeInteger(payment.amount) || payment.amount < 1 ||
        !Number.isSafeInteger(total + payment.amount)) {
      throw new Error('支払いの金額または参加者を確認してください。');
    }
    total += payment.amount;
    byId.get(payment.payer).paid += payment.amount;
    const weights = participants.map(({ id }) => payment.weights?.[id] ?? 2);
    if (weights.some(weight => !weightUnits.includes(weight))) throw new Error('負担の重みを確認してください。');
    const weightTotal = BigInt(weights.reduce((sum, weight) => sum + weight, 0));
    const shares = weights.map(weight => Number(BigInt(payment.amount) * BigInt(weight) / weightTotal));
    const remainder = payment.amount - shares.reduce((sum, share) => sum + share, 0);
    participants.forEach((balance, index) => {
      balance.share += shares[index] + Number(index < remainder);
    });
  }

  for (const balance of balances) balance.net = balance.paid - balance.share;
  let adjustment = null;
  if (rounding !== 1 && balances.length) {
    if (!roundingUnits.includes(rounding)) throw new Error('切り上げ単位を確認してください。');
    const mostPaid = balances.reduce((first, balance) => balance.paid > first.paid ? balance : first);
    let sum = 0n;
    for (const balance of balances) {
      if (balance === mostPaid || balance.net === 0) continue;
      const absolute = BigInt(Math.abs(balance.net));
      const unit = BigInt(rounding);
      const rounded = ((absolute + unit - 1n) / unit) * unit * BigInt(Math.sign(balance.net));
      if (!Number.isSafeInteger(Number(rounded))) throw new Error('切り上げ後の金額が上限を超えています。');
      balance.net = Number(rounded);
      sum += rounded;
    }
    const change = -sum - BigInt(mostPaid.net);
    if (!Number.isSafeInteger(Number(sum)) || !Number.isSafeInteger(Number(change))) {
      throw new Error('切り上げ後の金額が上限を超えています。');
    }
    mostPaid.net = Number(-sum);
    adjustment = { id: mostPaid.id, amount: Number(change) };
  }
  const receivers = balances.filter(balance => balance.net > 0).map(balance => ({ ...balance }));
  const transfers = [];
  let receiverIndex = 0;
  for (const sender of balances.filter(balance => balance.net < 0)) {
    let remaining = -sender.net;
    while (remaining > 0) {
      const receiver = receivers[receiverIndex];
      const amount = Math.min(remaining, receiver.net);
      transfers.push({ from: sender.id, to: receiver.id, amount });
      remaining -= amount;
      receiver.net -= amount;
      if (receiver.net === 0) receiverIndex++;
    }
  }
  return { total, balances, transfers, adjustment };
}

function sampleGroup() {
  return {
    id: 'osaka', name: '大阪旅行',
    members: ['A', 'B', 'C'].map(name => ({ id: name, name })),
    payments: [
      { id: 'meal', name: '食事代', payer: 'A', amount: 6000, participants: ['A', 'B', 'C'] },
      { id: 'train', name: '交通費', payer: 'B', amount: 3000, participants: ['A', 'B', 'C'] },
      { id: 'cafe', name: 'カフェ代', payer: 'C', amount: 2000, participants: ['A', 'C'] }
    ]
  };
}

if (typeof module !== 'undefined') module.exports = { calculate, sampleGroup };
