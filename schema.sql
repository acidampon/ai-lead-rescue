CREATE TABLE IF NOT EXISTS alr_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS alr_state_updated_at_idx ON alr_state(updated_at);