// Conversa com o Supabase por fetch, sem biblioteca. Camada de baixo: nao sabe de sessao nem de tela.
// Quem tem sessao e renova o login e js/auth.js; quem guarda dados e js/dados.js. As telas NAO chamam este arquivo: usam js/dados.js.
//
// Endereco e chave publica vem so de ../config.js. Nada aqui le endereco de parametro de URL, de armazenamento ou da tela.

import { SUPABASE_URL, SUPABASE_CHAVE_PUBLICA } from '../config.js';
import { epochDeDataHttp, definirDesvioDoRelogio } from './datas.js';

const TEMPO_LIMITE_MS = 20000;
export const TAMANHO_DA_PAGINA = 1000;   // o servidor corta em 1000 linhas por resposta
const PADRAO_NOME = /^[a-z_][a-z0-9_]{0,60}$/;

/** Falha de uma chamada. `rede` = nem chegou ao servidor (sem internet, tempo esgotado). `status` = codigo HTTP (0 se rede). */
export class ErroApi extends Error {
  constructor(mensagem, { status = 0, codigo = '', rede = false, detalhe = null } = {}) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.codigo = codigo;
    this.rede = rede;
    this.detalhe = detalhe;
  }
}

/** Frase simples para mostrar a quem usa. Nunca repete o texto tecnico do servidor. */
export function mensagemDeErro(erro) {
  if (!(erro instanceof ErroApi)) return 'Não foi possível concluir. Tente de novo.';
  if (erro.rede) return 'Sem conexão com a internet.';
  if (erro.status === 401) return 'Sua sessão terminou. Entre de novo.';
  if (erro.status === 403) return 'Este acesso não tem permissão para isso.';
  if (erro.status === 429) return 'Muitas tentativas seguidas. Espere um pouco e tente de novo.';
  if (erro.status >= 500) return 'A nuvem está com problema agora. Tente de novo em instantes.';
  return 'Não foi possível concluir. Tente de novo.';
}

async function requisitar(url, { metodo = 'GET', corpo, token, cabecalhos = {}, tempoLimiteMs = TEMPO_LIMITE_MS } = {}) {
  const controle = new AbortController();
  const relogio = window.setTimeout(() => controle.abort(), tempoLimiteMs);
  const cab = { apikey: SUPABASE_CHAVE_PUBLICA, Accept: 'application/json', ...cabecalhos };
  if (token) cab.Authorization = `Bearer ${token}`;
  if (corpo !== undefined) cab['Content-Type'] = 'application/json';
  let resposta;
  let texto = '';
  try {
    resposta = await fetch(url, {
      method: metodo,
      headers: cab,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controle.signal,
    });
    // Toda resposta que traz a hora do servidor (cabecalho Date) corrige o relogio do aplicativo: aparelho com a hora errada nao pode dizer "hoje" no dia
    // errado nem renovar o token a toda hora. Se o cabecalho nao estiver exposto (CORS), nada muda.
    const horaDoServidor = epochDeDataHttp(resposta.headers.get('date') || '');
    if (Number.isFinite(horaDoServidor)) definirDesvioDoRelogio(horaDoServidor - Date.now());
    texto = await resposta.text();
  } catch {
    throw new ErroApi('sem rede', { rede: true });
  } finally {
    window.clearTimeout(relogio);
  }
  let dados = null;
  if (texto) {
    try {
      dados = JSON.parse(texto);
    } catch {
      dados = null;
    }
  }
  if (!resposta.ok) {
    const corpoErro = dados && typeof dados === 'object' ? dados : {};
    throw new ErroApi(String(corpoErro.msg || corpoErro.message || corpoErro.error_description || 'falha'), {
      status: resposta.status,
      codigo: String(corpoErro.error_code || corpoErro.code || corpoErro.error || ''),
      detalhe: corpoErro,
    });
  }
  return { status: resposta.status, cabecalhos: resposta.headers, dados };
}

/** Chamada ao login (GoTrue): /auth/v1/<caminho>. `token` so quando o endpoint pede o usuario logado. */
export function chamarAuth(metodo, caminho, { corpo, token } = {}) {
  return requisitar(`${SUPABASE_URL}/auth/v1${caminho}`, { metodo, corpo, token });
}

// ---------------------------------------------------------------- filtros (PostgREST)

