// Roteador por hash (#/prazos, #/prazo/abc123?filtro=x). Funciona em qualquer subcaminho porque o endereco da pagina nunca muda: so o #.
//
// COMO UMA TELA SE REGISTRA (detalhes e exemplo completo em docs/CELULAR-APP.md, "Como criar uma tela"):
//
//   import { registrar } from '../rotas.js';
//   registrar('/prazo/:id', async (ctx) => {
//     ctx.titulo('Prazo');
//     ctx.raiz.replaceChildren(...);          // desenha dentro de ctx.raiz
//     return () => { /* limpeza opcional: timers, ouvintes */ };
//   }, { aba: 'prazos', pai: '/prazos' });
//
// `montar(ctx)` pode ser assincrona. Tudo que a tela abrir (timer, ouvinte, assinatura) tem de ser fechado na limpeza: devolva uma funcao
// ou use ctx.aoLimpar(fn). A limpeza roda quando a pessoa sai da tela.
//
// Opcoes do registro: aba ('hoje'|'prazos'|'agenda'|'publicacoes'|'mais': qual item da barra de baixo fica marcado),
//                     pai (rota para onde o Voltar vai quando nao ha historico, ex.: abriu o detalhe por um link direto),
//                     titulo (titulo padrao do topo, se a tela nao definir).
//
// Voltar do celular: cada ir() guarda uma entrada no historico (history.pushState); o botao Voltar do aparelho volta ao que estava
// antes (de um detalhe para a lista). Folhas inferiores tambem entram no historico (empilharCamada): Voltar fecha a folha, nao a tela.

import { erroDeTela } from './componentes/erro.js';

const rotas = [];
let raiz = null;
let casca = { definirTitulo() {}, marcarAba() {}, mostrarVoltar() {}, aoTrocar() {} };
let estender = () => {};
let atual = null;
let versao = 0;
let posicao = 0;          // quantas entradas de historico do aplicativo existem antes desta
let pendentes = 0;        // popstates provocados pelo proprio roteador (a ignorar)
let depoisDeVoltar = null;
let suspenso = false;                 // a trava do aplicativo esta na tela: o Voltar do aparelho nao troca de tela nem fecha folha
let ultimoPopFoiDoRoteador = false;   // o ultimo popstate foi provocado pelo proprio roteador (a trava ignora esse)
const camadas = [];

const CAMINHO_PADRAO = '/hoje';

