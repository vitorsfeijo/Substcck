import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useAuth } from '../auth/context';
import { apiBaseUrl } from '../config';
import type {
  AttachmentDTO,
  TccCommand,
  TccDTO,
  TccOptions,
} from '../models/tcc';
import {
  createTag,
  discardAttachment,
  EditorRequestError,
  getOwnWork,
  getPrivateImage,
  getTccOptions,
  saveTcc,
  uploadAttachment,
} from '../services/tcc';

interface ImageEntry {
  id: string;
  name: string;
  description: string;
  preview?: string;
  staged: boolean;
}

interface EditorForm {
  title: string;
  summary: string;
  year: string;
  semester: string;
  defendedAt: string;
  advisorId: string;
  coadvisorId: string;
  lumeUrl: string;
  tagIds: string[];
  collectionId: string;
}

const emptyForm: EditorForm = {
  title: '',
  summary: '',
  year: '',
  semester: '',
  defendedAt: '',
  advisorId: '',
  coadvisorId: '',
  lumeUrl: '',
  tagIds: [],
  collectionId: '',
};
const emptyOptions: TccOptions = {
  professors: [],
  tags: [],
  areas: [],
  collections: [],
};

function formFrom(work: TccDTO): EditorForm {
  return {
    title: work.title,
    summary: work.summary || '',
    year: String(work.year || ''),
    semester: String(work.semester || ''),
    defendedAt: work.defendedAt || '',
    advisorId: work.advisor?.id || '',
    coadvisorId: work.coadvisor?.id || '',
    lumeUrl: work.lumeUrl || '',
    tagIds: work.tags.map((tag) => tag.id),
    collectionId: work.collection?.id || '',
  };
}

function validate(form: EditorForm, intent: 'publish' | 'draft') {
  const fields: Record<string, string> = {};
  if (!form.title.trim()) fields.title = 'Informe o título do trabalho.';
  if (intent === 'publish') {
    if (!form.summary.trim()) fields.summary = 'Informe o resumo simplificado.';
    if (!form.year) fields.year = 'Informe o ano da defesa.';
    if (!form.semester) fields.semester = 'Informe o semestre.';
    if (!form.defendedAt) fields.defendedAt = 'Informe a data de defesa.';
    if (!form.advisorId) fields.advisorId = 'Selecione o orientador.';
    if (!form.lumeUrl.trim()) fields.lumeUrl = 'Informe o link do LUME.';
    if (!form.tagIds.length) fields.tagIds = 'Selecione ao menos uma tag.';
  }
  if (form.coadvisorId && form.coadvisorId === form.advisorId)
    fields.coadvisorId =
      'Orientador e coorientador devem ser pessoas diferentes.';
  return fields;
}

