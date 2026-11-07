// Erro de tela: frase simples (nunca texto tecnico) e, se der, um botao para tentar de novo.
//   erroDeTela('Não foi possível carregar os prazos.', { aoTentar: () => montarDeNovo() })

import { h } from '../ui.js';
import { icone } from '../icones.js';

export function erroDeTela(texto, { titulo = 'Algo deu errado', aoTentar = null } = {}) {
  return h(
    'div',
    { class: 'vazio vazio--erro', role: 'alert' },
    h('span', { class: 'vazio-icone' }, icone('erro', { tamanho: 28 })),
    h('p', { class: 'vazio-titulo' }, titulo),
    h('p', { class: 'vazio-texto' }, texto),
    aoTentar ? h('button', { class: 'botao', type: 'button', onclick: aoTentar }, icone('atualizar'), 'Tentar de novo') : null,
  );
}
