(() => {
  const menu = document.querySelector('[data-main-menu]');
  if (!menu) return;
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
  });
  document.addEventListener('pointerdown', event => { if (menu.open && !menu.contains(event.target)) menu.open = false; });
})();
