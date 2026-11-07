// Texto longo para LER no celular (o texto de uma publicacao do DJEN): largura e entrelinha confortaveis, botao para recolher e expandir e
// busca simples dentro do texto. O texto e de terceiros e NAO CONFIAVEL: entra sempre como texto (nos de texto e <mark> montados por codigo),
// nunca como HTML. As partes de calculo (paragrafos, recorte, achados) sao funcoes puras, testadas no navegador.
//
//   const leitura = textoDeLeitura({ texto, recolhido: true, rotulo: 'Texto da publicação' });
//   cartao.append(leitura.elemento);

import { h, preencher } from '../ui.js';
import { icone } from '../icones.js';
import { plural } from '../formato.js';

export const LIMITE_RECOLHIDO = 900;     // letras mostradas com o texto recolhido
const MINIMO_PARA_BUSCAR = 500;          // abaixo disso o texto cabe numa olhada e a busca so atrapalha
const MAXIMO_DE_ACHADOS = 500;
const MINIMO_DA_BUSCA = 2;

// ---------------------------------------------------------------- partes puras

/** Os paragrafos do texto (separados por linha em branco). Texto sem linha em branco vira um paragrafo so. */
export function paragrafosDoTexto(texto) {
  const limpo = String(texto ?? '').replace(/\r\n?/g, '\n').trim();
  if (!limpo) return [];
  return limpo.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

/** Corta `texto` no fim de uma palavra, com reticencias, para caber em `max` letras. */
function cortarNaPalavra(texto, max) {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max);
  const espaco = corte.lastIndexOf(' ');
  return `${(espaco > max * 0.5 ? corte.slice(0, espaco) : corte).trimEnd()}…`;
}

/** Os primeiros paragrafos que cabem em `limite` letras; o ultimo e cortado no fim de uma palavra. { paragrafos, cortou } */
export function recortarParagrafos(paragrafos, limite = LIMITE_RECOLHIDO) {
  const total = paragrafos.reduce((soma, p) => soma + p.length, 0);
  if (total <= limite) return { paragrafos: [...paragrafos], cortou: false };
  const saida = [];
  let restante = limite;
  for (const p of paragrafos) {
    if (restante <= 0) break;
    saida.push(p.length <= restante ? p : cortarNaPalavra(p, restante));
    restante -= p.length;
  }
  return { paragrafos: saida, cortou: true };
}

/** Minusculas e sem acento, letra por letra, com o mapa de volta ao texto original (o tamanho pode mudar com acento solto). */
function normalizarComMapa(texto) {
  let norm = '';
  const mapa = [];
  let i = 0;
  for (const letra of texto) {
    const n = letra.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (let k = 0; k < n.length; k += 1) mapa.push(i);
    norm += n;
    i += letra.length;
  }
  return { norm, mapa };
}

/**
 * Onde `busca` aparece em `texto`, sem diferenciar maiuscula nem acento: lista de { inicio, fim } no texto ORIGINAL (fim exclusivo), sem
 * sobreposicao. Busca com menos de 2 letras nao acha nada.
 */
export function acharTrechos(texto, busca) {
  const alvo = normalizarComMapa(String(busca ?? '').replace(/\s+/g, ' ').trim()).norm;
  if (alvo.length < MINIMO_DA_BUSCA) return [];
  const { norm, mapa } = normalizarComMapa(String(texto ?? ''));
  const achados = [];
  let de = 0;
  while (achados.length < MAXIMO_DE_ACHADOS) {
    const posicao = norm.indexOf(alvo, de);
    if (posicao < 0) break;
    const inicio = mapa[posicao];
    const ultimo = mapa[posicao + alvo.length - 1];
    const fim = ultimo + (String(texto).codePointAt(ultimo) > 0xffff ? 2 : 1);
    achados.push({ inicio, fim });
    de = posicao + alvo.length;
  }
  return achados;
}

// ---------------------------------------------------------------- tela

/** Os nos de um paragrafo: texto puro, ou texto com <mark> nos trechos achados. `primeiro` = numero do primeiro achado deste paragrafo. */
function nosDoParagrafo(paragrafo, trechos, primeiro, atual) {
  if (!trechos.length) return [paragrafo];
  const nos = [];
  let cursor = 0;
  trechos.forEach((t, k) => {
    if (t.inicio > cursor) nos.push(paragrafo.slice(cursor, t.inicio));
    nos.push(h('mark', { class: ['achado', primeiro + k === atual && 'achado--atual'], dataset: { achado: String(primeiro + k) } }, paragrafo.slice(t.inicio, t.fim)));
    cursor = t.fim;
  });
  if (cursor < paragrafo.length) nos.push(paragrafo.slice(cursor));
  return nos;
}

