// Ponto de entrada. Faz tres coisas, nesta ordem:
//   1. aplica o tema e registra o service worker (a casca do aplicativo fica guardada para abrir sem internet);
//   2. sem sessao completa (senha + codigo), mostra a tela de entrada; com sessao, abre o aplicativo;
//   3. abrir o aplicativo = montar a casca, carregar o cache, ligar o roteador e atualizar os dados em segundo plano.
//
// Para criar uma tela nova: crie js/telas/<nome>.js, chame registrar(...) la e adicione UMA linha de import aqui embaixo.
// Guia completo: docs/CELULAR-APP.md.

import * as auth from './auth.js';
import * as dados from './dados.js';
import * as rotas from './rotas.js';
import { montarCasca } from './casca.js';
import { aplicarTema, barraDaEntrada } from './tema.js';
import { hojeEmCuiaba } from './datas.js';
import { h } from './ui.js';

// ---- as telas (cada arquivo se registra no roteador ao ser importado) ----
import './telas/hoje.js';
import './telas/ajustes.js';
import './telas/prazos.js';
import './telas/agenda.js';
import './telas/publicacoes.js';
import './telas/mais.js';
import './telas/processos.js';
import './telas/clientes.js';
import './telas/financeiro.js';
import { montarEntrada } from './telas/entrada.js';

const conteudo = document.getElementById('conteudo');
let aberto = false;

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Versao nova publicada: o service worker novo assume sozinho. Na tela de entrada, e so se ninguem digitou nada, a pagina recarrega para
  // mostrar a versao nova na hora (em vez de so na proxima abertura). Com o aplicativo aberto nunca recarrega: a pessoa pode estar no meio de algo.
  const tinhaControlador = Boolean(navigator.serviceWorker.controller);
  let recarregou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControlador || aberto || recarregou) return;
    if ([...document.querySelectorAll('input')].some((campo) => campo.value)) return;
    recarregou = true;
    window.location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(() => { /* sem service worker o aplicativo funciona igual, so nao abre sem internet */ });
}

/**
 * Sem a folha de cores (css/tokens.css) todo botao e todo campo viram texto solto. Acontece se o arquivo falhar no caminho (sinal fraco, filtro,
 * economia de dados). Tenta carregar de novo e, se nao der, diz o que fazer em vez de deixar a tela sem forma.
 */
function guardaDoVisual() {
  const temCores = () => window.getComputedStyle(document.documentElement).getPropertyValue('--acento').trim() !== '';
  const aviso = () => {
    const app = document.getElementById('app');
    if (app) app.hidden = true;   // a tela sem cores so confunde: sobra o aviso e o botao
    document.body.prepend(h('div', { class: 'aviso-visual', role: 'alert' },
      h('p', null, 'O visual do aplicativo não carregou direito (sinal fraco ou bloqueio do navegador). Toque em Recarregar para tentar de novo.'),
      h('button', { type: 'button', onclick: () => window.location.reload() }, 'Recarregar')));
  };
  const conferir = (tentativa) => {
    if (temCores()) return;
    if (tentativa >= 2) { aviso(); return; }
    const ligacao = h('link', { rel: 'stylesheet', href: `css/tokens.css?tentativa=${tentativa + 1}` });
    ligacao.addEventListener('load', () => conferir(tentativa + 1));
    ligacao.addEventListener('error', () => window.setTimeout(() => conferir(tentativa + 1), 1500));
    document.head.appendChild(ligacao);
  };
  if (document.readyState === 'complete') conferir(0);
  else window.addEventListener('load', () => conferir(0), { once: true });
}

/** Funcoes extras que todo ctx de tela recebe (alem das do roteador). */
function estenderContexto(ctx) {
  /** `fn()` quando os dados mudam (atualizacao, estado da sincronizacao, comandos). Desliga sozinho ao sair da tela. */
  ctx.aoMudarDados = (fn) => { ctx.aoLimpar(dados.aoMudar(fn)); };
  /** `fn()` quando a data de Cuiaba virar (aplicativo aberto de um dia para o outro). Desliga sozinho ao sair da tela. */
  ctx.aoVirarODia = (fn) => {
    let dia = hojeEmCuiaba();
    const relogio = window.setInterval(() => {
      const agora = hojeEmCuiaba();
      if (agora !== dia) { dia = agora; fn(); }
    }, 30000);
    ctx.aoLimpar(() => window.clearInterval(relogio));
  };
}

async function abrirAplicativo() {
  if (aberto) return;
  aberto = true;
  conteudo.replaceChildren();
  conteudo.classList.remove('conteudo--entrada');
  barraDaEntrada(false);
  const casca = montarCasca();
  await dados.iniciar();
  auth.iniciarRenovacao();
  await rotas.iniciar({ raiz: conteudo, casca: casca.ganchos, estenderContexto });
  dados.atualizar();   // em segundo plano: a tela ja abriu com o que havia guardado

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    dados.atualizarSeVelho();
    dados.acompanharComandosAgora();
  });
  window.addEventListener('online', () => { dados.atualizar(); });
  // sessao que acabou de verdade (login recusado na renovacao): volta ao login
  auth.aoMudar(({ tipo, motivo }) => {
    if (tipo === 'perdida' && motivo !== 'saiu' && motivo !== 'cancelou') window.location.replace(window.location.pathname);
  });
}

function mostrarEntrada() {
  aplicarTema();
  barraDaEntrada(true);
  conteudo.classList.add('sem-barra', 'conteudo--entrada');
  montarEntrada(conteudo, { aoConcluir: abrirAplicativo });
}

async function iniciar() {
  window.__gestaoIniciou = true;   // js/inicio.js confere: se isto nao chegar a rodar, ele mostra o aviso com o botao Recarregar
  aplicarTema();
  guardaDoVisual();
  registrarServiceWorker();
  if (auth.temSessaoCompleta()) await abrirAplicativo();
  else mostrarEntrada();
}

iniciar();
