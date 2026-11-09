// Biometria (WebAuthn): o UNICO arquivo do aplicativo que fala com o navegador sobre credenciais.
//
// O que faz: cria uma credencial do proprio celular (criar), confere o desbloqueio do celular (verificar), diz se da para usar
// (suportado e disponivel), cancela o pedido em andamento (abortar) e pede ao celular para esquecer uma credencial (esquecer).
//
// Regras deste arquivo:
//  - criar() e verificar() chamam o navegador na MESMA pilha do clique, sem esperar nada antes. O WebKit (iPhone) so abre a janela do
//    desbloqueio quando a chamada sai do proprio toque. Quem chama deve chamar direto do ouvinte do clique.
//  - Nao guarda nada: nem credencial, nem chave, nem contador, nem texto de erro. Quem guarda o identificador e a camada de sessao.
//    Nao cifra nada, nao fala com a nuvem e nao importa a sessao nem tela nenhuma.
//  - Todo erro sai como ErroBiometria com um codigo fixo, nunca com o texto tecnico do navegador (que nao serve para quem le a tela):
//      nao_confirmado  a pessoa nao confirmou, recusou ou a conferencia local nao bateu
//      demorou         o prazo do pedido acabou
//      abortado        o proprio aplicativo cancelou o pedido
//      inseguro        o navegador recusou por causa do endereco ou do contexto
//      nao_suportado   o navegador nao tem o recurso
//      dados_incompletos  o identificador guardado esta fora do formato
//      falhou          qualquer outro defeito
//  - Nenhum parametro, variavel global ou gancho de teste: os testes controlam relogio e eventos por fora.

import { hojeEmCuiaba, dataBR } from './datas.js';

export class ErroBiometria extends Error {
  constructor(codigo) {
    super(codigo);
    this.name = 'ErroBiometria';
    this.codigo = codigo;
  }
}

// O mesmo TEXTO esta em auth.js: nao reformatar.
export const FORMATO_DO_ID = /^[A-Za-z0-9_-]{16,1400}$/;
const TRANSPORTS_VALIDOS = ['internal', 'hybrid', 'usb', 'nfc', 'ble', 'smart-card'];

const FOLGA_MS = 10000;            // quanto o aplicativo ainda considera "ocupado" depois do prazo do pedido
const ESPERA_DISPONIVEL_MS = 3000; // quanto esperar a resposta de "da para usar?" antes de dizer "desconhecido"
const REPETIR_APOS_MS = 150;       // pausa antes da unica repeticao depois de um OperationError

// ---------------------------------------------------------------- utilitarios

function base64url(bytes) {
  let binario = '';
  for (let i = 0; i < bytes.length; i += 1) binario += String.fromCharCode(bytes[i]);
  return btoa(binario).replace(/[+\/]/g, (c) => (c === '+' ? '-' : '_')).replace(/=+$/, '');
}

