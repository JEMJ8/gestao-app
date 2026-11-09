// Montagem de elementos sem HTML em texto. REGRA DE OURO: tudo que vem da nuvem entra na tela como TEXTO (filho de h() ou textContent).
// Nunca se monta HTML a partir de dado da nuvem: publicacao, nome de cliente e observacao podem ter < > & e aspas de proposito.
//
//   h('div', { class: 'cartao', onclick: fn }, h('strong', null, nome), ' ', texto)
//
// Atributos: `class` aceita lista; `dataset` aceita objeto; `onxxx` aceita funcao; true liga o atributo; false/null/undefined sao ignorados.
// Filhos: texto, numero, elemento, lista (achatada) ou null/false (ignorados).

import { linkHttps } from './formato.js';

const NS_SVG = 'http://www.w3.org/2000/svg';
// atributos que nunca passam: estilo inline e o que carrega HTML cru
const PROIBIDO = /^(style|srcdoc)$|html$/i;
const COM_ENDERECO = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);

function aplicar(el, atributos) {
  if (!atributos) return;
  for (const [nome, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (PROIBIDO.test(nome)) throw new Error(`Atributo nao permitido: ${nome}`);
    if (nome === 'class') {
      el.setAttribute('class', Array.isArray(valor) ? valor.filter(Boolean).join(' ') : String(valor));
    } else if (nome === 'dataset') {
      Object.assign(el.dataset, valor);
    } else if (nome.startsWith('on') && typeof valor === 'function') {
      el.addEventListener(nome.slice(2), valor);
    } else if (valor === true) {
      el.setAttribute(nome, '');
    } else {
      const texto = String(valor);
      if (COM_ENDERECO.has(nome) && /^\s*(javascript|vbscript|data):/i.test(texto) && !/^\s*data:image[/]/i.test(texto)) {
        throw new Error('Endereco nao permitido');
      }
      el.setAttribute(nome, texto);
    }
  }
}

function anexar(pai, filhos) {
  for (const filho of filhos) {
    if (filho === null || filho === undefined || filho === false || filho === true) continue;
    if (Array.isArray(filho)) anexar(pai, filho);
    else if (filho instanceof Node) pai.appendChild(filho);
    else pai.appendChild(document.createTextNode(String(filho)));
  }
}

export function h(tag, atributos, ...filhos) {
  const el = document.createElement(tag);
  aplicar(el, atributos);
  anexar(el, filhos);
  return el;
}

export function svg(tag, atributos, ...filhos) {
  const el = document.createElementNS(NS_SVG, tag);
  aplicar(el, atributos);
  anexar(el, filhos);
  return el;
}

/** Troca o conteudo de `pai` por estes filhos. */
export function preencher(pai, ...filhos) {
  pai.replaceChildren();
  anexar(pai, filhos);
  return pai;
}

/** Valor dinamico de estilo (largura, posicao) sem atributo style: usa a CSSOM, que a politica de seguranca permite. */
export function estilo(el, propriedades) {
  for (const [nome, valor] of Object.entries(propriedades)) el.style.setProperty(nome, String(valor));
  return el;
}

let contador = 0;
/** Identificador unico para ligar rotulo e campo (id/for, aria-describedby). */
export function novoId(prefixo = 'id') {
  contador += 1;
  return `${prefixo}-${contador}`;
}

/**
 * Link para fora do aplicativo. So vira link se o endereco for https seguro; senao devolve so o texto (nunca um link quebrado
 * ou perigoso). Abre em outra aba com rel="noopener noreferrer".
 */
export function linkExterno(endereco, rotulo) {
  const seguro = linkHttps(endereco);
  if (!seguro) return h('span', null, rotulo || String(endereco ?? ''));
  return h('a', { href: seguro, target: '_blank', rel: 'noopener noreferrer' }, rotulo || seguro);
}

/** Fala uma frase para o leitor de tela (regiao aria-live do index.html) sem mudar nada na tela. */
export function anunciar(frase) {
  const regiao = document.getElementById('anuncio');
  if (!regiao) return;
  regiao.textContent = '';
  window.setTimeout(() => { regiao.textContent = frase; }, 30);
}

/** Espera `ms` milissegundos (promessa). */
export function esperar(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Foco sem rolar a pagina. */
export function focar(el) {
  if (el && typeof el.focus === 'function') el.focus({ preventScroll: true });
}

/** Copia texto para a area de transferencia. Devolve true/false (o navegador pode negar). */
export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
