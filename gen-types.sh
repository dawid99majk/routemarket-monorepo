#!/bin/bash
# Regeneruje typy TypeScript ze schematu bazy (postgres-meta z self-hosted Supabase).
# Odpalać po każdej migracji: ./gen-types.sh && (cd apps/frontend && npm run build)
set -e
docker run --rm --network supabase_default curlimages/curl:latest -s   'http://supabase-meta:8080/generators/typescript?included_schemas=public&detect_one_to_one_relationships=true'   > apps/frontend/src/integrations/supabase/types.ts
echo "OK: $(grep -c 'Row:' apps/frontend/src/integrations/supabase/types.ts) tabel/widoków"
