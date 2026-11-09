// Login: e-mail e senha, depois o segundo fator (TOTP, o codigo de 6 digitos do aplicativo autenticador). Tudo por fetch (GoTrue).
//
// O segundo fator e OBRIGATORIO: sem ele a sessao e "aal1" e a nuvem devolve lista vazia em toda tabela. So a sessao "aal2" (senha + codigo)
// enxerga dados. Por isso o aplicativo so abre as telas com uma sessao aal2.
//
// A sessao fica em localStorage (chave gestao.sessao): tokens do usuario, e-mail e a lista de fatores. A senha NUNCA e guardada.
// O token e renovado em silencio antes de vencer (a renovacao mantem o aal2). Sair apaga tudo (ver sair()).
//
// A trava do aplicativo (desbloqueio do celular ao abrir) deixa dois campos opcionais DENTRO da mesma chave: `biometria` (que a trava esta
// ligada e como conferir) e `aviso_trava` (marca de que a trava caiu porque a sessao acabou). Quem manda neles e o ARMAZENAMENTO: toda
// leitura vai ao localStorage no momento, o objeto `sessao` em memoria nunca guarda o campo, e toda gravacao da sessao (renovacao, senha,
// codigo) preserva o que estiver la. A trava NUNCA cria, renova nem eleva sessao: so fecha a porta da interface.
//
// As telas nao usam este arquivo direto, exceto entrada.js, ajustes.js e trava.js. Quem le dados passa por dados.js, que chama comSessao().

import { chamarAuth, ErroApi } from './api.js';
import { esperar } from './ui.js';
import { agoraCerto } from './datas.js';

const CHAVE_SESSAO = 'gestao.sessao';
const PREFIXO_DAS_CHAVES = 'gestao.';
const CHAVE_QUE_SOBREVIVE = 'gestao.tema';   // preferencia de aparencia: nao e dado de ninguem
const MARGEM_DE_RENOVACAO_S = 90;
const NOME_DO_FATOR = 'celular';
const EMISSOR = 'Gestão JEMJ';
// O cadastro do autenticador que ainda nao foi confirmado fica guardado junto com a sessao (so de senha) por pouco tempo: quem vai ao
// aplicativo autenticador e volta pode encontrar a pagina recarregada, e sem isso o segredo que ja foi cadastrado la seria perdido.
const VALIDADE_DO_CADASTRO_S = 15 * 60;

/** Prazos (em minutos) em que a trava volta a pedir o desbloqueio ao voltar ao aplicativo. 0 = toda vez que sair e voltar. */
export const MINUTOS_VALIDOS = [0, 1, 5];
// Mesmo texto da expressao do modulo que fala com o WebAuthn (um teste confere): este arquivo nao depende dele.
const FORMATO_DO_ID = /^[A-Za-z0-9_-]{16,1400}$/;
const TRANSPORTS = ['internal', 'hybrid', 'usb', 'nfc', 'ble', 'smart-card'];
// "Nao mexa no campo": distingue de proposito de `undefined` (apagar o campo) e de `null` (trava desligada de proposito).
const SEM_MUDANCA = Symbol('sem-mudanca');

let sessao = lerSessaoGuardada();
// O que ESTA janela sabe do campo da trava. Serve so para perceber que uma janela velha regravou a sessao sem ele (ver restaurarCampoSeFaltou).
// Nunca decide sozinho se a trava esta ligada: isso e lido do armazenamento a cada vez.
let campoConhecido = lerCampoGuardado().valor;
let fatorEmCadastro = null;
// Sobe a cada senha nova e a cada "Usar outra conta": o que estava em andamento (codigo sendo conferido, autenticador sendo criado) percebe
// que a pessoa desistiu e para, em vez de gravar a sessao da conta que ela acabou de dispensar.
let geracao = 0;
let renovando = null;
let temporizador = null;
const ouvintes = new Set();
const ganchosDeSaida = [];

// ---------------------------------------------------------------- armazenamento da sessao

