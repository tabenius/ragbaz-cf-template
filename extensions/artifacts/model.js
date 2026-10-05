export const ARTIFACT_SCHEMA = 'ragbaz.artifact/v1';
export const SUBMISSION_SCHEMA = 'ragbaz.artifact-submission/v1';
export const SCOPES = ['artifact', 'quote', 'name', 'photo', 'profile'];
const ID = /^[a-z][a-z0-9-]{0,79}$/;
const own = (object, keys, name) => {
  if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).some(k => !keys.includes(k))) throw new Error(`Invalid ${name} fields`);
};
export function text(value, name, max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(`Invalid ${name}`);
  return value.trim();
}
export function identifier(value) {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error('Invalid identifier');
  return value;
}
export function localUrl(value) {
  if (typeof value !== 'string' || !/^\/[a-zA-Z0-9/_.,~-]*$/.test(value) || value.startsWith('//') || value.includes('..')) throw new Error('Use a clean local URL');
  return value;
}
export function httpsUrl(value) {
  const url = new URL(text(value, 'URL', 2048));
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use HTTPS without credentials');
  return url.href;
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().replace('.000Z', 'Z') !== value.replace('.000Z', 'Z')) throw new Error('Use an ISO UTC timestamp');
  return value;
}
function image(input) {
  own(input, ['src', 'alt'], 'image');
  const src = localUrl(input.src);
  if (!/^\/assets\/.+\.(?:png|jpe?g|webp|gif|svg)$/.test(src)) throw new Error('Images must use first-party assets');
  return { src, alt: text(input.alt, 'image description', 300) };
}
function person(input) {
  own(input, ['name', 'role', 'profile_url', 'identity_urls', 'photo'], 'person');
  const result = { name: text(input.name, 'person name', 160) };
  if (input.role !== undefined) result.role = text(input.role, 'role', 200);
  if (input.profile_url !== undefined) result.profile_url = httpsUrl(input.profile_url);
  if (input.identity_urls !== undefined) {
    if (!Array.isArray(input.identity_urls) || input.identity_urls.length > 8) throw new Error('Invalid identity links');
    result.identity_urls = input.identity_urls.map(httpsUrl);
  }
  if (input.photo !== undefined) result.photo = image(input.photo);
  return result;
}
function resource(input) {
  own(input, ['type', 'url', 'identifier', 'digest', 'media_type', 'bytes', 'label'], 'resource');
  if (!['local', 'external', 'mouseion', 'oci'].includes(input.type)) throw new Error('Unknown resource type');
  const result = { type: input.type };
  if (input.url !== undefined) result.url = input.type === 'local' ? localUrl(input.url) : httpsUrl(input.url);
  if (['local', 'external'].includes(input.type) && !result.url) throw new Error('Resource URL required');
  if (input.identifier !== undefined) result.identifier = text(input.identifier, 'resource identifier', 1024);
  if (['mouseion', 'oci'].includes(input.type) && !result.identifier) throw new Error('Artifact identifier required');
  if (input.digest !== undefined) {
    if (!/^sha256:[a-f0-9]{64}$/.test(input.digest)) throw new Error('Use a SHA-256 digest');
    result.digest = input.digest;
  }
  if (input.type === 'oci' && !result.digest) throw new Error('OCI reference needs an immutable digest');
  if (input.media_type !== undefined) {
    if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(input.media_type)) throw new Error('Invalid MIME type');
    result.media_type = input.media_type;
  }
  if (input.bytes !== undefined) {
    if (!Number.isSafeInteger(input.bytes) || input.bytes < 0) throw new Error('Invalid byte size');
    result.bytes = input.bytes;
  }
  if (input.label !== undefined) result.label = text(input.label, 'resource label', 200);
  return result;
}
export function artifactModel(input) {
  own(input, ['schema', 'id', 'kind', 'title', 'ingress', 'quote', 'person', 'image', 'social_image', 'presentation', 'resources', 'created_at', 'body', 'tags', 'relations'], 'artifact');
  if (input.schema !== ARTIFACT_SCHEMA) throw new Error('Unsupported artifact schema');
  const result = { schema: ARTIFACT_SCHEMA, id: identifier(input.id), kind: identifier(input.kind), title: text(input.title, 'title', 240), ingress: text(input.ingress, 'ingress', 1200), created_at: timestamp(input.created_at) };
  result.presentation = input.presentation || 'card';
  if (!['card', 'thumbnail', 'quote', 'box', 'og'].includes(result.presentation)) throw new Error('Invalid presentation');
  if (input.person !== undefined) result.person = person(input.person);
  if (input.quote !== undefined) {
    if (!result.person) throw new Error('An attributed quote needs a person');
    result.quote = text(input.quote, 'quote', 3000);
  }
  if (input.image !== undefined) result.image = image(input.image);
  if (input.social_image !== undefined) {
    result.social_image = image(input.social_image);
    if (result.social_image.src.endsWith('.svg')) throw new Error('Use a raster social image');
  }
  if (!Array.isArray(input.resources) || input.resources.length > 12) throw new Error('Supply a resource array');
  result.resources = input.resources.map(resource);
  if (input.body !== undefined) {
    if (!Array.isArray(input.body) || input.body.length > 30) throw new Error('Invalid body');
    const ids = new Set();
    result.body = input.body.map(section => {
      own(section, ['id', 'title', 'paragraphs'], 'section');
      identifier(section.id);
      if (ids.has(section.id)) throw new Error('Duplicate body section');
      ids.add(section.id);
      if (!Array.isArray(section.paragraphs) || !section.paragraphs.length || section.paragraphs.length > 30) throw new Error('Invalid paragraphs');
      return { id: section.id, title: text(section.title, 'section title', 240), paragraphs: section.paragraphs.map(p => text(p, 'paragraph', 8000)) };
    });
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.length > 20) throw new Error('Invalid tags');
    result.tags = input.tags.map(t => text(t, 'tag', 80));
  }
  if (input.relations !== undefined) {
    if (!Array.isArray(input.relations) || input.relations.length > 12) throw new Error('Invalid relations');
    result.relations = input.relations.map(r => {
      own(r, ['kind', 'artifact_id'], 'relation');
      return { kind: identifier(r.kind), artifact_id: identifier(r.artifact_id) };
    });
  }
  return result;
}
export function requiredScopes(input) {
  const artifact = artifactModel(input), scopes = ['artifact'];
  if (artifact.quote) scopes.push('quote');
  if (artifact.person) scopes.push('name');
  if (artifact.person?.photo) scopes.push('photo');
  if (artifact.person?.profile_url || artifact.person?.identity_urls?.length) scopes.push('profile');
  return scopes;
}
export function submissionModel(input) {
  own(input, ['schema', 'collection', 'direction', 'artifact', 'sender', 'recipient', 'permission', 'in_reply_to', 'source'], 'submission');
  if (input.schema !== SUBMISSION_SCHEMA || !['inbound', 'outbound'].includes(input.direction)) throw new Error('Invalid submission envelope');
  const result = { schema: SUBMISSION_SCHEMA, collection: identifier(input.collection), direction: input.direction, artifact: artifactModel(input.artifact) };
  for (const key of ['sender', 'recipient']) if (input[key] !== undefined) {
    own(input[key], ['name', 'email', 'profile_url', 'photo_source_url'], key);
    result[key] = {};
    for (const field of ['name', 'email']) if (input[key][field] !== undefined) {
      result[key][field] = text(input[key][field], field, field === 'email' ? 254 : 160);
      if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result[key][field])) throw new Error('Invalid contact email');
    }
    for (const field of ['profile_url', 'photo_source_url']) if (input[key][field] !== undefined) result[key][field] = httpsUrl(input[key][field]);
  }
  if (input.permission !== undefined) {
    own(input.permission, ['offered_scopes', 'note'], 'permission');
    if (!Array.isArray(input.permission.offered_scopes) || input.permission.offered_scopes.some(s => !SCOPES.includes(s))) throw new Error('Invalid offered permission');
    result.permission = { offered_scopes: [...new Set(input.permission.offered_scopes)] };
    if (input.permission.note !== undefined) result.permission.note = text(input.permission.note, 'permission note');
  }
  if (input.in_reply_to !== undefined) result.in_reply_to = identifier(input.in_reply_to);
  if (input.source !== undefined) {
    own(input.source, ['system', 'reference', 'person_reference', 'observed_at'], 'source');
    result.source = { system: identifier(input.source.system), reference: text(input.source.reference, 'source reference', 1000) };
    if (input.source.person_reference !== undefined) result.source.person_reference = text(input.source.person_reference, 'person reference', 160);
    if (input.source.observed_at !== undefined) result.source.observed_at = timestamp(input.source.observed_at);
  }
  return result;
}
export function collectionModel(input) {
  own(input, ['id', 'path', 'title', 'ingress', 'mode', 'theme'], 'collection');
  const route = localUrl(input.path);
  if (!route.endsWith('/') || /^\/(?:api|assets|inbox|healthz|manifest\.json|robots\.txt|sitemap\.xml)(?:\/|$)/.test(route)) throw new Error('Invalid collection route');
  const mode = input.mode || 'collection', theme = input.theme || 'paper';
  if (!['singleton', 'collection'].includes(mode) || !['paper', 'hearth'].includes(theme)) throw new Error('Invalid collection layout');
  return { id: identifier(input.id), path: route, title: text(input.title, 'collection title', 240), ingress: text(input.ingress, 'collection ingress', 1200), mode, theme };
}
// Call this at every public boundary; never serialize a submission wholesale.
export function publicArtifact(input) { return artifactModel(input); }
export function inlineJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
