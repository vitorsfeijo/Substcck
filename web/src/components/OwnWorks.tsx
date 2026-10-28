import { useEffect, useState } from 'react';
import { apiBaseUrl } from '../config';
import { getOwnWorks } from '../services/tcc';
import type { TccPage } from '../models/tcc';

export function OwnWorks({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ data?: TccPage; error?: string }>({});

  useEffect(() => {
    if (!apiBaseUrl) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    let active = true;
    void getOwnWorks(apiBaseUrl, controller.signal, page)
      .then((data) => {
        if (active) setState({ data });
      })
      .catch(() => {
        if (active)
          setState({
            error: 'Não foi possível carregar seus trabalhos agora.',
          });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [userId, page, attempt]);

  return (
    <section className="own-works" aria-labelledby="own-works-title">
      <div className="own-works-heading">
        <div>
          <span className="tiny-label">SUAS PUBLICAÇÕES</span>
          <h2 id="own-works-title">Pesquisa em movimento.</h2>
        </div>
        <a className="text-link" href="#/novo-tcc">
          Novo trabalho <span aria-hidden="true">↗</span>
        </a>
      </div>
      {state.error ? (
        <div className="access-notice" role="alert">
          <p>{state.error}</p>
          <button
            className="text-button"
            onClick={() => {
              setState({});
              setAttempt((value) => value + 1);
            }}
          >
            Tentar carregar trabalhos novamente
          </button>
        </div>
      ) : !state.data ? (
        <p role="status">Carregando seus trabalhos…</p>
      ) : !state.data.items.length ? (
        <div className="own-works-empty">
          <p>Seu próximo trabalho começa aqui.</p>
          <span>
            Cadastre uma pesquisa ou salve um rascunho para continuar depois.
          </span>
        </div>
      ) : (
        <>
          <ul className="own-works-list">
            {state.data.items.map((work) => (
              <li key={work.id}>
                <div>
                  <span
                    className={`work-status work-status--${work.status.toLowerCase()}`}
                  >
                    {work.status === 'PUBLICADO'
                      ? 'Publicado'
                      : 'Rascunho privado'}
                  </span>
                  <h3>{work.title}</h3>
                  <p>
                    {work.year && work.semester
                      ? `${work.year}/${work.semester}`
                      : 'Período ainda não informado'}{' '}
                    ·{' '}
                    {work.tags.map((tag) => tag.name).join(', ') || 'Sem tags'}
                  </p>
                </div>
                <a
                  className="text-link"
                  href={`#/editar-tcc/${encodeURIComponent(work.id)}`}
                >
                  {work.status === 'RASCUNHO'
                    ? 'Retomar rascunho'
                    : 'Editar TCC'}{' '}
                  <span aria-hidden="true">↗</span>
                </a>
              </li>
            ))}
          </ul>
          {state.data.total > state.data.pageSize && (
            <nav
              className="work-pagination"
              aria-label="Páginas dos seus trabalhos"
            >
              <button
                className="text-button"
                disabled={page === 1}
                onClick={() => {
                  setState({});
                  setPage((value) => value - 1);
                }}
              >
                Anterior
              </button>
              <span>
                Página {page} de{' '}
                {Math.ceil(state.data.total / state.data.pageSize)}
              </span>
              <button
                className="text-button"
                disabled={page * state.data.pageSize >= state.data.total}
                onClick={() => {
                  setState({});
                  setPage((value) => value + 1);
                }}
              >
                Próxima
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
