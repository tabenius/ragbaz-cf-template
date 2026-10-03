(() => {
  const key = 'ragbaz.reader/v1';
  const allowed = { theme: ['paper', 'sepia', 'white', 'night'], font: ['serif', 'sans', 'mono'], paper: ['a4', 'a5'] };
  const controls = [...document.querySelectorAll('[data-reader]')];
  let preferences = {};
  try { preferences = JSON.parse(localStorage.getItem(key) || '{}'); } catch { /* Storage is optional. */ }
  function apply() {
    for (const control of controls) {
      const name = control.dataset.reader;
      const value = allowed[name].includes(preferences[name]) ? preferences[name] : allowed[name][0];
      control.value = value;
      document.documentElement.dataset[`reader${name[0].toUpperCase() + name.slice(1)}`] = value;
    }
  }
  for (const control of controls) control.addEventListener('change', () => {
    preferences[control.dataset.reader] = control.value; apply();
    try { localStorage.setItem(key, JSON.stringify(preferences)); } catch { /* Storage is optional. */ }
  });
  document.querySelector('[data-reader-reset]')?.addEventListener('click', () => {
    preferences = {}; apply(); try { localStorage.removeItem(key); } catch { /* Storage is optional. */ }
  });
  document.querySelector('[data-reader-print]')?.addEventListener('click', () => window.print());
  const fullscreen = document.querySelector('[data-reader-fullscreen]');
  if (fullscreen && !document.documentElement.requestFullscreen) fullscreen.hidden = true;
  fullscreen?.addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { /* Fullscreen can be denied; reading still works. */ }
  });
  apply();
})();
