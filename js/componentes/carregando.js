// Carregando: um giro com texto (espera curta) ou blocos cinza no lugar da lista (espera de uma lista inteira).
//   ctx.raiz.replaceChildren(carregando('Buscando os prazos…'))
//   ctx.raiz.replaceChildren(esqueleto(4))

import { h } from '../ui.js';
import { icone } from '../icones.js';

export function carregando(texto = 'Carregando…') {
  return h('div', { class: 'carregando', role: 'status' }, h('span', { class: 'giro' }, icone('atualizar', { tamanho: 24 })), texto);
}

export function esqueleto(linhas = 3) {
  return h('div', { class: 'esqueleto', 'aria-hidden': 'true' }, Array.from({ length: linhas }, () => h('div', { class: 'esqueleto-bloco' })));
}
