// ===== NEVES PINHEIRO LINS - SERVIDOR (Laura) =====
// Mesma arquitetura do servidor da Ana, branding NPL

const express = require('express');
const cors = require('cors');
const config = require('./config');
const whatsapp = require('./whatsapp');
const db = require('./database');
const ia = require('./ia');
const fluxo = require('./fluxo');
let audio;
try { audio = require('./audio'); } catch (e) { console.log('[INIT-NPL] Audio nao disponivel'); }
let calendar;
try {
  calendar = require('./calendar');
  ia.setCalendar(calendar); // Injetar calendar no ia.js para buscar horários
  console.log('[INIT-NPL] Calendar OK');
} catch (e) {
  console.log('[INIT-NPL] Calendar nao disponivel:', e.message);
}
let documentos;
try { documentos = require('./documentos'); console.log('[INIT-NPL] Documentos OK'); } catch (e) { console.log('[INIT-NPL] Documentos nao disponivel:', e.message); }

const app = express();
app.use(cors());
app.use(express.json());

// ===== BUFFER DE MENSAGENS =====
const messageBuffer = new Map();

function bufferMessage(phone, text, senderName) {
  const cleanP = whatsapp.cleanPhone(phone);
  const existing = messageBuffer.get(cleanP);

  if (existing) {
    existing.messages.push(text);
    existing.senderName = senderName || existing.senderName;
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => flushBuffer(cleanP), config.BUFFER_DELAY);
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const entry = {
      messages: [text],
      senderName: senderName || '',
      timer: setTimeout(() => flushBuffer(cleanP), config.BUFFER_DELAY),
      resolve
    };
    messageBuffer.set(cleanP, entry);
  });
}

function flushBuffer(cleanP) {
  const entry = messageBuffer.get(cleanP);
  if (!entry) return;
  messageBuffer.delete(cleanP);
  entry.resolve({
    combined: entry.messages.join('\n'),
    senderName: entry.senderName
  });
}

// ===== CONTROLE DE PAUSA =====
const pausedConversas = new Map();
const processedMessages = new Set();

// ===== VERIFICAÇÃO DE CLIENTE ANTIGO =====
// Armazena clientes pendentes de confirmação: phone -> { processos, tentativas }
const pendingClienteVerification = new Map();

function pauseAI(phone, minutes = 30) {
  pausedConversas.set(whatsapp.cleanPhone(phone), Date.now() + minutes * 60 * 1000);
  console.log(`[PAUSE-NPL] IA pausada para ${phone} por ${minutes} min`);
}

function isAIPaused(phone) {
  const until = pausedConversas.get(whatsapp.cleanPhone(phone));
  if (!until) return false;
  if (Date.now() > until) {
    pausedConversas.delete(whatsapp.cleanPhone(phone));
    return false;
  }
  return true;
}

// ===== LIMPEZA PERIÓDICA =====
setInterval(() => {
  processedMessages.clear();
  whatsapp.cleanup();
  fluxo.cleanup();
  const now = Date.now();
  for (const [phone, until] of pausedConversas) {
    if (now > until) pausedConversas.delete(phone);
  }
}, 10 * 60 * 1000);

// ===== RATE LIMIT =====
const rateLimitMap = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + 60000 };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + 60000;
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count <= config.RATE_LIMIT_MAX;
}
setInterval(() => { rateLimitMap.clear(); }, 5 * 60 * 1000);

// ===== PROCESSAMENTO ASSÍNCRONO =====
async function processBufferedMessage(phone, text, senderName, respondComAudio = false) {
  try {
    const result = await bufferMessage(phone, text, senderName);
    if (!result) return;

    const combinedText = result.combined;
    const finalName = result.senderName;

    console.log(`[BUFFER-NPL] Processando ${combinedText.split('\n').length} msg(s) de ${phone}`);

    const lead
