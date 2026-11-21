'use strict';

const storageKey = 'nook-studio.warikan-note.v1';
const settingsKey = 'nook-studio.warikan-note.features.v1';
const featureLabels = {
  paid: '精算済みチェック', rounding: '切り上げ・幹事モード', colors: 'メンバー色分け',
  weights: '割合指定', duplicate: 'グループ複製', image: '結果画像保存',
  share: '共有リンク', receipt: 'レシート読取'
};
let features = {};
try {
  features = JSON.parse(localStorage.getItem(settingsKey)) ?? {};
} catch { /* Start with all options off if settings cannot be read. */ }
const enabled = name => features[name] === true;
const settingsButton = document.querySelector('#settings');

function settlementFor(group, useRounding = true) {
  if (group === sharedGroup) return calculate(group, group.rounding);
  const input = enabled('weights') ? group : {
    ...group, payments: group.payments.map(({ weights, ...payment }) => payment)
  };
  return calculate(input, useRounding && enabled('rounding') ? group.rounding : 1);
}

const tabs = document.querySelector('#bottom-tabs');
const screen = document.querySelector('#screen');
const editor = document.querySelector('#editor');
const form = document.querySelector('#editor-form');
const fields = document.querySelector('#fields');
const formError = document.querySelector('#form-error');
const save = document.querySelector('#save');
const notice = document.querySelector('#notice');
const yen = amount => amount.toLocaleString('ja-JP') + '円';
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const newId = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(36)).join('-');
let groups;
let sharedGroup;
let history;
let groupId = null;
let view = 'groups';
let applyEdit;
let noticeTimer;

try {
  if (enabled('share')) sharedGroup = sharedGroupFromUrl();
} catch {
  screen.innerHTML = '<h1>共有リンクを開けません</h1><p>リンクを作った人に、もう一度送ってもらってください。</p>';
}

try {
  const saved = !sharedGroup ? localStorage.getItem(storageKey) : null;
  const data = saved === null ? [sampleGroup()] : JSON.parse(saved);
  const storedGroups = Array.isArray(data) ? data : data.groups;
  const storedHistory = Array.isArray(data) ? [] : data.history;
  if (!Array.isArray(storedGroups) || !Array.isArray(storedHistory)) throw new Error();
  if (!sharedGroup) {
    groups = storedGroups;
    groupId = groups[0]?.id ?? null;
  }
  history = storedHistory;
} catch {
  screen.innerHTML = '<h1>保存データを開けません</h1><p>ブラウザでローカルストレージが利用できるか確認してください。</p>';
}

function notify(message) {
  notice.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.textContent = ''; }, 3500);
}

function commit(change) {
  const draft = JSON.parse(JSON.stringify(groups));
  const draftHistory = [...history];
  change(draft, draft.find(group => group.id === groupId), draftHistory);
  for (const group of draft) {
    if (enabled('paid') && group.paidTransfers?.length) {
      const active = new Set(settlementFor(group).transfers.map(transferKey));
      group.paidTransfers = group.paidTransfers.filter(key => active.has(key));
    }
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify({ groups: draft, history: draftHistory }));
  } catch {
    throw new Error('このブラウザに保存できませんでした。');
  }
  groups = draft;
  history = draftHistory;
}

const twoDigits = value => String(value).padStart(2, '0');

function localDate(date) {
  return [date.getFullYear(), twoDigits(date.getMonth() + 1), twoDigits(date.getDate())].join('-');
}

function addHistory(entries, group, message, date = new Date(), people = []) {
  entries.unshift({ group: group.name, message, at: date.toISOString(),
    people: people.map(id => ({ name: nameOf(group, id) + 'さん', color: colorOf(group, id) })) });
}

function paymentHistory(entries, group, payment, action, date) {
  const message = nameOf(group, payment.payer) + 'さんの支払い「' +
    payment.name + ' ' + yen(payment.amount) + '」を' + action;
  addHistory(entries, group, message, date, [payment.payer]);
}

