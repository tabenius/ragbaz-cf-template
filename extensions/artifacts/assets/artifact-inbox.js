(() => {
  const form = document.querySelector('#artifact-compose');
  if (!form) return;
  const base = form.dataset.endpoint, list = document.querySelector('#artifact-inbox');
  const status = document.querySelector('#artifact-status'), more = document.querySelector('#artifact-more');
  let cursor = null;
  const el = (name, content, className) => { const node = document.createElement(name); if (content) node.textContent = content; if (className) node.className = className; return node; };
  async function api(path, body) {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }
  async function action(item, kind, payload) {
    try { await api(`/items/${item.id}/${kind}`, payload); status.textContent = `${item.id}: ${kind} recorded.`; await refresh(); }
    catch (error) { status.textContent = error.message; }
  }
  function download(name, body, mime) {
    const url = URL.createObjectURL(new Blob([body], { type: mime })), anchor = el('a');
    anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function row(item) {
    const artifact = item.submission.artifact, card = el('article', '', 'artifact-review');
    card.append(el('p', `${item.state} · ${item.direction} · ${item.collection}`, 'artifact-kicker'), el('h3', artifact.title), el('p', artifact.ingress));
    if (artifact.quote) card.append(el('blockquote', artifact.quote));
    if (artifact.person) card.append(el('p', `Attribution: ${artifact.person.name}${artifact.person.role ? ' · ' + artifact.person.role : ''}`));
    const details = el('details'); details.append(el('summary', 'Private envelope and contact details'), el('pre', JSON.stringify(item.submission, null, 2))); card.append(details);
    if (item.permission) card.append(el('p', `Permission ${item.permission.state}: ${item.permission.scopes.join(', ')}. Evidence: ${item.permission.evidence.reference}`));
    if (item.state === 'pending' && !item.permission) {
      const permissionForm = el('form'), label = el('label', 'Where did the person explicitly give permission?');
      const evidence = el('textarea'); evidence.required = true; evidence.maxLength = 2000; evidence.rows = 2; label.append(evidence);
      const kind = el('select');
      for (const [value, title] of [['email', 'Email or mailbox reference'], ['form', 'Consent form record'], ['signed', 'Signed permission'], ['self-authored', 'My own outbound work']]) { const option = el('option', title); option.value = value; kind.append(option); }
      const kindLabel = el('label', 'Evidence type'); kindLabel.append(kind);
      const confirmation = el('label', ` I have permission for these exact fields: ${item.required_scopes.join(', ')}.`), checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.required = true; confirmation.prepend(checkbox);
      const save = el('button', 'Record permission'); save.type = 'submit';
      permissionForm.append(label, kindLabel, confirmation, save);
      permissionForm.addEventListener('submit', event => { event.preventDefault(); action(item, 'permission', { revision: item.revision, scopes: item.required_scopes, evidence: { kind: kind.value, reference: evidence.value } }); });
      card.append(permissionForm);
    }
    const actions = el('div', '', 'artifact-review-actions');
    for (const [kind, title] of item.state === 'pending' ? [['publish', 'Publish on collection'], ['reject', 'Decline']] : item.state === 'approved' ? [['withdraw', 'Unpublish / withdraw']] : []) {
      const button = el('button', title); button.type = 'button';
      if (kind === 'publish') button.disabled = item.permission?.state !== 'recorded';
      button.addEventListener('click', () => action(item, kind, { revision: item.revision })); actions.append(button);
    }
    const email = el('button', 'Export email HTML + text'); email.type = 'button';
    email.addEventListener('click', async () => {
      try { const data = await api(`/items/${item.id}/email`); download(item.id + '.html', data.html, 'text/html'); download(item.id + '.txt', data.text, 'text/plain'); status.textContent = 'Email files exported. No email has been sent.'; }
      catch (error) { status.textContent = error.message; }
    });
    actions.append(email); card.append(actions); return card;
  }
  async function refresh(append = false) {
    try {
      const data = await api('/inbox' + (append && cursor ? '?before=' + encodeURIComponent(cursor) : ''));
      if (!append) list.replaceChildren();
      data.items.forEach(item => list.append(row(item)));
      if (!data.items.length && !append) list.append(el('p', 'No artifacts received yet.'));
      cursor = data.next_cursor; more.hidden = !cursor;
    } catch (error) { status.textContent = error.message; }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try { await api('/import', JSON.parse(new FormData(form).get('envelope'))); form.reset(); status.textContent = 'Added privately to the inbox.'; await refresh(); }
    catch (error) { status.textContent = error.message; }
  });
  document.querySelector('#artifact-refresh').addEventListener('click', () => refresh());
  more.addEventListener('click', () => refresh(true));
  refresh();
})();
