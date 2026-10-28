import { useState } from 'react';
import { apiBaseUrl } from '../config';
import type { TccDTO } from '../models/tcc';
import { publicImageUrl } from '../services/discovery';

export function WorkCard({
  work,
  returnTo = '/',
}: {
  work: TccDTO;
  returnTo?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = work.media[0];
  const imageUrl = image ? publicImageUrl(apiBaseUrl, image.url) : null;
  const href = `#/tcc/${encodeURIComponent(work.id)}?from=${encodeURIComponent(returnTo)}`;

  return (
    <article className="discovery-card">
      <a className="discovery-card-open" href={href} aria-label={work.title}>
        <div
          className={`discovery-card-visual${imageUrl && !imageFailed ? '' : ' discovery-card-visual--type'}`}
        >
          {imageUrl && !imageFailed ? (
            <img
              src={imageUrl}
              alt={image.description || ''}
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="discovery-card-monogram" aria-hidden="true">
              <span>INF / UFRGS</span>
              <b>{work.tags[0]?.name || 'Pesquisa'}</b>
              <i>Conhecimento em circulação.</i>
            </div>
          )}
          <span className="discovery-card-period">
            {work.year}
            {work.semester ? ` / ${work.semester}` : ''}
          </span>
        </div>
        <h3>
          {work.title} <span aria-hidden="true">↗</span>
        </h3>
      </a>
      <p className="discovery-card-author">{work.author.name}</p>
      {work.advisor && (
        <p className="discovery-card-advisor">
          Orientação: {work.advisor.name}
        </p>
      )}
      {work.summary && <p className="discovery-card-summary">{work.summary}</p>}
      <ul className="discovery-tags" aria-label={`Assuntos de ${work.title}`}>
        {work.tags.map((tag) => (
          <li key={tag.id}>
            <a href={`#/buscar?tagIds=${encodeURIComponent(tag.id)}`}>
              {tag.name}
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}
