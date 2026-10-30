import { buildSemanticTerms, type SemanticSource } from './text.js';

/** Fictitious Portuguese evaluation corpus; never imported as production data. */
export const semanticEvaluationCorpus: (SemanticSource & { id: string })[] = [
  {
    id: 'saude-criptografia',
    title: 'Criptografia hospitalar',
    summary: 'Chaves, anonimização de prontuários e sigilo hospitalar.',
    tags: [],
    areas: [],
    collection: null,
  },
  {
    id: 'saude-protecao',
    title: 'Proteção de dados clínicos',
    summary: 'Privacidade, sigilo e criptografia para hospitais e prontuários.',
    tags: [],
    areas: [],
    collection: null,
  },
  {
    id: 'saude-privacidade',
    title: 'Privacidade hospitalar',
    summary: 'Dados clínicos, anonimização, sigilo e chaves para prontuários.',
    tags: [],
    areas: [],
    collection: null,
  },
  {
    id: 'redes-trafego',
    title: 'Congestionamento veicular',
    summary:
      'Automóveis, tráfego e roteamento para mobilidade em rotas urbanas.',
    tags: [],
    areas: [],
    collection: null,
  },
  {
    id: 'redes-mobilidade',
    title: 'Mobilidade urbana',
    summary: 'Veículos, automóveis, rotas, tráfego e redes veiculares.',
    tags: [],
    areas: [],
    collection: null,
  },
  {
    id: 'redes-roteamento',
    title: 'Roteamento veicular',
    summary: 'Pacotes em redes, mobilidade, rotas e comunicação veicular.',
    tags: [],
    areas: [],
    collection: null,
  },
  {
    id: 'agro-precisao',
    title: 'Agricultura de precisão',
    summary: 'Solo, colheita, irrigação e sensores agrícolas.',
    tags: [],
    areas: [],
    collection: null,
  },
  {
    id: 'agro-irrigacao',
    title: 'Irrigação agrícola',
    summary: 'Água, solo, sensores e plantação para agricultura.',
    tags: [],
    areas: [],
    collection: null,
  },
  {
    id: 'agro-colheita',
    title: 'Sensores na colheita',
    summary: 'Agricultura, solo, água e irrigação agrícola.',
    tags: [],
    areas: [],
    collection: null,
  },
];

export const semanticEvaluationQueries = [
  {
    query: 'proteção privacidade',
    expectedId: 'saude-criptografia',
    group: 'saude-',
  },
  { query: 'automóveis', expectedId: 'redes-roteamento', group: 'redes-' },
  { query: 'colheita', expectedId: 'agro-irrigacao', group: 'agro-' },
] as const;

export function semanticEvaluationDocuments() {
  return semanticEvaluationCorpus.map(({ id, ...source }) => ({
    id,
    terms: buildSemanticTerms(source),
  }));
}
