import { performance } from 'node:perf_hooks';
import { createLatentIndex, SEMANTIC_LIMITS } from '../semantic/lsa.js';
import {
  semanticEvaluationDocuments,
  semanticEvaluationQueries,
} from '../semantic/evaluation.js';
import { tokenizeQuery } from '../semantic/text.js';

const documents = semanticEvaluationDocuments();
const started = performance.now();
const model = createLatentIndex(documents);
const trainingMs = Number((performance.now() - started).toFixed(2));
const cases = semanticEvaluationQueries.map((evaluation) => {
  const target = documents.find((item) => item.id === evaluation.expectedId)!;
  const noDirectOverlap = !tokenizeQuery(evaluation.query).some((term) =>
    Object.hasOwn(target.terms, term),
  );
  const top3 = model.query(evaluation.query).slice(0, 3);
  const passed =
    noDirectOverlap &&
    top3.some((item) => item.id === evaluation.expectedId) &&
    top3.every((item) => item.id.startsWith(evaluation.group));
  return {
    query: evaluation.query,
    expectedId: evaluation.expectedId,
    noDirectOverlap,
    top3,
    passed,
  };
});
console.log(
  JSON.stringify(
    {
      technique: 'TF-IDF / LSA',
      documents: documents.length,
      dimensions: model.dimensions,
      vocabulary: model.vocabularySize,
      minimumCosine: SEMANTIC_LIMITS.minimumCosine,
      trainingMs,
      passed: cases.filter((item) => item.passed).length,
      total: cases.length,
      cases,
    },
    null,
    2,
  ),
);
if (cases.some((item) => !item.passed)) process.exitCode = 1;
