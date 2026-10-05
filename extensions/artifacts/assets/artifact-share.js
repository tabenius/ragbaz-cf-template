(() => {
  const form = document.querySelector('#artifact-share'); if (!form) return;
  const status = document.querySelector('#artifact-share-status');
  let receipt;
  async function post(url, body) {
    const response = await fetch(url, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not receive the submission'); return data;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(form), value = key => String(values.get(key) || '').trim();
    const artifact = { schema: 'ragbaz.artifact/v1', id: 'received-' + crypto.randomUUID(), kind: value('quote') ? 'quote' : 'gift', title: value('title'), ingress: value('ingress'), created_at: new Date().toISOString(), presentation: value('quote') ? 'quote' : 'card', resources: value('url') ? [{ type: 'external', url: value('url') }] : [] };
    const offered = values.getAll('scope');
    if (value('quote')) { artifact.quote = value('quote'); artifact.person = { name: value('name') }; }
    else if (offered.includes('name')) artifact.person = { name: value('name') };
    if (artifact.person && value('profile') && offered.includes('profile')) artifact.person.profile_url = value('profile');
    const sender = { name: value('name'), email: value('email') };
    if (value('profile')) sender.profile_url = value('profile');
    if (value('photo')) sender.photo_source_url = value('photo');
    try {
      const data = await post(form.dataset.endpoint, { schema: 'ragbaz.artifact-submission/v1', direction: 'inbound', collection: value('collection'), artifact, sender, permission: { offered_scopes: offered, note: 'Permission checkboxes submitted with these exact fields through the first-party sharing form.' } });
      receipt = { id: data.id, receipt_token: data.receipt_token };
      const box = document.querySelector('#artifact-receipt'); box.hidden = false; box.querySelector('pre').textContent = JSON.stringify(receipt, null, 2);
      status.textContent = 'Received privately. Nothing has been published. Save the receipt before leaving this page.';
      form.querySelector('button[type="submit"]').disabled = true;
    } catch (error) { status.textContent = error.message; }
  });
  document.querySelector('#artifact-revoke').addEventListener('click', async () => {
    try { await post(form.dataset.endpoint.replace(/\/submit$/, '/revoke'), receipt); status.textContent = 'Withdrawn. This submission is no longer eligible for publication.'; }
    catch (error) { status.textContent = error.message; }
  });
})();
