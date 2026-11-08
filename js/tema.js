// Tema claro, escuro ou automatico (segue o aparelho). A escolha fica em localStorage (gestao.tema) e e a unica coisa que sobrevive a "Sair".
// O CSS decide as cores: aqui so se marca data-tema="claro|escuro" no <html> (ou se tira a marca, no automatico) e se acerta a cor da barra do navegador.

const CHAVE = 'gestao.tema';
// Cores da barra do navegador: iguais a --superficie de css/tokens.css (um teste confere).
export const COR_DA_BARRA_CLARA = '#FFFFFF';
export const COR_DA_BARRA_ESCURA = '#111B2D';
// Na tela de entrada o topo e azul-marinho nos dois temas (--hero-1 de css/tokens.css, um teste confere): a barra do navegador acompanha.
export const COR_DA_BARRA_DA_ENTRADA = '#0F1B2D';

export const OPCOES_DE_TEMA = [
  { valor: 'auto', rotulo: 'Automático', ajuda: 'Acompanha o aparelho' },
  { valor: 'claro', rotulo: 'Claro', ajuda: 'Fundo claro sempre' },
  { valor: 'escuro', rotulo: 'Escuro', ajuda: 'Fundo escuro sempre' },
];

export function preferenciaDeTema() {
  try {
    const v = window.localStorage.getItem(CHAVE);
    return v === 'claro' || v === 'escuro' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/** Aplica a preferencia na pagina (marca no <html> e cor da barra). */
export function aplicarTema(valor = preferenciaDeTema()) {
  const raiz = document.documentElement;
  if (valor === 'claro' || valor === 'escuro') raiz.setAttribute('data-tema', valor);
  else raiz.removeAttribute('data-tema');
  const claro = document.getElementById('cor-claro');
  const escuro = document.getElementById('cor-escuro');
  if (claro) claro.setAttribute('content', valor === 'escuro' ? COR_DA_BARRA_ESCURA : COR_DA_BARRA_CLARA);
  if (escuro) escuro.setAttribute('content', valor === 'claro' ? COR_DA_BARRA_CLARA : COR_DA_BARRA_ESCURA);
}

/** Liga ou desliga a cor da barra do navegador da tela de entrada (desligar devolve a cor do tema escolhido). */
export function barraDaEntrada(ativa) {
  if (!ativa) {
    aplicarTema();
    return;
  }
  for (const id of ['cor-claro', 'cor-escuro']) {
    const meta = document.getElementById(id);
    if (meta) meta.setAttribute('content', COR_DA_BARRA_DA_ENTRADA);
  }
}

export function definirTema(valor) {
  const v = valor === 'claro' || valor === 'escuro' ? valor : 'auto';
  try {
    if (v === 'auto') window.localStorage.removeItem(CHAVE);
    else window.localStorage.setItem(CHAVE, v);
  } catch {
    /* sem armazenamento: vale ate fechar a pagina */
  }
  aplicarTema(v);
}