function valorDeFiltro(v) {
  const t = String(v);
  return /[,()"\\]/.test(t) ? `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : t;
}

/** Montadores de filtro: cada um devolve [coluna, 'operador.valor'] para a lista `filtros` de ler/lerTudo. */
export const filtro = {
  igual: (coluna, valor) => [coluna, `eq.${valor}`],
  nulo: (coluna) => [coluna, 'is.null'],
  naoNulo: (coluna) => [coluna, 'not.is.null'],
  em: (coluna, lista) => [coluna, `in.(${lista.map(valorDeFiltro).join(',')})`],
  maiorOuIgual: (coluna, valor) => [coluna, `gte.${valor}`],
  menorOuIgual: (coluna, valor) => [coluna, `lte.${valor}`],
  contem: (coluna, texto) => [coluna, `ilike.*${String(texto).replace(/[*%]/g, '')}*`],
};

function enderecoDaTabela(tabela, { select = '*', filtros = [], ordem = null, limite = null, deslocamento = null } = {}) {
  if (!PADRAO_NOME.test(tabela)) throw new Error('nome de tabela invalido');
  const parametros = new URLSearchParams();
  parametros.set('select', select);
  for (const [coluna, valor] of filtros) {
    if (!PADRAO_NOME.test(coluna)) throw new Error('nome de coluna invalido');
    parametros.append(coluna, valor);
  }
  if (ordem) parametros.set('order', ordem);
  if (limite !== null) parametros.set('limit', String(limite));
  if (deslocamento !== null) parametros.set('offset', String(deslocamento));
  return `${SUPABASE_URL}/rest/v1/${tabela}?${parametros.toString()}`;
}

function totalDoCabecalho(cabecalhos) {
  const faixa = cabecalhos.get('content-range') || '';
  const total = Number(faixa.split('/')[1]);
  return Number.isFinite(total) ? total : null;
}

/**
 * Uma pagina de linhas: { linhas, total, horaDoServidor }. `total` so com `contar`, senao null. `horaDoServidor` (ms) vem do cabecalho
 * Date da resposta, ou null: serve para o aplicativo corrigir um relogio de aparelho errado.
 */
export async function ler(tabela, { token, contar = false, ...opcoes } = {}) {
  const resposta = await requisitar(enderecoDaTabela(tabela, opcoes), {
    token,
    cabecalhos: contar ? { Prefer: 'count=exact' } : {},
  });
  const hora = epochDeDataHttp(resposta.cabecalhos.get('date') || '');
  return {
    linhas: Array.isArray(resposta.dados) ? resposta.dados : [],
    total: contar ? totalDoCabecalho(resposta.cabecalhos) : null,
    horaDoServidor: Number.isFinite(hora) ? hora : null,
  };
}

/**
 * Todas as linhas, de pagina em pagina (1000 por vez). Confere o total que o servidor anunciou: se faltar linha (o computador
 * sincronizou no meio da leitura), le tudo de novo, ate 3 vezes, e so entao desiste com erro. Prazo faltando e risco; nunca aceitamos silencio.
 * `ordem` precisa ser estavel (por padrao `id`).
 */
export async function lerTudo(tabela, { token, ordem = 'id.asc', ...opcoes } = {}) {
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    const porId = new Map();
    let total = null;
    for (let pagina = 0; pagina < 500; pagina += 1) {
      const { linhas, total: t } = await ler(tabela, { ...opcoes, token, ordem, limite: TAMANHO_DA_PAGINA, deslocamento: pagina * TAMANHO_DA_PAGINA, contar: pagina === 0 });
      if (pagina === 0) total = t;
      for (const linha of linhas) porId.set(linha.id, linha);
      if (linhas.length < TAMANHO_DA_PAGINA) break;
    }
    if (total === null || porId.size === total) return [...porId.values()];
  }
  throw new ErroApi('leitura incompleta', { status: 0, codigo: 'leitura_incompleta' });
}

/** Grava uma linha e devolve a linha criada (o servidor atribui o id). */
export async function inserir(tabela, linha, { token } = {}) {
  if (!PADRAO_NOME.test(tabela)) throw new Error('nome de tabela invalido');
  const resposta = await requisitar(`${SUPABASE_URL}/rest/v1/${tabela}`, {
    metodo: 'POST',
    corpo: linha,
    token,
    cabecalhos: { Prefer: 'return=representation' },
  });
  return Array.isArray(resposta.dados) ? resposta.dados[0] : resposta.dados;
}
