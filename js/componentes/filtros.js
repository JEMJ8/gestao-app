// Controles de filtro das telas de Mais, Clientes e Financeiro: campo de busca, alternador de opcoes (dois a quatro botoes lado a lado)
// e a memoria curta do que a pessoa digitou ou escolheu (para o Voltar do aparelho devolver a tela como estava).
//
//   const campo = campoDeBusca({ rotulo: 'Buscar cliente pelo nome', placeholder: 'Nome do cliente', valor, aoMudar: (texto) => ... });
//   const alt = alternador({ rotulo: 'Quem mostrar', opcoes: [{ valor: 'clientes', rotulo: 'Clientes' }, ...], atual: 'clientes', aoEscolher: (valor) => ... });
//   lembrar('clientes.busca', texto);   lembrado('clientes.busca', '');
//
// O CSS destes controles esta em css/tela-mais.css. Todo texto entra como texto (nunca HTML).

import { h, novoId } from '../ui.js';
import { icone } from '../icones.js';

// ---------------------------------------------------------------- memoria do que foi digitado

/**
 * Guarda `valor` na entrada atual do historico do aparelho (history.state), nao no endereco. Quem aperta Voltar a partir de um resultado
 * encontra a busca como deixou; quem abre a tela de novo pela barra de baixo (entrada nova do historico) comeca do zero.
 */
export function lembrar(chave, valor) {
  try {
    const atual = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
    window.history.replaceState({ ...atual, lembrado: { ...(atual.lembrado || {}), [chave]: valor } }, '');
  } catch {
    // historico indisponivel: a tela so deixa de lembrar
  }
}

export function lembrado(chave, padrao = null) {
  const estado = window.history.state;
  if (estado && typeof estado === 'object' && estado.lembrado && Object.prototype.hasOwnProperty.call(estado.lembrado, chave)) return estado.lembrado[chave];
  return padrao;
}

// ---------------------------------------------------------------- campo de busca

/**
 * Campo de busca com lupa e botao de limpar. `aoMudar(texto)` roda depois de uma pausa curta na digitacao (nao a cada letra).
 * Devolve { el, input, valor(), definir(texto), parar() }: chame parar() ao sair da tela (ctx.aoLimpar(campo.parar)).
 */
export function campoDeBusca({ rotulo, placeholder = '', valor = '', aoMudar, pausa = 150 }) {
  const id = novoId('busca');
  let espera = null;
  const input = h('input', {
    class: 'entrada campo-de-busca-entrada',
    id,
    type: 'search',
    value: valor,
    placeholder,
    'aria-label': rotulo,
    autocomplete: 'off',
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
    maxlength: 80,
  });
  const limpar = h('button', { class: 'campo-de-busca-limpar', type: 'button', 'aria-label': 'Limpar a busca', hidden: !valor }, icone('fechar', { tamanho: 20 }));
  const el = h('div', { class: 'campo-de-busca', role: 'search' },
    h('span', { class: 'campo-de-busca-lupa' }, icone('busca', { tamanho: 20 })),
    input,
    limpar);

  const avisar = () => {
    if (espera !== null) window.clearTimeout(espera);
    espera = null;
    if (typeof aoMudar === 'function') aoMudar(input.value);
  };
  input.addEventListener('input', () => {
    limpar.hidden = input.value === '';
    if (espera !== null) window.clearTimeout(espera);
    espera = window.setTimeout(avisar, pausa);
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      avisar();
      input.blur();     // fecha o teclado do celular para ver os resultados
    }
  });
  limpar.addEventListener('click', () => {
    input.value = '';
    limpar.hidden = true;
    avisar();
    input.focus({ preventScroll: true });
  });

  return {
    el,
    input,
    valor: () => input.value,
    definir(texto) {
      input.value = texto;
      limpar.hidden = texto === '';
    },
    parar() {
      if (espera !== null) window.clearTimeout(espera);
      espera = null;
    },
  };
}

// ---------------------------------------------------------------- alternador de opcoes

/**
 * Botoes lado a lado onde um so fica marcado (aria-pressed). Cada opcao: { valor, rotulo, contagem? }. Troca a marcacao no proprio lugar,
 * sem refazer os botoes (o foco do teclado nao se perde). `aoEscolher(valor)` roda ao tocar.
 * Devolve { el, atualizar({ atual, contagens }) }.
 */
export function alternador({ rotulo, opcoes, atual, aoEscolher }) {
  const botoes = new Map();
  const el = h('div', { class: 'alternador', role: 'group', 'aria-label': rotulo });
  for (const opcao of opcoes) {
    const numero = h('span', { class: 'alternador-contagem' });
    const botao = h('button', { class: 'alternador-opcao', type: 'button', 'aria-pressed': 'false', dataset: { valor: opcao.valor } },
      h('span', { class: 'alternador-rotulo' }, opcao.rotulo),
      opcao.contagem === undefined ? null : numero);
    if (opcao.contagem !== undefined) numero.textContent = String(opcao.contagem);
    botao.addEventListener('click', () => { if (typeof aoEscolher === 'function') aoEscolher(opcao.valor); });
    botoes.set(opcao.valor, { botao, numero, comContagem: opcao.contagem !== undefined });
    el.appendChild(botao);
  }
  function atualizar({ atual: novoAtual, contagens } = {}) {
    for (const [valor, { botao, numero, comContagem }] of botoes) {
      if (novoAtual !== undefined) botao.setAttribute('aria-pressed', valor === novoAtual ? 'true' : 'false');
      if (contagens && comContagem && contagens[valor] !== undefined) numero.textContent = String(contagens[valor]);
    }
  }
  atualizar({ atual });
  return { el, atualizar };
}
