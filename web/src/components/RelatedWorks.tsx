import { useEffect, useState } from 'react';
import { apiBaseUrl } from '../config';
import { getRelatedWorks } from '../services/related';
import type { RelatedWork } from '../services/related';
import { WorkCard } from './WorkCard';
import '../discovery.css';
import '../related.css';

interface RelatedState {
  workId: string;
  items?: RelatedWork[];
  error?: boolean;
}

export function RelatedWorks({
  workId,
  returnTo = '/buscar',
}: {
  workId: string;
  returnTo?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RelatedState>({ workId: '' });

  useEffect(() => {
    if (!apiBaseUrl) return;
    const controller = new AbortController();
    let active = true;
    void getRelatedWorks(apiBaseUrl, workId, controller.signal)
      .then((items) => {
        if (active) setState({ workId, items });
      })
      .catch(() => {
        if (active) setState({ workId, error: true });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [workId, attempt]);

  if (!apiBaseUrl) return null;
  const current = state.workId === workId ? state : null;

  return (
    <section className="related-works" aria-labelledby="related-works-title">
      <div className="related-heading">
        <div>
          <p className="tiny-label">OUTROS CAMINHOS PARA EXPLORAR</p>
          <h2 id="related-works-title">Trabalhos conexos</h2>
        </div>
        <p>Pesquisas que compartilham assuntos ou áreas com este trabalho.</p>
      </div>
      {current?.error ? (
        <div className="related-notice" role="alert">
          <p>Não foi possível carregar os trabalhos conexos agora.</p>
          <button
            className="text-button"
            onClick={() => {
              setState({ workId });
              setAttempt((value) => value + 1);
            }}
          >
            Tentar carregar conexões novamente
          </button>
        </div>
      ) : !current?.items ? (
        <p className="related-notice" role="status">
          Procurando trabalhos conexos…
        </p>
      ) : !current.items.length ? (
        <p className="related-notice">
          Ainda não há trabalhos conexos para esta pesquisa.
        </p>
      ) : (
        <ul
          className="discovery-grid related-grid"
          aria-label="Trabalhos conexos"
        >
          {current.items.map((item) => {
            const names = [
              ...new Set([
                ...item.sharedTags.map((tag) => tag.name),
                ...item.sharedAreas.map((area) => area.name),
              ]),
            ];
            return (
              <li key={item.tcc.id}>
                <p className="related-reason">Em comum: {names.join(', ')}.</p>
                <WorkCard work={item.tcc} returnTo={returnTo} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
