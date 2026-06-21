CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  status TEXT NOT NULL,
  input_url TEXT,
  output_url TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);