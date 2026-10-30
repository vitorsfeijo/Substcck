export interface SemanticSource {
  title: string;
  summary: string | null;
  tags: string[];
  areas: string[];
  collection: string | null;
}

const stopwords = new Set(
  `a ao aos aquela aquelas aquele aqueles as ate com como da das de dela delas
   dele deles depois do dos e ela elas ele eles em entre era essa essas esse esses
   esta estas este estes eu foi foram ha isso isto ja lhe lhes mais mas me mesmo
   minha minhas muito na nas nao no nos nossa nossas nosso nossos num numa o os
   ou para pela pelas pelo pelos por qual quando que quem se sem ser seu seus so
   sua suas tambem te tem ter tu um uma umas uns voce voces`.split(/\s+/),
);

/** The vocabulary is learned from Portuguese content, without a synonym list. */
export function tokenizeQuery(text: string): string[] {
  return (
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('pt-BR')
      .match(/[a-z0-9]+/g) || []
  ).filter(
    (token) => token.length >= 2 && token.length <= 80 && !stopwords.has(token),
  );
}

/** Field weights become term counts before logarithmic TF-IDF weighting. */
export function buildSemanticTerms(
  source: SemanticSource,
): Record<string, number> {
  const counts = new Map<string, number>();
  const add = (value: string | null, weight: number) => {
    for (const token of tokenizeQuery(value || ''))
      counts.set(token, (counts.get(token) || 0) + weight);
  };
  add(source.title, 3);
  add(source.summary, 1);
  for (const name of source.tags) add(name, 2);
  for (const name of source.areas) add(name, 1);
  add(source.collection, 1);
  return Object.fromEntries([...counts].sort(([a], [b]) => compare(a, b)));
}

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
