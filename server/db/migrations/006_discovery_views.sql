-- Only opaque session hashes are retained for the rolling per-work deduplication.
CREATE TABLE tcc_view_sessions (
    tcc_id TEXT NOT NULL REFERENCES tccs(id) ON DELETE CASCADE,
    session_hash TEXT NOT NULL CHECK (session_hash ~ '^[a-f0-9]{64}$'),
    last_counted_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tcc_id, session_hash)
);

CREATE TABLE tcc_view_events (
    id TEXT PRIMARY KEY,
    tcc_id TEXT NOT NULL REFERENCES tccs(id) ON DELETE CASCADE,
    occurred_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX tcc_view_events_period ON tcc_view_events (occurred_at, tcc_id);
CREATE INDEX tcc_view_events_work ON tcc_view_events (tcc_id);

-- A tag change must not retroactively reclassify an earlier exploration event.
CREATE TABLE tcc_view_event_tags (
    event_id TEXT NOT NULL REFERENCES tcc_view_events(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id),
    PRIMARY KEY (event_id, tag_id)
);
CREATE INDEX tcc_view_event_tags_tag ON tcc_view_event_tags (tag_id, event_id);

CREATE INDEX tccs_public_advisor ON tccs (advisor_id) WHERE status = 'PUBLICADO';
CREATE INDEX tccs_public_collection ON tccs (collection_id) WHERE status = 'PUBLICADO';
