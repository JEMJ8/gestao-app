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
import { aplicarTema } from './tema.js';
import { hojeEmCuiaba } from './datas.js';

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
  navigator.serviceWorker.register('sw.js').catch(() => { /* sem service worker o aplicativo funciona igual, so nao abre sem internet */ });
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
  conteudo.classList.add('sem-barra');
  montarEntrada(conteudo, { aoConcluir: abrirAplicativo });
}

async function iniciar() {
  aplicarTema();
  registrarServiceWorker();
  if (auth.temSessaoCompleta()) await abrirAplicativo();
  else mostrarEntrada();
}

iniciar();
