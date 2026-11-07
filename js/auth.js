// Login: e-mail e senha, depois o segundo fator (TOTP, o codigo de 6 digitos do aplicativo autenticador). Tudo por fetch (GoTrue).
//
// O segundo fator e OBRIGATORIO: sem ele a sessao e "aal1" e a nuvem devolve lista vazia em toda tabela. So a sessao "aal2" (senha + codigo)
// enxerga dados. Por isso o aplicativo so abre as telas com uma sessao aal2.
//
// A sessao fica em localStorage (chave gestao.sessao): tokens do usuario, e-mail e a lista de fatores. A senha NUNCA e guardada.
// O token e renovado em silencio antes de vencer (a renovacao mantem o aal2). Sair apaga tudo (ver sair()).
//
// As telas nao usam este arquivo direto, exceto entrada.js e ajustes.js. Quem le dados passa por dados.js, que chama comSessao().

import { chamarAuth, ErroApi } from './api.js';
import { esperar } from './ui.js';
import { agoraCerto } from './datas.js';

const CHAVE_SESSAO = 'gestao.sessao';
const PREFIXO_DAS_CHAVES = 'gestao.';
const CHAVE_QUE_SOBREVIVE = 'gestao.tema';   // preferencia de aparencia: nao e dado de ninguem
const MARGEM_DE_RENOVACAO_S = 90;
const NOME_DO_FATOR = 'celular';
const EMISSOR = 'Gestão JEMJ';

let sessao = lerSessaoGuardada();
let fatorEmCadastro = null;
let renovando = null;
let temporizador = null;
const ouvintes = new Set();
const ganchosDeSaida = [];

// ---------------------------------------------------------------- armazenamento da sessao

function lerSessaoGuardada() {
  try {
    const bruto = window.localStorage.getItem(CHAVE_SESSAO);
    if (!bruto) return null;
    const s = JSON.parse(bruto);
    return s && [s.access_token, s.refresh_token].every((v) => typeof v === 'string') ? s : null;
  } catch {
    return null;
  }
}

function guardarSessao() {
  try {
    if (sessao) window.localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
    else window.localStorage.removeItem(CHAVE_SESSAO);
  } catch {
    /* sem armazenamento: a sessao vale so enquanto a pagina estiver aberta */
  }
}

// Pelo relogio do servidor (datas.agoraCerto): com o relogio do aparelho adiantado, o token pareceria sempre vencido e seria renovado a cada 5 segundos.
function agoraEmSegundos() {
  return Math.floor(agoraCerto() / 1000);
}

/** Corpo (payload) de um JWT, sem conferir assinatura: serve so para ler o nivel (aal) e o vencimento do que o servidor entregou. */
export function lerToken(token) {
  try {
    const parte = String(token).split('.')[1];
    const texto = atob(parte.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parte.length / 4) * 4, '='));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(texto, (c) => c.charCodeAt(0))));
  } catch {
    return {};
  }
}

function aoReceberSessao(dados) {
  const corpo = lerToken(dados.access_token);
  const usuario = dados.user || {};
  sessao = {
    access_token: dados.access_token,
    refresh_token: dados.refresh_token,
    expires_at: Number(dados.expires_at) || corpo.exp || agoraEmSegundos() + Number(dados.expires_in || 3600),
    user_id: usuario.id || (sessao && sessao.user_id) || corpo.sub || null,
    email: usuario.email || (sessao && sessao.email) || corpo.email || null,
    fatores: Array.isArray(usuario.factors) ? usuario.factors : (sessao && sessao.fatores) || [],
  };
  guardarSessao();
  agendarRenovacao();
  avisar('sessao');
}

function perder(motivo) {
  sessao = null;
  fatorEmCadastro = null;
  guardarSessao();
  if (temporizador) window.clearTimeout(temporizador);
  temporizador = null;
  avisar('perdida', motivo);
}

// ---------------------------------------------------------------- estado

/** 'aal2' (senha + codigo: ve dados), 'aal1' (so senha: nao ve nada) ou null (sem sessao). */
export function nivelAtual() {
  return sessao ? (lerToken(sessao.access_token).aal || 'aal1') : null;
}

export function temSessaoCompleta() {
  return nivelAtual() === 'aal2';
}

/** Dados da sessao que as telas podem mostrar (nunca o token). */
export function usuarioAtual() {
  return sessao ? { id: sessao.user_id, email: sessao.email, nivel: nivelAtual(), expiraEm: sessao.expires_at * 1000 } : null;
}

/** `fn({ tipo, motivo })` quando a sessao muda ('sessao') ou se perde ('perdida': o app deve voltar ao login). Devolve quem desliga. */
export function aoMudar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