export function textoDeLeitura({ texto, recolhido = false, limite = LIMITE_RECOLHIDO, rotulo = 'Texto' } = {}) {
  const todos = paragrafosDoTexto(texto);
  const letras = todos.reduce((soma, p) => soma + p.length, 0);
  const longo = letras > limite;
  const comBusca = letras >= MINIMO_PARA_BUSCAR;
  const estado = { recolhido: Boolean(recolhido) && longo, busca: '', atual: 0, total: 0 };

  const corpo = h('div', { class: 'leitura-corpo' });
  const rodape = h('div', { class: 'leitura-rodape' });
  const contagem = h('span', { class: 'leitura-contagem', role: 'status', 'aria-live': 'polite' });
  const anterior = h('button', { class: 'botao leitura-nav', type: 'button', 'aria-label': 'Trecho anterior' }, icone('seta', { tamanho: 20, classe: 'icone--cima' }));
  const proximo = h('button', { class: 'botao leitura-nav', type: 'button', 'aria-label': 'Próximo trecho' }, icone('seta', { tamanho: 20, classe: 'icone--baixo' }));
  const campo = h('input', {
    class: 'entrada', type: 'search', placeholder: 'Buscar no texto', 'aria-label': 'Buscar dentro do texto', autocomplete: 'off', autocapitalize: 'none',
    spellcheck: 'false', enterkeyhint: 'search', maxlength: 60,
  });
  const linhaDoAndamento = h('div', { class: 'leitura-busca-linha', hidden: true }, contagem, anterior, proximo);     // so aparece enquanto se procura
  const barra = comBusca ? h('div', { class: 'leitura-busca' }, campo, linhaDoAndamento) : null;
  const elemento = h('div', { class: 'leitura', role: 'region', 'aria-label': rotulo }, barra, corpo, rodape);

  function desenhar(rolar = false) {
    const trechosPorParagrafo = [];
    let paragrafos;
    let cortou = false;
    if (estado.busca.trim().length >= MINIMO_DA_BUSCA) {
      paragrafos = todos;      // procurando: o texto inteiro aparece
    } else if (estado.recolhido) {
      ({ paragrafos, cortou } = recortarParagrafos(todos, limite));
    } else {
      paragrafos = todos;
    }
    let total = 0;
    const primeiros = [];
    for (const p of paragrafos) {
      const trechos = estado.busca.trim().length >= MINIMO_DA_BUSCA ? acharTrechos(p, estado.busca) : [];
      primeiros.push(total);
      trechosPorParagrafo.push(trechos);
      total += trechos.length;
    }
    estado.total = total;
    if (estado.atual >= total) estado.atual = 0;
    preencher(corpo, paragrafos.length
      ? paragrafos.map((p, i) => h('p', { class: 'leitura-paragrafo' }, nosDoParagrafo(p, trechosPorParagrafo[i], primeiros[i], estado.atual)))
      : h('p', { class: 'texto-2' }, 'Sem texto.'));

    const procurando = estado.busca.trim().length >= MINIMO_DA_BUSCA;
    if (barra) {
      contagem.textContent = !procurando ? '' : total ? `Trecho ${estado.atual + 1} de ${total}` : 'Nada encontrado';
      linhaDoAndamento.hidden = !procurando;
      anterior.disabled = proximo.disabled = total < 2;
    }
    const botoes = [];
    if (!procurando && longo) {
      if (estado.recolhido && cortou) {
        botoes.push(h('button', { class: 'botao botao--cheio', type: 'button', onclick: () => { estado.recolhido = false; desenhar(); } },
          `Ler o texto inteiro (${plural(letras, 'letra', 'letras')})`));
      } else if (!estado.recolhido) {
        botoes.push(h('button', { class: 'botao botao--cheio', type: 'button', onclick: () => { estado.recolhido = true; desenhar(); elemento.scrollIntoView({ block: 'start' }); } },
          'Recolher o texto'));
      }
    }
    preencher(rodape, botoes);
    if (rolar && total) {
      const marca = corpo.querySelector('mark.achado--atual');
      if (marca) marca.scrollIntoView({ block: 'center' });
    }
  }

  let espera = null;
  campo.addEventListener('input', () => {
    if (espera !== null) window.clearTimeout(espera);
    espera = window.setTimeout(() => {
      espera = null;
      estado.busca = campo.value;
      estado.atual = 0;
      desenhar(true);
    }, 200);
  });
  campo.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      campo.blur();
    }
  });
  const andar = (passo) => {
    if (estado.total < 2) return;
    estado.atual = (estado.atual + passo + estado.total) % estado.total;
    desenhar(true);
  };
  anterior.addEventListener('click', () => andar(-1));
  proximo.addEventListener('click', () => andar(1));

  desenhar();
  return { elemento, letras };
}
