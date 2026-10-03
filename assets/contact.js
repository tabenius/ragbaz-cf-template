(() => {
  const form = document.querySelector('[data-contact]');
  if (!form) return;
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const status = form.querySelector('[data-contact-status]');
    const button = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    status.textContent = 'Sending…'; button.disabled = true;
    try {
      const response = await fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: data.get('email'), message: data.get('message'), consent: data.get('consent') === 'on' }) });
      if (!response.ok) throw new Error('unavailable');
      status.textContent = 'Message accepted for delivery.'; form.reset();
    } catch { status.textContent = 'Message could not be sent. Please use the email link below.'; }
    finally { button.disabled = false; }
  });
})();
