-- =====================================================
-- Migration: tabela documentos_em_recepcao
-- Data: 2026-04-28
-- Motivo: o cache `recebendoDocumentos` (Map<phone, timestamp> em memoria)
--   nao sobrevive a multi-instancia. Se Render escalar pra 2+ dynos, cada
--   um tem seu Map: cliente envia doc1 no dyno A, doc2 no dyno B, e B nao
--   sabe que A ja confirmou — Laura responde 2 vezes.
--
-- Esta tabela centraliza o estado em uma fonte unica. Todos os dynos leem
-- e escrevem aqui antes de decidir se envia confirmacao ou silencia.
-- =====================================================

CREATE TABLE IF NOT EXISTS documentos_em_recepcao (
  phone           text          PRIMARY KEY,
  ultima_msg_em   timestamptz   NOT NULL DEFAULT now(),
  total_msgs      integer       NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_docs_recepcao_ultima ON documentos_em_recepcao(ultima_msg_em DESC);

-- RLS desabilitada (mesma justificativa de webhook_raw e mensagens_orfas:
-- tabela so eh escrita pelo backend, nao tem dados sensiveis)
ALTER TABLE documentos_em_recepcao DISABLE ROW LEVEL SECURITY;
