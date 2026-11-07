// Pecas das listas de Prazos e de Publicacoes: a fileira de chips de filtro, o campo de busca e o aviso de "ainda sem dados".
// O CSS esta em css/tela-prazos.css (chips e busca) e todo texto entra como texto, nunca como HTML.
//
//   const chips = grupoDeChips({ rotulo: 'Filtrar os prazos', aoEscolher: (valor) => ... });
//   chips.atualizar([{ valor: 'abertos', rotulo: 'Abertos' }, { valor: 'vencidos', rotulo: 'Vencidos', contagem: 6, tom: 'perigo' }], 'abertos');
//   const busca = campoDeBusca({ rotulo: 'Buscar prazo', placeholder: 'Cliente, processo ou ato', valor, aoMudar: (texto) => ... });
//   ctx.aoLimpar(busca.parar);

import { h, preencher, novoId } from '../ui.js';
import { icone } from '../icones.js';
import { carregando } from './carregando.js';
import { erroDeTela } from './erro.js';

// ---------------------------------------------------------------- chips

function preencherChip(botao, opcao, marcado) {
  preencher(
    botao,
    marcado ? icone('ok', { tamanho: 16 }) : null,
    h('span', { class: 'chip-rotulo' }, opcao.rotulo),
    typeof opcao.contagem === 'number' ? h('span', { class: ['chip-contagem', opcao.contagem === 0 && 'chip-contagem--zero'] }, String(opcao.contagem)) : null,
  );
  botao.setAttribute('aria-pressed', marcado ? 'true' : 'false');
  botao.classList.toggle('chip--ativo', marcado);
}

/**
 * Fileira de botoes onde um so fica marcado (aria-pressed; o marcado leva um sinal de certo alem da cor). Quebra em mais de uma linha em tela
 * estreita, nunca rola de lado. `atualizar(opcoes, valor)` troca textos e contagens NO LUGAR, sem refazer os botoes (o foco do teclado nao se
 * perde); so refaz quando a lista de opcoes muda. Cada opcao: { valor, rotulo, contagem?, tom? } (tom: perigo | atencao | info).
 */
export function grupoDeChips({ rotulo, aoEscolher }) {
  const elemento = h('div', { class: 'chips', role: 'group', 'aria-label': rotulo });
  let botoes = new Map();
  let assinatura = '';

  function atualizar(opcoes, valor) {
    const nova = opcoes.map((o) => `${o.valor}|${o.tom || ''}`).join(',');
    if (nova !== assinatura) {
      const focado = document.activeElement && elemento.contains(document.activeElement) ? document.activeElement.dataset.valor : null;
      botoes = new Map();
      elemento.replaceChildren();
      for (const o of opcoes) {
        const botao = h('button', {
          class: ['chip', o.tom && `chip--${o.tom}`], type: 'button', dataset: { valor: o.valor },
          onclick: () => { if (typeof aoEscolher === 'function') aoEscolher(o.valor); },
        });
        botoes.set(o.valor, botao);
        elemento.appendChild(botao);
      }
      assinatura = nova;
      if (focado && botoes.has(focado)) botoes.get(focado).focus({ preventScroll: true });
    }
    for (const o of opcoes) preencherChip(botoes.get(o.valor), o, o.valor === valor);
  }

  return { elemento, atualizar };
}

// ---------------------------------------------------------------- busca

/**
 * Campo de busca com lupa e botao de limpar. `aoMudar(texto)` roda depois de uma pausa curta na digitacao (nao a cada letra).
 * Devolve { elemento, entrada, valor(), definir(texto), parar() }: chame parar() ao sair da tela (ctx.aoLimpar(busca.parar)).
 */
export function campoDeBusca({ rotulo, placeholder = '', valor = '', aoMudar, pausa = 150 }) {
  let espera = null;
  const entrada = h('input', {
    class: 'entrada', id: novoId('busca'), type: 'search', placeholder, 'aria-label': rotulo, autocomplete: 'off', autocapitalize: 'none',
    spellcheck: 'false', enterkeyhint: 'search', maxlength: 80,
  });
  entrada.value = valor;
  const limpar = h('button', { class: 'busca-lista-limpar', type: 'button', 'aria-label': 'Limpar a busca', hidden: !valor }, icone('fechar', { tamanho: 20 }));
  const elemento = h('div', { class: 'busca-lista', role: 'search' }, h('span', { class: 'busca-lista-lupa' }, icone('busca', { tamanho: 20 })), entrada, limpar);

  const avisar = () => {
    if (espera !== null) window.clearTimeout(espera);
    espera = null;
    if (typeof aoMudar === 'function') aoMudar(entrada.value);
  };
  entrada.addEventListener('input', () => {
    limpar.hidden = entrada.value === '';
    if (espera !== null) window.clearTimeout(espera);
    espera = window.setTimeout(avisar, pausa);
  });
  entrada.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      avisar();
      entrada.blur();    // fecha o teclado do celular para ver os resultados
    }
  });
  limpar.addEventListener('click', () => {
    entrada.value = '';
    limpar.hidden = true;
    avisar();
    entrada.focus({ preventScroll: true });
  });

  return {
    elemento,
    entrada,
    valor: () => entrada.value,
    definir(texto) {
      entrada.value = texto;
      limpar.hidden = texto === '';
    },
    parar() {
      if (espera !== null) window.clearTimeout(espera);
      espera = null;
    },
  };
}

// ---------------------------------------------------------------- ainda sem dados

/** O que mostrar enquanto os dados nao chegaram (primeira abertura, sem internet e sem copia, erro da nuvem). `null` quando ja chegaram. */
export function semDadosAinda(estado, aoTentar) {
  if (estado.carregado) return null;
  if (estado.erro && !estado.atualizando) return erroDeTela(estado.erro, { aoTentar });
  if (estado.offline && !estado.atualizando) {
    return erroDeTela('Sem conexão e nenhum dado guardado neste aparelho. Conecte-se à internet para baixar os dados.', { titulo: 'Sem dados ainda', aoTentar });
  }
  return carregando(estado.progresso ? `Baixando os dados… ${estado.progresso.feitas} de ${estado.progresso.total}` : 'Baixando os dados…');
}
