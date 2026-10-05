export const FLEET = [
  { id: 'weftmark', name: 'WeftMark', origin: 'https://weftmark.ragbaz.cc', role: 'Scope, evidence and human review', motif: 'loom' },
  { id: 'sylvae', name: 'Sylvae', origin: 'https://sylvae.ragbaz.cc', role: 'Portable skills and recorded runs', motif: 'grove' },
  { id: 'nostoi', name: 'Nostoi', origin: 'https://nostoi.ragbaz.cc', role: 'Audit integrity and external checkpoints', motif: 'river' },
  { id: 'rebekah', name: 'Rebekah', origin: 'https://rebekah.ragbaz.cc', role: 'A reproducible, self-hosted workshop', motif: 'home' },
];
export const STUDIO = [
  { name: 'RAGBAZ', href: 'https://ragbaz.cc', description: 'The software studio' },
  { name: 'Thinktank', href: 'https://ragbaz.cc/thinktank/en', description: 'Ideas for everyone' },
  { name: 'Mouseion', href: 'https://mouseion.ragbaz.cc', description: 'Artifacts and their provenance' },
  { name: 'Ephor', href: 'https://ephor.ragbaz.cc', description: 'Opt-in AI governance' },
  { name: 'DetCordon', href: 'https://detcordon.ragbaz.cc', description: 'Contained security observation' },
  { name: 'School', href: 'https://ragbaz.cc/school', description: 'Learning and practical understanding' },
];
export const LOOM_ARTICLE = {
  title: 'The Loom and the Grove',
  description: 'A beautifully illustrated, plain-language guide to how AI teams can work together—and why the hard part is trust. No technical background needed.',
  editions: [
    { code: 'en', label: 'English', title: 'The Loom and the Grove' },
    { code: 'sv', label: 'Svenska', title: 'Väven och lunden' },
    { code: 'es', label: 'Español', title: 'El telar y la arboleda' },
    { code: 'ru', label: 'Русский', title: 'Ткацкий стан и роща' },
    { code: 'zh', label: '中文', title: '织机与树林' },
  ].map(edition => ({ ...edition, href: `https://ragbaz.cc/thinktank/${edition.code}/thinktank/the-loom-and-the-grove` })),
};
