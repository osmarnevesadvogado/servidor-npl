-- =====================================================
-- Migration: criar tabela webhook_raw
-- Data: 2026-04-27
-- Motivo: defesa em camadas contra perda de mensagens.
--   Salva o payload bruto de TODO webhook Z-API ANTES de qualquer
--   processamento. Se algo quebrar (bug novo, formato inesperado,
--   falha do Supabase no insert principal), o dado nao se perde.
--   Da pra reprocessar depois via /api/admin/reprocessar-webhook.
-- =====================================================

CREATE TABLE IF NOT EXISTS webhook_raw (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  body         jsonb         NOT NULL,
  endpoint     text          NOT NULL,            -- '/webhook/zapi' ou '/webhook/zapi-escritorio'
  instancia    text,                              -- 'escritorio' / 'prospeccao' / null
  phone        text,                              -- extraido do body pra busca rapida
  message_id   text,                              -- body.messageId se houver
  from_me      boolean       DEFAULT false,
  processado   boolean       NOT NULL DEFAULT false,
  erro         text,                              -- mensagem de erro se falhou processar
  reprocessado_em timestamptz,
  criado_em    timestamptz   NOT NULL DEFAULT now()
);

-- Indices pra buscas comuns:
--   - por phone (auditoria de incidentes)
--   - por message_id (dedup / rastreio)
--   - por processado=false + criado_em (lista falhas pra reprocessar)
CREATE INDEX IF NOT EXISTS idx_webhook_raw_phone ON webhook_raw(phone);
CREATE INDEX IF NOT EXISTS idx_webhook_raw_message_id ON webhook_raw(message_id);
CREATE INDEX IF NOT EXISTS idx_webhook_raw_falhas ON webhook_raw(criado_em DESC) WHERE processado = false;
CREATE INDEX IF NOT EXISTS idx_webhook_raw_criado ON webhook_raw(criado_em DESC);

-- RLS opcional (se a tabela 'mensagens' tem RLS, esta tambem deveria)
-- ALTER TABLE webhook_raw ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY webhook_raw_service_only ON webhook_raw FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Retencao: opcionalmente limpar webhooks processados com mais de 90 dias
-- DELETE FROM webhook_raw WHERE processado = true AND criado_em < now() - interval '90 days';