/** O que esta guardado, ja lido como objeto, ou null (nada guardado, JSON quebrado ou armazenamento indisponivel). Sempre uma leitura nova. */
function lerObjetoGuardado() {
  try {
    const bruto = window.localStorage.getItem(CHAVE_SESSAO);
    if (!bruto) return null;
    const s = JSON.parse(bruto);
    return s && typeof s === 'object' ? s : null;
  } catch {
    return null;
  }
}

/** So e sessao o que tem os dois tokens. O resto que `perder` deixa (so o aviso da trava) e o campo sozinho nao contam. */
function comTokens(s) {
  return Boolean(s) && [s.access_token, s.refresh_token].every((v) => typeof v === 'string');
}

function lerSessaoGuardada() {
  const s = lerObjetoGuardado();
  if (!comTokens(s)) return null;
  // a trava mora so no armazenamento: a copia em memoria nunca leva o campo nem o aviso
  const copia = { ...s };
  delete copia.biometria;
  delete copia.aviso_trava;
  return copia;
}

/**
 * Leitura PURA do que a trava deixou no armazenamento (nao mexe em `campoConhecido`): `valor` e o campo como esta (undefined = ausente,
 * null = desligada de proposito, qualquer outra coisa = ligada), `aviso` e a marca de que a trava caiu e `temTokens` diz se ha sessao.
 */
function lerCampoGuardado() {
  const s = lerObjetoGuardado();
  let valor;
  let aviso = null;
  if (s) {
    valor = s.biometria;
    if (s.aviso_trava !== undefined) aviso = s.aviso_trava;
  }
  const temTokens = comTokens(s);
  return { valor, aviso, temTokens };
}

