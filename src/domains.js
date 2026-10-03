// Portable data contracts; authorities remain in the owning applications.
const STATES = ['unknown', 'claimed', 'verified', 'failed', 'unavailable'];
export function provenanceModel(input) {
  if (!input || !Array.isArray(input.models) || !input.models.length) throw new Error('Model provenance needs models');
  if (input.harness && (typeof input.harness.name !== 'string' || !input.harness.name || (input.harness.version !== undefined && typeof input.harness.version !== 'string'))) throw new Error('Invalid harness identity');
  return {
    schema: 'ragbaz.model-provenance/v0',
    models: input.models.map(model => {
      if (typeof model.id !== 'string' || !model.id || typeof model.provider !== 'string' || !model.provider) throw new Error('Model identity/provider required');
      for (const field of ['configured_model', 'served_model']) if (model[field] !== undefined && typeof model[field] !== 'string') throw new Error('Model names must be strings');
      return { id: model.id, provider: model.provider, ...(model.configured_model ? { configured_model: model.configured_model } : {}), ...(model.served_model ? { served_model: model.served_model } : {}) };
    }),
    ...(input.harness ? { harness: { name: input.harness.name, ...(input.harness.version ? { version: input.harness.version } : {}) } } : {}),
  };
}
export function verificationModel(input) {
  for (const key of ['integrity', 'signature', 'signer_trust', 'external_observation']) {
    if (!STATES.includes(input[key])) throw new Error(`Invalid ${key} verification state`);
  }
  return { schema: 'ragbaz.verification/v0', ...Object.fromEntries(['integrity', 'signature', 'signer_trust', 'external_observation'].map(key => [key, input[key]])) };
}
export function publicProduct(input) {
  if (!/^[a-z][a-z0-9-]*$/.test(input.id) || typeof input.name !== 'string' || !input.name) throw new Error('Product identity required');
  if (!['prototype', 'development', 'released', 'retired'].includes(input.lifecycle)) throw new Error('Invalid product lifecycle');
  return { id: input.id, name: input.name, lifecycle: input.lifecycle, capabilities: Array.isArray(input.capabilities) ? input.capabilities.filter(c => typeof c === 'string') : [] };
}
export function offerModel(input) {
  if (typeof input.id !== 'string' || !input.id || typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency) || !Number.isSafeInteger(input.minor_units) || input.minor_units < 0) throw new Error('Offer needs integer minor units and ISO currency');
  if (!['month', 'year', 'one-time'].includes(input.interval)) throw new Error('Invalid offer interval');
  return { schema: 'ragbaz.offer/v0', id: input.id, currency: input.currency, minor_units: input.minor_units, interval: input.interval };
}
