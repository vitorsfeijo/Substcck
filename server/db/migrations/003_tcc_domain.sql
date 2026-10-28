CREATE TABLE areas (
    id TEXT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE CHECK (length(trim(name)) > 0)
);

CREATE TABLE collections (
    id TEXT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE CHECK (length(trim(name)) > 0)
);

CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name VARCHAR(50) NOT NULL CHECK (length(trim(name)) > 0),
    normalized_name VARCHAR(50) NOT NULL UNIQUE CHECK (length(trim(normalized_name)) > 0),
    area_id TEXT REFERENCES areas(id) ON DELETE SET NULL
);

CREATE TABLE tccs (
    id TEXT PRIMARY KEY,
    title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
    summary TEXT CHECK (length(summary) <= 5000),
    year INTEGER CHECK (year BETWEEN 1900 AND 9999),
    semester INTEGER CHECK (semester IN (1, 2)),
    defended_at DATE CHECK (defended_at <= CURRENT_DATE),
    author_id TEXT NOT NULL REFERENCES users(id),
    advisor_id TEXT REFERENCES users(id),
    coadvisor_id TEXT REFERENCES users(id),
    lume_url VARCHAR(2048),
    status TEXT NOT NULL CHECK (status IN ('RASCUNHO', 'PUBLICADO')),
    collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
    views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (coadvisor_id IS NULL OR advisor_id IS DISTINCT FROM coadvisor_id),
    CHECK (defended_at IS NULL OR year IS NULL OR EXTRACT(YEAR FROM defended_at) = year),
    CHECK (defended_at IS NULL OR semester IS NULL OR CASE WHEN EXTRACT(MONTH FROM defended_at) <= 6 THEN 1 ELSE 2 END = semester),
    CHECK (status <> 'PUBLICADO' OR (
        summary IS NOT NULL AND length(trim(summary)) > 0 AND
        year IS NOT NULL AND semester IS NOT NULL AND defended_at IS NOT NULL AND
        advisor_id IS NOT NULL AND lume_url IS NOT NULL AND length(trim(lume_url)) > 0 AND published_at IS NOT NULL
    ))
);

CREATE INDEX tccs_public_recency ON tccs (defended_at DESC, published_at DESC, id) WHERE status = 'PUBLICADO';
CREATE INDEX tccs_author ON tccs (author_id, updated_at DESC, id);

CREATE TABLE tcc_tags (
    tcc_id TEXT NOT NULL REFERENCES tccs(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id),
    PRIMARY KEY (tcc_id, tag_id)
);
CREATE INDEX tcc_tags_tag ON tcc_tags (tag_id, tcc_id);

CREATE TABLE tcc_media (
    id TEXT PRIMARY KEY,
    tcc_id TEXT NOT NULL REFERENCES tccs(id) ON DELETE CASCADE,
    url VARCHAR(2048) NOT NULL CHECK (length(trim(url)) > 0),
    description VARCHAR(300) NOT NULL DEFAULT '',
    position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 2),
    UNIQUE (tcc_id, position)
);

CREATE TABLE tcc_files (
    id TEXT PRIMARY KEY,
    tcc_id TEXT NOT NULL UNIQUE REFERENCES tccs(id) ON DELETE CASCADE,
    original_name VARCHAR(255) NOT NULL CHECK (length(trim(original_name)) > 0),
    format TEXT NOT NULL CHECK (format IN ('PDF', 'DOCX', 'EPUB')),
    path VARCHAR(2048) NOT NULL CHECK (length(trim(path)) > 0)
);

-- Deferred checks inspect the final state, allowing an atomic replacement of tags.
CREATE FUNCTION enforce_tcc_integrity() RETURNS TRIGGER AS $$
DECLARE
    target_ids TEXT[];
    target_id TEXT;
    work RECORD;
    tag_count INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'tccs' THEN
        IF TG_OP = 'INSERT' THEN target_ids := ARRAY[NEW.id];
        ELSIF TG_OP = 'DELETE' THEN target_ids := ARRAY[OLD.id];
        ELSE target_ids := ARRAY[OLD.id, NEW.id]; END IF;
    ELSE
        IF TG_OP = 'INSERT' THEN target_ids := ARRAY[NEW.tcc_id];
        ELSIF TG_OP = 'DELETE' THEN target_ids := ARRAY[OLD.tcc_id];
        ELSE target_ids := ARRAY[OLD.tcc_id, NEW.tcc_id]; END IF;
    END IF;
    FOR target_id IN SELECT DISTINCT unnest(target_ids) LOOP
        SELECT * INTO work FROM tccs WHERE id = target_id;
        IF NOT FOUND THEN CONTINUE; END IF;
        IF NOT EXISTS (SELECT 1 FROM users WHERE id = work.author_id AND role = 'student') THEN
            RAISE EXCEPTION 'TCC author must be a student' USING ERRCODE = '23514';
        END IF;
        IF work.advisor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users WHERE id = work.advisor_id AND role = 'professor') THEN
            RAISE EXCEPTION 'Advisor must be a professor' USING ERRCODE = '23514';
        END IF;
        IF work.coadvisor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users WHERE id = work.coadvisor_id AND role = 'professor') THEN
            RAISE EXCEPTION 'Coadvisor must be a professor' USING ERRCODE = '23514';
        END IF;
        SELECT count(*) INTO tag_count FROM tcc_tags WHERE tcc_id = target_id;
        IF tag_count > 5 OR (work.status = 'PUBLICADO' AND tag_count = 0) THEN
            RAISE EXCEPTION 'TCC requires one to five tags when published' USING ERRCODE = '23514';
        END IF;
        IF (SELECT count(*) FROM tcc_media WHERE tcc_id = target_id) > 3 THEN
            RAISE EXCEPTION 'TCC allows at most three images' USING ERRCODE = '23514';
        END IF;
    END LOOP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER tcc_integrity_work AFTER INSERT OR UPDATE ON tccs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_tcc_integrity();
CREATE CONSTRAINT TRIGGER tcc_integrity_tags AFTER INSERT OR UPDATE OR DELETE ON tcc_tags DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_tcc_integrity();
CREATE CONSTRAINT TRIGGER tcc_integrity_media AFTER INSERT OR UPDATE OR DELETE ON tcc_media DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_tcc_integrity();
