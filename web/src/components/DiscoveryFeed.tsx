import { useEffect, useState } from 'react';
import { apiBaseUrl } from '../config';
import type { FeedDTO } from '../models/discovery';
import { getFeed } from '../services/discovery';
import { WorkCard } from './WorkCard';
import '../discovery.css';

export function DiscoveryFeed() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ data?: FeedDTO; error?: string }>({});

  useEffect(() => {
    if (!apiBaseUrl) return;
    const controller = new AbortController();
    let active = true;
    void getFeed(apiBaseUrl, controller.signal)
      .then((data) => {
        if (active) setState({ data });
      })
      .catch(() => {
        if (active)
          setState({ error: 'Não foi possível carregar o acervo agora.' });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  return (
    <section
      id="catalogo"
      className="catalog section-shell discovery-feed"
      aria-labelledby="catalog-title"
    >
      <div className="discovery-heading">
        <div>
          <p className="eyebrow">UM ACERVO, MUITAS POSSIBILIDADES</p>
          <h2 id="catalog-title">
            O próximo capítulo
            <br />
            da sua curiosidade.
          </h2>
          <p>
            Pesquisas feitas para serem encontradas. Escolha um tema e continue
            a descoberta.
          </p>
        </div>
        <a className="button button-primary" href="#/buscar">
          Buscar TCC <span aria-hidden="true">↗</span>
        </a>
      </div>
      {!apiBaseUrl ? (
        <div className="discovery-notice">
          <span className="tiny-label">O ACERVO</span>
          <h3>O acervo ainda precisa ser conectado.</h3>
          <p>Enquanto isso, explore a produção acadêmica da UFRGS no LUME.</p>
          <a className="text-link" href="https://lume.ufrgs.br">
            Conhecer o repositório LUME <span aria-hidden="true">↗</span>
          </a>
        </div>
      ) : state.error ? (
        <div className="discovery-notice" role="alert">
          <h3>A descoberta pode continuar em instantes.</h3>
          <p>{state.error}</p>
          <button
            className="text-button"
            onClick={() => {
              setState({});
              setAttempt((value) => value + 1);
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : !state.data ? (
        <p className="discovery-loading" role="status">
          Carregando o acervo…
        </p>
      ) : (
        <>
          <section className="discovery-topics" aria-labelledby="topics-title">
            <div>
              <h3 id="topics-title">Tópicos em alta</h3>
              <p>Mais explorados nos últimos {state.data.windowDays} dias.</p>
            </div>
            {state.data.topics.length ? (
              <ul aria-label="Tópicos em alta">
                {state.data.topics.map((tag, index) => (
                  <li key={tag.id}>
                    <a href={`#/buscar?tagIds=${encodeURIComponent(tag.id)}`}>
                      <span aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      {tag.name}
                      <span className="topic-views">
                        {tag.views} {tag.views === 1 ? 'leitura' : 'leituras'}
                      </span>
                      <span aria-hidden="true">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="discovery-topics-empty">
                Os tópicos aparecem conforme os trabalhos são lidos.
              </p>
            )}
          </section>
          {state.data.recent.length ? (
            <section
              className="discovery-recent"
              aria-labelledby="recent-title"
            >
              <div className="discovery-subheading">
                <h3 id="recent-title">Defendidos recentemente</h3>
                <span>Novas perspectivas para explorar.</span>
              </div>
              <ul
                className="discovery-grid"
                aria-label="Trabalhos defendidos recentemente"
              >
                {state.data.recent.map((work) => (
                  <li key={work.id}>
                    <WorkCard work={work} />
                  </li>
                ))}
              </ul>
              <a className="text-link discovery-more" href="#/buscar">
                Explorar todos os trabalhos <span aria-hidden="true">↗</span>
              </a>
            </section>
          ) : (
            <div className="discovery-notice">
              <h3>O acervo começa com a próxima pesquisa.</h3>
              <p>
                Ainda não há trabalhos publicados. Quando uma pesquisa for
                publicada, ela aparecerá aqui.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
