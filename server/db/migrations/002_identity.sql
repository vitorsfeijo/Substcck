CREATE TABLE users (
    id TEXT PRIMARY KEY,
    issuer TEXT NOT NULL CHECK (length(trim(issuer)) > 0),
    subject TEXT NOT NULL CHECK (length(trim(subject)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    email TEXT NOT NULL CHECK (length(trim(email)) > 0),
    institutional_login TEXT NOT NULL CHECK (length(trim(institutional_login)) > 0),
    role TEXT NOT NULL CHECK (role IN ('student', 'professor')),
    enrollment TEXT,
    department TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (issuer, subject),
    CHECK (
        (role = 'student' AND enrollment IS NOT NULL AND length(trim(enrollment)) > 0)
        OR (role = 'professor' AND department IS NOT NULL AND length(trim(department)) > 0)
    )
);

CREATE TABLE auth_sessions (
    id_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX auth_sessions_expiry_idx ON auth_sessions (expires_at);
CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);

CREATE TABLE auth_attempts (
    state_hash TEXT PRIMARY KEY,
    code_verifier TEXT NOT NULL,
    nonce TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX auth_attempts_expiry_idx ON auth_attempts (expires_at);
