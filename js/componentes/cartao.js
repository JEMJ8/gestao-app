// Cartao: bloco com borda e fundo da superficie, titulo opcional com icone e, no canto, uma acao (link ou botao).
//
//   cartao({ titulo: 'Audiências', icone: 'calendario', acao: h('a', { href: '#/agenda', class: 'secao-link' }, 'Ver agenda') }, linhas)
//   cartao({ variante: 'atencao', titulo: 'Atenção' }, h('p', null, 'texto'))
//
// variante: 'perigo' | 'atencao' | 'ok' | 'info' (cor da situacao, sempre com o titulo e o icone dizendo o mesmo).
// corpo: 'padrao' (com espaco interno) | 'lista' (sem espaco: para colocar uma lista de linhas encostada nas bordas).

import { h } from '../ui.js';
import { icone } from '../icones.js';

export function cartao({ titulo = null, icone: nomeIcone = null, variante = null, acao = null, corpo = 'padrao', classe = null, rotulo = null } = {}, ...filhos) {
  const cabeca = titulo
    ? h('header', { class: 'cartao-cabeca' },
      nomeIcone ? h('span', { class: 'cartao-icone' }, icone(nomeIcone, { tamanho: 22 })) : null,
      h('h2', { class: 'cartao-titulo' }, titulo),
      acao)
    : null;
  return h(
    'section',
    { class: ['cartao', variante && `cartao--${variante}`, classe], 'aria-label': titulo ? null : rotulo },
    cabeca,
    corpo === 'lista' ? filhos : h('div', { class: 'cartao-corpo' }, filhos),
  );
}
