import { useEffect, useRef, useState } from 'react';
import { PlatformStatus } from './components/PlatformStatus';
import { ResearchMap } from './components/ResearchMap';
import { useAuth } from './auth/context';
import { LoginPage, NewTccPage, ProfilePage } from './components/AccountPages';

type Route = 'home' | 'about' | 'login' | 'profile' | 'new-tcc' | 'edit-tcc';

function getRoute(): Route {
  const path = window.location.hash.split('?')[0];
  if (path === '#/sobre') return 'about';
  if (path === '#/entrar') return 'login';
  if (path === '#/perfil') return 'profile';
  if (path === '#/novo-tcc') return 'new-tcc';
  if (/^#\/editar-tcc\/[^/?]+$/.test(path)) return 'edit-tcc';
  return 'home';
}

function Wordmark() {
  return (
    <a className="wordmark" href="#/" aria-label="Substcck — início">
      <span className="brand-symbol" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        Sub<span className="brand-accent">stcc</span>k
        <span className="brand-period">.</span>
      </span>
    </a>
  );
}

function Home() {
  return (
    <>
      <section className="hero section-shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="eyebrow-line" /> PESQUISA QUE VAI ALÉM DA BANCA
          </p>
          <h1 id="hero-title">
            Tornar
            <br />
            conhecimento
            <br />
            <em>visível.</em>
          </h1>
          <p className="hero-description">
            Grandes ideias não deveriam ficar esquecidas em um e-mail. Um novo
            espaço para descobrir, conectar e dar vida aos TCCs de computação da
            UFRGS.
          </p>
          <div className="hero-actions">
            <button
              className="button button-primary"
              onClick={() =>
                document
                  .getElementById('catalogo')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Explorar o catálogo <span aria-hidden="true">↓</span>
            </button>
            <a className="text-link" href="#/sobre">
              Conheça a proposta <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="hero-signature">
            <span className="signature-mark" aria-hidden="true">
              inf<span>●</span>
            </span>
            <span>
              Uma iniciativa para a comunidade do
              <br />
              <strong>Instituto de Informática · UFRGS</strong>
            </span>
          </div>
        </div>
        <ResearchMap />
      </section>

      <div className="principles-strip">
        <div className="section-shell principles-inner">
          <span>01 / DESCOBRIR</span>
          <span>02 / CONECTAR</span>
          <span>03 / COMPARTILHAR</span>
          <span className="strip-note">
            O conhecimento continua aqui. <span aria-hidden="true">↗</span>
          </span>
        </div>
      </div>

      <section
        id="catalogo"
        className="catalog section-shell"
        aria-labelledby="catalog-title"
      >
        <div className="section-heading">
          <p className="eyebrow">UM ACERVO, MUITAS POSSIBILIDADES</p>
          <h2 id="catalog-title">
            O próximo capítulo
            <br />
            da sua curiosidade.
          </h2>
          <p>
            Do primeiro interesse à próxima referência. <br />
            Pesquisas feitas para serem encontradas.
          </p>
        </div>
        <div className="catalog-empty">
          <div className="empty-illustration" aria-hidden="true">
            <span />
            <span />
            <span />
            <b>+</b>
          </div>
          <div>
            <span className="tiny-label">EM CONSTRUÇÃO</span>
            <h3>Estamos preparando o catálogo.</h3>
            <p>
              Em breve, trabalhos, pessoas e ideias vão se encontrar por aqui.
              Enquanto isso, a produção acadêmica da UFRGS continua disponível
              no LUME.
            </p>
            <a className="text-link" href="https://lume.ufrgs.br">
              Conhecer o repositório LUME <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </section>

      <section
        className="purpose section-shell"
        aria-labelledby="purpose-title"
      >
        <div>
          <p className="eyebrow">MAIS DO QUE UM REPOSITÓRIO</p>
          <h2 id="purpose-title">
            Ideias feitas <br />
            para <em>circular.</em>
          </h2>
        </div>
        <div className="purpose-items">
          <article>
            <span>01</span>
            <div>
              <h3>Entender antes de aprofundar</h3>
              <p>
                Resumos acessíveis e recursos visuais para aproximar você da
                pesquisa.
              </p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <h3>Encontrar pontos em comum</h3>
              <p>
                Áreas e temas que conectam trabalhos, interesses e novas
                possibilidades.
              </p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <h3>Dar alcance a cada descoberta</h3>
              <p>
                Um espaço pensado para que o conhecimento produzido no INF
                encontre mais pessoas.
              </p>
            </div>
          </article>
        </div>
      </section>
    </>
  );
}

function About() {
  return (
    <div className="about section-shell">
      <p className="eyebrow">
        <span className="eyebrow-line" /> SOBRE O PROJETO
      </p>
      <h1>
        Uma pesquisa pode
        <br />
        ser o começo de
        <br />
        <em>muitas outras.</em>
      </h1>
      <p className="about-intro">
        O Substcck nasce para aproximar a comunidade dos trabalhos de conclusão
        de curso do Instituto de Informática da UFRGS. Uma forma mais visual e
        acessível de descobrir o que está sendo pesquisado — e perceber como as
        ideias se conectam.
      </p>
      <div className="about-grid">
        <section aria-labelledby="delivery-title">
          <span className="tiny-label">TERCEIRA ENTREGA</span>
          <h2 id="delivery-title">A base para o que vem.</h2>
          <p>
            Esta versão permite cadastrar, ilustrar, publicar e editar
            trabalhos, além de salvar rascunhos privados. O catálogo e a busca
            na interface serão desenvolvidos na próxima entrega.
          </p>
          <p>
            O acesso institucional de produção ainda precisa ser conectado ao
            provedor da universidade. O cadastro e a publicação exigem uma API
            configurada e um perfil de aluno autorizado.
          </p>
          <PlatformStatus />
        </section>
        <section aria-labelledby="vision-title">
          <span className="tiny-label">A PROPOSTA</span>
          <h2 id="vision-title">
            Menos distância.
            <br />
            Mais descobertas.
          </h2>
          <p>
            Reunir resumos, demonstrações e referências oficiais em uma
            experiência que convida à leitura. Organizar por áreas e tags para
            facilitar o encontro entre pesquisas.
          </p>
          <p>
            O LUME permanece como referência institucional dos documentos
            oficiais. O Substcck propõe uma nova porta de entrada para esse
            conhecimento.
          </p>
          <a className="text-link" href="https://lume.ufrgs.br">
            Visitar o LUME <span aria-hidden="true">↗</span>
          </a>
        </section>
      </div>
      <a className="text-link about-back" href="#/">
        <span aria-hidden="true">←</span> Voltar ao início
      </a>
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  const [route, setRoute] = useState(getRoute);
  const [hash, setHash] = useState(() => window.location.hash);
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    const changeRoute = () => {
      setHash(window.location.hash);
      setRoute(getRoute());
    };
    window.addEventListener('hashchange', changeRoute);
    return () => window.removeEventListener('hashchange', changeRoute);
  }, []);

  useEffect(() => {
    const titles = {
      home: 'Substcck — Conhecimento que circula',
      about: 'Sobre — Substcck',
      login: 'Entrar — Substcck',
      profile: 'Meu perfil — Substcck',
      'new-tcc': 'Novo TCC — Substcck',
      'edit-tcc': 'Editar TCC — Substcck',
    };
    document.title = titles[route];
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    mainRef.current?.focus({ preventScroll: true });
  }, [route, hash]);

  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Pular para o conteúdo
      </a>
      <header className="site-header section-shell">
        <Wordmark />
        <nav aria-label="Navegação principal">
          <a href="#/" aria-current={route === 'home' ? 'page' : undefined}>
            Descobrir
          </a>
          <a
            href="#/sobre"
            aria-current={route === 'about' ? 'page' : undefined}
          >
            Sobre o projeto
          </a>
          <a
            href={auth.user ? '#/perfil' : '#/entrar'}
            aria-current={
              route === 'profile' ||
              route === 'login' ||
              route === 'new-tcc' ||
              route === 'edit-tcc'
                ? 'page'
                : undefined
            }
            className="account-nav"
          >
            {auth.user ? 'Meu perfil' : 'Entrar'}
          </a>
        </nav>
        <span className="header-institution">
          INFORMÁTICA
          <br />
          <strong>UFRGS</strong>
        </span>
      </header>
      <main id="main-content" tabIndex={-1} ref={mainRef}>
        {route === 'about' ? (
          <About />
        ) : route === 'login' ? (
          <LoginPage />
        ) : route === 'profile' ? (
          <ProfilePage />
        ) : route === 'new-tcc' || route === 'edit-tcc' ? (
          <NewTccPage
            workId={
              route === 'edit-tcc'
                ? (() => {
                    const id = hash.split('?')[0].split('/')[2];
                    try {
                      return decodeURIComponent(id);
                    } catch {
                      return id;
                    }
                  })()
                : undefined
            }
          />
        ) : (
          <Home />
        )}
      </main>
      <footer className="site-footer">
        <div className="section-shell footer-inner">
          <Wordmark />
          <p>Feito para circular conhecimento.</p>
          <span>
            PORTO ALEGRE · RS <span aria-hidden="true">↗</span>
          </span>
        </div>
      </footer>
    </>
  );
}