function bytesDeBase64url(texto) {
  const comum = texto.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(comum + '='.repeat((4 - (comum.length % 4)) % 4));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function aleatorio(n) {
  const bytes = new Uint8Array(n);
  window.crypto.getRandomValues(bytes);
  return bytes;
}

function dentroDoFormato(id) {
  return typeof id === 'string' && FORMATO_DO_ID.test(id);
}

function transportsValidos(lista) {
  if (!Array.isArray(lista)) return [];
  return [...new Set(lista.filter((t) => TRANSPORTS_VALIDOS.includes(t)))];
}

function limiteValido(valor, padrao) {
  return Number.isFinite(valor) && valor > 0 ? valor : padrao;
}

function rejeitar(codigo) {
  return Promise.reject(new ErroBiometria(codigo));
}

// ---------------------------------------------------------------- o que o navegador e o aparelho oferecem

/**
 * O navegador tem WebAuthn, a pagina e segura, nao esta dentro de outra pagina e sabe abrir uma janela modal (<dialog>.showModal: e nela que a
 * trava sobe; sem ela a trava nao poderia aparecer, entao nem se oferece). Nao diz se o celular tem bloqueio de tela.
 */
export function suportado() {
  try {
    return Boolean(
      typeof window.PublicKeyCredential === 'function'
      && navigator.credentials
      && typeof navigator.credentials.create === 'function'
      && window.isSecureContext
      && window.top === window.self
      && typeof window.HTMLDialogElement === 'function'
      && typeof window.HTMLDialogElement.prototype.showModal === 'function',
    );
  } catch {
    return false;
  }
}

/**
 * O celular confirma ter um bloqueio de tela que sirva? 'sim', 'nao' ou 'desconhecido' (o navegador nao respondeu em 3 s).
 * 'desconhecido' NUNCA vira 'nao': quem chama continua deixando a pessoa tentar.
 */
export function disponivel() {
  if (!suportado()) return Promise.resolve('nao');
  return new Promise((resolve) => {
    let fim = false;
    let relogio = null;
    const concluir = (valor) => {
      if (fim) return;
      fim = true;
      clearTimeout(relogio);
      resolve(valor);
    };
    relogio = setTimeout(() => concluir('desconhecido'), ESPERA_DISPONIVEL_MS);
    let pergunta;
    try {
      pergunta = window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      concluir('nao');
      return;
    }
    Promise.resolve(pergunta).then((resposta) => concluir(resposta === true ? 'sim' : 'nao'), () => concluir('nao'));
  });
}

// Mesma regra de plataforma() e jaInstalado() de telas/entrada.js, repetida aqui de proposito: este arquivo nao importa tela nenhuma.
const UA = () => navigator.userAgent || '';

/** iphone: iPhone, iPad, iPod, ou Mac com toque (que e iPad pedindo o site de computador). instalado: aberto pelo icone da tela inicial. */
export function aparelho() {
  try {
    const iphone = /iPhone|iPad|iPod/i.test(UA()) || (/Macintosh/i.test(UA()) && navigator.maxTouchPoints > 1);
    const instalado = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    return { iphone: Boolean(iphone), instalado: Boolean(instalado) };
  } catch {
    return { iphone: false, instalado: false };
  }
}

/** O navegador so abre a janela do desbloqueio a partir de um toque (WebKit: iPhone e Safari). Quando verdadeiro, nada e tentado sozinho. */
export function exigeToque() {
  try {
    return aparelho().iphone || (UA().includes('Safari/') && !/Chrome|Chromium|CriOS|Edg|Android|FxiOS/i.test(UA()));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- o pedido em andamento (um de cada vez)

let atual = null;        // o pedido em andamento: { controle, abortadoPorNos, motivo, cancelarJa }
let ocupadoAte = 0;      // instante (ms) ate o qual o aplicativo se considera ocupado com o painel do sistema aberto
const ouvintesDeFim = new Set();

/** Verdadeiro enquanto um pedido esta aberto (e por alguns segundos de folga depois do prazo dele). */
export function ocupado() {
  return Date.now() < ocupadoAte;
}

/** Registra fn para rodar quando QUALQUER pedido termina (sucesso, erro, abortado, demorou). Devolve quem remove o registro. */
export function aoEncerrar(fn) {
  if (typeof fn !== 'function') return () => {};
  ouvintesDeFim.add(fn);
  return () => { ouvintesDeFim.delete(fn); };
}

function avisarFim() {
  for (const fn of [...ouvintesDeFim]) {
    try {
      fn();
    } catch {
      // um ouvinte com defeito nao derruba o pedido nem os outros ouvintes
    }
  }
}

/** Cancela o pedido em andamento, se houver: ele rejeita 'abortado' na hora. Pode ser chamada a qualquer momento, quantas vezes for. */
export function abortar() {
  if (atual && typeof atual.cancelarJa === 'function') {
    atual.abortadoPorNos = true;
    atual.cancelarJa();
  } else if (atual) {
    atual = null;       // pedido sem como cancelar: limpa o estado preso
    ocupadoAte = 0;
    avisarFim();
  }
}

function iniciarPedido(limiteMs) {
  abortar();            // nunca ha dois pedidos ao mesmo tempo
  const meu = { controle: new AbortController(), abortadoPorNos: false, motivo: null, cancelarJa: null };
  atual = meu;
  ocupadoAte = Date.now() + limiteMs + FOLGA_MS;
  return meu;
}

/** Erro do navegador para ErroBiometria. 'abortado' e 'demorou' vem so das bandeiras do pedido, nunca do nome do erro. */
function traduzir(e, meu) {
  if (e instanceof ErroBiometria) return e;
  if (meu && meu.abortadoPorNos) return new ErroBiometria('abortado');
  if (meu && meu.motivo === 'demorou') return new ErroBiometria('demorou');
  const nome = e && e.name;
  if (nome === 'NotAllowedError') return new ErroBiometria('nao_confirmado');
  if (nome === 'SecurityError') return new ErroBiometria('inseguro');
  if (nome === 'NotSupportedError') return new ErroBiometria('nao_suportado');
  if (nome === 'AbortError') return new ErroBiometria('nao_confirmado');   // cancelamento que nao foi nosso
  return new ErroBiometria('falhou');
}

/**
 * Roda o pedido. A PRIMEIRA chamada ao navegador acontece de forma sincrona dentro do executor da promessa: na mesma pilha do clique.
 * `chamar(sinal)` faz a chamada ao navegador e devolve a promessa dele. Um OperationError repete UMA vez, sem contar como falha.
 */
function executar(meu, chamar, limiteMs) {
  return new Promise((resolve, reject) => {
    let fim = false;
    let repetiu = false;
    let relogio = null;
    const encerrar = () => {
      fim = true;
      clearTimeout(relogio);
      if (atual === meu) {
        atual = null;
        ocupadoAte = 0;
      }
      avisarFim();
    };
    relogio = setTimeout(() => {
      if (fim) return;
      meu.motivo = 'demorou';
      encerrar();
      meu.controle.abort();
      reject(new ErroBiometria('demorou'));
    }, limiteMs);
    meu.cancelarJa = () => {
      if (fim) return;
      encerrar();
      meu.controle.abort();
      reject(new ErroBiometria('abortado'));
    };
    const tentar = () => {
      let promessa;
      try {
        promessa = chamar(meu.controle.signal);
      } catch (e) {
        // excecao sincrona (por exemplo, o navegador sem o metodo): encerra sem deixar o aplicativo "ocupado"
        if (!fim) {
          encerrar();
          reject(traduzir(e, meu));
        }
        return;
      }
      Promise.resolve(promessa).then((valor) => {
        if (fim) return;
        encerrar();
        resolve(valor);
      }, (e) => {
        if (fim) return;
        if (!repetiu && e && e.name === 'OperationError') {
          repetiu = true;
          meu.controle = new AbortController();
          setTimeout(() => { if (!fim) tentar(); }, REPETIR_APOS_MS);
          return;
        }
        encerrar();
        reject(traduzir(e, meu));
      });
    };
    tentar();
  });
}

// ---------------------------------------------------------------- criar e verificar

function conferirCriacao(credencial) {
  try {
    const id = base64url(new Uint8Array(credencial.rawId));
    if (!dentroDoFormato(id)) throw new ErroBiometria('falhou');
    let transports = [];
    try {
      const resposta = credencial.response;
      if (resposta && typeof resposta.getTransports === 'function') transports = transportsValidos(resposta.getTransports());
    } catch {
      transports = [];     // sem a lista de transportes a credencial continua valendo
    }
    return { id, transports };
  } catch (e) {
    throw e instanceof ErroBiometria ? e : new ErroBiometria('falhou');
  }
}

/**
 * Cria a credencial deste celular, protegida pelo desbloqueio dele. Devolve { id, transports }.
 * Nao espera nada antes da chamada ao navegador (sem pausa e sem promessa na frente): chame direto do clique.
 */
export function criar({ limiteMs = 60000 } = {}) {
  if (!suportado()) return rejeitar('nao_suportado');
  const limite = limiteValido(limiteMs, 60000);
  let opcoes;
  try {
    opcoes = {
      publicKey: {
        rp: { name: 'Gestão JEMJ' },
        user: { id: aleatorio(16), name: 'gestao-jemj', displayName: 'Gestão JEMJ neste celular, ' + dataBR(hojeEmCuiaba()) },
        challenge: aleatorio(32),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        attestation: 'none',
        timeout: limite,
        hints: ['client-device'],
      },
    };
  } catch {
    return rejeitar('falhou');       // antes de iniciarPedido: o aplicativo nao fica "ocupado" por um pedido que nunca existiu
  }
  const meu = iniciarPedido(limite);
  return executar(meu, (sinal) => navigator.credentials.create({ ...opcoes, signal: sinal }), limite).then(conferirCriacao);
}

/** Confere por conta propria o que o celular devolveu. Qualquer divergencia ou defeito vira 'nao_confirmado'. */
function conferirAssertion(credencial, id, desafio) {
  try {
    if (base64url(new Uint8Array(credencial.rawId)) !== id) throw new ErroBiometria('nao_confirmado');
    const dados = new Uint8Array(credencial.response.authenticatorData);
    if ((dados[32] & 0x05) !== 0x05) throw new ErroBiometria('nao_confirmado');       // presenca (0x01) E verificacao (0x04)
    const cliente = JSON.parse(new TextDecoder().decode(credencial.response.clientDataJSON));
    if (cliente.type !== 'webauthn.get') throw new ErroBiometria('nao_confirmado');
    if (cliente.challenge !== base64url(desafio)) throw new ErroBiometria('nao_confirmado');
    if (cliente.origin !== window.location.origin) throw new ErroBiometria('nao_confirmado');
    return true;
  } catch {
    throw new ErroBiometria('nao_confirmado');
  }
}

/**
 * Pede o desbloqueio do celular para a credencial `id`. Devolve true. Rejeita sempre com ErroBiometria.
 * Nao espera nada antes da chamada ao navegador (sem pausa e sem promessa na frente): chame direto do clique.
 */
export function verificar({ id, transports = [], limiteMs = 120000 } = {}) {
  if (!suportado()) return rejeitar('nao_suportado');
  if (!dentroDoFormato(id)) return rejeitar('dados_incompletos');
  const limite = limiteValido(limiteMs, 120000);
  let bytesDoId;
  try {
    bytesDoId = bytesDeBase64url(id);
  } catch {
    return rejeitar('dados_incompletos');
  }
  let desafio;
  let opcoes;
  try {
    desafio = aleatorio(32);
    const lista = transportsValidos(transports);
    opcoes = {
      publicKey: {
        challenge: desafio,
        allowCredentials: [{ type: 'public-key', id: bytesDoId, ...(lista.length ? { transports: lista } : {}) }],
        userVerification: 'required',
        timeout: limite,
        hints: ['client-device'],
      },
    };
  } catch {
    return rejeitar('falhou');
  }
  const meu = iniciarPedido(limite);
  return executar(meu, (sinal) => navigator.credentials.get({ ...opcoes, signal: sinal }), limite)
    .then((credencial) => conferirAssertion(credencial, id, desafio));
}

/** Pede ao celular para esquecer a credencial. Melhor esforco: nunca rejeita, e o aparelho pode ignorar o pedido. */
export function esquecer(id) {
  try {
    const resposta = window.PublicKeyCredential.signalUnknownCredential({ rpId: window.location.hostname, credentialId: id });
    if (resposta && typeof resposta.catch === 'function') resposta.catch(() => {});
  } catch {
    // o navegador pode nao ter o recurso
  }
  return Promise.resolve();
}
