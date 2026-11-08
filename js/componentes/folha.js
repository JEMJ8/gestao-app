// Folha inferior (bottom sheet): painel que sobe da borda de baixo, em cima da tela, para escolhas, confirmacoes e formularios curtos.
// Usa o <dialog> nativo (foco preso dentro, Esc fecha, fundo escurecido). O botao Voltar do celular FECHA A FOLHA e nao sai da tela:
// a folha se registra no historico por rotas.empilharCamada.
//
//   const folha = abrirFolha({ titulo: 'Mudar a situação', conteudo: h('p', null, 'texto'), rodape: [botao1, botao2] });
//   await folha.fechar();                 // fecha (e espera o historico acertar). Para navegar de dentro da folha: await folha.fechar(); ctx.ir(...)
//   abrirFolha({ ..., aoFechar: () => ... })   // roda uma vez, por qualquer caminho de fechamento
//   abrirFolha({ ..., guarda: { sujo: () => boolean, perguntar: async () => boolean, continuar: () => void } })
//        // formulario com algo a perder: tocar fora, Esc, o botao Fechar e o Voltar do aparelho PERGUNTAM antes de fechar (perguntar devolve
//        // true para descartar; `continuar` responde a pergunta aberta com "nao descartar"). `folha.tentarFechar()` faz o mesmo para os botoes da
//        // propria folha (Cancelar). `folha.fechar()` fecha direto.
//
// `conteudo` e `rodape` sao elementos ou listas de elementos (montados com h()). Nunca passe HTML em texto.

import { h, novoId, focar } from '../ui.js';
import { icone } from '../icones.js';
import { empilharCamada } from '../rotas.js';

export function abrirFolha({ titulo, conteudo = null, rodape = null, aoFechar = null, focoInicial = null, guarda = null } = {}) {
  const idTitulo = novoId('folha-titulo');
  const anterior = document.activeElement;
  let aberta = true;
  let perguntando = false;
  const botaoFechar = h('button', { class: 'topo-botao', type: 'button', 'aria-label': 'Fechar', onclick: () => folha.tentarFechar() }, icone('fechar', { tamanho: 22 }));
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

  // O Voltar do aparelho: com algo a perder, a folha fica e pergunta (rotas.js poe de volta a entrada do historico que o Voltar gastou).
  const liberar = empilharCamada(encerrar, {
    antesDeVoltar: guarda ? () => {
      if (!aberta) return false;
      if (perguntando) {                 // Voltar com a pergunta aberta: vale como "continuar editando"
        if (guarda.continuar) guarda.continuar();
        return true;
      }
      if (!guarda.sujo()) return false;
      folha.tentarFechar();
      return true;
    } : null,
  });
  const folha = {
    elemento: dialogo,
    corpo,
    /** Fecha e devolve uma promessa que termina quando o historico ja foi acertado. Fecha direto, sem perguntar. */
    fechar() {
      if (!aberta) return Promise.resolve();
      encerrar();
      return liberar();
    },
    /** Fecha como a pessoa pede (X, tocar fora, Esc, Cancelar): se ha algo a perder, pergunta antes; se ela quiser continuar, a folha fica. */
    tentarFechar() {
      if (!aberta) return Promise.resolve();
      if (!guarda || !guarda.sujo()) return folha.fechar();
      if (perguntando) {                 // Esc, tocar fora ou Fechar com a pergunta aberta: vale como "continuar editando"
        if (guarda.continuar) guarda.continuar();
        return Promise.resolve();
      }
      perguntando = true;
      return Promise.resolve()
        .then(() => guarda.perguntar())
        .catch(() => false)   // se a pergunta falhar, nao perde o que a pessoa escreveu
        .then((descartar) => {
          perguntando = false;
          return descartar && aberta ? folha.fechar() : undefined;
        });
    },
  };

  dialogo.addEventListener('cancel', (ev) => { ev.preventDefault(); folha.tentarFechar(); });
  dialogo.addEventListener('click', (ev) => { if (ev.target === dialogo) folha.tentarFechar(); });
  document.body.appendChild(dialogo);
  dialogo.showModal();
  if (focoInicial) focar(focoInicial);
  return folha;
}
