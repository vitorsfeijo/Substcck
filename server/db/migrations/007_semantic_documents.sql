CREATE TABLE semantic_documents (
    tcc_id TEXT PRIMARY KEY REFERENCES tccs(id) ON DELETE CASCADE,
    terms JSONB NOT NULL,
    source_hash TEXT NOT NULL,
    source_updated_at TIMESTAMPTZ NOT NULL,
    version TEXT NOT NULL,
    indexed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
