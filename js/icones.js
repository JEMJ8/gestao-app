// Icones do aplicativo: tracos simples em 24x24, desenhados com createElementNS (nenhum arquivo de imagem, nenhum HTML em texto).
// Herdam a cor do texto (currentColor). Quando o icone sozinho diz algo, passe `titulo` (vira o nome acessivel);
// sem `titulo` ele e decorativo e fica escondido do leitor de tela.
//
//   icone('alerta')                       -> decorativo, 20 px
//   icone('ok', { tamanho: 24, titulo: 'Conferido' })

import { svg } from './ui.js';

const ICONES = {
  sol: [['circle', { cx: 12, cy: 12, r: 4 }], ['path', { d: 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' }]],
  relogio: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7v5l3 2' }]],
  calendario: [['rect', { x: 3, y: 4, width: 18, height: 18, rx: 2 }], ['path', { d: 'M16 2v4M8 2v4M3 10h18' }]],
  jornal: [['path', { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z' }], ['path', { d: 'M14 3v5h5M9 13h6M9 17h6' }]],
  mais: [['circle', { cx: 5, cy: 12, r: 1.6, fill: 'currentColor' }], ['circle', { cx: 12, cy: 12, r: 1.6, fill: 'currentColor' }], ['circle', { cx: 19, cy: 12, r: 1.6, fill: 'currentColor' }]],
  voltar: [['path', { d: 'M19 12H5M12 19l-7-7 7-7' }]],
  atualizar: [['path', { d: 'M21 12a9 9 0 1 1-3-6.7' }], ['path', { d: 'M21 3v6h-6' }]],
  alerta: [['path', { d: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z' }], ['path', { d: 'M12 9v4M12 17h.01' }]],
  ok: [['path', { d: 'M22 11.1V12a10 10 0 1 1-5.9-9.1' }], ['path', { d: 'M22 4 12 14l-3-3' }]],
  info: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 16v-4M12 8h.01' }]],
  erro: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M15 9l-6 6M9 9l6 6' }]],
  cadeado: [['rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }], ['path', { d: 'M8 11V7a4 4 0 0 1 8 0v4' }]],
  sair: [['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9' }]],
  olho: [['path', { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z' }], ['circle', { cx: 12, cy: 12, r: 3 }]],
  olhoRisco: [['path', { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z' }], ['path', { d: 'M3 3l18 18' }]],
  copiar: [['rect', { x: 9, y: 9, width: 13, height: 13, rx: 2 }], ['path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }]],
  seta: [['path', { d: 'M9 18l6-6-6-6' }]],
  fechar: [['path', { d: 'M18 6 6 18M6 6l12 12' }]],
  semRede: [['path', { d: 'M2 8.8a15 15 0 0 1 4.2-2.6M5 12.9a10 10 0 0 1 5.2-2.7M10.7 16.4a5 5 0 0 1 2.6 0M12 20h.01M8.5 4.4A15 15 0 0 1 22 8.8M19 12.9a10 10 0 0 0-2.2-1.7M2 2l20 20' }]],
  computador: [['rect', { x: 2, y: 3, width: 20, height: 14, rx: 2 }], ['path', { d: 'M8 21h8M12 17v4' }]],
  ajustes: [['path', { d: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6' }]],
  pessoas: [['path', { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }], ['circle', { cx: 9, cy: 7, r: 4 }], ['path', { d: 'M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8' }]],
  processo: [['rect', { x: 2, y: 7, width: 20, height: 14, rx: 2 }], ['path', { d: 'M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2' }]],
  dinheiro: [['rect', { x: 2, y: 6, width: 20, height: 12, rx: 2 }], ['circle', { cx: 12, cy: 12, r: 2.5 }], ['path', { d: 'M6 12h.01M18 12h.01' }]],
  lua: [['path', { d: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z' }]],
  raio: [['path', { d: 'M13 2 3 14h9l-1 8 10-12h-9z' }]],
  escudo: [['path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }]],
  pin: [['path', { d: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z' }], ['circle', { cx: 12, cy: 10, r: 3 }]],
  link: [['path', { d: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7' }]],
  hora: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7v5l3 2' }]],
  busca: [['circle', { cx: 11, cy: 11, r: 7 }], ['path', { d: 'M21 21l-4.3-4.3' }]],
  telefone: [['path', { d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z' }]],
  email: [['rect', { x: 2, y: 4, width: 20, height: 16, rx: 2 }], ['path', { d: 'M22 7l-10 6L2 7' }]],
  mensagem: [['path', { d: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' }]],
  celular: [['rect', { x: 6, y: 2, width: 12, height: 20, rx: 3 }], ['path', { d: 'M11 18h2' }]],
  chave: [['circle', { cx: 7.5, cy: 15.5, r: 5.5 }], ['path', { d: 'M21 2l-9.6 9.6M15.5 7.5l3 3L22 7l-3-3' }]],
  qr: [['rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }], ['rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }], ['rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }], ['path', { d: 'M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1' }]],
  baixar: [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3' }]],
  compartilhar: [['path', { d: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13' }]],
  ajuda: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01' }]],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  avancar: [['path', { d: 'M5 12h14M12 5l7 7-7 7' }]],
  lapis: [['path', { d: 'M12 20h9' }], ['path', { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' }]],
  lixeira: [['path', { d: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6' }]],
};

export const NOMES_DE_ICONES = Object.keys(ICONES);

export function icone(nome, { tamanho = 20, titulo = null, classe = null } = {}) {
  const formas = ICONES[nome];
  if (!formas) throw new Error(`Icone desconhecido: ${nome}`);
  const atributos = {
    class: ['icone', classe],
    width: tamanho,
    height: tamanho,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    focusable: 'false',
  };
  if (titulo) {
    atributos.role = 'img';
    atributos['aria-label'] = titulo;
  } else {
    atributos['aria-hidden'] = 'true';
  }
  return svg('svg', atributos, ...formas.map(([tag, attrs]) => svg(tag, attrs)));
}
