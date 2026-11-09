// Trava do aplicativo: a tela "Confirme que é você" que pede o MESMO desbloqueio que a pessoa usa para abrir o celular.
//
// O que e, em poucas palavras:
//  - Uma janela do tipo <dialog> aberta por showModal() POR CIMA do aplicativo vivo. O aplicativo por baixo nao e desmontado, nao recarrega e
//    nao perde o que estava na tela (texto digitado numa folha, por exemplo). Quando o desbloqueio funciona, a janela fecha e tudo esta como estava.
//  - Dois modos: 'frio' (o aplicativo acabou de abrir e ainda nem montou a casca: aoLiberar monta tudo) e 'retorno' (a pessoa saiu do aplicativo e
//    voltou depois do prazo escolhido, ou tocou em Trancar agora: aoLiberar so registra que a verificacao aconteceu).
//  - Protecao BASICA: so fecha a porta da interface. Nao cifra nada. Quem le o armazenamento do navegador continua lendo.
//  - Falha fechada: campo da trava ilegivel tranca; volta do segundo plano sem aviso tranca; relogio andando para tras tranca.
//    Se a propria trava nao conseguir abrir (plano B), o aplicativo fica coberto e recarrega (retorno) ou mostra o aviso Recarregar (frio).
//  - Nunca apaga sessao, cache nem o campo da trava por numero de falhas.
//
// Limite declarado em tela: NAO ha trava por inatividade com o aplicativo aberto na mao. O vigia (vigiar) so tranca quando a pessoa sai do
// aplicativo e volta depois do prazo, ou quando o relogio revela que a pagina ficou parada.
//
// Este arquivo nao fala com o navegador sobre credenciais (isso e js/biometria.js) e nao guarda nada em lugar nenhum: tudo aqui e memoria que
// some a cada recarga. Quem guarda o campo e js/auth.js.

import * as auth from '../auth.js';
import * as bio from '../biometria.js';
import * as rotas from '../rotas.js';
import { h, preencher, novoId, focar, esperar } from '../ui.js';
import { icone } from '../icones.js';
import { marca } from '../marca.js';
import { barraDaEntrada } from '../tema.js';
import { VERSAO_APP } from '../versao.js';

// ---------------------------------------------------------------- textos da tela (catalogo do contrato, secao 12.1)

const TV = {
  TITULO: 'Confirme que é você',
  TEXTO: 'Use o desbloqueio do celular para abrir o Gestão JEMJ.',
  PEQUENO: 'Normalmente é o mesmo desbloqueio que você usa para abrir o celular.',
  SEM_DESBLOQUEIO: 'Não foi possível usar o desbloqueio neste celular.',
  PRINCIPAL: 'Abrir com o desbloqueio do celular',
  AGUARDANDO_BOTAO: 'Aguardando o celular…',
  TENTAR: 'Tentar de novo',
  OUTRO_CAMINHO: 'Entrar com senha e código',
  SEM_INTERNET: 'Sem internet, se o desbloqueio falhar, você só volta a entrar quando o sinal voltar.',
  INTERNET_FRIO: 'Precisa de internet.',
  INTERNET_RETORNO: 'Precisa de internet. O aplicativo reinicia e o que não foi salvo se perde.',
  AGUARDANDO: 'Siga as instruções que aparecem na tela do celular.',
  FALHA1: 'Não foi liberado. Toque em Tentar de novo quando quiser.',
  FALHA2: 'Ainda não foi liberado. Use o mesmo desbloqueio que abre o seu celular. Se não der, toque em Entrar com senha e código.',
  DEMOROU: 'A confirmação demorou e foi encerrada. Toque em Tentar de novo.',
  SEM_BLOQUEIO: 'O celular não confirmou ter um bloqueio de tela que sirva para isso. Confira nas configurações do celular ou entre com senha e código.',
  SEM_SUPORTE: 'Este navegador não consegue usar a trava do aplicativo. Abra o aplicativo pelo mesmo navegador onde você a ligou, ou entre com senha e código.',
  INCOMPLETO: 'A trava guardada neste celular está incompleta. Entre com senha e código.',
  PLANO_B_FRIO: 'A trava do aplicativo não abriu. Toque em Recarregar para tentar de novo.',
  RECARREGAR: 'Recarregar',
  TITULO_DA_ABA: 'Trava · Gestão JEMJ',
};

// O que cada estado mostra. `regiao`: o texto da area de estado; `alerta`: usa a area de alerta (laranja, com icone) em vez da area comum;
// `botao`: o rotulo do botao principal (null = o botao nao existe nesse estado); `ocupado`: botao com "girando" e aria-busy.
const ESTADOS = {
  pronto: { regiao: '', alerta: false, botao: TV.PRINCIPAL, ocupado: false },
  aguardando: { regiao: TV.AGUARDANDO, alerta: false, botao: TV.AGUARDANDO_BOTAO, ocupado: true },
  falha1: { regiao: TV.FALHA1, alerta: false, botao: TV.TENTAR, ocupado: false },
  falha2: { regiao: TV.FALHA2, alerta: true, botao: TV.TENTAR, ocupado: false },
  demorou: { regiao: TV.DEMOROU, alerta: false, botao: TV.TENTAR, ocupado: false },
  sem_bloqueio: { regiao: TV.SEM_BLOQUEIO, alerta: true, botao: TV.TENTAR, ocupado: false },
  // sem botao de desbloqueio: o texto de cima nao pode mandar usar o que a tela nao oferece, e a linha "e o mesmo desbloqueio" some
  sem_suporte: { regiao: TV.SEM_SUPORTE, alerta: true, botao: null, ocupado: false, texto: TV.SEM_DESBLOQUEIO, pequeno: false },
  incompleto: { regiao: TV.INCOMPLETO, alerta: true, botao: null, ocupado: false, texto: TV.SEM_DESBLOQUEIO, pequeno: false },
};

