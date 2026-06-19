# Apply migrations to Supabase

Hướng dẫn apply migration `00000000000001_model_pricing.sql` lên Supabase cloud
và verify.

## ⚠️ Supabase project này KHÔNG có `exec_sql` RPC

Supabase REST API chỉ cho query tables đã tồn tại. Để chạy DDL (CREATE TABLE,
CREATE INDEX, CREATE POLICY...) cần dùng **1 trong 3 cách** sau:

### ✅ Cách 1: Supabase Dashboard SQL Editor (KHUYẾN NGHỊ — 30 giây)

1. Mở https://app.supabase.com → chọn project `oyktnoszkkbjtwruoboc`
2. Menu trái → **SQL Editor**
3. Click **+ New query**
4. Copy toàn bộ nội dung file `supabase/migrations/00000000000001_model_pricing.sql`
5. Paste vào editor
6. Click **Run** (hoặc Ctrl/Cmd + Enter)
7. Đợi "Success. No rows returned" — DDL không trả rows

**Verify:**

```sql
-- Trong SQL Editor, chạy tiếp:
SELECT count(*) AS total_models FROM model_pricing;
-- Expected: 12 (10 seed cũ + 2 mới)
```

### Cách 2: psql qua connection string (nếu có DB password)

```bash
# Connection string có dạng:
# postgresql://postgres:[PASSWORD]@db.oyktnoszkkbjtwruoboc.supabase.co:5432/postgres

PGPASSWORD='your-db-password' psql \
  -h db.oyktnoszkkbjtwruoboc.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -f supabase/migrations/00000000000001_model_pricing.sql
```

DB password lấy ở: Supabase Dashboard → Settings → Database → Connection string

### Cách 3: Supabase CLI

```bash
# Install CLI
brew install supabase/tap/supabase  # macOS
# hoặc Linux: scoop install supabase

# Login + link
supabase login
supabase link --project-ref oyktnoszkkbjtwruoboc

# Apply migration
supabase db push
```

## Verify migration thành công

Sau khi apply, chạy các query verify trong SQL Editor:

```sql
-- 1. Table tồn tại
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'model_pricing'
ORDER BY ordinal_position;

-- 2. Có 12 rows (10 seed + 2 mới)
SELECT count(*) FROM model_pricing;

-- 3. RLS enabled
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'model_pricing';

-- 4. Policies
SELECT polname, polcmd
FROM pg_policy
WHERE polrelid = 'model_pricing'::regclass;
```

Sau đó test qua agent code: gọi `fetchActiveRoomsWithAgents()` → orchestrator sẽ
dùng `estimateCost()` với giá chính xác từ DB.

## Nếu cần rollback

```sql
DROP TABLE IF EXISTS model_pricing CASCADE;
-- (CASCADE để drop policies + trigger + function liên quan)
```

## Lưu ý

- File migration được thiết kế **idempotent** (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`)
- Có thể chạy nhiều lần mà không lỗi
- Không cần downtime (chỉ thêm table mới, không động vào schema cũ)