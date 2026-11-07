// Consultas das listas de Prazos e de Publicacoes: quais linhas entram em cada filtro, como a busca acha, como a lista e paginada.
// Modulo PURO (sem tela e sem rede): recebe as linhas e devolve linhas. As regras de prazo (aberto, vencido, nao conferido) vem de
// dominio.js, para a lista, o semaforo de Hoje e o detalhe dizerem sempre a mesma coisa.
//
// Filtros de prazo (a ordem e a dos chips): abertos, hoje, proximos (de 1 a 7 dias depois de hoje, igual ao semaforo de Hoje), vencidos,
// nao_conferidos, encerrados, todos. Dois filtros extras so aparecem quando a pessoa chega por um link de Hoje: atencao (vencidos e de hoje)
// e futuros (mais de 7 dias).

import { situacaoDoPrazo, prazoAberto, prazoNaoConferido, ordenarPorDataFatal, publicacaoNova } from '../dominio.js';
import { contemBusca, processoCNJ, somenteDigitos } from '../formato.js';

// ---------------------------------------------------------------- prazos

export const FILTROS_DE_PRAZO = [
  { valor: 'abertos', rotulo: 'Abertos' },
  { valor: 'hoje', rotulo: 'Hoje', contar: true, tom: 'atencao' },
  { valor: 'proximos', rotulo: 'Próximos 7 dias', contar: true, tom: 'info' },
  { valor: 'vencidos', rotulo: 'Vencidos', contar: true, tom: 'perigo' },
  { valor: 'nao_conferidos', rotulo: 'Não conferidos', contar: true, tom: 'atencao' },
  { valor: 'encerrados', rotulo: 'Encerrados' },
  { valor: 'todos', rotulo: 'Todos' },
];

/** Filtros que so existem quando a pessoa chega por um link: o chip aparece marcado, no lugar certo da fileira. */
export const FILTROS_EXTRAS_DE_PRAZO = {
  atencao: { valor: 'atencao', rotulo: 'Vencidos e de hoje', depoisDe: 'vencidos', tom: 'perigo' },
  futuros: { valor: 'futuros', rotulo: 'Mais adiante', depoisDe: 'proximos', tom: 'info' },
};

const DA_CONSULTA = new Map([
  ['vencido', 'vencidos'], ['hoje', 'hoje'], ['proximo', 'proximos'], ['futuro', 'futuros'], ['encerrado', 'encerrados'], ['atencao', 'atencao'],
]);

/** O filtro pedido por um link de Hoje (`#/prazos?situacao=vencido`, `#/prazos?nao_conferidos=1`), ou null se o link nao pede nenhum. */
export function filtroDaConsulta(consulta) {
  const c = consulta && typeof consulta === 'object' ? consulta : {};
  if (c.nao_conferidos === '1') return 'nao_conferidos';
  return DA_CONSULTA.get(String(c.situacao || '')) || null;
}

/** Verdadeiro para os filtros que so existem por link (atencao e futuros). */
export function ehFiltroExtra(valor) {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(FILTROS_EXTRAS_DE_PRAZO, valor);
}

/** As opcoes de chip (com o filtro extra no lugar certo, se `extra` for um deles). */
export function opcoesDeFiltroDePrazo(extra = null) {
  const opcoes = [...FILTROS_DE_PRAZO];
  if (ehFiltroExtra(extra)) {
    const adicional = FILTROS_EXTRAS_DE_PRAZO[extra];
    opcoes.splice(opcoes.findIndex((o) => o.valor === adicional.depoisDe) + 1, 0, adicional);
  }
  return opcoes;
}

/**
 * 'vencido' | 'hoje' | 'proximo' | 'futuro' | 'encerrado'. Prazo aberto com data fatal que nao existe no calendario NUNCA some da lista:
 * conta como vencido (e a linha dele avisa que a data nao e entendida). Prazo faltando e risco; silencio nunca.
 */
function chaveDaSituacao(prazo, hoje) {
  if (!prazoAberto(prazo)) return 'encerrado';
  try {
    return situacaoDoPrazo(prazo, hoje).chave;
  } catch {
    return 'vencido';
  }
}

/** Mais recente primeiro (para os encerrados e para o historico). */
function maisRecentePrimeiro(prazos) {
  return ordenarPorDataFatal(prazos).reverse();
}

/**
 * As linhas do filtro, na ordem em que aparecem: abertos e vencidos por data fatal (o mais urgente primeiro); encerrados do mais recente
 * para o mais antigo; "todos" traz os abertos e depois os encerrados.
 */