// ---------------------------------------------------------------- tempos (milissegundos)

const BATIMENTO_MS = 5000;          // de quanto em quanto tempo o vigia confere que a pagina esta viva
const LACUNA_MINIMA_MS = 15000;     // lacuna entre batidas que, no minimo, conta como "a pagina ficou parada"
const PAINEL_MS = 120000;           // quanto tempo longe da tela o painel do sistema (janela do desbloqueio) pode explicar
const GRACA_MS = 3000;              // depois de uma verificacao, um aviso de "escondida" atrasado do painel e ignorado
const ESPERA_AUTOMATICA_MS = 500;   // quanto depois da tela aparecer o desbloqueio e tentado sozinho (so onde o navegador deixa)
const TRAVA_DO_BOTAO_MS = 1000;     // "Tentar de novo" fica travado um instante depois de uma falha
const ESPERA_RENOVACAO_MS = 5000;   // quanto esperar uma renovacao de sessao em curso antes de recarregar
const JANELA_DO_VOLTAR_MS = 1000;   // o Voltar do aparelho desfeito por history.forward() tem este tempo para voltar como popstate
const MARGEM_DA_MENSAGEM_PX = 8;    // folga entre o fim da mensagem e o topo das acoes presas na base
const ESPERA_PARA_REPETIR_MS = 15000;   // esperando o celular por tanto tempo, o botao vira "Tentar de novo" (o sistema pode ter fechado a janela sem avisar)

// ---------------------------------------------------------------- memoria do modulo (nada disto e gravado)

let trancada = false;
let dialog = null;
let botaoPrincipal = null;
let botaoSenha = null;
let tituloDoPasso = null;
let textoDoPasso = null;
let pequenoDoPasso = null;
let timerRepetir = null;
let areaDasAcoes = null;
let regiaoEstado = null;
let regiaoAlerta = null;
let instancia = null;           // { estado, falhas, automaticoPendente, pendenteEhAutomatico, travado, saindo }
let sequencia = 0;              // identifica o pedido de desbloqueio em curso: resposta de pedido antigo e ignorada
let modo = null;                // 'frio' | 'retorno'
let aoLiberar = null;
let aoOutroCaminho = null;
let anterior = null;            // quem tinha o foco antes da trava subir
let tituloAnterior = null;
let ignorarFechamentos = 0;     // fechamentos que a propria trava provocou (nao reabrir de novo)
let esperandoVolta = false;
let timerVolta = null;
let timerAutomatico = null;
let observador = null;
const dialogosDeBaixo = new Set();   // dialogs (folhas) que estavam abertos por baixo da trava; o navegador pode fecha-los num Esc dado contra ela
let removerOuvinteAuth = null;
let planoBAtivo = false;
let erroInterno = null;         // ultimo defeito da propria trava, so em memoria
let vigiando = false;
let ultimoSinal = 0; let ocultoEm = null; let gracaAte = 0;
// Os tres valores acima so ganham valor DENTRO de vigiar() e de carimbarVerificacao(). Nunca no carregamento do modulo: na abertura a frio a trava
// pode ficar minutos na tela, e um relogio nascido no carregamento faria a primeira batida depois de abrir o aplicativo ver uma lacuna longa
// e trancar de novo, em laco.

// ---------------------------------------------------------------- pecas de tela

function rodape() {
  return h('p', { class: 'entrada-rodape texto-pequeno' }, icone('cadeado', { tamanho: 16 }), `Acesso restrito · Versão ${VERSAO_APP}`);
}

