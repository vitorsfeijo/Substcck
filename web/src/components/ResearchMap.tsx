export function ResearchMap() {
  return (
    <figure className="research-map">
      <div className="map-caption">
        <span className="small-cross">+</span> IDEIAS QUE SE ENCONTRAM
      </div>
      <svg
        viewBox="0 0 520 440"
        role="img"
        aria-label="Ilustração conceitual de um TCC conectando diferentes áreas de pesquisa"
      >
        <defs>
          <pattern
            id="map-dots"
            x="0"
            y="0"
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill="#c8c4b9" />
          </pattern>
        </defs>
        <rect width="520" height="440" fill="url(#map-dots)" />
        <circle
          cx="260"
          cy="218"
          r="156"
          fill="none"
          stroke="#d6d0c4"
          strokeDasharray="4 7"
        />
        <circle cx="260" cy="218" r="92" fill="none" stroke="#e0dbd0" />
        <g fill="none" stroke="#b7afa0" strokeWidth="1.5">
          <path d="M260 218 128 106M260 218 399 122M260 218 431 282M260 218 290 365M260 218 89 305M260 218 242 49" />
          <path
            d="M128 106 242 49 399 122 431 282 290 365 89 305 128 106"
            strokeDasharray="3 6"
          />
        </g>
        <g className="map-node" transform="translate(128 106)">
          <circle r="39" fill="#dedfcf" />
          <text textAnchor="middle" dominantBaseline="central">
            IA
          </text>
        </g>
        <g className="map-node" transform="translate(399 122)">
          <circle r="43" fill="#e6d6ca" />
          <text textAnchor="middle" dominantBaseline="central">
            Redes
          </text>
        </g>
        <g className="map-node" transform="translate(431 282)">
          <circle r="38" fill="#dddcd4" />
          <text textAnchor="middle" dominantBaseline="central">
            Dados
          </text>
        </g>
        <g className="map-node" transform="translate(290 365)">
          <circle r="40" fill="#dedfcf" />
          <text textAnchor="middle" dominantBaseline="central">
            Sistemas
          </text>
        </g>
        <g className="map-node" transform="translate(89 305)">
          <circle r="40" fill="#e6d6ca" />
          <text textAnchor="middle" dominantBaseline="central">
            Design
          </text>
        </g>
        <g className="map-node" transform="translate(242 49)">
          <circle r="18" fill="#dedbd1" />
          <circle r="4" fill="#8a8173" />
        </g>
        <circle cx="260" cy="218" r="69" fill="#b63d2e" />
        <text x="260" y="213" textAnchor="middle" className="map-center">
          TCC
        </text>
        <text x="260" y="239" textAnchor="middle" className="map-center-label">
          um novo começo
        </text>
        <circle cx="205" cy="91" r="5" fill="#b63d2e" />
        <circle cx="366" cy="334" r="5" fill="#b63d2e" />
      </svg>
      <figcaption>Uma pesquisa nunca termina em si mesma.</figcaption>
    </figure>
  );
}
