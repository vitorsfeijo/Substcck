import { useEffect, useRef, useState } from 'react';
import { apiBaseUrl } from '../config';
import type { TccDTO } from '../models/tcc';
import {
  downloadPublishedFile,
  getPublishedWork,
  officialLumeUrl,
  publicAttachmentUrl,
  ReadingRequestError,
  recordPublicView,
} from '../services/reading';
import '../reading.css';

const downloadError =
  'Ocorreu um erro durante o download, verifique a sua conexão com a internet e tente novamente.';

function searchLink(field: string, value: string) {
  return `#/buscar?${new URLSearchParams({ [field]: value })}`;
}

function backLink(returnTo?: string) {
  if (returnTo === '/') return '#/';
  if (returnTo === '/buscar') return '#/buscar';
  if (returnTo?.startsWith('/buscar?'))
    return `#/buscar?${new URLSearchParams(returnTo.slice('/buscar?'.length))}`;
  return '#/buscar';
}

function defenseDate(value: string | null) {
  if (!value) return 'Data não informada';
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return 'Data não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

function ReadingImage({
  image,
  index,
}: {
  image: TccDTO['media'][number];
  index: number;
}) {
  const [failed, setFailed] = useState(false);
  const url = apiBaseUrl ? publicAttachmentUrl(apiBaseUrl, image.url) : null;
  return (
    <figure className="reading-figure">
      {url && !failed ? (
        <img
          src={url}
          alt={image.description || `Demonstração ${index + 1} do trabalho`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <p className="reading-image-unavailable">Imagem indisponível.</p>
      )}
      {image.description && <figcaption>{image.description}</figcaption>}
    </figure>
  );
}

interface ReadingState {
  workId: string;
  work?: TccDTO;
  error?: 'not-found' | 'unavailable';
}

export function ReadingPage({
  workId,
  returnTo,
}: {
  workId: string;
  returnTo?: string;
}) {
  const [state, setState] = useState<ReadingState>({ workId: '' });
  const [attempt, setAttempt] = useState(0);
  const [downloadState, setDownloadState] = useState({
    workId: '',
    busy: false,
    failed: false,
  });
  const downloadController = useRef<AbortController | null>(null);
  const downloadUrls = useRef(new Map<string, number>());

  useEffect(() => {
    if (!apiBaseUrl) return;
    const controller = new AbortController();
    let active = true;
    document.title = 'Leitura — Substcck';
    void getPublishedWork(apiBaseUrl, workId, controller.signal)
      .then((work) => {
        if (!active) return;
        setState({ workId, work });
        document.title = `${work.title} — Substcck`;
        void recordPublicView(apiBaseUrl!, work.id, controller.signal).catch(
          () => {
            // Metrics never interrupt the reading or its download actions.
          },
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          workId,
          error:
            error instanceof ReadingRequestError && error.status === 404
              ? 'not-found'
              : 'unavailable',
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [workId, attempt]);

  useEffect(() => {
    const urls = downloadUrls.current;
    return () => {
      downloadController.current?.abort();
      downloadController.current = null;
      for (const [url, timer] of urls) {
        window.clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, [workId]);

  const current = state.workId === workId ? state : null;
  const work = current?.work;
  const busy = downloadState.workId === workId && downloadState.busy;
  const failedDownload =
    downloadState.workId === workId && downloadState.failed;
  const back = backLink(returnTo);

  async function download() {
    if (!work?.file || !apiBaseUrl || downloadController.current) return;
    const controller = new AbortController();
    downloadController.current = controller;
    setDownloadState({ workId, busy: true, failed: false });
    try {
      const { blob, filename } = await downloadPublishedFile(
        apiBaseUrl,
        work.file,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      const timer = window.setTimeout(() => {
        URL.revokeObjectURL(url);
        downloadUrls.current.delete(url);
      }, 1000);
      downloadUrls.current.set(url, timer);
      setDownloadState({ workId, busy: false, failed: false });
    } catch {
      if (!controller.signal.aborted)
        setDownloadState({ workId, busy: false, failed: true });
    } finally {
      if (downloadController.current === controller)
        downloadController.current = null;
    }
  }

  const retry = () => {
    setState({ workId });
    setAttempt((value) => value + 1);
  };

  return (
    <article className="reading-page section-shell">
      <a className="text-link reading-back" href={back}>
        <span aria-hidden="true">←</span>{' '}
        {back === '#/' ? 'Voltar à descoberta' : 'Voltar aos resultados'}
      </a>
      {!apiBaseUrl ? (
        <section className="reading-notice" aria-labelledby="reading-status">
          <p className="eyebrow">LEITURA</p>
          <h1 id="reading-status">O acervo ainda precisa ser conectado.</h1>
          <p>
            A consulta aos trabalhos estará disponível quando o serviço de dados
            for configurado.
          </p>
          <a className="text-link" href="https://lume.ufrgs.br">
            Conhecer o repositório LUME <span aria-hidden="true">↗</span>
          </a>
        </section>
      ) : !current || (!work && !current.error) ? (
        <section className="reading-notice" aria-labelledby="reading-status">
          <p className="eyebrow">LEITURA</p>
          <h1 id="reading-status">Abrindo a pesquisa.</h1>
          <p role="status">Carregando trabalho…</p>
        </section>
      ) : current.error ? (
        <section className="reading-notice" aria-labelledby="reading-status">
          <p className="eyebrow">LEITURA</p>
          <h1 id="reading-status">
            {current.error === 'not-found'
              ? 'Trabalho não encontrado.'
              : 'Não foi possível abrir este trabalho agora.'}
          </h1>
          <p role="alert">
            {current.error === 'not-found'
              ? 'O trabalho não está disponível para leitura pública. Explore outros trabalhos no acervo.'
              : 'Verifique sua conexão e tente carregar a pesquisa novamente.'}
          </p>
          {current.error === 'unavailable' && (
            <button className="button button-outline" onClick={retry}>
              Tentar carregar trabalho novamente
            </button>
          )}
        </section>
      ) : work ? (
        <>
          <header className="reading-heading">
            <p className="eyebrow">PESQUISA QUE CIRCULA</p>
            <div className="reading-period">
              <span>TRABALHO DE CONCLUSÃO DE CURSO</span>
              <span>
                {work.year && work.semester
                  ? `${work.year} / ${work.semester}º semestre`
                  : 'Período não informado'}
              </span>
            </div>
            <h1>{work.title}</h1>
            <p className="reading-author">
              Por{' '}
              <a href={searchLink('authorId', work.author.id)}>
                {work.author.name}
              </a>
            </p>
            <ul className="reading-tags" aria-label="Tags do trabalho">
              {work.tags.map((tag) => (
                <li key={tag.id}>
                  <a href={searchLink('tagIds', tag.id)}>{tag.name}</a>
                </li>
              ))}
            </ul>
          </header>

          <div className="reading-layout">
            <div className="reading-content">
              <section aria-labelledby="reading-summary">
                <p className="tiny-label">01 / A PESQUISA EM POUCAS PALAVRAS</p>
                <h2 id="reading-summary">O que este trabalho conta.</h2>
                <div className="reading-summary">
                  {work.summary || 'Resumo ainda não disponível.'}
                </div>
              </section>
              {!!work.media.length && (
                <section
                  className="reading-demonstrations"
                  aria-labelledby="reading-images"
                >
                  <p className="tiny-label">02 / ALÉM DAS PALAVRAS</p>
                  <h2 id="reading-images">Uma pesquisa que se vê.</h2>
                  {work.media.map((image, index) => (
                    <ReadingImage key={image.id} image={image} index={index} />
                  ))}
                </section>
              )}
            </div>

            <aside className="reading-details" aria-label="Dados do trabalho">
              <section aria-labelledby="reading-credits">
                <p className="tiny-label">PESSOAS E CONTEXTO</p>
                <h2 id="reading-credits">Por trás da pesquisa.</h2>
                <dl>
                  <div>
                    <dt>Autor</dt>
                    <dd>
                      <a href={searchLink('authorId', work.author.id)}>
                        {work.author.name}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>Orientador</dt>
                    <dd>
                      {work.advisor ? (
                        <a href={searchLink('advisorId', work.advisor.id)}>
                          {work.advisor.name}
                        </a>
                      ) : (
                        'Não informado'
                      )}
                    </dd>
                  </div>
                  {work.coadvisor && (
                    <div>
                      <dt>Coorientador</dt>
                      <dd>{work.coadvisor.name}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Data de defesa</dt>
                    <dd>
                      {work.defendedAt ? (
                        <time dateTime={work.defendedAt}>
                          {defenseDate(work.defendedAt)}
                        </time>
                      ) : (
                        defenseDate(null)
                      )}
                    </dd>
                  </div>
                  {!!work.tags.some((tag) => tag.area) && (
                    <div>
                      <dt>Áreas</dt>
                      <dd>
                        {[
                          ...new Map(
                            work.tags.flatMap((tag) =>
                              tag.area
                                ? [[tag.area.id, tag.area] as const]
                                : [],
                            ),
                          ).values(),
                        ].map((area, index) => (
                          <span key={area.id}>
                            {index > 0 && ', '}
                            <a href={searchLink('areaIds', area.id)}>
                              {area.name}
                            </a>
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                  {work.collection && (
                    <div>
                      <dt>Coleção</dt>
                      <dd>
                        <a
                          href={searchLink('collectionId', work.collection.id)}
                        >
                          {work.collection.name}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              </section>

              <section
                className="reading-document"
                aria-labelledby="reading-document-title"
              >
                <p className="tiny-label">PARA IR ALÉM</p>
                <h2 id="reading-document-title">O trabalho completo.</h2>
                {work.file ? (
                  <>
                    <p className="reading-filename">
                      <span>{work.file.format}</span> {work.file.originalName}
                    </p>
                    <button
                      className="button button-primary"
                      onClick={() => void download()}
                      disabled={busy}
                    >
                      {busy ? 'Preparando arquivo…' : 'Baixar Artigo'}
                      <span aria-hidden="true">↓</span>
                    </button>
                    {failedDownload && (
                      <div className="reading-download-error" role="alert">
                        <p>{downloadError}</p>
                        <button
                          className="text-button"
                          onClick={() => void download()}
                        >
                          Tentar download novamente
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p>
                    O documento completo pode ser consultado na referência
                    oficial do LUME.
                  </p>
                )}
                {officialLumeUrl(work.lumeUrl) ? (
                  <a
                    className="text-link reading-official-link"
                    href={officialLumeUrl(work.lumeUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir documento no LUME <span aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <p>Referência oficial indisponível.</p>
                )}
              </section>
            </aside>
          </div>

          <div className="reading-end">
            <p>Uma referência pode abrir muitas outras.</p>
            <a className="text-link" href={back}>
              Continuar explorando <span aria-hidden="true">↗</span>
            </a>
          </div>
        </>
      ) : null}
    </article>
  );
}