/** Monta o dialog inteiro (contrato 7.1) e desenha o estado de partida. Usa `modo` e `instancia`, que ja existem. */
function construir() {
  const idTitulo = novoId('trava-titulo');
  tituloDoPasso = h('h2', { class: 'entrada-passo-titulo', id: idTitulo, tabindex: '-1' }, TV.TITULO);
  regiaoEstado = h('p', { class: 'trava-estado', role: 'status', 'aria-live': 'polite', 'data-trava': 'estado' });
  regiaoAlerta = h('p', { class: 'trava-estado trava-estado--atencao', role: 'alert', 'data-trava': 'alerta', hidden: true });
  botaoPrincipal = h('button', {
    type: 'button',
    class: 'botao botao--primario botao--grande botao--cheio botao--destaque',
    'data-trava': 'principal',
    onclick: aoToqueDesbloquear,
  }, TV.PRINCIPAL);
  botaoSenha = h('button', {
    type: 'button',
    class: 'botao botao--discreto botao--cheio',
    'data-trava': 'senha',
    onclick: aoToqueSenha,
  }, TV.OUTRO_CAMINHO);
  areaDasAcoes = h('div', { class: 'trava-acoes' },
    botaoPrincipal,
    botaoSenha,
    h('p', { class: 'trava-internet', 'data-trava': 'internet' }, modo === 'frio' ? TV.INTERNET_FRIO : TV.INTERNET_RETORNO));
  const cabeca = h('header', { class: 'entrada-hero' },
    h('div', { class: 'entrada-fundo-marca', 'aria-hidden': 'true' }, marca({ tamanho: 300 })),
    h('div', { class: 'entrada-marca', 'aria-hidden': 'true' }, marca({ tamanho: 52 })),
    h('p', { class: 'entrada-titulo' }, 'Gestão JEMJ'));
  textoDoPasso = h('p', { class: 'entrada-passo-texto', 'data-trava': 'texto' }, TV.TEXTO);
  pequenoDoPasso = h('p', { class: 'trava-pequeno', 'data-trava': 'pequeno' }, TV.PEQUENO);
  const passo = h('div', { class: 'entrada-passo trava-passo' },
    h('div', null,
      tituloDoPasso,
      textoDoPasso),
    pequenoDoPasso,
    regiaoEstado,
    regiaoAlerta,
    h('p', { class: 'trava-pequeno', 'data-trava': 'sem-internet' }, TV.SEM_INTERNET),
    areaDasAcoes,
    rodape());
  const janela = h('dialog', { class: 'trava', 'aria-labelledby': idTitulo, 'data-modo': modo, 'data-estado': 'pronto' },
    h('div', { class: 'entrada-tela entrada-tela--compacta' },
      h('div', { class: 'entrada-cartao' }, cabeca, h('div', { class: 'entrada-folha' }, passo))));
  dialog = janela;
  let partida = 'pronto';
  if (!auth.biometriaDados().valido) partida = 'incompleto';
  else if (!bio.suportado()) partida = 'sem_suporte';
  desenhar(partida);
  return janela;
}

/** Quem deve ficar com o foco: o botao principal, ou o titulo quando o botao nao existe no estado. */
function alvoDoFoco() {
  return botaoPrincipal && botaoPrincipal.isConnected ? botaoPrincipal : tituloDoPasso;
}

function aplicarTravaDoBotao() {
  if (!botaoPrincipal || !instancia) return;
  botaoPrincipal.disabled = Boolean(instancia.travado) && instancia.estado !== 'aguardando';
}

/** Escreve o estado na tela: texto da area de estado ou de alerta, rotulo do botao principal e o atributo data-estado. */
function desenhar(estado) {
  const cfg = ESTADOS[estado];
  if (!dialog || !instancia || !cfg) return;
  const mudou = instancia.estado !== estado || dialog.dataset.estado !== estado;
  instancia.estado = estado;
  dialog.dataset.estado = estado;
  if (mudou) {
    textoDoPasso.textContent = cfg.texto || TV.TEXTO;
    pequenoDoPasso.hidden = cfg.pequeno === false;
    if (cfg.alerta) {
      regiaoEstado.textContent = '';
      regiaoEstado.hidden = true;
      preencher(regiaoAlerta, icone('alerta', { tamanho: 20 }), h('span', null, cfg.regiao));
      regiaoAlerta.hidden = false;
    } else {
      regiaoAlerta.hidden = true;
      regiaoAlerta.textContent = '';
      regiaoEstado.hidden = false;
      regiaoEstado.textContent = cfg.regiao;
    }
    if (cfg.botao === null) {
      const tinhaFoco = document.activeElement === botaoPrincipal;
      botaoPrincipal.remove();
      if (tinhaFoco) focar(tituloDoPasso);
    } else {
      if (!botaoPrincipal.isConnected) areaDasAcoes.prepend(botaoPrincipal);
      if (cfg.ocupado) {
        preencher(botaoPrincipal, icone('atualizar', { tamanho: 20, classe: 'botao-giro' }), cfg.botao);
        botaoPrincipal.setAttribute('aria-busy', 'true');
      } else {
        preencher(botaoPrincipal, cfg.botao);
        botaoPrincipal.removeAttribute('aria-busy');
      }
    }
  }
  aplicarTravaDoBotao();
  if (mudou) mostrarMensagem();
}

/**
 * Rola a janela o bastante para a mensagem do estado (a de alerta, ou a comum quando tem texto) ficar INTEIRA acima das acoes presas na base. Numa
 * tela baixa ou com letra grande elas cobririam o fim da mensagem: a pessoa tocaria no botao sem ler por que o desbloqueio nao abriu. Se a mensagem
 * for mais alta que o espaco, aparece o comeco dela. Roda quando o estado muda e quando a janela muda de tamanho (girar o celular).
 */
function mostrarMensagem() {
  const alvo = regiaoAlerta && !regiaoAlerta.hidden ? regiaoAlerta : (regiaoEstado && regiaoEstado.textContent ? regiaoEstado : null);
  if (!dialog || !alvo || !alvo.isConnected || !areaDasAcoes) return;
  try {
    const caixa = alvo.getBoundingClientRect();
    const limite = Math.min(areaDasAcoes.getBoundingClientRect().top, window.innerHeight);
    let rolar = caixa.bottom - limite + MARGEM_DA_MENSAGEM_PX;      // positivo: o fim da mensagem esta sob as acoes
    if (caixa.top - rolar < MARGEM_DA_MENSAGEM_PX) rolar = caixa.top - MARGEM_DA_MENSAGEM_PX;     // nao empurra o comeco da mensagem para fora
    if (rolar > 0) dialog.scrollTop += rolar;
  } catch {
    // sem medida o navegador deixa a janela como esta: a mensagem continua na tela, so pode ficar parte dela sob as acoes
  }
}

