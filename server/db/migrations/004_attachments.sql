CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('image', 'document')),
    original_name VARCHAR(255) NOT NULL CHECK (length(trim(original_name)) > 0),
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL CHECK (size > 0 AND size <= 26214400),
    storage_key TEXT NOT NULL UNIQUE,
    description VARCHAR(300) NOT NULL DEFAULT '',
    format TEXT CHECK (format IN ('PDF', 'DOCX', 'EPUB')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((kind = 'image' AND format IS NULL AND size <= 5242880)
           OR (kind = 'document' AND format IS NOT NULL))
);

CREATE INDEX attachments_author_created ON attachments(author_id, created_at);
