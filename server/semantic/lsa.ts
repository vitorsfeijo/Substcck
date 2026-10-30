import { performance } from 'node:perf_hooks';
import { tokenizeQuery } from './text.js';

export type SemanticUnavailableReason =
  | 'insufficient_corpus'
  | 'query_out_of_vocabulary'
  | 'index_unavailable'
  | 'corpus_limit';

export class SemanticUnavailableError extends Error {
  constructor(public readonly reason: SemanticUnavailableReason) {
    super('A aproximação semântica não está disponível para esta consulta.');
    this.name = 'SemanticUnavailableError';
  }
}

export interface SemanticDocument {
  id: string;
  terms: Record<string, number>;
}

export interface SemanticHit {
  id: string;
  score: number;
}

export const SEMANTIC_LIMITS = {
  documents: 512,
  vocabulary: 10_000,
  trainingMs: 2000,
  iterations: 64,
  minimumCosine: 0.3,
  minimumProjectedEnergy: 1e-6,
} as const;

interface Entry {
  index: number;
  weight: number;
}

function dot(a: Float64Array, b: Float64Array) {
  let result = 0;
  for (let i = 0; i < a.length; i++) result += a[i]! * b[i]!;
  return result;
}

function normalize(vector: Float64Array) {
  const norm = Math.sqrt(dot(vector, vector));
  if (!Number.isFinite(norm))
    throw new SemanticUnavailableError('index_unavailable');
  if (norm < 1e-10) return false;
  for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return true;
}

function orthogonalize(vector: Float64Array, basis: Float64Array[]) {
  // A second Gram-Schmidt pass limits rounding errors during deflation.
  for (let pass = 0; pass < 2; pass++) {
    for (const previous of basis) {
      const projection = dot(vector, previous);
      for (let i = 0; i < vector.length; i++)
        vector[i] -= projection * previous[i]!;
    }
  }
}

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * LSA on an L2-normalized, logarithmic TF-IDF matrix. Eigenvectors of its
 * document Gram matrix yield a truncated right-singular basis for terms.
 * Neither queries nor documents are expanded with manually supplied synonyms.
 */
