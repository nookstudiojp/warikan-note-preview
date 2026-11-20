'use strict';

async function saveResultImage(group, result) {
  const width = 640;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const font = (size, bold = false) => (bold ? 'bold ' : '') + size + 'px system-ui, sans-serif';
  function wrap(value, maxWidth) {
    const lines = [''];
    for (const char of value) {
      const last = lines.length - 1;
      if (lines[last] && context.measureText(lines[last] + char).width > maxWidth) lines.push(char);
      else lines[last] += char;
    }
    return lines;
  }

  context.font = font(27, true);
  const title = wrap(group.name, 544);
  context.font = font(24, true);
  const transfers = result.transfers.map(transfer => ({
    lines: wrap(nameOf(group, transfer.from) + 'さん → ' + nameOf(group, transfer.to) + 'さん', 512),
    amount: yen(transfer.amount)
  }));
  const height = 220 + 36 * title.length + (transfers.length ?
    transfers.reduce((sum, item) => sum + 96 + item.lines.length * 32, 0) : 70);
  if (height > 16000) throw new Error('送金件数が多すぎるため画像を作成できません。');

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = '#FFF8EC';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#191714';
  context.font = font(22, true);
  context.fillText('ワリカンノート', 40, 56);
  context.font = font(27, true);
  title.forEach((line, index) => context.fillText(line, 40, 102 + index * 36));
  let y = 112 + 36 * title.length;
  context.font = font(34, true);
  context.fillText('精算結果', 40, y);
  y += 42;
  context.font = font(24, true);
  context.fillText('支払総額 ' + yen(result.total), 40, y);
  y += 22;

  for (const item of transfers) {
    const cardHeight = 78 + item.lines.length * 32;
    context.fillStyle = '#C5F631';
    context.beginPath();
    context.roundRect(40, y, 560, cardHeight, 24);
    context.fill();
    context.fillStyle = '#191714';
    context.font = font(24, true);
    item.lines.forEach((line, index) => context.fillText(line, 64, y + 36 + 32 * index));
    context.font = font(36, true);
    context.fillText(item.amount, 64, y + cardHeight - 20);
    y += cardHeight + 18;
  }
  if (!transfers.length) {
    context.font = font(24, true);
    context.fillText(result.total ? '送金は不要です' : '支払いはまだありません', 40, y + 38);
  }
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('画像を作成できませんでした。');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ワリカンノート-精算結果.png';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