/** Os dois campos guardados sao iguais? Comparacao pelo conteudo: o JSON lido de novo nunca e o mesmo objeto. */
function mesmoCampo(a, b) {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * UNICO ponto que grava a sessao. Sem argumentos grava a `sessao` em memoria e PRESERVA o campo e o aviso que estiverem no armazenamento
 * (por isso o campo atravessa renovacao de token, senha e codigo). Os argumentos so existem para as poucas funcoes que mexem na trava:
 * o campo (`undefined` apaga, `null` grava desligada), o aviso (`null` apaga), a sessao fresca a regravar no lugar da de memoria, e o
 * resto sem tokens que `perder` deixa. Devolve false se o armazenamento recusou.
 */
function guardarSessao({ biometria = SEM_MUDANCA, aviso = SEM_MUDANCA, base = null, resto = null } = {}) {
  try {
    const alvo = base || sessao;
    const lido = lerCampoGuardado();
    let finalBio = lido.valor;
    if (biometria !== SEM_MUDANCA) finalBio = biometria;
    let finalAviso = lido.aviso;
    if (aviso !== SEM_MUDANCA) finalAviso = aviso;
    let objeto = null;
    if (alvo) {
      objeto = { ...alvo };   // copia: o objeto em memoria nao recebe o campo
      if (finalBio === undefined) delete objeto.biometria; else objeto.biometria = finalBio;
      if (finalAviso === undefined || finalAviso === null) delete objeto.aviso_trava; else objeto.aviso_trava = finalAviso;
    } else if (resto) {
      objeto = { ...resto };
    }
    if (objeto) window.localStorage.setItem(CHAVE_SESSAO, JSON.stringify(objeto));
    else window.localStorage.removeItem(CHAVE_SESSAO);
    campoConhecido = alvo ? finalBio : undefined;
    return true;
  } catch {
    /* sem armazenamento: a sessao vale so enquanto a pagina estiver aberta */
    return false;
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

// Prazos da entrada contam pelo relogio do aparelho nos DOIS lados (gravar e conferir): o desvio do relogio do servidor so existe em memoria e
// volta a zero quando a pagina recarrega, entao misturar os dois relogios fazia o cadastro "vencer" ou "nascer no futuro".
function relogioLocalEmSegundos() {
  return Math.floor(Date.now() / 1000);
}

function recente(desde) {
  const idade = relogioLocalEmSegundos() - desde;
  return Number.isFinite(desde) && idade > -3 * 60 * 60 && idade < VALIDADE_DO_CADASTRO_S;
}

function cadastroValido(c) {
  return Boolean(c && typeof c.id === 'string' && typeof c.segredo === 'string' && c.segredo && recente(c.em));
}

function cancelado(minhaGeracao) {
  if (minhaGeracao !== geracao) throw new ErroApi('cancelado', { codigo: 'cancelado' });
}

/**
 * `manterCadastro` so e falso quando a sessao muda de mao (senha nova ou codigo confirmado): a renovacao do token mantem o cadastro pendente.
 * `senhaAgora` marca o instante em que a senha foi aceita (a entrada so e retomada depois de recarregar dentro do prazo).
 */
function aoReceberSessao(dados, { manterCadastro = true, senhaAgora = false } = {}) {
  const corpo = lerToken(dados.access_token);
  const usuario = dados.user || {};
  sessao = {
    access_token: dados.access_token,
    refresh_token: dados.refresh_token,
    expires_at: Number(dados.expires_at) || corpo.exp || agoraEmSegundos() + Number(dados.expires_in || 3600),
    user_id: usuario.id || (sessao && sessao.user_id) || corpo.sub || null,
    email: usuario.email || (sessao && sessao.email) || corpo.email || null,
    fatores: Array.isArray(usuario.factors) ? usuario.factors : (sessao && sessao.fatores) || [],
    cadastro: manterCadastro && sessao && cadastroValido(sessao.cadastro) ? sessao.cadastro : null,
    senha_em: senhaAgora ? relogioLocalEmSegundos() : (sessao && sessao.senha_em) || null,
  };
  guardarSessao();
  agendarRenovacao();
  avisar('sessao');
}

/** O que o armazenamento guarda em `aviso_trava` e mesmo um aviso? Objeto com `em` inteiro e `motivo` em texto; qualquer outra coisa nao conta. */
function avisoValido(aviso) {
  return Boolean(aviso) && typeof aviso === 'object' && Number.isInteger(aviso.em) && typeof aviso.motivo === 'string';
}

/**
 * A sessao acabou. Apaga o que estava guardado; so deixa para tras, SEM tokens, a marca `aviso_trava` quando a trava estava ligada e a
 * sessao se perdeu por falta dela (nao por "Sair" nem por "Usar outra conta"): a tela explica depois por que a trava foi desligada.
 * Sem trava ligada, um aviso que ja estava guardado (o de uma perda anterior, que outra janela pode ter acabado de gravar) fica como esta:
 * so "Sair", "Usar outra conta", ligar a trava ou dispensar o aviso o apagam.
 * `gravar: false` e para quando outra janela ja apagou ou trocou o que estava guardado: so esquece a sessao desta janela, sem escrever nada.
 */
function perder(motivo, { gravar = true } = {}) {
  const antes = lerCampoGuardado();   // ANTES de zerar: depois de apagar nao ha mais como saber se a trava estava ligada
  sessao = null;
  fatorEmCadastro = null;
  if (temporizador) window.clearTimeout(temporizador);
  temporizador = null;
  if (gravar) {
    const estavaLigada = antes.valor !== undefined && antes.valor !== null;
    const deixaMarca = motivo !== 'saiu' && motivo !== 'cancelou';
    if (deixaMarca && estavaLigada) guardarSessao({ resto: { aviso_trava: { em: Date.now(), motivo } } });
    else if (deixaMarca && avisoValido(antes.aviso)) guardarSessao({ resto: { aviso_trava: { em: antes.aviso.em, motivo: antes.aviso.motivo } } });
    else guardarSessao();
  }
  avisar('perdida', motivo);
}

// ---------------------------------------------------------------- estado

/** 'aal2' (senha + codigo, ve dados), 'aal1' (so a senha, nao ve nada) ou null (sem sessao). */
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

/**
 * `fn({ tipo, motivo })` quando a sessao muda ('sessao'), se perde ('perdida': o app deve voltar ao login) ou a trava do aplicativo muda
 * ('biometria', com motivo 'ligada', 'minutos', 'desligada' ou 'de-fora', este ultimo quando foi outra janela que mudou). Devolve quem desliga.
 * 'perdida' ganha o motivo 'apagada-em-outra-janela' (outra janela saiu ou perdeu a sessao).
 */
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

// ---------------------------------------------------------------- trava do aplicativo (campo guardado dentro da sessao)

function campoValido(valor) {
  return Boolean(valor) && typeof valor === 'object' && valor.v === 1 && typeof valor.id === 'string' && FORMATO_DO_ID.test(valor.id);
}

function transportsConhecidos(lista) {
  return Array.isArray(lista) ? lista.filter((t) => TRANSPORTS.includes(t)) : [];
}

/**
 * Uma janela velha (aberta antes da trava existir, ou que ainda nao viu o campo) pode regravar a sessao SEM ele. Quando esta janela sabia que a
 * trava estava ligada e o campo sumiu de uma sessao que continua la, devolve o campo: lendo o armazenamento NESTE instante e regravando em cima
 * do que a outra janela escreveu, nunca dos tokens que esta janela tem. Trava desligada de proposito (null) nunca e restaurada.
 */
function restaurarCampoSeFaltou() {
  const conhecido = campoConhecido;
  if (conhecido === undefined || conhecido === null) return false;
  const fresco = lerObjetoGuardado();
  if (!comTokens(fresco) || fresco.biometria !== undefined) return false;
  return guardarSessao({ base: fresco, biometria: conhecido });
}

/**
 * A sessao como esta guardada AGORA, se for a mesma conta que esta janela conhece, ou null. Ligar, trocar o prazo e desligar a trava mudam so o campo:
 * partem deste objeto e nunca regravam os tokens que esta janela tem na memoria, porque outra janela pode ter renovado o token (a nuvem gira o
 * refresh_token a cada renovacao) e o refresh antigo, devolvido ao armazenamento, seria recusado e acabaria a sessao.
 */
function sessaoGuardadaAgora() {
  const guardada = lerObjetoGuardado();
  return comTokens(guardada) && sessao && guardada.user_id === sessao.user_id ? guardada : null;
}

/** A trava esta ligada? Lido do armazenamento agora (nunca da sessao em memoria). Campo malformado conta como ligado: a trava falha fechada. */
export function biometriaLigada() {
  restaurarCampoSeFaltou();
  const { valor } = lerCampoGuardado();
  if (valor !== undefined) campoConhecido = valor;
  return valor !== undefined && valor !== null;
}

/** O que a trava precisa para conferir: `valido` falso quer dizer ligada, porem incompleta (a tela so oferece senha e codigo). */
export function biometriaDados() {
  restaurarCampoSeFaltou();
  const { valor } = lerCampoGuardado();
  if (valor !== undefined) campoConhecido = valor;
  if (!campoValido(valor)) return { valido: false, id: null, transports: [], minutos: 1 };
  return {
    valido: true,
    id: valor.id,
    transports: transportsConhecidos(valor.tr),
    minutos: MINUTOS_VALIDOS.includes(valor.minutos) ? valor.minutos : 1,
  };
}

/** A trava foi desligada de proposito (campo `null` guardado), e nao so esta ausente. */
export function biometriaDesligadaDeProposito() {
  return lerCampoGuardado().valor === null;
}

/** Liga a trava com a credencial recem criada. So com sessao completa. Devolve true so se o armazenamento guardou mesmo (releitura). */
export function ligarBiometria({ id, transports = [], minutos = 1 } = {}) {
  if (!sessao || nivelAtual() !== 'aal2') return false;
  if (typeof id !== 'string' || !FORMATO_DO_ID.test(id)) return false;
  const campo = { v: 1, id, tr: transportsConhecidos(transports), minutos: MINUTOS_VALIDOS.includes(minutos) ? minutos : 1 };
  // limpa o aviso de "a trava caiu" na mesma gravacao: ligar de novo e a resposta a ele
  if (!guardarSessao({ biometria: campo, aviso: null, base: sessaoGuardadaAgora() })) return false;
  const lido = lerCampoGuardado().valor;
  const gravou = campoValido(lido) && lido.id === id;
  if (gravou) avisar('biometria', 'ligada');
  return gravou;
}

/** Troca o prazo (0, 1 ou 5 minutos). Nao mexe em mais nada do campo. */
export function trocarMinutosBiometria(minutos) {
  if (typeof minutos !== 'number' || !MINUTOS_VALIDOS.includes(minutos)) return false;
  if (!sessao) return false;
  const dados = biometriaDados();
  if (!dados.valido) return false;
  if (!guardarSessao({ biometria: { v: 1, id: dados.id, tr: dados.transports, minutos }, base: sessaoGuardadaAgora() })) return false;
  const lido = lerCampoGuardado().valor;
  const gravou = campoValido(lido) && lido.minutos === minutos;
  if (gravou) avisar('biometria', 'minutos');
  return gravou;
}

/** Desliga a trava de proposito: grava `null` (e nao apaga), para uma janela nova nao ressuscitar. A sessao e o aviso ficam como estao. */
export function desligarBiometria() {
  if (!sessao) return false;
  if (!guardarSessao({ biometria: null, base: sessaoGuardadaAgora() })) return false;
  const gravou = lerCampoGuardado().valor === null;
  if (gravou) avisar('biometria', 'desligada');
  return gravou;
}

/** A trava caiu porque a sessao acabou? `{ em, motivo }` ou null. Fica guardado ate a pessoa ligar de novo, dispensar ou sair. */
export function avisoDaTrava() {
  const { aviso } = lerCampoGuardado();
  return avisoValido(aviso) ? { em: aviso.em, motivo: aviso.motivo } : null;
}

/** Apaga so o aviso. Sem aviso, ou sem nada guardado, devolve true. Nunca mexe numa sessao que esta janela nao conhece. */
export function limparAvisoDaTrava() {
  const antes = lerCampoGuardado();
  if (antes.aviso === null) return true;
  if (!sessao && antes.temTokens) return false;   // sessao de outra janela, que esta nao adotou: nao regravar nem apagar
  if (!guardarSessao({ aviso: null })) return false;
  return lerCampoGuardado().aviso === null;
}

/** A renovacao do token que esta em curso (ou null). A trava espera por ela antes de recarregar, para nao perder a sessao no meio. */
export function renovacaoEmAndamento() {
  return renovando;
}

let armazenamentoPedido = null;

/** Pede ao navegador para nao apagar os dados do aplicativo sozinho. Uma vez por pagina; nunca lanca. true/false = a resposta; null = sem suporte. */
export function pedirArmazenamentoDuravel() {
  if (!armazenamentoPedido) {
    armazenamentoPedido = (async () => {
      try {
        if (!navigator.storage || typeof navigator.storage.persist !== 'function') return null;
        return (await navigator.storage.persist()) === true;
      } catch {
        return null;
      }
    })();
  }
  return armazenamentoPedido;
}

// Outra janela do aplicativo mexeu no armazenamento. Le o que esta guardado AGORA (nunca o valor que veio no evento, que pode ja estar velho).
function aoMudarOArmazenamento(ev) {
  try {
    if (ev.key !== null && ev.key !== CHAVE_SESSAO) return;
    const conhecido = campoConhecido;
    const fresco = lerCampoGuardado();
    if (!fresco.temTokens) {
      // sessao apagada (Sair em outra janela) ou trocada pelo resto sem tokens: esta janela so esquece a dela, sem escrever nada
      if (sessao) perder('apagada-em-outra-janela', { gravar: false });
      campoConhecido = undefined;
      return;
    }
    if (fresco.valor === undefined && conhecido !== undefined && conhecido !== null) {
      restaurarCampoSeFaltou();   // janela velha regravou sem o campo
      return;
    }
    if (!mesmoCampo(fresco.valor, conhecido)) {
      campoConhecido = fresco.valor;
      avisar('biometria', 'de-fora');
    }
  } catch {
    /* um evento com defeito nao derruba a pagina */
  }
}
window.addEventListener('storage', aoMudarOArmazenamento);

// ---------------------------------------------------------------- entrar

const FATOR_TOTP = (f) => f && f.factor_type === 'totp';

/** Passo 1. Devolve { passo: 'codigo' } (ja tem autenticador) ou { passo: 'cadastro' } (primeiro acesso: precisa cadastrar o autenticador). */
export async function entrar(email, senha) {
  fatorEmCadastro = null;
  geracao += 1;
  const minhaGeracao = geracao;
  const r = await chamarAuth('POST', '/token?grant_type=password', { corpo: { email: String(email).trim(), password: senha } });
  cancelado(minhaGeracao);
  aoReceberSessao(r.dados, { manterCadastro: false, senhaAgora: true });
  const verificado = sessao.fatores.find((f) => FATOR_TOTP(f) && f.status === 'verified');
  return { passo: verificado ? 'codigo' : 'cadastro' };
}

/**
 * Pagina recarregada no meio da entrada (a pessoa foi ao aplicativo autenticador e voltou, ou o navegador descartou a aba): devolve o passo em
 * que ela estava, sem pedir a senha de novo, ou null se nao ha o que retomar. Nao fala com a nuvem: so le o que a sessao guardou.
 */
export function retomarEntrada() {
  if (!sessao || nivelAtual() === 'aal2') return null;
  if (sessao.fatores.find((f) => FATOR_TOTP(f) && f.status === 'verified')) {
    if (recente(sessao.senha_em)) return { passo: 'codigo' };
  } else if (cadastroValido(sessao.cadastro)) {
    const c = sessao.cadastro;
    fatorEmCadastro = c.id;
    return { passo: 'cadastro', cadastro: { qrSvg: String(c.qrSvg || ''), segredo: c.segredo, uri: String(c.uri || '') } };
  }
  // passou do prazo (ou nao ha o que retomar): apaga de verdade, inclusive o segredo pendente, em vez de so ignorar
  perder('abandonada');
  return null;
}

/** Primeiro acesso: pede o segredo do autenticador. Devolve { qrSvg (texto do SVG), segredo, uri }. */
export async function iniciarCadastro() {
  const minhaGeracao = geracao;
  const token = await tokenParaUso();
  cancelado(minhaGeracao);
  // sobra de uma tentativa anterior que ficou pela metade: sai do caminho para o nome "celular" nao dar conflito.
  // `substituiu` avisa a tela: a pessoa pode ter uma entrada velha no aplicativo autenticador que nao vale mais.
  let substituiu = false;
  for (const f of sessao.fatores.filter((x) => FATOR_TOTP(x) && x.status !== 'verified')) {
    try {
      await chamarAuth('DELETE', `/factors/${encodeURIComponent(f.id)}`, { token });
      substituiu = true;
    } catch { /* segue: o cadastro abaixo diz se deu problema */ }
  }
  cancelado(minhaGeracao);
  let r;
  try {
    r = await chamarAuth('POST', '/factors', { token, corpo: { factor_type: 'totp', friendly_name: NOME_DO_FATOR, issuer: EMISSOR } });
  } catch (erro) {
    if (!(erro instanceof ErroApi) || erro.status !== 422) throw erro;
    r = await chamarAuth('POST', '/factors', { token, corpo: { factor_type: 'totp', friendly_name: `${NOME_DO_FATOR} ${Date.now().toString(36)}`, issuer: EMISSOR } });
  }
  cancelado(minhaGeracao);
  fatorEmCadastro = r.dados.id;
  const totp = r.dados.totp || {};
  const dadosDoFator = { qrSvg: String(totp.qr_code || ''), segredo: String(totp.secret || ''), uri: String(totp.uri || '') };
  sessao.cadastro = { id: fatorEmCadastro, ...dadosDoFator, em: relogioLocalEmSegundos() };
  guardarSessao();
  return { ...dadosDoFator, substituiu };
}

/** Passo 2: confere o codigo de 6 digitos (cadastro ou entrada). Termina com sessao aal2 guardada. Levanta ErroApi se o codigo nao confere. */
export async function verificarCodigo(codigo) {
  const limpo = String(codigo).replace(/\s+/g, '');
  if (!/^\d{6}$/.test(limpo)) throw new ErroApi('codigo mal formado', { status: 400, codigo: 'codigo_invalido' });
  const verificado = sessao && sessao.fatores.find((f) => FATOR_TOTP(f) && f.status === 'verified');
  const fatorId = fatorEmCadastro || (verificado && verificado.id);
  if (!fatorId) throw new ErroApi('sem fator', { status: 400, codigo: 'sem_fator' });
  const minhaGeracao = geracao;
  // 401 ou 403 (token vencido, sessao apagada na nuvem): renova UMA vez e tenta de novo; se ainda assim a nuvem nao reconhece a sessao, ela acabou
  const comRenovacao = async (fazer) => {
    const token = await tokenParaUso();
    try {
      return await fazer(token);
    } catch (erro) {
      if (!(erro instanceof ErroApi) || erro.rede || (erro.status !== 401 && erro.status !== 403)) throw erro;
    }
    cancelado(minhaGeracao);
    await renovar();
    cancelado(minhaGeracao);
    try {
      return await fazer(sessao.access_token);
    } catch (erro) {
      if (erro instanceof ErroApi && !erro.rede && (erro.status === 401 || erro.status === 403)) perder('sessao-acabou');
      throw erro;
    }
  };
  // um desafio novo a cada tentativa: nao depende de o anterior ainda valer
  let desafio;
  try {
    desafio = await comRenovacao((token) => chamarAuth('POST', `/factors/${encodeURIComponent(fatorId)}/challenge`, { token, corpo: {} }));
  } catch (erro) {
    // a nuvem apaga sozinha o autenticador que ficou muito tempo sem ser confirmado: a tela gera outro (ou manda entrar de novo) e explica (entrada.js)
    if (erro instanceof ErroApi && erro.status === 404) throw new ErroApi('fator sumiu', { status: 404, codigo: 'fator_sumiu' });
    throw erro;
  }
  cancelado(minhaGeracao);
  const r = await comRenovacao((token) => chamarAuth('POST', `/factors/${encodeURIComponent(fatorId)}/verify`, { token, corpo: { challenge_id: desafio.dados.id, code: limpo } }));
  cancelado(minhaGeracao);
  fatorEmCadastro = null;
  aoReceberSessao(r.dados, { manterCadastro: false });
  if (nivelAtual() !== 'aal2') {
    perder('sem-aal2');
    throw new ErroApi('sessao sem segundo fator', { status: 401, codigo: 'sem_aal2' });
  }
}

/** Frase simples para o erro de login. `passo`: 'senha' | 'codigo' | 'cadastro'. Nunca mostra texto tecnico do servidor. */
export function mensagemDeEntrada(erro, passo) {
  if (!(erro instanceof ErroApi)) return 'Não foi possível entrar agora. Tente de novo em instantes.';
  if (erro.rede) return 'Sem conexão com a internet. Confira o sinal e tente de novo.';
  if (erro.status === 429) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if (passo === 'senha' && (erro.status === 400 || erro.status === 401 || erro.status === 422)) return 'E-mail ou senha incorretos.';
  if (passo === 'cadastro' && (erro.status === 400 || erro.status === 422)) return 'Código incorreto. Confira se é o código da entrada "Gestão JEMJ" no autenticador, se a chave foi colada inteira e se a hora do celular está certa.';
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
      if (!sessao) throw new ErroApi('sem sessao', { status: 401 });   // outra janela fez Sair durante a espera: a sessao apagada nao volta
      aoReceberSessao(r.dados);
      if (eraCompleta && nivelAtual() !== 'aal2') {
        perder('sem-aal2');
        throw new ErroApi('sessao sem segundo fator', { status: 401, codigo: 'sem_aal2' });
      }
    } catch (erro) {
      // login recusado de verdade (e nao so falta de internet): a sessao acabou (se ja acabou nesta janela, nao ha o que perder de novo)
      if (sessao && erro instanceof ErroApi && !erro.rede && erro.status >= 400 && erro.status < 500 && erro.status !== 429) perder('renovacao-recusada');
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
  geracao += 1;
  const token = sessao && sessao.access_token;
  perder('cancelou');
  // melhor esforco: a nuvem tambem esquece a sessao so de senha (sair() faz o mesmo para a sessao completa)
  if (token) chamarAuth('POST', '/logout?scope=local', { token }).catch(() => {});
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