export function createLatentIndex(input: SemanticDocument[]) {
  const started = performance.now();
  const checkDeadline = () => {
    if (performance.now() - started > SEMANTIC_LIMITS.trainingMs)
      throw new SemanticUnavailableError('index_unavailable');
  };
  if (!Array.isArray(input) || input.length < 3)
    throw new SemanticUnavailableError('insufficient_corpus');
  if (input.length > SEMANTIC_LIMITS.documents)
    throw new SemanticUnavailableError('corpus_limit');
  if (
    input.some(
      (document) =>
        !document ||
        typeof document.id !== 'string' ||
        !document.id ||
        !document.terms ||
        typeof document.terms !== 'object' ||
        Array.isArray(document.terms),
    ) ||
    new Set(input.map((document) => document.id)).size !== input.length
  )
    throw new SemanticUnavailableError('index_unavailable');

  // Content fixes numerical row order; document IDs only break content/score ties.
  const documents = input
    .map((document) => ({
      ...document,
      signature: JSON.stringify(
        Object.entries(document.terms).sort(([a], [b]) => compare(a, b)),
      ),
    }))
    .sort((a, b) => compare(a.signature, b.signature) || compare(a.id, b.id));
  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    const entries = Object.entries(document.terms);
    if (!entries.length)
      throw new SemanticUnavailableError('index_unavailable');
    for (const [term, count] of entries) {
      if (
        !/^[a-z0-9]{2,80}$/.test(term) ||
        !Number.isSafeInteger(count) ||
        count <= 0
      )
        throw new SemanticUnavailableError('index_unavailable');
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
      if (documentFrequency.size > SEMANTIC_LIMITS.vocabulary)
        throw new SemanticUnavailableError('corpus_limit');
    }
    checkDeadline();
  }
  const vocabulary = [...documentFrequency.keys()].sort(compare);
  const positions = new Map(vocabulary.map((term, index) => [term, index]));
  const idf = vocabulary.map(
    (term) =>
      Math.log((documents.length + 1) / (documentFrequency.get(term)! + 1)) + 1,
  );
  const vectors: Entry[][] = documents.map((document) => {
    const vector = Object.entries(document.terms).map(([term, count]) => {
      const index = positions.get(term)!;
      return { index, weight: (1 + Math.log(count)) * idf[index]! };
    });
    const norm = Math.sqrt(
      vector.reduce((sum, entry) => sum + entry.weight ** 2, 0),
    );
    if (!Number.isFinite(norm) || norm <= 0)
      throw new SemanticUnavailableError('index_unavailable');
    for (const entry of vector) entry.weight /= norm;
    checkDeadline();
    return vector;
  });

  const n = documents.length;
  const gram = Array.from({ length: n }, () => new Float64Array(n));
  const postings: { document: number; weight: number }[][] = Array.from(
    { length: vocabulary.length },
    () => [],
  );
  for (const [document, vector] of vectors.entries())
    for (const entry of vector)
      postings[entry.index]!.push({ document, weight: entry.weight });
  for (const posting of postings) {
    for (let i = 0; i < posting.length; i++) {
      const a = posting[i]!;
      for (let j = i; j < posting.length; j++) {
        const b = posting[j]!;
        const value = a.weight * b.weight;
        gram[a.document]![b.document] += value;
        if (a.document !== b.document) gram[b.document]![a.document] += value;
      }
      checkDeadline();
    }
  }
  const multiply = (vector: Float64Array) => {
    const result = new Float64Array(n);
    for (let row = 0; row < n; row++) result[row] = dot(gram[row]!, vector);
    return result;
  };
  const targetDimensions = Math.min(
    8,
    Math.max(2, Math.floor(Math.sqrt(n))),
    n - 1,
  );
  const basis: Float64Array[] = [];
  const eigenvalues: number[] = [];
  // One extra positive direction proves that the retained space is truncated.
  for (let component = 0; component <= targetDimensions; component++) {
    let vector = Float64Array.from({ length: n }, (_, i) =>
      component === 0
        ? 1
        : Math.sin((i + 1) * (component + 1) * 1.618) +
          Math.cos((i + 1) * 0.713),
    );
    orthogonalize(vector, basis);
    if (!normalize(vector)) {
      for (let seed = 0; seed < n; seed++) {
        vector.fill(0);
        vector[seed] = 1;
        orthogonalize(vector, basis);
        if (normalize(vector)) break;
      }
    }
    for (
      let iteration = 0;
      iteration < SEMANTIC_LIMITS.iterations;
      iteration++
    ) {
      checkDeadline();
      const next = multiply(vector);
      orthogonalize(next, basis);
      if (!normalize(next)) break;
      const alignment = Math.abs(dot(next, vector));
      vector = next;
      if (1 - alignment < 1e-10) break;
    }
    const value = dot(vector, multiply(vector));
    if (!Number.isFinite(value))
      throw new SemanticUnavailableError('index_unavailable');
    if (value <= Math.max(1e-9, (eigenvalues[0] || 1) * 1e-8)) break;
    basis.push(vector);
    eigenvalues.push(value);
    checkDeadline();
  }
  const dimensions = Math.min(targetDimensions, basis.length - 1);
  // A one-dimensional cosine collapses every positive topic to the same score.
  if (dimensions < 2) throw new SemanticUnavailableError('index_unavailable');
  const termBasis = Array.from(
    { length: dimensions },
    () => new Float64Array(vocabulary.length),
  );
  for (let component = 0; component < dimensions; component++) {
    const sigma = Math.sqrt(eigenvalues[component]!);
    for (const [document, entries] of vectors.entries())
      for (const entry of entries)
        termBasis[component]![entry.index] +=
          (entry.weight * basis[component]![document]!) / sigma;
    checkDeadline();
  }
  const projected = vectors.map((entries) => {
    const vector = Float64Array.from(termBasis, (direction) =>
      entries.reduce(
        (sum, entry) => sum + entry.weight * direction[entry.index]!,
        0,
      ),
    );
    // Unit-length TF-IDF documents make this the fraction of retained energy.
    // Do not turn convergence residue outside the retained subspace into a hit.
    if (dot(vector, vector) < SEMANTIC_LIMITS.minimumProjectedEnergy)
      vector.fill(0);
    else normalize(vector);
    return vector;
  });
  checkDeadline();

  return {
    dimensions,
    vocabularySize: vocabulary.length,
    query(text: string): SemanticHit[] {
      const counts = new Map<number, number>();
      for (const token of tokenizeQuery(text)) {
        const position = positions.get(token);
        if (position !== undefined)
          counts.set(position, (counts.get(position) || 0) + 1);
      }
      if (!counts.size)
        throw new SemanticUnavailableError('query_out_of_vocabulary');
      const query = Float64Array.from(termBasis, (direction) => {
        let value = 0;
        for (const [position, count] of counts)
          value +=
            (1 + Math.log(count)) * idf[position]! * direction[position]!;
        return value;
      });
      let originalEnergy = 0;
      for (const [position, count] of counts)
        originalEnergy += ((1 + Math.log(count)) * idf[position]!) ** 2;
      if (
        dot(query, query) / originalEnergy <
          SEMANTIC_LIMITS.minimumProjectedEnergy ||
        !normalize(query)
      )
        throw new SemanticUnavailableError('query_out_of_vocabulary');
      return projected
        .map((vector, index) => ({
          id: documents[index]!.id,
          score: Number(
            Math.max(-1, Math.min(1, dot(vector, query))).toFixed(12),
          ),
        }))
        .filter((hit) => hit.score >= SEMANTIC_LIMITS.minimumCosine)
        .sort((a, b) => b.score - a.score || compare(a.id, b.id));
    },
  };
}
