-- Add lightweight provider credential test metadata.
alter table public.model_credentials
  add column if not exists test_status text not null default 'untested'
    check (test_status in ('untested', 'testing', 'success', 'failed')),
  add column if not exists last_tested_at timestamptz,
  add column if not exists last_test_error text;

comment on column public.model_credentials.last_test_error is
  'Sanitized provider test error. Must not contain API keys or decrypted config.';