// ---------------------------------------------------------------- abrir e fechar a trava

/**
 * Sobe a trava. `modo`: 'frio' ou 'retorno'. `aoLiberar()`: o que fazer quando o desbloqueio funciona. `aoSenha()`: o que fazer quando a pessoa
 * escolhe entrar com senha e codigo (so o modo frio usa; no retorno a pagina recarrega). Nunca lanca. true = a trava esta na tela; false = a trava
 * nao conseguiu abrir e o plano B foi acionado (o aplicativo fica coberto).
 */
export function pedir(opcoes) {
  if (trancada) return true;
  const o = opcoes || {};
  const m = o.modo === 'retorno' ? 'retorno' : 'frio';
  if (planoBAtivo) return false;
  try {
    montarETrancar({ modo: m, aoLiberar: o.aoLiberar, aoSenha: o.aoSenha === undefined ? null : o.aoSenha });
    return true;
  } catch (e) {
    erroInterno = e;
    desfazerMontagem();
    planoB(m);
    return false;
  }
}

function montarETrancar({ modo: m, aoLiberar: libera, aoSenha: senha }) {
  modo = m;
  aoLiberar = libera;
  aoOutroCaminho = senha;
  anterior = document.activeElement && document.activeElement !== document.body && document.activeElement.isConnected ? document.activeElement : null;
  tituloAnterior = document.title;
  ignorarFechamentos = 0;
  esperandoVolta = false;
  instancia = { estado: 'pronto', falhas: 0, automaticoPendente: false, pendenteEhAutomatico: false, podeRepetir: false, travado: false, saindo: false };
  dialogosDeBaixo.clear();
  for (const aberto of document.querySelectorAll('dialog[open]')) dialogosDeBaixo.add(aberto);
  dialog = construir();                      // o dialog nasce com o estado de partida ja desenhado
  document.body.appendChild(dialog);
  dialog.showModal();
  trancada = true;
  document.title = TV.TITULO_DA_ABA;
  if (modo === 'frio') {
    barraDaEntrada(true);
  } else {
    document.getElementById('app').inert = true;
    rotas.suspender(true);
  }
  dialog.addEventListener('cancel', (ev) => ev.preventDefault());
  dialog.addEventListener('close', aoFecharDialog);
  observador = new MutationObserver(aoMudarBody);
  observador.observe(document.body, { childList: true });
  window.addEventListener('popstate', aoPopstate);
  window.addEventListener('resize', mostrarMensagem);
  document.addEventListener('visibilitychange', aoMudarVisibilidadeDaTrava);
  removerOuvinteAuth = auth.aoMudar(aoMudarAuth);
  focar(alvoDoFoco());
  mostrarMensagem();
  instancia.automaticoPendente = instancia.estado === 'pronto' && !bio.exigeToque();
  agendarAutomatico();
}

/** A trava fica atenta ao que acontece em outra janela do aplicativo (ver contrato 7.3). */
function aoMudarAuth({ tipo }) {
  if (!trancada) return;
  if (tipo === 'biometria' && auth.biometriaDesligadaDeProposito()) {
    // A pessoa desligou a trava em outra janela. Campo AUSENTE nunca solta a trava: so o null explicito.
    const eraRetorno = modo === 'retorno';
    const fn = aoLiberar;
    fechar();
    if (eraRetorno) carimbarVerificacao();
    else liberar(fn);          // a frio: sem isto o aplicativo ficaria como casca vazia (so abrirAplicativo monta a casca)
  } else if (tipo === 'perdida' && modo === 'frio') {
    window.location.replace(window.location.pathname);   // a sessao acabou ou foi apagada em outra janela: volta ao login
  }
}

