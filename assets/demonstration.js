// A presentation-only explorer. No commands, requests, approvals or policy
// calculations happen here; the cases are explicitly authored illustrations.
(() => {
  const select = document.querySelector('[data-demo-select]');
  const cases = [...document.querySelectorAll('[data-demo-case]')];
  if (!select || !cases.length) return;
  document.querySelector('[data-demo-controls]').hidden = false;
  const show = () => cases.forEach(item => { item.hidden = item.dataset.demoCase !== select.value; });
  select.addEventListener('change', show);
  show();
})();