function compilar(padrao) {
  const nomes = [];
  const fonte = padrao.split('/').map((parte) => {
    if (parte.startsWith(':')) {
      nomes.push(parte.slice(1));
      return '([^/]+)';
    }
    return parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  return { regex: new RegExp(`^${fonte}$`), nomes };
}

/** Registra uma tela. `padrao` aceita parametros (:id). Registrar duas vezes o mesmo padrao e erro de programacao. */
export function registrar(padrao, montar, opcoes = {}) {
  if (rotas.some((r) => r.padrao === padrao)) throw new Error(`Rota repetida: ${padrao}`);
  rotas.push({ padrao, montar, opcoes, ...compilar(padrao) });
}

export function rotasRegistradas() {
  return rotas.map((r) => r.padrao);
}

function decodificar(texto) {
  try { return decodeURIComponent(texto); } catch { return texto; }
}

/** Monta o caminho a partir do padrao: caminhoDe('/prazo/:id', { id: 'a b' }) -> '/prazo/a%20b'. */
export function caminhoDe(padrao, params = {}, consulta = null) {
  const caminho = padrao.split('/').map((parte) => (parte.startsWith(':') ? encodeURIComponent(String(params[parte.slice(1)] ?? '')) : parte)).join('/');
  const pares = consulta ? Object.entries(consulta).filter(([, v]) => v !== null && v !== undefined && v !== '') : [];
  return pares.length ? `${caminho}?${new URLSearchParams(pares).toString()}` : caminho;
}

/** O valor para href="..." de um link interno: href('/prazo/:id', { id }) -> '#/prazo/abc'. */
export function href(padrao, params = {}, consulta = null) {
  return `#${caminhoDe(padrao, params, consulta)}`;
}

function lerHash(hash) {
  const bruto = String(hash || '').replace(/^#/, '') || CAMINHO_PADRAO;
  const corte = bruto.indexOf('?');
  const caminho = corte < 0 ? bruto : bruto.slice(0, corte);
  const consulta = {};
  if (corte >= 0) for (const [k, v] of new URLSearchParams(bruto.slice(corte + 1))) consulta[k] = v;
  return { caminho: caminho || CAMINHO_PADRAO, consulta };
}

function casar(caminho) {
  for (const r of rotas) {
    const m = r.regex.exec(caminho);
    if (!m) continue;
    const params = {};
    r.nomes.forEach((nome, i) => { params[nome] = decodificar(m[i + 1]); });
    return { rota: r, params };
  }
  return null;
}

/** A rota que esta na tela: { caminho, padrao, params, consulta } (ou null antes de iniciar). */
export function rotaAtual() {
  return atual ? atual.info : null;
}

function posicaoDoHistorico() {
  const e = window.history.state;
  return e && Number.isInteger(e.n) ? e.n : 0;
}

// ---------------------------------------------------------------- navegar

function empurrar(caminho) {
  const destino = `#${caminho}`;
  if (destino === window.location.hash) {
    rotear();
    return;
  }
  posicao += 1;
  window.history.pushState({ n: posicao }, '', destino);
  rotear();
}

/**
 * Vai para outra tela e guarda no historico. Aceita o padrao com parametros: ir('/prazo/:id', { id }) ou o caminho pronto: ir('/hoje').
 * Se houver folha aberta, fecha antes (e depois navega).
 */
export function ir(padraoOuCaminho, params = {}, consulta = null) {
  const caminho = caminhoDe(padraoOuCaminho, params, consulta);
  if (camadas.length) {
    fecharCamadas(() => empurrar(caminho));
    return;
  }
  empurrar(caminho);
}

/** Troca a tela sem criar entrada de historico (o Voltar nao volta para a anterior). */
export function substituir(padraoOuCaminho, params = {}, consulta = null) {
  const caminho = caminhoDe(padraoOuCaminho, params, consulta);
  window.history.replaceState({ n: posicao }, '', `#${caminho}`);
  rotear();
}

function voltarDaTela(opcoes) {
  if (camadas.length) {
    window.history.back();
    return;
  }
  if (posicao > 0) window.history.back();
  else substituir(opcoes.pai || CAMINHO_PADRAO);
}

/** Voltar da tela atual: ao que estava antes; se nao houver (abriu por link direto), a rota `pai` do registro, ou Hoje. */
export function voltar() {
  voltarDaTela(atual && atual.rota ? atual.rota.opcoes : {});
}

// ---------------------------------------------------------------- camadas (folhas) no historico

/**
 * Registra uma camada aberta (folha inferior) no historico, para o Voltar do aparelho fecha-la sem sair da tela.
 * `fechar()` e chamada quando a pessoa aperta Voltar. Devolve `liberar()`, que a camada chama quando ela mesma se fecha.
 * `antesDeVoltar()` (opcional) e chamada primeiro: se devolver true, a camada FICA aberta (ela mesma pergunta e se fecha se a pessoa quiser).
 */
export function empilharCamada(fechar, { antesDeVoltar = null } = {}) {
  const item = { fechar, ativa: true, antesDeVoltar };
  camadas.push(item);
  posicao += 1;
  window.history.pushState({ n: posicao, camada: true }, '');
  return () => new Promise((resolve) => {
    if (!item.ativa) { resolve(); return; }
    item.ativa = false;
    camadas.splice(camadas.indexOf(item), 1);
    pendentes += 1;
    depoisDeVoltar = resolve;
    window.history.back();
  });
}

function fecharCamadas(depois) {
  const quantas = camadas.length;
  for (const c of camadas.splice(0)) {
    c.ativa = false;
    try { c.fechar(); } catch { /* a camada ja se fechou */ }
  }
  pendentes += 1;
  depoisDeVoltar = depois;
  window.history.go(-quantas);
}

/**
 * Enquanto `sim` for verdadeiro (a trava do aplicativo esta na tela), o Voltar do aparelho nao troca de tela nem fecha folha: o roteador
 * so acompanha a posicao do historico. Quem suspende tem de chamar suspender(false) e ressincronizar() ao terminar.
 */
export function suspender(sim) {
  suspenso = Boolean(sim);
}

/** O ultimo popstate foi provocado pelo proprio roteador (ao fechar uma folha, por exemplo)? A trava ignora esse e trata os da pessoa. */
export function ultimoPopDoRoteador() {
  return ultimoPopFoiDoRoteador;
}

/** Depois de uma suspensao: acerta a posicao do historico e, se o endereco nao e mais o da tela que esta montada, monta a tela do endereco. */
export function ressincronizar() {
  posicao = posicaoDoHistorico();
  if (!raiz) return;
  const { caminho } = lerHash(window.location.hash);
  if (!atual || atual.info.caminho !== caminho) rotear();
}

function aoVoltarPeloHistorico() {
  ultimoPopFoiDoRoteador = false;
  posicao = posicaoDoHistorico();
  if (pendentes > 0) {
    ultimoPopFoiDoRoteador = true;
    pendentes -= 1;
    if (pendentes === 0 && depoisDeVoltar) {
      const fn = depoisDeVoltar;
      depoisDeVoltar = null;
      fn();
    }
    return;
  }
  if (suspenso) return;
  const topo = camadas[camadas.length - 1];
  if (topo) {
    if (topo.antesDeVoltar && topo.antesDeVoltar()) {
      // A camada tem algo a perder (um formulario preenchido) e vai perguntar antes de sair: o Voltar ja gastou a entrada do historico,
      // entao poe outra no lugar. Se a pessoa descartar, a camada se fecha e devolve essa entrada pelo caminho de sempre.
      posicao += 1;
      window.history.pushState({ n: posicao, camada: true }, '');
      return;
    }
    camadas.pop();
    topo.ativa = false;
    topo.fechar();
    return;
  }
  rotear();
}

// ---------------------------------------------------------------- montar a tela

function executar(limpezas, retorno) {
  const todas = [...limpezas].reverse();
  if (typeof retorno === 'function') todas.push(retorno);
  else if (retorno && typeof retorno.limpar === 'function') todas.push(() => retorno.limpar());
  for (const fn of todas) {
    try { fn(); } catch (erro) { console.error(erro); }
  }
}

function limparAtual() {
  if (!atual) return;
  atual.controle.abort();
  executar(atual.limpezas, atual.retorno);
  atual = null;
}

async function rotear() {
  const { caminho, consulta } = lerHash(window.location.hash);
  const achada = casar(caminho);
  if (!achada) {
    substituir(CAMINHO_PADRAO);   // tela que nao existe cai em Hoje
    return;
  }
  limparAtual();
  versao += 1;
  const minhaVersao = versao;
  const limpezas = [];
  const controle = new AbortController();
  const { rota, params } = achada;
  const info = { caminho, padrao: rota.padrao, params, consulta };
  const registro = { info, rota, limpezas, controle, retorno: null };
  atual = registro;
  const ctx = {
    ...info,
    raiz,
    sinal: controle.signal,
    titulo: (texto) => casca.definirTitulo(texto),
    aoLimpar: (fn) => { limpezas.push(fn); },
    ir,
    substituir,
    voltar,
    href,
  };
  estender(ctx);
  casca.marcarAba(rota.opcoes.aba || null);
  casca.mostrarVoltar(Boolean(rota.opcoes.pai));
  casca.definirTitulo(rota.opcoes.titulo || '');
  raiz.replaceChildren();
  window.scrollTo(0, 0);
  let retorno = null;
  try {
    retorno = await rota.montar(ctx);
  } catch (erro) {
    console.error(erro);
    if (minhaVersao === versao) {
      raiz.replaceChildren(erroDeTela('Não foi possível abrir esta tela.', { aoTentar: () => rotear() }));
    }
  }
  if (minhaVersao !== versao) {
    executar([], retorno);   // a pessoa ja foi para outra tela enquanto esta montava
    return;
  }
  registro.retorno = retorno;
  casca.aoTrocar(info);
  raiz.focus({ preventScroll: true });
}

/** Refaz a tela atual do zero (a mesma rota). */
export function remontar() {
  return rotear();
}

/**
 * Liga o roteador. `raiz` = elemento onde as telas desenham. `casca` = { definirTitulo, marcarAba, mostrarVoltar, aoTrocar }.
 * `estenderContexto(ctx)` pode acrescentar funcoes ao ctx de toda tela (app.js poe ctx.aoMudarDados).
 */
export function iniciar({ raiz: elemento, casca: gancho, estenderContexto }) {
  raiz = elemento;
  casca = { ...casca, ...gancho };
  if (estenderContexto) estender = estenderContexto;
  posicao = posicaoDoHistorico();
  if (!(window.history.state && Number.isInteger(window.history.state.n))) window.history.replaceState({ n: 0 }, '');
  window.addEventListener('popstate', aoVoltarPeloHistorico);
  // Link interno (<a href="#/...">): passa pelo roteador para entrar no historico com a posicao certa.
  document.addEventListener('click', (ev) => {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const a = ev.target instanceof Element ? ev.target.closest('a[href^="#/"]') : null;
    if (!a || (a.target && a.target !== '_self')) return;
    ev.preventDefault();
    const { caminho, consulta } = lerHash(a.getAttribute('href'));
    ir(caminho, {}, consulta);
  });
  return rotear();
}