function button(action, label, id = '', className = '', attributes = '') {
  return '<button type="button" data-action="' + action + '" data-id="' + escape(id) +
    '" class="' + className + '" ' + attributes + '>' + label + '</button>';
}

const iconPaths = {
  groups: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  manage: '<path d="M6 3l2 1 2-1 2 1 2-1 2 1 2-1v18l-2-1-2 1-2-1-2 1-2-1-2 1zM9 9h6m-6 4h6"/>',
  result: '<path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4"/>',
  history: '<path d="M3 12a9 9 0 1 1 2.6 6.4M3 7v5h5m4-5v5l3 2"/>'
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`;
}

function emptyState(iconName, message, action = '') {
  return `<div class="empty"><span class="empty-icon">${icon(iconName)}</span><p>${message}</p>${action}</div>`;
}

function render(focus = false) {
  const group = groups.find(item => item.id === groupId);
  tabs.innerHTML = [['groups', 'メンバー'], ['manage', '支払い'], ['result', '精算'], ['history', '履歴']].map(([name, label]) =>
    button(name, `<span class="tab-icon">${icon(name)}</span><span>${label}</span>`,
      '', 'tab', view === name ? 'aria-current="page"' : '')).join('');
  if (view === 'groups') {
    screen.innerHTML = (group ? groupHero(group, settlementFor(group)) : `<section class="hero welcome">
        <p class="welcome-visual" aria-hidden="true">${icon('result')}</p>
        <h1 tabindex="-1">グループ</h1><p>誰が誰にいくら返すか、<br>すぐ分かる。</p>
      </section>`) + (group ? memberView(group) : '') + `
      ${groups.length ? `<div class="bar"><h2>グループ一覧</h2>${button('group-add', '＋ 作成', '', 'primary', 'aria-label="グループを作成"')}</div>
      <div class="group-list">${groups.map(item => `<article class="card">
        <div class="group-details"><span class="group-icon">${icon('groups')}</span><div>
          ${button('open', escape(item.name), item.id, 'title-link')}
          <p class="muted">メンバー数 ${item.members.length}人 ・ 支払い ${item.payments.length}件</p>
        </div></div>
        <div class="group-total"><small>支払総額</small> <strong>${yen(settlementFor(item).total)}</strong></div>
        <div class="actions">${enabled('duplicate') ? button('group-duplicate', '複製', item.id) : ''}${button('group-edit', '編集', item.id)}${button('group-delete', '削除', item.id, 'danger')}</div>
      </article>`).join('')}</div>` : emptyState('groups', '最初のグループを作ろう！', button('group-add', '＋ グループを作成', '', 'primary'))}`;
  } else if (view === 'history') {
    screen.innerHTML = (group ? groupHero(group, settlementFor(group)) : '') + historyView();
  } else if (!group) {
    screen.innerHTML = `<h1 tabindex="-1">${view === 'manage' ? '支払い管理' : '精算結果'}</h1>
      ${emptyState(view, groups.length ? '確認したいグループを選ぼう。' : 'まずはグループを作ろう！',
        groups.length ? button('back', 'グループを選ぶ', '', 'primary') : button('group-add', '＋ グループを作成', '', 'primary'))}`;
  } else {
    const result = settlementFor(group, view === 'result');
    screen.innerHTML = groupHero(group, result) +
      (view === 'manage' ? manageView(group, result) : resultView(group, result));
  }
  if (focus) {
    screen.querySelector('h1')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function groupHero(group, { total }) {
  const count = group.members.length;
  const average = count ? (total / count).toLocaleString('ja-JP', { maximumFractionDigits: 1 }) + '円' : '—';
  return `<section class="hero group-hero">
    <h1 tabindex="-1">${escape(group.name)}</h1>
    <div class="hero-metrics"><div><span>支払総額</span><strong>${yen(total)}</strong></div>
    <div><span>1人あたり（平均）</span><strong>${average}</strong></div></div>
  </section>`;
}

function nameOf(group, id) {
  return group.members.find(member => member.id === id).name;
}

function colorOf(group, id) {
  const index = group.members.findIndex(member => member.id === id);
  const color = group.members[index]?.color;
  return memberColors.includes(color) ? color : memberColors[Math.max(0, index) % memberColors.length];
}

function avatar(color) {
  if (!enabled('colors')) return '';
  const safeColor = memberColors.includes(color) ? color : memberColors[0];
  return `<span class="avatar" style="--avatar:${safeColor}" aria-hidden="true"></span>`;
}

function memberTag(group, id, honorific = '') {
  return `<span class="member-tag">${avatar(colorOf(group, id))}<span>${escape(nameOf(group, id))}${honorific}</span></span>`;
}

function memberView(group) {
  return `<section class="panel"><h2>メンバー</h2>
      <form id="member-form" class="member-form">
        <label class="field">メンバー名<input name="member-name" placeholder="例：D" maxlength="50" required></label>
        <button class="primary" type="submit">追加</button>
        <p id="member-error" class="field-error" role="alert" hidden></p>
      </form>
      <div class="list">${group.members.map(member => `<div class="item row"><strong>${memberTag(group, member.id)}</strong>
        ${button('member-edit', '名前を変更', member.id)}</div>`).join('') || '<p class="muted">一緒に割り勘する人を登録しよう。</p>'}</div>
    </section>`;
}

function manageView(group, result) {
  return `    <section class="panel"><div class="bar"><h2>支払い</h2>${button('groups', 'メンバー管理')}</div>
      <div class="list">${group.payments.map(payment => `<div class="item row"><div>
        ${payment.registeredDate ? `<time class="payment-date" datetime="${escape(payment.registeredDate)}">${escape(payment.registeredDate.replaceAll('-', '/'))}</time>` : '<span class="payment-date">登録日不明</span>'}
        <strong>${escape(payment.name)} · ${yen(payment.amount)}</strong><br>
        <small>立て替え ${memberTag(group, payment.payer)} ／ 対象 ${payment.participants.map(id => memberTag(group, id)).join('、')}</small>
      </div><div class="actions">${button('payment-edit', '編集', payment.id)}${button('payment-delete', '削除', payment.id, 'danger')}</div></div>`).join('') ||
      emptyState('manage', group.members.length ? '最初の支払いを記録しよう。' : '上の入力欄からメンバーを追加しよう。')}</div>
    </section>
    ${button('payment-add', '＋', '', 'primary payment-fab', 'aria-label="支払いを追加"' + (group.members.length ? '' : ' disabled'))}
    <section class="panel"><h2>メンバー別の金額</h2>
      ${result.balances.map(balance => `<div class="balance"><strong>${escape(balance.name)}</strong><div class="balance-data">
        <div><small>立て替え額</small>${yen(balance.paid)}</div>
        <div><small>負担額</small>${yen(balance.share)}</div>
        <div><small>${balance.net > 0 ? '受取額' : balance.net < 0 ? '支払額' : '差額'}</small>${yen(Math.abs(balance.net))}</div>
      </div></div>`).join('') || '<p class="muted">メンバーを登録すると金額が表示されます。</p>'}
      <p class="rule"><small>${enabled('weights') ? '負担は指定した割合に応じて割ります。' : '負担は対象者で均等に割ります。'}割り切れない場合は、対象者の登録が早い順に、余りを1円ずつ割り当てます。</small></p>
    </section>`;
}

function transferText(group, transfer) {
  return nameOf(group, transfer.from) + 'さんから' + nameOf(group, transfer.to) + 'さんへ ' + yen(transfer.amount);
}

function breakdown(group, balances) {
  if (!balances.length) return '';
  const scale = balances.reduce((max, { paid, share }) => Math.max(max, paid, share), 1);
  return `<section class="panel breakdown"><h2>立て替え額・負担額</h2>
    ${balances.map(({ id, paid, share }) => `<div class="balance">
      <strong>${memberTag(group, id, 'さん')}</strong>
      <div class="comparison">${[['立て替え額', paid, 'paid'], ['負担額', share, 'share']].map(([label, amount, kind]) =>
        `<div class="comparison-row"><div><span>${label}</span><strong>${yen(amount)}</strong></div>
          <meter class="${kind}" min="0" max="${scale}" value="${amount}" aria-hidden="true"></meter></div>`).join('')}</div>
    </div>`).join('')}
  </section>`;
}

function transferKey({ from, to, amount }) {
  return JSON.stringify([from, to, amount]);
}

function resultView(group, { total, balances, transfers, adjustment }, readOnly = false) {
  const paid = new Set(enabled('paid') ? group.paidTransfers : []);
  const complete = transfers.length > 0 && transfers.every(transfer => paid.has(transferKey(transfer)));
  return `<section class="results" aria-label="送金の内訳">
    ${readOnly || !enabled('rounding') ? '' : `<section class="panel settings"><label class="field">精算の切り上げ
      <select id="rounding">${roundingUnits.map(unit => `<option value="${unit}" ${unit === (group.rounding ?? 1) ? 'selected' : ''}>
        ${unit === 1 ? '切り上げなし' : unit + '円単位'}</option>`).join('')}</select></label>
      <small>立て替え額が最も多い人を除き、受取額・支払額を切り上げます。差額はその人にまとめます。同額なら登録が早い人が対象です。</small></section>`}
    ${adjustment && adjustment.amount ? `<p class="rule adjustment"><small>${memberTag(group, adjustment.id, 'さん')}の精算差額を
      ${adjustment.amount > 0 ? '＋' : '−'}${yen(Math.abs(adjustment.amount))}調整</small></p>` : ''}
    <p class="result-total"><small>支払総額</small> <strong>${yen(total)}</strong></p>
    ${complete ? '<p class="completion" role="status">精算完了！</p>' : ''}
    ${transfers.map((transfer, index) => {
      const settled = paid.has(transferKey(transfer));
      return `<div class="transfer${settled ? ' is-paid' : ''}">
        <span class="sr-only">${escape(transferText(group, transfer))}</span>
        <div class="transfer-route" aria-hidden="true">${memberTag(group, transfer.from, 'さん')}<span class="route-arrow">→</span>${memberTag(group, transfer.to, 'さんへ')}</div>
        <div class="transfer-amount" aria-hidden="true">${transfer.amount.toLocaleString('ja-JP')}<span>円</span></div>
        ${settled ? '<span class="paid-label">✓ 支払い済み</span>' : ''}
        ${readOnly || !enabled('paid') ? '' : button('transfer-paid', settled ? '済みを取り消す' : '支払い済み', String(index), 'pay-toggle',
          'aria-label="' + escape(transferText(group, transfer) + (settled ? 'の支払い済みを取り消す' : 'を支払い済みにする')) + '"')}
      </div>`;
    }).join('') || emptyState('result',
      group.payments.length ? '全員の差額は0円です。送金は不要です。' : '支払いが登録されていません。',
      group.payments.length || readOnly ? '' : button('manage', '支払い画面を開く', '', 'primary'))}
    <div class="result-actions">${button('copy', '結果をコピー', '', 'primary', group.payments.length ? '' : 'disabled')}
      ${enabled('image') ? button('result-image', '画像で保存') : ''}
      ${enabled('share') && !readOnly ? button('share', '共有リンクをコピー') : ''}</div>
    ${enabled('share') && !readOnly ? '<p class="rule"><small>共有リンクにはメンバー名と支払い明細が含まれます。</small></p>' : ''}
    </section>${breakdown(group, balances)}`;
}

function historyMessage(entry) {
  const group = groups.find(group => group.name === entry.group);
  const legacyMember = group?.members.find(member => entry.message.startsWith(member.name + 'さんの支払い「'));
  const people = entry.people ?? (legacyMember ?
    [{ name: legacyMember.name + 'さん', color: colorOf(group, legacyMember.id) }] : []);
  let remainder = entry.message;
  let message = '';
  for (const person of people) {
    const index = remainder.indexOf(person.name);
    if (index < 0) continue;
    message += escape(remainder.slice(0, index)) + avatar(person.color) + escape(person.name);
    remainder = remainder.slice(index + person.name.length);
  }
  return message + escape(remainder);
}

function historyView() {
  return `<h1 tabindex="-1">履歴</h1>
    ${history.length ? `<section class="panel"><div class="bar"><h2>操作履歴</h2>
      ${button('history-clear', '履歴をすべて消す', '', 'danger')}</div>
      <ol class="history-list">${history.map(entry => {
        const date = new Date(entry.at);
        const time = twoDigits(date.getMonth() + 1) + '/' + twoDigits(date.getDate()) + ' ' +
          twoDigits(date.getHours()) + ':' + twoDigits(date.getMinutes());
        return `<li><div class="history-meta"><time datetime="${escape(entry.at)}">${time}</time>
          <span>${escape(entry.group)}</span></div><p>${historyMessage(entry)}</p></li>`;
      }).join('')}</ol></section>` : emptyState('history', '支払いの変更や精算をすると、ここに履歴が残るよ。',
        button('manage', '支払い画面を開く', '', 'primary'))}`;
}

function openEditor(title, content, onSave, label = '保存する') {
  document.querySelector('#form-title').textContent = title;
  fields.innerHTML = content;
  formError.hidden = true;
  save.textContent = label;
  save.hidden = !onSave;
  save.disabled = false;
  document.querySelector('#cancel').textContent = onSave ? 'キャンセル' : '閉じる';
  applyEdit = onSave;
  editor.showModal();
  fields.querySelector('input, textarea')?.focus();
}

function editName(title, initial, handler) {
  openEditor(title, `<label class="field">名前<input name="name" value="${escape(initial)}" maxlength="50" required></label>`,
    data => {
      const name = data.get('name').trim();
      if (!name) throw new Error('名前を入力してください。');
      commit((draft, group) => handler(name, draft, group));
    });
}

function editPayment(group, payment) {
  openEditor(payment ? '支払いを編集' : '支払いを追加', `
    <label class="field">支払いの名前<input name="name" required maxlength="50" value="${escape(payment?.name ?? '')}"></label>
    <label class="field">金額（円）<input name="amount" inputmode="numeric" pattern="[0-9]+" required value="${payment?.amount ?? ''}"></label>
    <label class="field">支払った人<select name="payer">${group.members.map(member =>
      `<option value="${escape(member.id)}" ${payment?.payer === member.id ? 'selected' : ''}>${escape(member.name)}</option>`).join('')}</select></label>
    <fieldset><legend>負担する対象者</legend>${group.members.map((member, index) => {
      const included = !payment || payment.participants.includes(member.id);
      const weight = payment?.weights?.[member.id] ?? 2;
      return `<div class="weight-row"><label class="check">
        <input type="checkbox" name="participant" value="${escape(member.id)}" data-weight="${index}" ${included ? 'checked' : ''}>
        ${escape(member.name)}</label>${enabled('weights') ? `<select name="weight-${index}" aria-label="${escape(member.name)}の負担の重み" ${included ? '' : 'disabled'}>
        ${[[2, '1人分'], [4, '2人分'], [1, '0.5人分']].map(([value, label]) =>
          `<option value="${value}" ${value === weight ? 'selected' : ''}>${label}</option>`).join('')}</select>` : ''}</div>`;
    }).join('')}</fieldset>
    ${enabled('receipt') ? `<details class="receipt"><summary>レシート画像から金額を読む</summary>
      <label class="field">レシート画像<input id="receipt-file" type="file" accept="image/*"></label>
      <p id="receipt-status" role="status">読み取った金額を確認してから保存してください。</p>
      <div id="receipt-options" class="actions"></div></details>
    <label class="check" hidden><input id="receipt-review" type="checkbox">入力された金額を確認しました</label>` : ''}`, data => {
    const name = data.get('name').trim();
    const participants = data.getAll('participant');
    const amount = Number(data.get('amount'));
    if (!name) throw new Error('支払いの名前を入力してください。');
    if (!participants.length) throw new Error('負担する人を1人以上選んでください。');
    if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('金額は1円以上の整数を入力してください。');
    const weights = Object.fromEntries(group.members.flatMap(({ id }, index) =>
      participants.includes(id) ? [[id, Number(data.get('weight-' + index) ?? 2)]] : []));
    const now = new Date();
    commit((_, selected, entries) => {
      const updated = { ...payment, id: payment?.id ?? newId(), name, amount, payer: data.get('payer'), participants };
      if (enabled('weights')) updated.weights = weights;
      if (!payment) updated.registeredDate = localDate(now);
      if (payment) selected.payments = selected.payments.map(item => item.id === payment.id ? updated : item);
      else selected.payments.push(updated);
      paymentHistory(entries, selected, updated, payment ? '編集' : '追加', now);
    });
  });
}

function copyResult(group) {
  const { transfers } = settlementFor(group);
  const lines = transfers.length ? transfers.map(transfer => transferText(group, transfer)) : ['全員の差額は0円です。送金は不要です。'];
  return copyText(['【' + group.name + '】精算結果', ...lines].join('\n'), '精算結果');
}

async function copyText(message, label) {
  const originalFocus = document.activeElement;
  try {
    await navigator.clipboard.writeText(message);
  } catch {
    const area = document.createElement('textarea');
    area.value = message;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { /* Show manual copy. */ }
    area.remove();
    if (!copied) {
      openEditor(label + 'をコピー', '<label class="field">以下の文章を選択してコピー<textarea readonly rows="5"></textarea></label>');
      fields.querySelector('textarea').value = message;
      fields.querySelector('textarea').select();
      return;
    }
    originalFocus?.focus();
  }
  notify(label + 'をコピーしました');
}

document.querySelector('#cancel').addEventListener('click', () => editor.close());
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!applyEdit) return;
  try {
    applyEdit(new FormData(form));
    editor.close();
    if (!sharedGroup && groups) render(true);
  } catch (error) {
    formError.textContent = error.message;
    formError.hidden = false;
  }
});

screen.addEventListener('submit', event => {
  if (event.target.id !== 'member-form') return;
  event.preventDefault();
  const input = event.target.elements.namedItem('member-name');
  const error = screen.querySelector('#member-error');
  const name = input.value.trim();
  try {
    if (!name) throw new Error('メンバー名を入力してください。');
    commit((_, group) => {
      if (group.members.some(member => member.name === name)) throw new Error('同じ名前のメンバーがいます。');
      group.members.push({ id: newId(), name, color: memberColors[group.members.length % memberColors.length] });
    });
    render();
    screen.querySelector('[name="member-name"]').focus({ preventScroll: true });
    notify(name + 'さんを追加しました');
  } catch (failure) {
    error.textContent = failure.message;
    error.hidden = false;
    input.focus();
  }
});

function openGroupView(nextView) {
  const previousView = view;
  const selected = groups.find(group => group.id === groupId) ??
    groups.find(group => group.id === 'osaka') ?? (groups.length === 1 ? groups[0] : null);
  groupId = selected?.id ?? null;
  view = nextView;
  render(true);
  if (nextView === 'result' && previousView !== 'result' && selected?.payments.length) {
    try {
      commit((_, group, entries) => addHistory(entries, group, '精算を実行'));
    } catch (error) {
      notify(error.message);
    }
  }
}

function duplicateGroup(group) {
  openEditor('グループを複製', `<fieldset><legend>複製する内容</legend>
    <label class="check"><input type="radio" name="duplicate" value="members" checked>メンバー構成だけ</label>
    <label class="check"><input type="radio" name="duplicate" value="payments">支払いも含めて</label>
    </fieldset>`, data => {
    const includePayments = data.get('duplicate') === 'payments';
    const copy = {
      id: newId(),
      name: Array.from(group.name).slice(0, 45).join('') + '（複製）',
      members: group.members.map(member => ({ ...member })),
      payments: includePayments ? JSON.parse(JSON.stringify(group.payments)) : []
    };
    commit(draft => draft.push(copy));
  }, '複製する');
}

function setTransferPaid(group, index) {
  const transfer = settlementFor(group).transfers[index];
  if (!transfer) return;
  const key = transferKey(transfer);
  const wasPaid = group.paidTransfers?.includes(key);
  try {
    commit((_, selected, entries) => {
      selected.paidTransfers = wasPaid ? selected.paidTransfers.filter(item => item !== key) :
        [...(selected.paidTransfers ?? []), key];
      addHistory(entries, selected, transferText(selected, transfer) +
        (wasPaid ? 'の支払い済みを取り消し' : 'を支払い済みに変更'), new Date(), [transfer.from, transfer.to]);
    });
    render();
    screen.querySelector(`[data-action="transfer-paid"][data-id="${index}"]`)?.focus({ preventScroll: true });
  } catch (error) {
    notify(error.message);
  }
}

screen.addEventListener('change', event => {
  if (event.target.id !== 'rounding' || sharedGroup || !enabled('rounding')) return;
  const select = event.target;
  try {
    commit((_, group) => { group.rounding = Number(select.value); });
    render();
    screen.querySelector('#rounding').focus({ preventScroll: true });
  } catch (error) {
    select.value = groups.find(group => group.id === groupId).rounding ?? 1;
    notify(error.message);
  }
});

let receiptRequest = 0;
function applyReceiptAmount(amount) {
  form.elements.namedItem('amount').value = amount;
  fields.querySelector('#receipt-review').checked = false;
}

form.addEventListener('change', async event => {
  const control = event.target;
  if (control.name === 'participant' && enabled('weights')) {
    form.elements.namedItem('weight-' + control.dataset.weight).disabled = !control.checked;
  }
  if (control.id !== 'receipt-file' || !enabled('receipt')) return;
  const file = control.files[0];
  const request = ++receiptRequest;
  const status = fields.querySelector('#receipt-status');
  const options = fields.querySelector('#receipt-options');
  const review = fields.querySelector('#receipt-review');
  const current = () => control.isConnected && editor.open && request === receiptRequest;
  options.replaceChildren();
  if (!file) {
    status.textContent = '読み取った金額を確認してから保存してください。';
    save.disabled = false;
    return;
  }
  save.disabled = true;
  status.textContent = 'レシートを読み取っています…';
  try {
    const amounts = await recognizeReceipt(file);
    if (!current()) return;
    if (!amounts.length) {
      status.textContent = '金額の候補が見つかりませんでした。金額欄に手入力できます。';
      return;
    }
    review.closest('label').hidden = false;
    review.required = true;
    applyReceiptAmount(amounts[0]);
    status.textContent = '候補を金額欄に入力しました。必要に応じて修正してください。';
    options.innerHTML = amounts.map(amount => button('receipt-amount', yen(amount), String(amount))).join('');
  } catch (error) {
    if (current()) status.textContent = '読み取れませんでした。画像を選び直すか、金額を手入力してください。';
  } finally {
    if (current()) save.disabled = false;
  }
});

form.addEventListener('click', event => {
  const choice = event.target.closest('[data-action="receipt-amount"]');
  if (choice) applyReceiptAmount(Number(choice.dataset.id));
});
form.addEventListener('input', event => {
  if (event.target.name === 'amount' && fields.querySelector('#receipt-review')?.required) {
    fields.querySelector('#receipt-review').checked = false;
  }
});

function handleAction(event) {
  const control = event.target.closest('button[data-action]');
  if (!control) return;
  const { action, id } = control.dataset;
  if (!groups && !sharedGroup) return;
  const group = sharedGroup ?? groups.find(item => item.id === groupId);
  if (sharedGroup && !['copy', 'result-image'].includes(action)) return;
  switch (action) {
    case 'open': groupId = id; view = 'groups'; render(true); break;
    case 'back':
    case 'groups': view = 'groups'; render(true); break;
    case 'manage':
    case 'result': openGroupView(action); break;
    case 'history': view = action; render(true); break;
    case 'history-clear':
      openEditor('履歴をすべて消す', '<p>すべてのグループの操作履歴を削除します。</p>',
        () => commit((_, __, entries) => { entries.length = 0; }), '履歴を消す');
      break;
    case 'group-add':
      editName('グループを作成', '', (name, draft) => {
        draft.push({ id: newId(), name, members: [], payments: [] });
      });
      if (view !== 'groups') {
        const saveGroup = applyEdit;
        applyEdit = data => { saveGroup(data); view = 'groups'; };
      }
      break;
    case 'group-duplicate':
      if (enabled('duplicate')) duplicateGroup(groups.find(item => item.id === id));
      break;
    case 'group-edit':
      editName('グループ名を編集', groups.find(item => item.id === id).name,
        (name, draft) => { draft.find(item => item.id === id).name = name; });
      break;
    case 'group-delete':
      openEditor('グループを削除', '<p>「' + escape(groups.find(item => item.id === id).name) +
        '」と、このグループの支払いを削除します。</p>',
        () => {
          commit(draft => draft.splice(draft.findIndex(item => item.id === id), 1));
          if (groupId === id) groupId = null;
        }, '削除する');
      break;
    case 'member-edit':
      editName('メンバー名を変更', nameOf(group, id), (name, _, selected) => {
        if (selected.members.some(member => member.id !== id && member.name === name)) {
          throw new Error('同じ名前のメンバーがいます。');
        }
        selected.members.find(member => member.id === id).name = name;
      });
      break;
    case 'payment-add':
    case 'payment-edit': editPayment(group, group.payments.find(payment => payment.id === id)); break;
    case 'payment-delete': {
      const payment = group.payments.find(item => item.id === id);
      openEditor('支払いを削除', '<p>「' + escape(payment.name) + '」を削除します。</p>',
        () => commit((_, selected, entries) => {
          selected.payments = selected.payments.filter(item => item.id !== id);
          paymentHistory(entries, selected, payment, '削除');
        }), '削除する');
      break;
    }
    case 'transfer-paid':
      if (enabled('paid')) setTransferPaid(group, Number(id));
      break;
    case 'result-image':
      if (enabled('image')) saveResultImage(group, settlementFor(group)).catch(error => notify(error.message));
      break;
    case 'share':
      if (!enabled('share')) break;
      try { copyText(shareLink({ ...group, rounding: enabled('rounding') ? group.rounding : 1,
        paidTransfers: enabled('paid') ? group.paidTransfers : [],
        payments: enabled('weights') ? group.payments : group.payments.map(({ weights, ...payment }) => payment) }), '共有リンク'); } catch (error) { notify(error.message); }
      break;
    case 'copy': copyResult(group); break;
  }
}

screen.addEventListener('click', handleAction);
tabs.addEventListener('click', handleAction);

settingsButton.addEventListener('click', () => {
  openEditor('追加機能の設定', `<fieldset class="feature-options"><legend>使いたい機能</legend>
    ${Object.entries(featureLabels).map(([key, label]) =>
      `<label class="check"><input type="checkbox" name="${key}" ${enabled(key) ? 'checked' : ''}>${label}</label>`).join('')}
    </fieldset>`, data => {
    const next = Object.fromEntries(Object.keys(featureLabels).map(key => [key, data.has(key)]));
    localStorage.setItem(settingsKey, JSON.stringify(next));
    features = next;
    if (location.hash.startsWith(sharePrefix)) location.reload();
  });
});

if (sharedGroup) {
  screen.innerHTML = `<p class="context">共有された精算 · 読み取り専用</p><h1>${escape(sharedGroup.name)}</h1>
    ${groupHero(sharedGroup, settlementFor(sharedGroup))}${resultView(sharedGroup, settlementFor(sharedGroup), true)}`;
} else if (groups) render();

window.addEventListener('hashchange', () => location.reload());
