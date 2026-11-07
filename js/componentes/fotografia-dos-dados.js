// "Fotografia" das tabelas que uma tela usa, para decidir se vale redesenhar.
//
// `dados.aoMudar` (e ctx.aoMudarDados) avisa a cada passo do download (progresso, estado da sincronizacao), mas as listas de linhas so sao
// TROCADAS quando o espelho muda de verdade. Comparar a fotografia de antes com a de agora evita redesenhar (e piscar) a tela a cada aviso.
//
//   let antes = null;
//   const redesenhar = () => {
//     const agora = fotografiaDosDados(['prazo', 'processo']);
//     if (!dadosMudaram(antes, agora)) return;
//     antes = agora;
//     ...
//   };

import * as dados from '../dados.js';

export function fotografiaDosDados(tabelas) {
  return { carregado: dados.estado().carregado, listas: tabelas.map((t) => dados.obter(t)) };
}

/** Verdadeiro quando a fotografia `agora` difere da `antes` (ou nao ha `antes`). */
export function dadosMudaram(antes, agora) {
  return !antes || antes.carregado !== agora.carregado || agora.listas.some((lista, i) => lista !== antes.listas[i]);
}
