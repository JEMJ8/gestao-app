// Estado vazio: quando nao ha nada para mostrar. Sempre explica o motivo em uma frase e, se der, oferece o proximo passo.
//   vazio({ icone: 'ok', titulo: 'Nada vencido', texto: 'Nenhum prazo precisa de atenção hoje.', variante: 'ok' })

import { h } from '../ui.js';
import { icone } from '../icones.js';

export function vazio({ icone: nomeIcone = 'info', titulo, texto = null, variante = null, acao = null } = {}) {
  return h(
    'div',
    { class: ['vazio', variante && `vazio--${variante}`] },
    h('span', { class: 'vazio-icone' }, icone(nomeIcone, { tamanho: 28 })),
    h('p', { class: 'vazio-titulo' }, titulo),
    texto ? h('p', { class: 'vazio-texto' }, texto) : null,
    acao,
  );
}

/** Tela provisoria dos construtores que ainda nao chegaram. Quem construir a tela troca o arquivo inteiro. */
export function emConstrucao(nome) {
  return vazio({ icone: 'ajustes', titulo: `${nome}: em construção`, texto: 'Esta tela ainda será feita. O resto do aplicativo já funciona.' });
}