function avisar(tipo, motivo = '') {
  for (const fn of [...ouvintes]) {
    try { fn({ tipo, motivo }); } catch { /* um ouvinte com defeito nao derruba os outros */ }
  }
}

/** Registra algo a fazer antes de sair (dados.js apaga o cache local por aqui). */
export function aoSair(fn) {
  ganchosDeSaida.push(fn);
}

// ---------------------------------------------------------------- entrar

const FATOR_TOTP = (f) => f && f.factor_type === 'totp';

/** Passo 1. Devolve { passo: 'codigo' } (ja tem autenticador) ou { passo: 'cadastro' } (primeiro acesso: precisa cadastrar o autenticador). */
export async function entrar(email, senha) {
  fatorEmCadastro = null;
  const r = await chamarAuth('POST', '/token?grant_type=password', { corpo: { email: String(email).trim(), password: senha } });
  aoReceberSessao(r.dados);
  const verificado = sessao.fatores.find((f) => FATOR_TOTP(f) && f.status === 'verified');
  return { passo: verificado ? 'codigo' : 'cadastro' };
}

/** Primeiro acesso: pede o segredo do autenticador. Devolve { qrSvg (texto do SVG), segredo, uri }. */
export async function iniciarCadastro() {
  const token = await tokenParaUso();
  // sobra de uma tentativa anterior que ficou pela metade: sai do caminho para o nome "celular" nao dar conflito
  for (const f of sessao.fatores.filter((x) => FATOR_TOTP(x) && x.status !== 'verified')) {
    try { await chamarAuth('DELETE', `/factors/${encodeURIComponent(f.id)}`, { token }); } catch { /* segue: o cadastro abaixo diz se deu problema */ }
  }
  let r;
  try {
    r = await chamarAuth('POST', '/factors', { token, corpo: { factor_type: 'totp', friendly_name: NOME_DO_FATOR, issuer: EMISSOR } });
  } catch (erro) {
    if (!(erro instanceof ErroApi) || erro.status !== 422) throw erro;
    r = await chamarAuth('POST', '/factors', { token, corpo: { factor_type: 'totp', friendly_name: `${NOME_DO_FATOR} ${Date.now().toString(36)}`, issuer: EMISSOR } });
  }
  fatorEmCadastro = r.dados.id;
  const totp = r.dados.totp || {};
  return { qrSvg: String(totp.qr_code || ''), segredo: String(totp.secret || ''), uri: String(totp.uri || '') };
}

/** Passo 2: confere o codigo de 6 digitos (cadastro ou entrada). Termina com sessao aal2 guardada. Levanta ErroApi se o codigo nao confere. */
export async function verificarCodigo(codigo) {
  const limpo = String(codigo).replace(/\s+/g, '');
  if (!/^\d{6}$/.test(limpo)) throw new ErroApi('codigo mal formado', { status: 400, codigo: 'codigo_invalido' });
  const verificado = sessao && sessao.fatores.find((f) => FATOR_TOTP(f) && f.status === 'verified');
  const fatorId = fatorEmCadastro || (verificado && verificado.id);
  if (!fatorId) throw new ErroApi('sem fator', { status: 400, codigo: 'sem_fator' });
  const token = await tokenParaUso();
  // um desafio novo a cada tentativa: nao depende de o anterior ainda valer
  const desafio = await chamarAuth('POST', `/factors/${encodeURIComponent(fatorId)}/challenge`, { token, corpo: {} });
  const r = await chamarAuth('POST', `/factors/${encodeURIComponent(fatorId)}/verify`, { token, corpo: { challenge_id: desafio.dados.id, code: limpo } });
  fatorEmCadastro = null;
  aoReceberSessao(r.dados);
  if (nivelAtual() !== 'aal2') {
    perder('sem-aal2');
    throw new ErroApi('sessao sem segundo fator', { status: 401, codigo: 'sem_aal2' });
  }
}

/** Frase simples para o erro de login. `passo`: 'senha' | 'codigo' | 'cadastro'. Nunca mostra texto tecnico do servidor. */
export function mensagemDeEntrada(erro, passo) {
  if (!(erro instanceof ErroApi)) return 'Não foi possível entrar agora. Tente de novo em instantes.';
  if (erro.rede) return 'Sem conexão com a internet. Confira o sinal e tente de novo.';
  if (erro.status === 429) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
  if (passo === 'senha' && (erro.status === 400 || erro.status === 401 || erro.status === 422)) return 'E-mail ou senha incorretos.';
  if (passo !== 'senha' && (erro.status === 400 || erro.status === 422)) return 'Código incorreto, confira a hora do celular.';
  return 'Não foi possível entrar agora. Tente de novo em instantes.';
}

