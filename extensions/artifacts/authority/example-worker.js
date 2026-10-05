import config from '../examples/maria/config.json' with { type: 'json' };
import { createExchangeAuthority } from './worker.js';

// Consumer-owned deployment adapter. Replace the example identity adapter with
// the real authority's session-contract mapping before enabling editor access.
export default {
  fetch(request, env) {
    return createExchangeAuthority({
      allowedOrigins: [config.site.origin], identityOrigin: 'https://ragbaz.cc',
      collections: config.collections, site: config.site,
      publicIntake: env.PUBLIC_INTAKE === 'true',
    }).fetch(request, env);
  },
};
