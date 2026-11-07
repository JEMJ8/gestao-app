// Formatos de texto: numero de processo, dinheiro, telefone, plural, busca sem acento e link seguro.
// Modulo puro (sem DOM, sem rede). Tudo aqui trata o texto recebido como NAO CONFIAVEL: nunca monta HTML.

const dois = (n) => String(n).padStart(2, '0');

export function somenteDigitos(texto) {
  return String(texto ?? '').replace(/[^0-9]/g, '');
}

/** Numero unico do CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO). Com 20 digitos formata; senao devolve o texto como veio. */
export function processoCNJ(numero) {
  const d = somenteDigitos(numero);
  if (d.length !== 20) return String(numero ?? '');
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d[13]}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

/** Centavos (inteiro) em "R$ 1.234,56". Vazio ou invalido devolve "". Negativo vira "-R$ 1,00". */
export function dinheiro(centavos) {
  if (centavos === null || centavos === undefined || centavos === '') return '';
  const n = Number(centavos);
  if (!Number.isFinite(n)) return '';
  const total = Math.round(Math.abs(n));
  const reais = String(Math.floor(total / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}R$ ${reais},${dois(total % 100)}`;
}

/** Telefone do Brasil: (65) 99999-0001 ou (65) 3333-0001. Aceita +55. Qualquer outra forma volta como veio. */
export function telefone(valor) {
  let d = somenteDigitos(valor);
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(valor ?? '');
}

/** "1 prazo" / "3 prazos". */
export function plural(n, singular, pluralTxt) {
  return `${n} ${n === 1 ? singular : pluralTxt}`;
}

/** Minusculas e sem acento, para comparar na busca. */
export function semAcento(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Todas as palavras de `busca` aparecem em `texto` (sem diferenciar maiuscula nem acento). Busca vazia acha tudo. */
export function contemBusca(texto, busca) {
  const palavras = semAcento(busca).split(/\s+/).filter(Boolean);
  if (!palavras.length) return true;
  const alvo = semAcento(texto);
  return palavras.every((p) => alvo.includes(p));
}

/** Comeco de um texto longo em uma linha so, cortado no fim de uma palavra e com reticencias. */
export function inicioDoTexto(texto, max = 140) {
  const limpo = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (limpo.length <= max) return limpo;
  const corte = limpo.slice(0, max);
  const ultimoEspaco = corte.lastIndexOf(' ');
  return `${(ultimoEspaco > max * 0.6 ? corte.slice(0, ultimoEspaco) : corte).trimEnd()}…`;
}

/** Iniciais para o circulo de um nome: "Ana Maria Souza" vira "AS". */
export function iniciais(nome) {
  const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0][0].toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * O endereco, se for um link https seguro (sem usuario nem senha); senao null.
 * E a UNICA porta de entrada para link vindo da nuvem: http, javascript:, data: e afins nunca passam.
 */
export function linkHttps(texto) {
  let url;
  try {
    url = new URL(String(texto ?? '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return null;
  return url.href;
}

/** Inteiro de uma coluna que pode vir nula, texto ou numero. */
export function inteiro(valor, padrao = 0) {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.trunc(n) : padrao;
}
