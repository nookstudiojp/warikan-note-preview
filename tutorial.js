'use strict';

{
  const key = 'nook-studio.warikan-note.tutorial-dismissed.v1';
  const banner = document.querySelector('#tutorial-banner');
  const dialog = document.querySelector('#tutorial');

  function dismissBanner() {
    banner.hidden = true;
    try {
      localStorage.setItem(key, '1');
    } catch {
      // The banner can still be dismissed when storage is unavailable.
    }
  }

  try {
    banner.hidden = localStorage.getItem(key) === '1';
  } catch {
    banner.hidden = false;
  }

  document.querySelector('#dismiss-tutorial').addEventListener('click', dismissBanner);
  for (const button of document.querySelectorAll('[data-open-tutorial]')) {
    button.addEventListener('click', () => dialog.showModal());
  }
  dialog.addEventListener('close', dismissBanner);
}
