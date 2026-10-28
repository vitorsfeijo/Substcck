import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { apiBaseUrl } from '../config';
import type { DiscoveryOptions, SearchFilters } from '../models/discovery';
import type { NamedEntity, TccPage } from '../models/tcc';
import {
  buildSearchQuery,
  DiscoveryRequestError,
  getDiscoveryOptions,
  getSearchResults,
  readSearchFilters,
  readSearchPage,
  readSearchPageSize,
  searchHref,
} from '../services/discovery';
import { WorkCard } from './WorkCard';
import '../discovery.css';

const emptyOptions: DiscoveryOptions = {
  authors: [],
  advisors: [],
  years: [],
  tags: [],
  areas: [],
  collections: [],
};
const emptyMessage =
  'Nenhum trabalho encontrado para os critérios informados. Tente ajustar ou remover alguns filtros.';

function Selection({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: NamedEntity[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="search-field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Todos</option>
        {value && !choices.some((item) => item.id === value) && (
          <option value={value}>Seleção indisponível no acervo</option>
        )}
        {choices.map((item) => (
          <option value={item.id} key={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SearchExperience({ query }: { query: string }) {
  const [filters, setFilters] = useState(() => readSearchFilters(query));
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    data?: { results: TccPage; options: DiscoveryOptions };
    error?: string;
  }>({});
  const options = state.data?.options || emptyOptions;
  const submitted = readSearchFilters(query);
  const currentPage = readSearchPage(query);
  const pageSize = new URLSearchParams(query).has('pageSize')
    ? readSearchPageSize(query)
    : undefined;
  const returnTo = `/buscar${query ? `?${query}` : ''}`;
  const loading = Boolean(apiBaseUrl) && !state.data && !state.error;

  useEffect(() => {
    if (!apiBaseUrl) return;
    const controller = new AbortController();
    let active = true;
    void Promise.all([
      getSearchResults(apiBaseUrl, query, controller.signal),
      getDiscoveryOptions(apiBaseUrl, controller.signal),
    ])
      .then(([results, choices]) => {
        if (active) setState({ data: { results, options: choices } });
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            error:
              error instanceof DiscoveryRequestError
                ? error.message
                : 'Não foi possível carregar a pesquisa agora. Tente novamente.',
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [query, attempt]);

  const update = (key: keyof SearchFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const toggle = (key: 'tagIds' | 'areaIds', id: string, checked: boolean) =>
    setFilters((current) => ({
      ...current,
      [key]: checked
        ? [...current[key], id]
        : current[key].filter((value) => value !== id),
    }));
  const navigate = (next: SearchFilters) => {
    const target = searchHref(next, 1, pageSize);
    if (window.location.hash === target) {
      setState({});
      setAttempt((value) => value + 1);
    } else window.location.hash = target;
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(filters);
  };
  const clear = () => {
    const next = readSearchFilters('');
    setFilters(next);
    navigate(next);
  };

  return (
    <div className="search-page section-shell">
      <header className="search-intro">
        <p className="eyebrow">
          <span className="eyebrow-line" /> SIGA SUA CURIOSIDADE
        </p>
        <h1>Buscar TCC</h1>
        <p>
          Um tema, uma pessoa, um novo caminho. Combine os critérios para
          encontrar sua próxima referência.
        </p>
        <a className="text-link" href="#/">
          ← Voltar à descoberta
        </a>
      </header>
      <form className="search-form" aria-label="Buscar TCC" onSubmit={submit}>
        <fieldset className="search-main-fields" disabled={!apiBaseUrl}>
          <legend>O que você quer descobrir?</legend>
          <label className="search-field search-term">
            <span>Termo de pesquisa</span>
            <input
              type="search"
              maxLength={200}
              value={filters.term}
              onChange={(event) => update('term', event.target.value)}
              placeholder="Título, resumo, autor ou orientador"
            />
          </label>
          <div className="search-field-grid">
            <label className="search-field">
              <span>Ano da defesa</span>
              <input
                type="number"
                min={1900}
                max={9999}
                step={1}
                list="discovery-years"
                value={filters.year}
                onChange={(event) => update('year', event.target.value)}
                placeholder="Todos os anos"
              />
              <datalist id="discovery-years">
                {options.years.map((year) => (
                  <option key={year} value={year} />
                ))}
              </datalist>
            </label>
            <label className="search-field">
              <span>Semestre</span>
              <select
                aria-label="Semestre"
                value={filters.semester}
                onChange={(event) => update('semester', event.target.value)}
              >
                <option value="">Todos</option>
                <option value="1">1º semestre</option>
                <option value="2">2º semestre</option>
              </select>
            </label>
            <label className="search-field">
              <span>Defesa a partir de</span>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(event) => update('dateFrom', event.target.value)}
              />
            </label>
            <label className="search-field">
              <span>Defesa até</span>
              <input
                type="date"
                min={filters.dateFrom || undefined}
                value={filters.dateTo}
                onChange={(event) => update('dateTo', event.target.value)}
              />
            </label>
            <Selection
              label="Autor / orientando"
              value={filters.authorId}
              choices={options.authors}
              onChange={(value) => update('authorId', value)}
            />
            <Selection
              label="Orientador"
              value={filters.advisorId}
              choices={options.advisors}
              onChange={(value) => update('advisorId', value)}
            />
            <Selection
              label="Coleção"
              value={filters.collectionId}
              choices={options.collections}
              onChange={(value) => update('collectionId', value)}
            />
          </div>
        </fieldset>
        <div className="search-classifications">
          <fieldset
            disabled={!apiBaseUrl || loading}
            aria-describedby="search-tags-help"
          >
            <legend>Assuntos / tags</legend>
            <p id="search-tags-help">
              O trabalho deve conter todas as tags selecionadas.
            </p>
            <div className="search-checkboxes">
              {options.tags.map((tag) => (
                <label key={tag.id}>
                  <input
                    type="checkbox"
                    checked={filters.tagIds.includes(tag.id)}
                    onChange={(event) =>
                      toggle('tagIds', tag.id, event.target.checked)
                    }
                  />
                  <span>{tag.name}</span>
                </label>
              ))}
              {filters.tagIds
                .filter((id) => !options.tags.some((tag) => tag.id === id))
                .map((id) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked
                      onChange={() => toggle('tagIds', id, false)}
                    />
                    <span>Tag indisponível</span>
                  </label>
                ))}
              {!loading && !options.tags.length && !filters.tagIds.length && (
                <span className="search-options-empty">
                  Nenhuma tag disponível no momento.
                </span>
              )}
            </div>
          </fieldset>
          <fieldset
            disabled={!apiBaseUrl || loading}
            aria-describedby="search-areas-help"
          >
            <legend>Áreas</legend>
            <p id="search-areas-help">
              O trabalho pode pertencer a qualquer uma das áreas selecionadas.
            </p>
            <div className="search-checkboxes">
              {options.areas.map((area) => (
                <label key={area.id}>
                  <input
                    type="checkbox"
                    checked={filters.areaIds.includes(area.id)}
                    onChange={(event) =>
                      toggle('areaIds', area.id, event.target.checked)
                    }
                  />
                  <span>{area.name}</span>
                </label>
              ))}
              {filters.areaIds
                .filter((id) => !options.areas.some((area) => area.id === id))
                .map((id) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked
                      onChange={() => toggle('areaIds', id, false)}
                    />
                    <span>Área indisponível</span>
                  </label>
                ))}
              {!loading && !options.areas.length && !filters.areaIds.length && (
                <span className="search-options-empty">
                  Nenhuma área disponível no momento.
                </span>
              )}
            </div>
          </fieldset>
        </div>
        <div className="search-actions">
          <p>Todos os critérios preenchidos são aplicados juntos.</p>
          <button
            type="button"
            className="button search-clear"
            onClick={clear}
            disabled={!apiBaseUrl}
          >
            Limpar filtros
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={!apiBaseUrl}
          >
            Pesquisar <span aria-hidden="true">↗</span>
          </button>
        </div>
      </form>
      <section
        className="search-results"
        aria-labelledby="search-results-title"
        aria-busy={loading}
      >
        <div className="discovery-subheading">
          <h2 id="search-results-title">Resultados da pesquisa</h2>
          {state.data && (
            <span role="status">
              {state.data.results.total}{' '}
              {state.data.results.total === 1
                ? 'trabalho encontrado'
                : 'trabalhos encontrados'}
            </span>
          )}
        </div>
        {!apiBaseUrl ? (
          <div className="discovery-notice">
            <h3>O acervo ainda precisa ser conectado.</h3>
            <p>
              A busca estará disponível quando os trabalhos puderem ser
              consultados. Você também pode explorar a produção acadêmica
              diretamente no LUME.
            </p>
            <a className="text-link" href="https://lume.ufrgs.br">
              Conhecer o repositório LUME <span aria-hidden="true">↗</span>
            </a>
          </div>
        ) : state.error ? (
          <div className="discovery-notice" role="alert">
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
            Pesquisando trabalhos…
          </p>
        ) : !state.data.results.items.length ? (
          <div className="discovery-notice" role="status">
            <p>{emptyMessage}</p>
            <button className="text-button" onClick={clear}>
              Remover filtros e pesquisar novamente
            </button>
          </div>
        ) : (
          <>
            <ul className="discovery-grid" aria-label="Resultados da pesquisa">
              {state.data.results.items.map((work) => (
                <li key={work.id}>
                  <WorkCard work={work} returnTo={returnTo} />
                </li>
              ))}
            </ul>
            {(state.data.results.total > state.data.results.pageSize ||
              currentPage > 1) && (
              <nav
                className="discovery-pagination"
                aria-label="Páginas dos resultados"
              >
                {currentPage > 1 ? (
                  <a
                    className="text-link"
                    rel="prev"
                    href={searchHref(submitted, currentPage - 1, pageSize)}
                  >
                    <span aria-hidden="true">←</span> Página anterior
                  </a>
                ) : (
                  <span />
                )}
                <span>
                  Página {currentPage} de{' '}
                  {Math.max(
                    1,
                    Math.ceil(
                      state.data.results.total / state.data.results.pageSize,
                    ),
                  )}
                </span>
                {currentPage * state.data.results.pageSize <
                state.data.results.total ? (
                  <a
                    className="text-link"
                    rel="next"
                    href={searchHref(submitted, currentPage + 1, pageSize)}
                  >
                    Próxima página <span aria-hidden="true">→</span>
                  </a>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** Each URL owns its form state, including when browser Back restores an earlier query. */
export function SearchPage({ query }: { query: string }) {
  return (
    <SearchExperience
      key={buildSearchQuery(
        readSearchFilters(query),
        readSearchPage(query),
        readSearchPageSize(query),
      )}
      query={query}
    />
  );
}
