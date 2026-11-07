// Folha inferior (bottom sheet): painel que sobe da borda de baixo, em cima da tela, para escolhas, confirmacoes e formularios curtos.
// Usa o <dialog> nativo (foco preso dentro, Esc fecha, fundo escurecido). O botao Voltar do celular FECHA A FOLHA e nao sai da tela:
// a folha se registra no historico por rotas.empilharCamada.
//
//   const folha = abrirFolha({ titulo: 'Mudar a situação', conteudo: h('p', null, 'texto'), rodape: [botao1, botao2] });
//   await folha.fechar();                 // fecha (e espera o historico acertar). Para navegar de dentro da folha: await folha.fechar(); ctx.ir(...)
//   abrirFolha({ ..., aoFechar: () => ... })   // roda uma vez, por qualquer caminho de fechamento
//
// `conteudo` e `rodape` sao elementos ou listas de elementos (montados com h()). Nunca passe HTML em texto.

import { h, novoId, focar } from '../ui.js';
import { icone } from '../icones.js';
import { empilharCamada } from '../rotas.js';

export function abrirFolha({ titulo, conteudo = null, rodape = null, aoFechar = null, focoInicial = null } = {}) {
  const idTitulo = novoId('folha-titulo');
  const anterior = document.activeElement;
  let aberta = true;
  const botaoFechar = h('button', { class: 'topo-botao', type: 'button', 'aria-label': 'Fechar', onclick: () => folha.fechar() }, icone('fechar', { tamanho: 22 }));
  const corpo = h('div', { class: 'folha-corpo' }, conteudo);
  const dialogo = h(
    'dialog',
    { class: 'folha', 'aria-labelledby': idTitulo },
    h('header', { class: 'folha-cabeca' }, h('h2', { class: 'folha-titulo', id: idTitulo }, titulo), botaoFechar),
    corpo,
    rodape ? h('footer', { class: 'folha-rodape' }, rodape) : null,
  );

  function encerrar() {
    if (!aberta) return;
    aberta = false;
    try { dialogo.close(); } catch { /* ja fechado */ }
    dialogo.remove();
    if (anterior && anterior.isConnected) focar(anterior);
    if (aoFechar) aoFechar();
  }

  const liberar = empilharCamada(encerrar);
  const folha = {
    elemento: dialogo,
    corpo,
    /** Fecha e devolve uma promessa que termina quando o historico ja foi acertado. */
    fechar() {
      if (!aberta) return Promise.resolve();
      encerrar();
      return liberar();
    },
  };

  dialogo.addEventListener('cancel', (ev) => { ev.preventDefault(); folha.fechar(); });
  dialogo.addEventListener('click', (ev) => { if (ev.target === dialogo) folha.fechar(); });
  document.body.appendChild(dialogo);
  dialogo.showModal();
  if (focoInicial) focar(focoInicial);
  return folha;
}
