-- Completed responses make creation retries safe without duplicate publications.
CREATE TABLE tcc_write_requests (
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_key VARCHAR(128) NOT NULL,
    payload_hash TEXT NOT NULL,
    response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (author_id, request_key)
);