export function prazosDoFiltro(prazos, filtro, hoje) {
  const so = (...chaves) => ordenarPorDataFatal(prazos.filter((p) => chaves.includes(chaveDaSituacao(p, hoje))));
  switch (filtro) {
    case 'abertos': return ordenarPorDataFatal(prazos.filter(prazoAberto));
    case 'hoje': return so('hoje');
    case 'proximos': return so('proximo');
    case 'vencidos': return so('vencido');
    case 'atencao': return so('vencido', 'hoje');
    case 'futuros': return so('futuro');
    case 'nao_conferidos': return ordenarPorDataFatal(prazos.filter(prazoNaoConferido));
    case 'encerrados': return maisRecentePrimeiro(prazos.filter((p) => !prazoAberto(p)));
    case 'todos': return [...ordenarPorDataFatal(prazos.filter(prazoAberto)), ...maisRecentePrimeiro(prazos.filter((p) => !prazoAberto(p)))];
    default: return ordenarPorDataFatal(prazos.filter(prazoAberto));
  }
}

/** { abertos, hoje, proximos, vencidos, nao_conferidos, encerrados, todos, atencao, futuros }: quantas linhas cada filtro tem. */
export function contagensDePrazo(prazos, hoje) {
  const c = { abertos: 0, hoje: 0, proximos: 0, vencidos: 0, nao_conferidos: 0, encerrados: 0, todos: prazos.length, atencao: 0, futuros: 0 };
  for (const p of prazos) {
    const chave = chaveDaSituacao(p, hoje);
    if (chave === 'encerrado') { c.encerrados += 1; continue; }
    c.abertos += 1;
    if (chave === 'hoje') { c.hoje += 1; c.atencao += 1; }
    else if (chave === 'proximo') c.proximos += 1;
    else if (chave === 'vencido') { c.vencidos += 1; c.atencao += 1; }
    else c.futuros += 1;
    if (prazoNaoConferido(p)) c.nao_conferidos += 1;
  }
  return c;
}

/**
 * O texto onde a busca procura num prazo: o ato, o nome de cada cliente, o numero do processo formatado e so com digitos (a pessoa pode
 * digitar de qualquer jeito). `clientes` = lista de nomes; `numero` = numero do processo.
 */
export function textoDeBuscaDoPrazo(prazo, { clientes = [], numero = '' } = {}) {
  return [prazo.ato, ...clientes, processoCNJ(numero), somenteDigitos(numero)].filter(Boolean).join(' ');
}

/** Todas as palavras da busca aparecem no texto (sem diferenciar maiuscula nem acento). Busca vazia acha tudo. */
export function achaNaBusca(texto, busca) {
  return contemBusca(texto, busca);
}

// ---------------------------------------------------------------- publicacoes

export const FILTROS_DE_PUBLICACAO = [
  { valor: 'novas', rotulo: 'Novas', contar: true, tom: 'info' },
  { valor: 'com_prazo', rotulo: 'Com prazo', contar: true },
  { valor: 'sem_prazo', rotulo: 'Sem prazo', contar: true },
  { valor: 'todas', rotulo: 'Todas', contar: true },
];

export function publicacaoComPrazo(c) {
  return Boolean(c.prazo_id) || c.situacao === 'confirmada';
}

export function publicacaoSemPrazo(c) {
  return c.situacao === 'sem_prazo';
}

/** As publicacoes do filtro, na ordem recebida (a lista de dados.publicacoesRecentes() ja vem da mais recente para a mais antiga). */
export function publicacoesDoFiltro(comunicacoes, filtro) {
  switch (filtro) {
    case 'novas': return comunicacoes.filter(publicacaoNova);
    case 'com_prazo': return comunicacoes.filter(publicacaoComPrazo);
    case 'sem_prazo': return comunicacoes.filter(publicacaoSemPrazo);
    default: return [...comunicacoes];
  }
}

export function contagensDePublicacao(comunicacoes) {
  return {
    novas: comunicacoes.filter(publicacaoNova).length,
    com_prazo: comunicacoes.filter(publicacaoComPrazo).length,
    sem_prazo: comunicacoes.filter(publicacaoSemPrazo).length,
    todas: comunicacoes.length,
  };
}

/** O texto onde a busca procura numa publicacao: o titulo (tipo), o documento, a classe, o orgao, o tribunal, os clientes e o numero do processo. */
export function textoDeBuscaDaPublicacao(c, { clientes = [] } = {}) {
  return [c.tipo_comunicacao, c.tipo_documento, c.nome_classe, c.nome_orgao, c.sigla_tribunal, ...clientes, processoCNJ(c.processo_numero), somenteDigitos(c.processo_numero)]
    .filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- paginacao

/** { itens, restantes }: as primeiras `limite` linhas e quantas ficaram de fora. */
export function paginar(linhas, limite) {
  const n = Math.max(0, Math.trunc(Number(limite)) || 0);
  return { itens: linhas.slice(0, n), restantes: Math.max(0, linhas.length - n) };
}