export function TccEditor({ workId }: { workId?: string }) {
  const auth = useAuth();
  const refresh = auth.refresh;
  const [form, setForm] = useState<EditorForm>(emptyForm);
  const [options, setOptions] = useState<TccOptions>(emptyOptions);
  const [work, setWork] = useState<TccDTO | null>(null);
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [document, setDocument] = useState<
    | (Pick<AttachmentDTO, 'id' | 'originalName' | 'format'> & {
        staged: boolean;
      })
    | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [lumeFailure, setLumeFailure] = useState<{
    message: string;
    canSaveDraft: boolean;
  } | null>(null);
  const [areaId, setAreaId] = useState('');
  const [newTag, setNewTag] = useState('');
  const active = useRef(true);
  const locked = useRef(false);
  const objectUrls = useRef(new Set<string>());
  const operations = useRef(new Set<AbortController>());
  const feedback = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    active.current = true;
    const urls = objectUrls.current;
    const pending = operations.current;
    return () => {
      active.current = false;
      for (const operation of pending) operation.abort();
      pending.clear();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  useEffect(() => {
    if (!apiBaseUrl) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    let cancelled = false;
    void Promise.all([
      getTccOptions(apiBaseUrl, controller.signal),
      workId
        ? getOwnWork(apiBaseUrl, workId, controller.signal)
        : Promise.resolve(null),
    ])
      .then(([choices, initial]) => {
        if (cancelled) return;
        setOptions(choices);
        setWork(initial);
        if (initial) {
          setForm(formFrom(initial));
          setImages(
            initial.media.map((media, index) => ({
              id: media.id,
              name: `Imagem ${index + 1}`,
              description: media.description,
              staged: false,
            })),
          );
          setDocument(
            initial.file
              ? {
                  id: initial.file.id,
                  originalName: initial.file.originalName,
                  format: initial.file.format,
                  staged: false,
                }
              : null,
          );
          for (const media of initial.media) {
            void getPrivateImage(apiBaseUrl!, media.id, controller.signal)
              .then((blob) => {
                if (cancelled) return;
                const url = URL.createObjectURL(blob);
                objectUrls.current.add(url);
                setImages((current) =>
                  current.map((entry) =>
                    entry.id === media.id ? { ...entry, preview: url } : entry,
                  ),
                );
              })
              .catch(() => {
                /* Metadata stays editable even when a preview is unavailable. */
              });
          }
        }
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoading(false);
        setLoadError(
          error instanceof EditorRequestError && error.status === 404
            ? 'Trabalho não encontrado ou acesso não permitido.'
            : 'Não foi possível preparar o formulário. Tente novamente.',
        );
        if (error instanceof EditorRequestError && error.status === 401)
          void refresh();
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [workId, attempt, refresh]);

  const update = (key: keyof EditorForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSuccess('');
    setLumeFailure(null);
  };
  const clearFeedback = () => {
    setMessage('');
    setSuccess('');
    setFields({});
    setLumeFailure(null);
  };
  const focusFeedback = () =>
    requestAnimationFrame(() =>
      feedback.current?.focus({ preventScroll: false }),
    );
  const csrf = auth.csrfToken;

  const save = async (intent: 'publish' | 'draft') => {
    if (locked.current || !apiBaseUrl || !csrf) return;
    clearFeedback();
    const invalid = validate(form, intent);
    if (Object.keys(invalid).length) {
      setFields(invalid);
      setMessage('Preencha todos os campos obrigatórios');
      focusFeedback();
      return;
    }
    locked.current = true;
    setBusy(true);
    const operation = new AbortController();
    operations.current.add(operation);
    const command: TccCommand = {
      intent,
      title: form.title,
      summary: form.summary,
      lumeUrl: form.lumeUrl,
      tagIds: form.tagIds,
      ...(form.year ? { year: Number(form.year) } : {}),
      ...(form.semester ? { semester: Number(form.semester) } : {}),
      ...(form.defendedAt ? { defendedAt: form.defendedAt } : {}),
      ...(form.advisorId ? { advisorId: form.advisorId } : {}),
      ...(form.coadvisorId ? { coadvisorId: form.coadvisorId } : {}),
      ...(form.collectionId ? { collectionId: form.collectionId } : {}),
      mediaIds: images.map((image) => image.id),
      mediaDescriptions: Object.fromEntries(
        images.map((image) => [image.id, image.description]),
      ),
      fileId: document?.id || null,
    };
    try {
      const result = await saveTcc(
        apiBaseUrl,
        csrf,
        command,
        work?.id || workId,
        idempotencyKey,
        operation.signal,
      );
      if (!active.current) return;
      setWork(result.tcc);
      setImages((current) =>
        current.map((image) => ({ ...image, staged: false })),
      );
      setDocument((current) =>
        current ? { ...current, staged: false } : null,
      );
      setSuccess(result.message);
      focusFeedback();
    } catch (error) {
      if (!active.current) return;
      if (error instanceof EditorRequestError) {
        if (error.code === 'LUME_INVALID')
          setLumeFailure({
            message: error.message,
            canSaveDraft: error.canSaveDraft,
          });
        else {
          setMessage(error.message);
          setFields(error.fields);
        }
        if (error.status === 401) void auth.refresh();
      } else
        setMessage(
          'Não foi possível salvar agora. Seus dados continuam no formulário; tente novamente.',
        );
      focusFeedback();
    } finally {
      operations.current.delete(operation);
      locked.current = false;
      if (active.current) setBusy(false);
    }
  };

  const upload = async (
    event: ChangeEvent<HTMLInputElement>,
    kind: 'image' | 'document',
  ) => {
    const files = [...(event.currentTarget.files || [])];
    event.currentTarget.value = '';
    if (!files.length || locked.current || !apiBaseUrl || !csrf) return;
    setMessage('');
    setSuccess('');
    if (kind === 'image' && images.length + files.length > 3) {
      setFields((current) => ({
        ...current,
        mediaIds: 'Você pode anexar até 3 imagens.',
      }));
      return;
    }
    const max = kind === 'image' ? 5 * 1024 * 1024 : 25 * 1024 * 1024;
    if (files.some((file) => file.size > max)) {
      setFields((current) => ({
        ...current,
        [kind === 'image' ? 'mediaIds' : 'fileId']:
          kind === 'image'
            ? 'Cada imagem deve ter até 5 MiB.'
            : 'O arquivo deve ter até 25 MiB.',
      }));
      return;
    }
    locked.current = true;
    setBusy(true);
    const operation = new AbortController();
    operations.current.add(operation);
    setFields((current) => ({ ...current, mediaIds: '', fileId: '' }));
    try {
      for (const file of files) {
        const attachment = await uploadAttachment(
          apiBaseUrl,
          csrf,
          file,
          kind,
          operation.signal,
        );
        if (!active.current) return;
        if (kind === 'image') {
          const preview = URL.createObjectURL(file);
          objectUrls.current.add(preview);
          setImages((current) => [
            ...current,
            {
              id: attachment.id,
              name: attachment.originalName,
              description: attachment.description,
              preview,
              staged: true,
            },
          ]);
        } else {
          const previous = document;
          setDocument({
            id: attachment.id,
            originalName: attachment.originalName,
            format: attachment.format,
            staged: true,
          });
          if (previous?.staged)
            void discardAttachment(apiBaseUrl, csrf, previous.id).catch(
              () => {},
            );
        }
      }
    } catch (error) {
      if (!active.current) return;
      setMessage(
        error instanceof EditorRequestError
          ? error.message
          : 'O envio não foi concluído. Os arquivos já enviados e seus dados continuam disponíveis para tentar novamente.',
      );
      if (error instanceof EditorRequestError && error.status === 401)
        void auth.refresh();
    } finally {
      operations.current.delete(operation);
      locked.current = false;
      if (active.current) setBusy(false);
    }
  };

  const removeImage = (image: ImageEntry) => {
    if (locked.current) return;
    setSuccess('');
    setImages((current) => current.filter((entry) => entry.id !== image.id));
    if (image.preview) {
      URL.revokeObjectURL(image.preview);
      objectUrls.current.delete(image.preview);
    }
    if (image.staged && apiBaseUrl && csrf)
      void discardAttachment(apiBaseUrl, csrf, image.id).catch(() => {});
  };
  const removeDocument = () => {
    if (locked.current) return;
    setSuccess('');
    const previous = document;
    setDocument(null);
    if (previous?.staged && apiBaseUrl && csrf)
      void discardAttachment(apiBaseUrl, csrf, previous.id).catch(() => {});
  };
  const addTag = async () => {
    if (
      !newTag.trim() ||
      form.tagIds.length >= 5 ||
      locked.current ||
      !apiBaseUrl ||
      !csrf
    )
      return;
    locked.current = true;
    setBusy(true);
    const operation = new AbortController();
    operations.current.add(operation);
    setMessage('');
    setSuccess('');
    try {
      const tag = await createTag(
        apiBaseUrl,
        csrf,
        newTag.trim(),
        areaId || undefined,
        operation.signal,
      );
      if (!active.current) return;
      setOptions((current) => ({
        ...current,
        tags: [...current.tags.filter((entry) => entry.id !== tag.id), tag],
      }));
      setForm((current) => ({
        ...current,
        tagIds: [...new Set([...current.tagIds, tag.id])],
      }));
      setNewTag('');
    } catch (error) {
      if (active.current)
        setMessage(
          error instanceof EditorRequestError
            ? error.message
            : 'Não foi possível criar a tag agora.',
        );
    } finally {
      operations.current.delete(operation);
      locked.current = false;
      if (active.current) setBusy(false);
    }
  };

  const errorFor = (name: string) =>
    fields[name] ? (
      <span className="field-error" id={`error-${name}`}>
        {fields[name]}
      </span>
    ) : null;
  const inputProps = (name: string) => ({
    'aria-invalid': Boolean(fields[name]),
    'aria-describedby': fields[name] ? `error-${name}` : undefined,
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save('publish');
  };

  if (loading)
    return (
      <p role="status" className="editor-loading">
        Preparando seu espaço de escrita…
      </p>
    );
  if (loadError)
    return (
      <div className="access-notice" role="alert">
        <p>{loadError}</p>
        <button
          className="text-button"
          onClick={() => {
            setLoadError('');
            setLoading(true);
            setAttempt((value) => value + 1);
          }}
        >
          Tentar preparar formulário novamente
        </button>
        <p>
          <a className="text-link" href="#/perfil">
            Voltar ao perfil
          </a>
        </p>
      </div>
    );
  if (!apiBaseUrl)
    return <p>O serviço de publicação ainda precisa ser conectado.</p>;

  return (
    <>
      <div className="editor-intro">
        <p className="account-intro">
          Um resumo que aproxima, imagens que explicam e uma referência oficial
          para quem quiser ir além. Os campos marcados com * são necessários
          para publicar.
        </p>
        <a className="text-link" href="#/perfil">
          ← Voltar ao perfil
        </a>
      </div>
      <div className="editor-feedback" ref={feedback} tabIndex={-1}>
        {message && (
          <p className="editor-error" role="alert">
            {message}
          </p>
        )}
        {success && (
          <div className="editor-success" role="status">
            <strong>{success}</strong>
            <p>
              {work?.status === 'RASCUNHO'
                ? 'Somente você pode acessar este rascunho. Retome-o pelo seu perfil quando quiser.'
                : 'Seu trabalho está publicado e disponível para descoberta.'}
            </p>
            <a className="text-link" href="#/perfil">
              Ver meus trabalhos ↗
            </a>
            {work?.status === 'PUBLICADO' && (
              <p>
                <a
                  className="text-link"
                  href={`#/tcc/${encodeURIComponent(work.id)}`}
                >
                  Ler publicação ↗
                </a>
              </p>
            )}
          </div>
        )}
        {lumeFailure && (
          <div className="lume-notice" role="alert">
            <h2>Confira a referência oficial.</h2>
            <p>{lumeFailure.message}</p>
            {lumeFailure.canSaveDraft ? (
              <div className="editor-inline-actions">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={busy}
                  onClick={() => {
                    void save('draft');
                  }}
                >
                  Salvar como rascunho
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setLumeFailure(null);
                  }}
                >
                  Voltar ao formulário
                </button>
              </div>
            ) : (
              <p>
                A versão publicada anterior permanece disponível. Corrija o link
                para atualizar o trabalho.
              </p>
            )}
          </div>
        )}
      </div>
      <form
        className="tcc-editor"
        onSubmit={submit}
        noValidate
        aria-label={workId ? 'Editar TCC' : 'Cadastrar Novo TCC'}
      >
        <fieldset disabled={busy}>
          <legend>
            <span>01</span> Apresente sua pesquisa
          </legend>
          <label className="editor-field editor-title">
            <span>Título *</span>
            <input
              value={form.title}
              maxLength={200}
              onChange={(event) => update('title', event.target.value)}
              placeholder="O nome da sua contribuição"
              {...inputProps('title')}
            />
            {errorFor('title')}
          </label>
          <label className="editor-field">
            <span>Resumo simplificado *</span>
            <textarea
              rows={7}
              maxLength={5000}
              value={form.summary}
              onChange={(event) => update('summary', event.target.value)}
              placeholder="O que você investigou, como e por que isso importa?"
              {...inputProps('summary')}
            />
            <small>
              {form.summary.length}/5.000 caracteres. Escreva para quem está
              conhecendo o tema.
            </small>
            {errorFor('summary')}
          </label>
          <div className="editor-grid editor-grid-three">
            <label className="editor-field">
              <span>Ano da defesa *</span>
              <input
                type="number"
                min={1900}
                max={new Date().getFullYear()}
                value={form.year}
                onChange={(event) => update('year', event.target.value)}
                {...inputProps('year')}
              />
              {errorFor('year')}
            </label>
            <label className="editor-field">
              <span>Semestre *</span>
              <select
                value={form.semester}
                onChange={(event) => update('semester', event.target.value)}
                {...inputProps('semester')}
              >
                <option value="">Selecione</option>
                <option value="1">1º semestre</option>
                <option value="2">2º semestre</option>
              </select>
              {errorFor('semester')}
            </label>
            <label className="editor-field">
              <span>Data de defesa *</span>
              <input
                type="date"
                value={form.defendedAt}
                onChange={(event) => update('defendedAt', event.target.value)}
                {...inputProps('defendedAt')}
              />
              {errorFor('defendedAt')}
            </label>
          </div>
          <div className="editor-grid">
            <label className="editor-field">
              <span>Orientador *</span>
              <select
                value={form.advisorId}
                onChange={(event) => update('advisorId', event.target.value)}
                {...inputProps('advisorId')}
              >
                <option value="">Selecione um professor</option>
                {options.professors.map((professor) => (
                  <option key={professor.id} value={professor.id}>
                    {professor.name}
                  </option>
                ))}
              </select>
              {!options.professors.length && (
                <small>
                  Nenhum professor cadastrado ainda. Salve um rascunho enquanto
                  os vínculos são preparados.
                </small>
              )}
              {errorFor('advisorId')}
            </label>
            <label className="editor-field">
              <span>Coorientador (opcional)</span>
              <select
                value={form.coadvisorId}
                onChange={(event) => update('coadvisorId', event.target.value)}
                {...inputProps('coadvisorId')}
              >
                <option value="">Sem coorientador</option>
                {options.professors.map((professor) => (
                  <option key={professor.id} value={professor.id}>
                    {professor.name}
                  </option>
                ))}
              </select>
              {errorFor('coadvisorId')}
            </label>
          </div>
          <label className="editor-field">
            <span>Link do LUME *</span>
            <input
              type="url"
              maxLength={2048}
              value={form.lumeUrl}
              onChange={(event) => update('lumeUrl', event.target.value)}
              placeholder="https://lume.ufrgs.br/handle/…"
              {...inputProps('lumeUrl')}
            />
            <small>
              A publicação verifica se a referência oficial está acessível no
              LUME.
            </small>
            {errorFor('lumeUrl')}
          </label>
        </fieldset>

        <fieldset disabled={busy}>
          <legend>
            <span>02</span> Encontre seu lugar no acervo
          </legend>
          <div className="editor-grid">
            <label className="editor-field">
              <span>Área temática</span>
              <select
                value={areaId}
                onChange={(event) => setAreaId(event.target.value)}
              >
                <option value="">Todas as áreas</option>
                {options.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
              <small>
                A área organiza as sugestões e a criação de novas tags.
              </small>
            </label>
            <label className="editor-field">
              <span>Coleção (opcional)</span>
              <select
                value={form.collectionId}
                onChange={(event) => update('collectionId', event.target.value)}
                {...inputProps('collectionId')}
              >
                <option value="">Sem coleção</option>
                {options.collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
              {errorFor('collectionId')}
            </label>
          </div>
          <div className="editor-field">
            <span id="tags-label">
              Tags temáticas *{' '}
              <small>{form.tagIds.length}/5 selecionadas</small>
            </span>
            <div
              className="editor-tags"
              role="group"
              aria-labelledby="tags-label"
              {...inputProps('tagIds')}
            >
              {options.tags
                .filter(
                  (tag) =>
                    !areaId ||
                    tag.area?.id === areaId ||
                    form.tagIds.includes(tag.id),
                )
                .map((tag) => (
                  <label
                    className={`tag-choice ${form.tagIds.includes(tag.id) ? 'tag-choice--selected' : ''}`}
                    key={tag.id}
                  >
                    <input
                      type="checkbox"
                      checked={form.tagIds.includes(tag.id)}
                      disabled={
                        !form.tagIds.includes(tag.id) && form.tagIds.length >= 5
                      }
                      onChange={(event) => {
                        setForm((current) => ({
                          ...current,
                          tagIds: event.target.checked
                            ? [...current.tagIds, tag.id]
                            : current.tagIds.filter((id) => id !== tag.id),
                        }));
                        setSuccess('');
                      }}
                    />
                    <span>{tag.name}</span>
                  </label>
                ))}
            </div>
            {!options.tags.length && (
              <small>Crie a primeira tag para classificar o trabalho.</small>
            )}
            {errorFor('tagIds')}
          </div>
          <div className="create-tag">
            <label className="editor-field">
              <span>Nova tag</span>
              <input
                value={newTag}
                maxLength={50}
                onChange={(event) => setNewTag(event.target.value)}
                placeholder="Um tema que ainda não apareceu"
              />
            </label>
            <button
              type="button"
              className="editor-secondary"
              onClick={() => {
                void addTag();
              }}
              disabled={!newTag.trim() || form.tagIds.length >= 5}
            >
              Criar tag
            </button>
          </div>
        </fieldset>

        <fieldset disabled={busy}>
          <legend>
            <span>03</span> Mostre o que as palavras não mostram
          </legend>
          <p className="editor-section-note">
            Até 3 imagens PNG, JPEG ou WebP de 5 MiB cada. O arquivo do trabalho
            é opcional.
          </p>
          <input
            ref={imageInput}
            className="visually-hidden-input"
            type="file"
            tabIndex={-1}
            accept="image/png,image/jpeg,image/webp"
            multiple
            aria-label="Selecionar imagens de demonstração"
            onChange={(event) => {
              void upload(event, 'image');
            }}
          />
          <div className="editor-inline-actions">
            <button
              type="button"
              className="editor-secondary"
              disabled={images.length >= 3}
              onClick={() => imageInput.current?.click()}
            >
              Adicionar imagens
            </button>
            <span className="upload-count">{images.length}/3 imagens</span>
          </div>
          {errorFor('mediaIds')}
          {errorFor('media')}
          {!!images.length && (
            <ul className="image-list">
              {images.map((image, index) => (
                <li key={image.id}>
                  <div className="image-preview">
                    {image.preview ? (
                      <img
                        src={image.preview}
                        alt={
                          image.description || `Prévia da imagem ${index + 1}`
                        }
                      />
                    ) : (
                      <span>Prévia indisponível</span>
                    )}
                  </div>
                  <div>
                    <strong>{image.name}</strong>
                    <label className="editor-field">
                      <span>Descrição da imagem {index + 1}</span>
                      <textarea
                        rows={2}
                        maxLength={300}
                        value={image.description}
                        onChange={(event) => {
                          setSuccess('');
                          setImages((current) =>
                            current.map((entry) =>
                              entry.id === image.id
                                ? { ...entry, description: event.target.value }
                                : entry,
                            ),
                          );
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => removeImage(image)}
                    >
                      Remover imagem {index + 1}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="document-upload">
            <h3>Arquivo do trabalho</h3>
            <p>
              PDF, DOCX ou EPUB de até 25 MiB. Sem anexo, a referência oficial
              continua disponível pelo link do LUME.
            </p>
            <input
              ref={fileInput}
              className="visually-hidden-input"
              type="file"
              tabIndex={-1}
              accept=".pdf,.docx,.epub"
              aria-label="Selecionar arquivo do trabalho"
              onChange={(event) => {
                void upload(event, 'document');
              }}
            />
            {document && (
              <div className="document-summary">
                <span>
                  <strong>{document.originalName}</strong>
                  <small>{document.format}</small>
                </span>
                <button
                  type="button"
                  className="text-button"
                  onClick={removeDocument}
                >
                  Remover arquivo
                </button>
              </div>
            )}
            <button
              type="button"
              className="editor-secondary"
              onClick={() => fileInput.current?.click()}
            >
              {document ? 'Substituir arquivo' : 'Anexar arquivo'}
            </button>
            {errorFor('fileId')}
            {errorFor('file')}
          </div>
        </fieldset>

        <div className="editor-footer">
          <div>
            <strong>
              {work?.status === 'PUBLICADO'
                ? 'Uma nova versão da sua pesquisa.'
                : 'Sua pesquisa está pronta para circular?'}
            </strong>
            <p>
              {work?.status === 'PUBLICADO'
                ? 'Uma edição inválida mantém a versão pública anterior.'
                : 'Rascunhos são privados e podem ser retomados pelo seu perfil.'}
            </p>
          </div>
          <div className="editor-inline-actions">
            {work?.status !== 'PUBLICADO' && (
              <button
                type="button"
                className="editor-secondary"
                disabled={busy}
                onClick={() => {
                  void save('draft');
                }}
              >
                Salvar rascunho
              </button>
            )}
            <button
              type="submit"
              className="button button-primary"
              disabled={busy}
            >
              {busy
                ? 'Aguarde…'
                : work?.status === 'PUBLICADO'
                  ? 'Atualizar TCC'
                  : 'Publicar TCC'}{' '}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
        {busy && (
          <p className="editor-busy" role="status">
            Concluindo a operação. Seus dados estão preservados…
          </p>
        )}
      </form>
    </>
  );
}