/** Chama o que deve acontecer depois do desbloqueio. Defeito ou rejeicao de quem foi chamado nunca fica solto. */
function liberar(fn) {
  if (typeof fn !== 'function') return;
  try {
    const r = fn();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch {
    // nunca fica rejeicao solta
  }
}

/** A janela fechou sem ser por nos (Esc depois do primeiro, Voltar do Android): reabre. E o caminho COMUM, nao a excecao. */
function aoFecharDialog(ev) {
  if (!dialog || (ev && ev.target !== dialog)) return;     // aviso de um dialog antigo que ja foi retirado
  if (ignorarFechamentos > 0) {
    ignorarFechamentos -= 1;
    if (!trancada || dialog.open) return;                   // a janela ja foi reaberta por quem provocou este fechamento
  }
  if (!trancada) return;
  try {
    dialog.showModal();
  } catch {
    // ja esta aberto
  }
  focar(alvoDoFoco());
}

/** Outro dialog entrou na pagina (folha, confirmacao): a trava volta para cima de todos. */
function aoMudarBody(registros) {
  if (!trancada || !dialog) return;
  let estranho = false;
  for (const registro of registros) {
    for (const no of registro.addedNodes) {
      if (no.nodeName === 'DIALOG' && no !== dialog) {
        estranho = true;
        dialogosDeBaixo.add(no);
      }
    }
  }
  if (!estranho) return;
  ignorarFechamentos += 1;
  try {
    dialog.close();
    dialog.showModal();
  } catch {
    ignorarFechamentos = 0;
    planoB();
    return;
  }
  focar(alvoDoFoco());
}

/** Voltar do aparelho com a trava na tela: o historico nao anda. O Voltar da pessoa e desfeito por history.forward(). */
function aoPopstate() {
  if (!trancada) return;
  if (rotas.ultimoPopDoRoteador()) return;      // foi o proprio roteador fechando uma folha por tras da trava
  if (esperandoVolta) {                         // este e o popstate do nosso forward()
    esperandoVolta = false;
    window.clearTimeout(timerVolta);
    timerVolta = null;
    return;
  }
  esperandoVolta = true;
  timerVolta = window.setTimeout(() => { esperandoVolta = false; timerVolta = null; }, JANELA_DO_VOLTAR_MS);
  window.history.forward();
}

/** Fecha a trava. Pode ser chamada quantas vezes quiser, a qualquer hora. */
export function fechar() {
  if (!dialog) {
    trancada = false;
    return;
  }
  const janela = dialog;
  const modoAnterior = modo;
  const pendente = instancia && instancia.estado === 'aguardando';
  trancada = false;
  if (timerAutomatico !== null) {
    window.clearTimeout(timerAutomatico);
    timerAutomatico = null;
  }
  window.clearTimeout(timerRepetir);
  timerRepetir = null;
  if (pendente) {
    try { bio.abortar(); } catch { /* nada a cancelar */ }
  }
  if (observador) {
    observador.disconnect();
    observador = null;
  }
  if (removerOuvinteAuth) {
    try { removerOuvinteAuth(); } catch { /* ja retirado */ }
    removerOuvinteAuth = null;
  }
  window.removeEventListener('popstate', aoPopstate);
  window.removeEventListener('resize', mostrarMensagem);
  document.removeEventListener('visibilitychange', aoMudarVisibilidadeDaTrava);
  window.clearTimeout(timerVolta);
  timerVolta = null;
  dialog = null;
  try { janela.close(); } catch { /* ja fechado */ }
  janela.remove();
  botaoPrincipal = null;
  botaoSenha = null;
  tituloDoPasso = null;
  textoDoPasso = null;
  pequenoDoPasso = null;
  areaDasAcoes = null;
  regiaoEstado = null;
  regiaoAlerta = null;
  instancia = null;
  if (modoAnterior === 'retorno') {
    const app = document.getElementById('app');
    if (app) app.inert = false;
    rotas.suspender(false);
    rotas.ressincronizar();
    // Elemento coberto (visibility hidden) nao recebe foco: com a pagina a vista, a cobertura sai ANTES de devolver o foco. Escondida, fica.
    if (visivel()) tirarCobertura();
  }
  restaurarDialogosDeBaixo();
  if (tituloAnterior !== null) document.title = tituloAnterior;
  const volta = anterior && anterior.isConnected && !anterior.closest('[inert]') ? anterior : document.getElementById('conteudo');
  focar(volta);
  anterior = null;
  ignorarFechamentos = 0;
  esperandoVolta = false;
}

/**
 * O Esc (ou o Voltar do Android) dado contra a trava pode fechar, junto com ela, uma folha que estava por baixo: o navegador agrupa os dois pedidos
 * de fechar. A folha continua na pagina com o texto digitado, so que fechada e invisivel. Ao liberar, o que o navegador fechou volta a ficar aberto.
 * Folha que o proprio aplicativo fechou e retirou da pagina nao volta.
 */
function restaurarDialogosDeBaixo() {
  for (const d of dialogosDeBaixo) {
    if (d.isConnected && !d.open) {
      try { d.showModal(); } catch { /* nao da para reabrir: fica como esta */ }
    }
  }
  dialogosDeBaixo.clear();
}

/** Desfaz uma montagem que falhou no meio, para o plano B encontrar a pagina limpa. */
function desfazerMontagem() {
  trancada = false;
  window.clearTimeout(timerRepetir);
  timerRepetir = null;
  if (timerAutomatico !== null) {
    window.clearTimeout(timerAutomatico);
    timerAutomatico = null;
  }
  if (observador) {
    observador.disconnect();
    observador = null;
  }
  if (removerOuvinteAuth) {
    try { removerOuvinteAuth(); } catch { /* ja retirado */ }
    removerOuvinteAuth = null;
  }
  window.removeEventListener('popstate', aoPopstate);
  window.removeEventListener('resize', mostrarMensagem);
  document.removeEventListener('visibilitychange', aoMudarVisibilidadeDaTrava);
  window.clearTimeout(timerVolta);
  timerVolta = null;
  const janela = dialog;
  dialog = null;
  if (janela) {
    try { janela.close(); } catch { /* nunca abriu */ }
    janela.remove();
  }
  if (modo === 'retorno') {
    try { rotas.suspender(false); } catch { /* nada a desfazer */ }
  }
  dialogosDeBaixo.clear();
  if (tituloAnterior !== null) document.title = tituloAnterior;
  botaoPrincipal = null;
  botaoSenha = null;
  tituloDoPasso = null;
  textoDoPasso = null;
  pequenoDoPasso = null;
  areaDasAcoes = null;
  regiaoEstado = null;
  regiaoAlerta = null;
  instancia = null;
  ignorarFechamentos = 0;
  esperandoVolta = false;
}

/** A trava esta na tela agora? */
export function emTela() {
  return dialog !== null;
}

// ---------------------------------------------------------------- o desbloqueio (toques e respostas)

/**
 * Toque no botao principal. A verificacao sai na MESMA pilha do toque (o WebKit so abre a janela do desbloqueio assim): esta funcao nao espera nada
 * antes de pedir. Toque durante a tentativa sozinha cancela a sozinha e recomeca como tentativa da pessoa.
 */
function aoToqueDesbloquear() {
  if (!trancada || !instancia || instancia.saindo) return;
  if (instancia.estado === 'aguardando' && !instancia.pendenteEhAutomatico && !instancia.podeRepetir) return;
  const dados = auth.biometriaDados();
  let pedido;
  try {
    pedido = bio.verificar({ id: dados.id, transports: dados.transports });
  } catch (e) {
    pedido = Promise.reject(e);
  }
  const meu = abrirPedido(false);
  pedido.then(() => aoSucesso(meu), (e) => aoErro(e, false, meu));
}

/** A tentativa sozinha, uma vez por trava na tela, so onde o navegador deixa (nao no iPhone nem no Safari). Falha nao conta e nao aparece. */
function tentarAutomatico() {
  timerAutomatico = null;
  if (!trancada || !instancia || !instancia.automaticoPendente) return;
  if (instancia.estado !== 'pronto') {                  // a pessoa ja mexeu: nao atrapalha
    instancia.automaticoPendente = false;
    return;
  }
  if (document.visibilityState !== 'visible') return;   // fica pendente: tenta quando a pagina voltar a ficar visivel
  instancia.automaticoPendente = false;
  const dados = auth.biometriaDados();
  let pedido;
  try {
    pedido = bio.verificar({ id: dados.id, transports: dados.transports });
  } catch (e) {
    pedido = Promise.reject(e);
  }
  const meu = abrirPedido(true);
  pedido.then(() => aoSucesso(meu), (e) => aoErro(e, true, meu));
}

function agendarAutomatico() {
  if (!trancada || !instancia || !instancia.automaticoPendente || timerAutomatico !== null) return;
  timerAutomatico = window.setTimeout(tentarAutomatico, ESPERA_AUTOMATICA_MS);
}

function aoMudarVisibilidadeDaTrava() {
  if (document.visibilityState === 'visible') agendarAutomatico();
}

function abrirPedido(automatico) {
  sequencia += 1;
  const meu = sequencia;
  instancia.pendenteEhAutomatico = automatico;
  if (instancia.podeRepetir) {          // era um "Tentar de novo" dentro da espera: o botao volta a girar
    instancia.podeRepetir = false;
    instancia.estado = 'pronto';        // forca o desenho de "aguardando" de novo
  }
  window.clearTimeout(timerRepetir);
  timerRepetir = null;
  desenhar('aguardando');
  if (!automatico) timerRepetir = window.setTimeout(() => oferecerRepetir(meu), ESPERA_PARA_REPETIR_MS);
  return meu;
}

/**
 * Esperando o celular ha muito tempo (o sistema pode ter fechado a janela sem avisar o navegador): o botao passa a dizer "Tentar de novo" e um
 * novo toque cancela a espera e recomeca. Sem isto a pessoa ficaria ate 2 minutos olhando "Aguardando o celular…" sem poder fazer nada.
 */
function oferecerRepetir(meu) {
  timerRepetir = null;
  if (!trancada || !instancia || meu !== sequencia || instancia.estado !== 'aguardando' || instancia.pendenteEhAutomatico) return;
  instancia.podeRepetir = true;
  if (botaoPrincipal && botaoPrincipal.isConnected) {
    preencher(botaoPrincipal, TV.TENTAR);
    botaoPrincipal.removeAttribute('aria-busy');
  }
}

function aoSucesso(meu) {
  if (!trancada || meu !== sequencia) return;
  const fn = aoLiberar;
  fechar();
  liberar(fn);
}

function aoErro(e, automatico, meu) {
  if (!trancada || !instancia || meu !== sequencia || instancia.saindo) return;
  const minha = instancia;
  minha.pendenteEhAutomatico = false;
  minha.podeRepetir = false;
  window.clearTimeout(timerRepetir);
  timerRepetir = null;
  const codigo = e && typeof e.codigo === 'string' ? e.codigo : 'falhou';
  if (codigo === 'abortado') { desenhar('pronto'); return; }
  if (codigo === 'inseguro' || codigo === 'nao_suportado') { desenhar('sem_suporte'); return; }
  if (codigo === 'dados_incompletos') { desenhar('incompleto'); return; }
  if (automatico) { desenhar('pronto'); return; }     // a tentativa sozinha falha em silencio e nao conta
  if (codigo === 'demorou') { desenhar('demorou'); return; }
  minha.falhas += 1;
  minha.travado = true;
  desenhar(minha.falhas >= 2 ? 'falha2' : 'falha1');
  esperar(TRAVA_DO_BOTAO_MS).then(() => {
    if (instancia !== minha || !trancada) return;
    minha.travado = false;
    aplicarTravaDoBotao();
    if (botaoPrincipal && botaoPrincipal.isConnected && (!document.activeElement || document.activeElement === document.body)) focar(botaoPrincipal);
  });
  bio.disponivel().then((r) => {
    if (r !== 'nao' || !trancada || instancia !== minha) return;
    if (minha.estado === 'falha1' || minha.estado === 'falha2') desenhar('sem_bloqueio');     // a trava NAO e desligada: o botao continua
  }, () => {});
}

/** Entrar com senha e codigo. A frio, quem chamou decide; no retorno a pagina recarrega (depois de esperar uma renovacao em curso). */
function aoToqueSenha() {
  if (instancia && instancia.saindo) return;
  bio.abortar();
  if (modo === 'frio' && typeof aoOutroCaminho === 'function') {
    aoOutroCaminho();
    return;
  }
  if (instancia) {
    instancia.saindo = true;
    if (botaoPrincipal) botaoPrincipal.disabled = true;
    if (botaoSenha) botaoSenha.setAttribute('aria-busy', 'true');
  }
  esperarERecarregar(true);
}

function esperarERecarregar(marcar) {
  return Promise.race([auth.renovacaoEmAndamento() || Promise.resolve(), esperar(ESPERA_RENOVACAO_MS)]).catch(() => {}).then(() => {
    if (marcar && (!trancada || !instancia || !instancia.saindo)) return;     // a trava fechou por outro caminho enquanto se esperava
    if (marcar) marcarPedidoDeSenha();
    window.location.reload();
  });
}

// ---------------------------------------------------------------- plano B (a propria trava falhou)

/**
 * Cobre o aplicativo. No retorno, recarrega (depois de esperar uma renovacao em curso). A frio NAO recarrega sozinho (evita laco): mostra o
 * aviso com o botao Recarregar e deixa o aplicativo escondido. O defeito fica so em memoria.
 */
function planoB(m = modo) {
  if (planoBAtivo) return;
  planoBAtivo = true;
  try {
    document.documentElement.setAttribute('data-coberta', '1');
    const app = document.getElementById('app');
    if (app) app.inert = true;
    if (m === 'retorno') {
      esperarERecarregar(false);
      return;
    }
    if (app) app.hidden = true;
    const aviso = h('div', { class: 'aviso-visual', role: 'alert' },
      h('p', null, TV.PLANO_B_FRIO),
      h('button', { type: 'button', onclick: () => window.location.reload() }, TV.RECARREGAR));
    // A tela de senha e codigo nao depende do <dialog>: se a trava nao sobe (navegador antigo, defeito), a pessoa ainda entra por ela.
    // Recarregar repetiria a mesma falha, e sem esta saida o aplicativo ficaria fechado ate limpar os dados do site.
    const outroCaminho = aoOutroCaminho;
    if (typeof outroCaminho === 'function') {
      aviso.appendChild(h('button', {
        type: 'button',
        'data-trava': 'senha-plano-b',
        onclick: () => {
          aviso.remove();
          if (app) { app.hidden = false; app.inert = false; }
          document.documentElement.removeAttribute('data-coberta');
          planoBAtivo = false;
          try { outroCaminho(); } catch (e) { erroInterno = e; }
        },
      }, TV.OUTRO_CAMINHO));
    }
    document.body.prepend(aviso);
  } catch (e) {
    erroInterno = e;
  }
}

// ---------------------------------------------------------------- pedido de senha entre recargas

/** Marca, no estado do historico da pagina, que a proxima abertura deve ir direto para a tela de senha e codigo. */
export function marcarPedidoDeSenha() {
  try {
    const atual = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
    window.history.replaceState({ ...atual, entrarComSenha: true }, '');
  } catch {
    // sem historico gravavel: a pessoa vera a trava de novo e toca em Entrar com senha e codigo outra vez
  }
}

/** Le e apaga a marca de marcarPedidoDeSenha(), preservando o resto do estado (n, camada). */
export function consumirPedidoDeSenha() {
  try {
    const atual = window.history.state;
    if (!atual || typeof atual !== 'object' || atual.entrarComSenha !== true) return false;
    const resto = { ...atual };
    delete resto.entrarComSenha;
    window.history.replaceState(resto, '');
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- vigia (quando trancar de novo)

function visivel() {
  return document.visibilityState === 'visible';
}

function tirarCobertura() {
  document.documentElement.removeAttribute('data-coberta');
}

/** Um pedido de desbloqueio terminou (de qualquer jeito): se a pagina esta visivel e nao ha trava na tela, a cobertura sai. */
function aoEncerrarPedido() {
  if (visivel() && !trancada) tirarCobertura();
}

/** Passou tempo demais fora da tela, ou o relogio revela que a pagina ficou parada ou voltou no tempo? */
function deveTrancar(agora, minutos) {
  const limite = minutos * 60000;
  if (ocultoEm !== null) {
    const ausente = agora - ocultoEm;
    if (ausente < 0 || ausente >= limite) return true;      // prazo 0 (Sempre): qualquer ausencia tranca
  }
  const lacuna = agora - ultimoSinal;
  return lacuna < 0 || lacuna >= Math.max(limite, LACUNA_MINIMA_MS);
}

/**
 * Estamos dentro da graca de uma verificacao? So conta se o relogio esta DENTRO da janela de GRACA_MS que comecou na verificacao. Relogio que
 * voltou para antes da verificacao nao e graca: seria um jeito de desligar o vigia ate o relogio alcancar o fim dela. Nesse caso a decisao
 * segue para deveTrancar, que tranca por lacuna negativa.
 */
function emGraca(agora) {
  return agora < gracaAte && gracaAte - agora <= GRACA_MS;
}

function aoEsconder() {
  if (!auth.biometriaLigada()) return;
  const agora = Date.now();
  if (emGraca(agora)) return;              // aviso atrasado do painel do sistema: nao grava, nao cobre
  if (ocultoEm === null) ocultoEm = agora;
  document.documentElement.setAttribute('data-coberta', '1');
  conferirAgora();
}

function conferirAgora() {
  const agora = Date.now();
  const aVista = visivel();
  if (!auth.biometriaLigada()) {
    ocultoEm = null;
    ultimoSinal = agora;
    tirarCobertura();
    return;
  }
  if (trancada) return;
  if (emGraca(agora)) {
    if (aVista) {
      ocultoEm = null;
      ultimoSinal = agora;
      tirarCobertura();
    }
    return;
  }
  if (bio.ocupado()) {
    // o painel do desbloqueio do sistema pode esconder a pagina por um tempo: isso nao e a pessoa ter ido embora
    const ausente = ocultoEm === null ? 0 : agora - ocultoEm;
    const lacuna = agora - ultimoSinal;
    if (ausente >= 0 && ausente < PAINEL_MS && lacuna >= 0 && lacuna < PAINEL_MS) {
      if (aVista) {
        ocultoEm = null;
        ultimoSinal = agora;
        tirarCobertura();
      }
      return;
    }
  }
  if (deveTrancar(agora, auth.biometriaDados().minutos)) {
    trancarAgora();
    return;
  }
  if (aVista) {
    ocultoEm = null;
    ultimoSinal = agora;
    tirarCobertura();
  }
}

function batida() {
  if (!auth.biometriaLigada()) {
    if (visivel()) {
      ultimoSinal = Date.now();
      ocultoEm = null;
      tirarCobertura();
    }
    return;
  }
  if (trancada) return;
  const agora = Date.now();
  const aVista = visivel();
  if (aVista && ocultoEm !== null) {         // visivel nunca usa ocultoEm direto: a conferencia decide
    conferirAgora();
    return;
  }
  if (!aVista && ocultoEm === null && !bio.ocupado()) ocultoEm = ultimoSinal;      // o aviso de "escondida" se perdeu
  if (!bio.ocupado() && !emGraca(agora) && deveTrancar(agora, auth.biometriaDados().minutos)) {
    trancarAgora();
    return;
  }
  if (aVista) {                              // sempre que visivel, ocupado ou nao: ocupado so suspende a DECISAO de trancar
    ultimoSinal = agora;
    tirarCobertura();
  }
}

function aoMudarVisibilidadeDoVigia() {
  if (document.visibilityState === 'hidden') aoEsconder();
  else conferirAgora();
}

/**
 * Liga o vigia (uma vez). Chamado como primeira coisa util quando o aplicativo abre. Observa a pagina sair e voltar, e bate de 5 em 5 segundos
 * para pegar pagina congelada, relogio atrasado ou adiantado e aviso perdido. Nao tranca por inatividade com a pagina visivel.
 */
export function vigiar() {
  if (vigiando) return;
  vigiando = true;
  ultimoSinal = Date.now();
  ocultoEm = null;
  gracaAte = Date.now() + GRACA_MS;
  document.addEventListener('visibilitychange', aoMudarVisibilidadeDoVigia);
  window.addEventListener('pageshow', conferirAgora);
  window.addEventListener('pagehide', aoEsconder);
  window.addEventListener('focus', conferirAgora);
  document.addEventListener('resume', conferirAgora);
  window.setInterval(batida, BATIMENTO_MS);
  bio.aoEncerrar(aoEncerrarPedido);
}

/**
 * Chamada depois de TODA verificacao ou criacao bem-sucedida do celular (desbloqueio da trava, Testar agora, Desligar, Refazer, Ligar, Sair,
 * oferta, troca para prazo maior, Excluir prazo verificado): a pessoa acabou de provar quem e, entao o relogio de ausencia recomeca.
 */
export function carimbarVerificacao() {
  ocultoEm = null;
  ultimoSinal = Date.now();
  gracaAte = Date.now() + GRACA_MS;
  tirarCobertura();
}

/** Tranca agora, como se a pessoa tivesse voltado depois do prazo. So se a trava esta ligada e nao esta na tela. true = a trava subiu. */
export function trancarAgora() {
  try {
    if (!auth.biometriaLigada() || trancada) return false;
    return pedir({ modo: 'retorno', aoLiberar: carimbarVerificacao });
  } catch (e) {
    erroInterno = e;
    planoB('retorno');
    return false;
  }
}
