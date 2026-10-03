(() => {
  const catalog = document.querySelector('[data-catalog]');
  const layout = document.querySelector('[data-catalog-layout]');
  const sort = document.querySelector('[data-catalog-sort]');
  if (!catalog || !layout || !sort) return;
  const key = 'ragbaz.catalog/v0:' + location.pathname;
  try { const saved = localStorage.getItem(key); if (['grid', 'list'].includes(saved)) { layout.value = saved; catalog.dataset.layout = saved; } } catch { /* Storage is optional. */ }
  layout.addEventListener('change', () => { catalog.dataset.layout = layout.value; try { localStorage.setItem(key, layout.value); } catch { /* Storage is optional. */ } });
  sort.addEventListener('change', () => {
    const cards = [...catalog.querySelectorAll('.publication-card')];
    cards.sort((a, b) => sort.value === 'name' ? a.dataset.title.localeCompare(b.dataset.title, document.documentElement.lang) : b.dataset.date.localeCompare(a.dataset.date));
    cards.forEach(card => catalog.appendChild(card));
  });
})();
