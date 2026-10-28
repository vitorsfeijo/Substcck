import { useEffect, useState } from 'react';
import { useAuth } from '../auth/context';
import { TccEditor } from './TccEditor';
import { OwnWorks } from './OwnWorks';

function returnHash() {
  const next = new URLSearchParams(
    window.location.hash.split('?')[1] || '',
  ).get('next');
  return next === '/novo-tcc' ||
    (next && /^\/editar-tcc\/[A-Za-z0-9%_-]+$/.test(next))
    ? `#${next}`
    : '#/perfil';
}

function NavigateTo({ hash }: { hash: string }) {
  useEffect(() => {
    window.location.replace(hash);
  }, [hash]);
  return <p role="status">Abrindo a página de acesso…</p>;
}

function AccessStatus() {
  const auth = useAuth();
  if (auth.status === 'loading')
    return <p role="status">Verificando seu acesso…</p>;
  if (auth.status === 'error')
    return (
      <div className="access-notice" role="alert">
        <p>{auth.error}</p>
        <button
          className="text-button"
          onClick={() => {
            void auth.refresh();
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  return null;
}

export function LoginPage() {
  const auth = useAuth();
  const callbackFailed = new URLSearchParams(
    window.location.hash.split('?')[1] || '',
  ).has('error');
  return (
    <section
      className="account-page section-shell"
      aria-labelledby="access-title"
    >
      <p className="eyebrow">SEU ESPAÇO NA PESQUISA</p>
      <h1 id="access-title">
        Entre para <em>conectar.</em>
      </h1>
      <p className="account-intro">
        A consulta aos trabalhos é pública. O acesso à conta identifica os
        autores e protege suas informações.
      </p>
      {auth.status !== 'ready' ? (
        <AccessStatus />
      ) : auth.user ? (
        <NavigateTo hash={returnHash()} />
      ) : (
        <div className="account-card">
          {auth.config.mode === 'disabled' && (
            <>
              <span className="tiny-label">ACESSO INSTITUCIONAL</span>
              <h2>A conexão com a universidade ainda não está disponível.</h2>
              <p>
                O provedor institucional precisa ser configurado antes de
                entrar. Nenhuma credencial da UFRGS é solicitada nesta página.
              </p>
              <a className="text-link" href="#/">
                Continuar como visitante <span aria-hidden="true">↗</span>
              </a>
            </>
          )}
          {auth.config.mode === 'oidc' && auth.config.loginUrl && (
            <>
              <span className="tiny-label">ACESSO INSTITUCIONAL</span>
              <h2>Continue no provedor da universidade.</h2>
              <p>
                Você será direcionado ao serviço de identidade configurado. Sua
                senha não é recebida por este site.
              </p>
              <a className="button button-primary" href={auth.config.loginUrl}>
                Entrar com acesso institucional{' '}
                <span aria-hidden="true">↗</span>
              </a>
            </>
          )}
          {auth.config.mode === 'development' && (
            <>
              <span className="tiny-label">DESENVOLVIMENTO</span>
              <h2>Escolha um perfil de demonstração.</h2>
              <p className="development-notice" role="note">
                Simulação local de acesso. Não utiliza credenciais da UFRGS.
              </p>
              <div className="persona-list">
                {auth.config.developmentUsers?.map((persona) => (
                  <button
                    key={persona.id}
                    className="persona-button"
                    disabled={auth.busy}
                    onClick={() => {
                      void auth.enterDevelopment(persona.id);
                    }}
                  >
                    <strong>{persona.name}</strong>
                    <span>
                      {persona.role === 'student' ? 'Aluno' : 'Professor'}{' '}
                      <span aria-hidden="true">↗</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {auth.busy && <p role="status">Iniciando sua sessão…</p>}
          {callbackFailed && (
            <p className="access-error" role="alert">
              Não foi possível concluir o acesso institucional. Tente novamente.
            </p>
          )}
          {auth.error && (
            <p className="access-error" role="alert">
              {auth.error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function ProfilePage() {
  const auth = useAuth();
  const [departing, setDeparting] = useState(false);
  return (
    <section
      className="account-page section-shell"
      aria-labelledby="profile-title"
    >
      <p className="eyebrow">SUA CONTA</p>
      <h1 id="profile-title">
        Um ponto de <em>partida.</em>
      </h1>
      {auth.status !== 'ready' ? (
        <AccessStatus />
      ) : !auth.user && departing ? (
        <p role="status">Encerrando sua sessão…</p>
      ) : !auth.user ? (
        <NavigateTo hash="#/entrar?next=/perfil" />
      ) : (
        <>
          <div className="account-card">
            <span className="tiny-label">
              {auth.user.role === 'student' ? 'ALUNO' : 'PROFESSOR'}
            </span>
            <h2>{auth.user.name}</h2>
            {auth.config.mode === 'development' && (
              <p className="development-notice" role="note">
                Simulação local de acesso. Não utiliza credenciais da UFRGS.
              </p>
            )}
            <dl className="profile-details">
              <div>
                <dt>E-mail</dt>
                <dd>{auth.user.email}</dd>
              </div>
              <div>
                <dt>Identificação institucional</dt>
                <dd>{auth.user.institutionalLogin}</dd>
              </div>
              {auth.user.enrollment && (
                <div>
                  <dt>Matrícula</dt>
                  <dd>{auth.user.enrollment}</dd>
                </div>
              )}
              {auth.user.department && (
                <div>
                  <dt>Departamento</dt>
                  <dd>{auth.user.department}</dd>
                </div>
              )}
            </dl>
            <div className="account-actions">
              {auth.user.role === 'student' && (
                <a className="button button-primary" href="#/novo-tcc">
                  Cadastrar Novo TCC <span aria-hidden="true">↗</span>
                </a>
              )}
              <button
                className="text-button"
                disabled={auth.busy}
                onClick={() => {
                  setDeparting(true);
                  void auth.logout().then((left) => {
                    if (left) window.location.hash = '#/';
                    else setDeparting(false);
                  });
                }}
              >
                {auth.busy ? 'Saindo…' : 'Sair da conta'}
              </button>
            </div>
            {auth.error && (
              <p className="access-error" role="alert">
                {auth.error}
              </p>
            )}
          </div>
          {auth.user.role === 'student' && (
            <OwnWorks key={auth.user.id} userId={auth.user.id} />
          )}
        </>
      )}
    </section>
  );
}

export function NewTccPage({ workId }: { workId?: string }) {
  const auth = useAuth();
  return (
    <section
      className="account-page section-shell"
      aria-labelledby="new-tcc-title"
    >
      <p className="eyebrow">SEU TRABALHO</p>
      <h1 id="new-tcc-title">
        {workId ? (
          <>
            Sua pesquisa, <em>em evolução.</em>
          </>
        ) : (
          <>
            A próxima <em>contribuição.</em>
          </>
        )}
      </h1>
      {auth.status !== 'ready' ? (
        <AccessStatus />
      ) : !auth.user ? (
        <NavigateTo
          hash={`#/entrar?next=${encodeURIComponent(workId ? `/editar-tcc/${encodeURIComponent(workId)}` : '/novo-tcc')}`}
        />
      ) : auth.user.role !== 'student' ? (
        <div className="account-card" role="alert">
          <h2>Este espaço é reservado ao aluno autor.</h2>
          <p>
            Seu perfil permite consultar os trabalhos. O cadastro de TCC é
            destinado a alunos com vínculo verificado.
          </p>
          <a className="text-link" href="#/perfil">
            Voltar ao perfil
          </a>
        </div>
      ) : (
        <TccEditor key={`${auth.user.id}:${workId || 'new'}`} workId={workId} />
      )}
    </section>
  );
}
