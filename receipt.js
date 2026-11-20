'use strict';

let receiptLibrary;

function loadReceiptLibrary() {
  if (receiptLibrary) return receiptLibrary;
  receiptLibrary = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => {
      script.remove();
      receiptLibrary = null;
      reject(new Error('レシート読み取り機能を読み込めませんでした。'));
    };
    document.head.append(script);
  });
  return receiptLibrary;
}

function receiptAmounts(text) {
  const candidates = new Map();
  for (const line of text.normalize('NFKC').split('\n')) {
    const total = /合\s*計|総\s*額|お\s*会\s*計|お\s*買\s*上|支\s*払\s*[額金]|(?:grand\s*)?total/i.test(line);
    if (/小\s*計|sub\s*total|お\s*釣|お\s*預|change/i.test(line)) continue;
    const matches = line.matchAll(/(?:[¥￥]\s*)?(\d[\d,]*)(?:\s*円)?/g);
    for (const [token, digits] of matches) {
      if (!total && !/[¥￥円]/.test(token)) continue;
      const amount = Number(digits.replaceAll(',', ''));
      if (!Number.isSafeInteger(amount) || amount < 1) continue;
      const score = total ? 2 : 1;
      candidates.set(amount, Math.max(score, candidates.get(amount) ?? 0));
    }
  }
  return [...candidates].sort((a, b) => b[1] - a[1] || b[0] - a[0]).slice(0, 8).map(([amount]) => amount);
}

async function recognizeReceipt(file) {
  if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) {
    throw new Error('15MB以下の画像を選んでください。');
  }
  const library = await loadReceiptLibrary();
  const worker = await library.createWorker('jpn+eng');
  try {
    const { data } = await worker.recognize(file);
    return receiptAmounts(data.text);
  } finally {
    await worker.terminate();
  }
}
