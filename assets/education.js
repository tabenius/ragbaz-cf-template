(() => {
  const host = document.querySelector('[data-education]');
  if (!host) return;
  const key = 'ragbaz.education/v0:' + host.dataset.project;
  const lessons = host.dataset.lessons.split(',');
  const current = host.dataset.lesson;
  const button = host.querySelector('button');
  const status = host.querySelector('[role="status"]');
  let completed = [];
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(saved)) completed = [...new Set(saved.filter(id => lessons.includes(id)))];
  } catch { /* Local storage is optional. */ }
  function render() {
    status.textContent = `${completed.length} / ${lessons.length} lessons marked as read on this device. This is not verified assessment evidence.`;
    if (button) { button.textContent = completed.includes(current) ? 'Mark unread' : 'Mark as read'; button.setAttribute('aria-pressed', String(completed.includes(current))); }
  }
  button?.addEventListener('click', () => {
    completed = completed.includes(current) ? completed.filter(id => id !== current) : [...completed, current];
    try { localStorage.setItem(key, JSON.stringify(completed)); } catch { /* Local storage is optional. */ }
    render();
  });
  render();
})();