// ---------------------------------------------------------------- renovar e usar

export function renovar() {
  if (renovando) return renovando;
  renovando = (async () => {
    if (!sessao) throw new ErroApi('sem sessao', { status: 401 });
    const eraCompleta = nivelAtual() === 'aal2';
    try {
      const r = await chamarAuth('POST', '/token?grant_type=refresh_token', { corpo: { refresh_token: sessao.refresh_token } });
      aoReceberSessao(r.dados);
      if (eraCompleta && nivelAtual() !== 'aal2') {
        perder('sem-aal2');
        throw new ErroApi('sessao sem segundo fator', { status: 401, codigo: 'sem_aal2' });
      }
    } catch (erro) {
      // login recusado de verdade (e nao so falta de internet): a sessao acabou
      if (erro instanceof ErroApi && !erro.rede && erro.status >= 400 && erro.status < 500 && erro.status !== 429) perder('renovacao-recusada');
      throw erro;
    }
  })().finally(() => { renovando = null; });
  return renovando;
}

function agendarRenovacao() {
  if (temporizador) window.clearTimeout(temporizador);
  if (!sessao) return;
  const emSegundos = Math.max(5, sessao.expires_at - agoraEmSegundos() - MARGEM_DE_RENOVACAO_S);
  temporizador = window.setTimeout(() => { renovar().catch(() => {}); }, Math.min(emSegundos * 1000, 2 ** 31 - 1));
}

/** Liga a renovacao em silencio: ao abrir, ao voltar a aba para a frente e ao reconectar. Chamado uma vez por app.js. */
export function iniciarRenovacao() {
  agendarRenovacao();
  const conferir = () => {
    if (sessao && sessao.expires_at - agoraEmSegundos() < MARGEM_DE_RENOVACAO_S) renovar().catch(() => {});
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') conferir(); });
  window.addEventListener('online', conferir);
  conferir();
}

/** O token de acesso para uma chamada, renovando antes se estiver perto de vencer. Levanta ErroApi (rede ou 401). */
export async function tokenParaUso() {
  if (!sessao) throw new ErroApi('sem sessao', { status: 401 });
  if (sessao.expires_at - agoraEmSegundos() < MARGEM_DE_RENOVACAO_S) await renovar();
  if (!sessao) throw new ErroApi('sem sessao', { status: 401 });
  return sessao.access_token;
}

/**
 * Roda `fn(token)`. Se a nuvem responder 401, renova a sessao UMA vez e tenta de novo; se ainda assim for 401, a sessao acabou:
 * o aplicativo volta ao login (ouvintes de aoMudar recebem 'perdida').
 */
export async function comSessao(fn) {
  const token = await tokenParaUso();
  try {
    return await fn(token);
  } catch (erro) {
    if (!(erro instanceof ErroApi) || erro.rede || erro.status !== 401) throw erro;
  }
  await renovar();
  try {
    return await fn(sessao.access_token);
  } catch (erro) {
    if (erro instanceof ErroApi && !erro.rede && erro.status === 401) perder('401-repetido');
    throw erro;
  }
}

/** Desiste do login no meio (aperta "Usar outra conta"): larga a sessao so de senha, sem apagar o cache de dados. */
export function cancelarEntrada() {
  perder('cancelou');
}

// ---------------------------------------------------------------- sair

/**
 * Sair apaga TUDO deste aparelho: o aviso ao servidor (se houver internet), a sessao, o cache de dados e as chaves do aplicativo no
 * armazenamento local (so a escolha de tema fica, porque nao e dado de ninguem).
 */
export async function sair() {
  const token = sessao && sessao.access_token;
  if (token) {
    try { await Promise.race([chamarAuth('POST', '/logout?scope=local', { token }), esperar(3000)]); } catch { /* sem internet: sai do mesmo jeito */ }
  }
  for (const gancho of ganchosDeSaida) {
    try { await gancho(); } catch { /* segue apagando o resto */ }
  }
  try {
    const chaves = [];
    for (let i = 0; i < window.localStorage.length; i += 1) chaves.push(window.localStorage.key(i));
    for (const chave of chaves) {
      if (chave && chave.startsWith(PREFIXO_DAS_CHAVES) && chave !== CHAVE_QUE_SOBREVIVE) window.localStorage.removeItem(chave);
    }
    window.sessionStorage.clear();
  } catch { /* sem armazenamento */ }
  perder('saiu');
}
