-- M0: metadata only. Domain tables and identity arrive in M1.
CREATE TABLE platform_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO platform_metadata (key, value)
VALUES ('application', 'subtccstack');
