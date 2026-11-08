// CAMADA UNICA DE DADOS. As telas leem e mandam comandos so por aqui: nenhuma tela chama fetch, IndexedDB ou js/api.js.
//
// O que ela faz:
//  - baixa o espelho (pessoa, contato, processo, parte, prazo, evento, contrato, parcela inteiros; comunicacao so dos ultimos 180 dias e SEM o texto)
//    e guarda no IndexedDB, para o aplicativo abrir na hora e funcionar sem internet;
//  - mantem tudo em memoria: `obter('prazo')` devolve a lista na hora (sincrono, depois de `iniciar()`);
//  - sabe quando o COMPUTADOR sincronizou pela ultima vez (tabela estado_nuvem) e quando ESTE aparelho baixou (estado());
//  - manda comandos ao computador (enviarComando: situacao, conferir, editar e excluir prazo) e acompanha a resposta (comandosDoAlvo);
//  - traz o texto de uma publicacao so quando ela e aberta (carregarTextoPublicacao);
//  - oferece as juncoes que toda tela precisa (cliente do processo, partes, prazos de um processo, ordenacao).
//
// Regra de ouro: o dado local so muda quando o espelho muda. Um comando enviado NUNCA altera o prazo na tela: ele aparece como
// "pedido enviado" ate o computador aplicar e o espelho refletir.

import * as api from './api.js';
import * as auth from './auth.js';
import * as armazenamento from './idb.js';
import { epochDe, hojeEmCuiaba, somarDias, dataDoMomento, definirDesvioDoRelogio, agoraCerto } from './datas.js';
import {
  STATUS_ABERTOS, STATUS_ENCERRADOS, STATUS_DO_COMANDO, ordenarPorDataFatal, prazoAberto, prazoNaoConferido, situacaoDoPrazo,
  eventoPendente, publicacaoNova, CAMPOS_EDITAVEIS, LIMITE_DA_NOTA_DE_EDICAO, LIMITE_DA_NOTA_DE_EXCLUSAO, LIMITE_DE_BYTES_DO_PEDIDO,
  FRASE_NAO_EXCLUI_NAO_CUMPRIDO, analisarEdicaoDoPrazo, dataDoPrazoValida,
} from './dominio.js';

const TABELAS = armazenamento.TABELAS_DO_ESPELHO;
export const DIAS_DE_PUBLICACOES = 180;
export const LIMITE_COMPUTADOR_ATRASADO_MS = 3 * 60 * 60 * 1000;
export const INTERVALO_MINIMO_AO_VOLTAR_MS = 60 * 1000;
const COLUNAS_DA_LISTA_DE_PUBLICACOES = [
  'id', 'djen_id', 'hash', 'numero_comunicacao', 'processo_numero', 'processo_id', 'sigla_tribunal', 'nome_orgao', 'tipo_comunicacao',
  'tipo_documento', 'nome_classe', 'meio', 'data_disponibilizacao', 'link', 'situacao', 'prazo_id', 'coletada_em',
].join(',');
const VALIDADE_DOS_COMANDOS_MS = 7 * 24 * 60 * 60 * 1000;
const TEXTOS_EM_MEMORIA = 20;
const LIMITE_DA_NOTA = 1000;

// ---------------------------------------------------------------- estado

let memoria = Object.fromEntries(TABELAS.map((t) => [t, []]));
let versaoDosDados = 0;
let cacheDeIndices = new Map();
let cacheDeGrupos = new Map();
let computador = null;            // { atualizadoEm (texto), epoch, versao, contagens } ou null
let atualizadoLocalEm = null;     // quando ESTE aparelho baixou com sucesso (ms)
let ultimaTentativaEm = 0;
let comandos = [];
let iniciado = null;
let atualizando = null;
let temporizadorDosComandos = null;
const estadoInterno = { carregado: false, atualizando: false, progresso: null, offline: false, erro: null };
const ouvintes = new Set();
const textos = new Map();

function notificar() {
  for (const fn of [...ouvintes]) {
    try { fn(); } catch { /* um ouvinte com defeito nao derruba os outros */ }
  }
}

/** `fn()` roda sempre que algo mudar (dados novos, estado da sincronizacao, comandos). Devolve a funcao que desliga. */
export function aoMudar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

/** Hora de agora corrigida pelo relogio do servidor (se o aparelho estiver adiantado ou atrasado, a conta de "ha quanto tempo" continua certa). */
export function agoraCorrigido() {
  return agoraCerto();
}

/**
 * Fotografia do estado, sempre recalculada na hora:
 * { carregado, atualizando, progresso: {feitas,total}|null, offline, erro: texto|null, atualizadoLocalEm: ms|null,
 *   computador: { conhecido, atualizadoEm, epoch, versao, atrasoMs, atrasado } }
 * `computador.atrasado` fica verdadeiro quando o computador nao sincroniza ha mais de 3 horas (ou nunca sincronizou).
 */
export function estado() {
  const epoch = computador ? computador.epoch : null;
  const atrasoMs = epoch === null ? null : Math.max(0, agoraCorrigido() - epoch);
  return {
    ...estadoInterno,
    atualizadoLocalEm,
    computador: {
      conhecido: computador !== null,
      atualizadoEm: computador ? computador.atualizadoEm : null,
      epoch,
      versao: computador ? computador.versao : null,
      contagens: computador ? computador.contagens : {},
      atrasoMs,
      atrasado: atrasoMs === null || atrasoMs > LIMITE_COMPUTADOR_ATRASADO_MS,
    },
  };
}

// ---------------------------------------------------------------- leitura (sincrona, da memoria)

/** Lista de linhas da tabela (nao altere a lista devolvida). */
export function obter(tabela) {
  return memoria[tabela] || [];
}

/** Map id -> linha da tabela (montado uma vez por atualizacao). */
export function indice(tabela) {
  let mapa = cacheDeIndices.get(tabela);
  if (!mapa) {
    mapa = new Map(obter(tabela).map((l) => [l.id, l]));
    cacheDeIndices.set(tabela, mapa);
  }
  return mapa;
}

export function linha(tabela, id) {
  return indice(tabela).get(id) || null;
}

/** Map valor-da-coluna -> lista de linhas, para juncoes (ex.: agrupar('parte', 'processo_id')). */
export function agrupar(tabela, coluna) {
  const chave = `${tabela}.${coluna}`;
  let mapa = cacheDeGrupos.get(chave);
  if (!mapa) {
    mapa = new Map();
    for (const l of obter(tabela)) {
      const v = l[coluna];
      if (v === null || v === undefined) continue;
      if (!mapa.has(v)) mapa.set(v, []);
      mapa.get(v).push(l);
    }
    cacheDeGrupos.set(chave, mapa);
  }
  return mapa;
}

function trocarMemoria(novas) {
  memoria = { ...memoria, ...novas };
  versaoDosDados += 1;
  cacheDeIndices = new Map();
  cacheDeGrupos = new Map();
}

// ---------------------------------------------------------------- juncoes: processo -> partes -> clientes

/** [{ parte, pessoa }] do processo (pessoa pode ser null se o cadastro ainda nao chegou). */
export function partesDoProcesso(processoId) {
  return (agrupar('parte', 'processo_id').get(processoId) || []).map((parte) => ({ parte, pessoa: linha('pessoa', parte.pessoa_id) }));
}

/** Pessoas que o escritorio representa no processo (parte com cliente_escritorio = 1). */
export function clientesDoProcesso(processoId) {
  return partesDoProcesso(processoId)
    .filter(({ parte, pessoa }) => pessoa && Number(parte.cliente_escritorio) === 1)
    .map(({ pessoa }) => pessoa);
}

/**
 * O nome do cliente do processo para mostrar numa linha: "Maria Souza", "Maria Souza e mais 1" ou "" se nao houver cliente cadastrado.
 * Quando houver mais de um cliente, o primeiro (pela ordem de cadastro da parte) aparece e os outros viram a contagem.
 */
export function nomeDoClienteDoProcesso(processoId) {
  const clientes = clientesDoProcesso(processoId);
  if (!clientes.length) return '';
  return clientes.length === 1 ? clientes[0].nome : `${clientes[0].nome} e mais ${clientes.length - 1}`;
}

/** Quem esta do outro lado: partes que nao sao do escritorio. */
export function contrariosDoProcesso(processoId) {
  return partesDoProcesso(processoId).filter(({ parte, pessoa }) => pessoa && Number(parte.cliente_escritorio) !== 1).map(({ pessoa }) => pessoa);
}

export function processosDaPessoa(pessoaId) {
  const ids = new Set((agrupar('parte', 'pessoa_id').get(pessoaId) || []).map((p) => p.processo_id));
  return [...ids].map((id) => linha('processo', id)).filter(Boolean);
}

export function contatosDaPessoa(pessoaId) {
  return [...(agrupar('contato', 'pessoa_id').get(pessoaId) || [])].sort((a, b) => Number(b.principal) - Number(a.principal) || String(a.tipo).localeCompare(String(b.tipo)));
}

export function contratosDaPessoa(pessoaId) {
  return agrupar('contrato', 'pessoa_id').get(pessoaId) || [];
}

export function parcelasDoContrato(contratoId) {
  return [...(agrupar('parcela', 'contrato_id').get(contratoId) || [])].sort((a, b) => Number(a.numero) - Number(b.numero));
}

export function prazosDoProcesso(processoId) {
  return ordenarPorDataFatal(agrupar('prazo', 'processo_id').get(processoId) || []);
}

export function eventosDoProcesso(processoId) {
  return [...(agrupar('evento', 'processo_id').get(processoId) || [])].sort((a, b) => epochDe(a.inicio) - epochDe(b.inicio));
}

export function publicacoesDoProcesso(processoId) {
  return [...(agrupar('comunicacao', 'processo_id').get(processoId) || [])].sort(maisRecentePrimeiro);
}

/** Publicacao do DJEN que deu origem ao prazo (ou null: prazo digitado a mao, calculadora, importacao). */
export function publicacaoDoPrazo(prazo) {
  if (prazo.comunicacao_id) {
    const direta = linha('comunicacao', prazo.comunicacao_id);
    if (direta) return direta;
  }
  return (agrupar('comunicacao', 'prazo_id').get(prazo.id) || [])[0] || null;
}

// ---------------------------------------------------------------- consultas de uso comum

/** Prazos com a situacao calculada para `hoje`: { chave, dias }. Mais urgente primeiro. */
export function prazosComSituacao(hoje = hojeEmCuiaba()) {
  return ordenarPorDataFatal(obter('prazo')).map((prazo) => ({ prazo, situacao: situacaoDoPrazo(prazo, hoje) }));
}

/** { vencidos, hoje, proximos, futuros, encerrados, naoConferidos } (listas de prazos, ordenadas por data fatal). */
export function prazosPorSituacao(hoje = hojeEmCuiaba()) {
  const grupos = { vencidos: [], hoje: [], proximos: [], futuros: [], encerrados: [], naoConferidos: [] };
  const destino = { vencido: 'vencidos', hoje: 'hoje', proximo: 'proximos', futuro: 'futuros', encerrado: 'encerrados' };
  for (const { prazo, situacao } of prazosComSituacao(hoje)) {
    grupos[destino[situacao.chave]].push(prazo);
    if (prazoNaoConferido(prazo)) grupos.naoConferidos.push(prazo);
  }
  return grupos;
}

export function prazosAbertos() {
  return ordenarPorDataFatal(obter('prazo').filter(prazoAberto));
}

/** Eventos agendados que comecam no dia `iso` (data de Cuiaba), por hora de inicio. */
export function eventosDoDia(iso) {
  return eventosEntre(iso, iso);
}

/** Eventos agendados que comecam entre os dias `deIso` e `ateIso` (inclusive, data de Cuiaba), por hora de inicio. */
export function eventosEntre(deIso, ateIso) {
  return obter('evento')
    .filter((e) => eventoPendente(e) && dataDoMomento(e.inicio) !== null && dataDoMomento(e.inicio) >= deIso && dataDoMomento(e.inicio) <= ateIso)
    .sort((a, b) => epochDe(a.inicio) - epochDe(b.inicio) || String(a.id).localeCompare(String(b.id)));
}

function maisRecentePrimeiro(a, b) {
  return String(b.data_disponibilizacao).localeCompare(String(a.data_disponibilizacao)) || String(b.coletada_em || '').localeCompare(String(a.coletada_em || '')) || String(b.id).localeCompare(String(a.id));
}

/** Publicacoes que esperam leitura (novas ou em revisao), mais recentes primeiro. */
export function publicacoesNovas() {
  return obter('comunicacao').filter(publicacaoNova).sort(maisRecentePrimeiro);
}

export function publicacoesRecentes() {
  return [...obter('comunicacao')].sort(maisRecentePrimeiro);
}

// ---------------------------------------------------------------- texto da publicacao (sob demanda)

/**
 * O texto de uma publicacao, buscado na nuvem so quando ela e aberta. Guardado apenas na memoria desta visita (nunca no IndexedDB).
 * Devolve { texto, original, editado }: `texto` e o editado, se houver, senao o original. Levanta ErroApi (rede ou outro).
 */
export async function carregarTextoPublicacao(id) {
  if (textos.has(id)) {
    const guardado = textos.get(id);
    textos.delete(id);
    textos.set(id, guardado);   // volta para o fim: o mais antigo sai primeiro
    return guardado;
  }
  const { linhas } = await auth.comSessao((token) => api.ler('comunicacao', {
    token, select: 'id,texto_original,texto_editado', filtros: [api.filtro.igual('id', id)], limite: 1,
  }));
  const bruto = linhas[0] || {};
  const resultado = {
    original: String(bruto.texto_original ?? ''),
    editado: bruto.texto_editado ? String(bruto.texto_editado) : '',
    texto: String(bruto.texto_editado || bruto.texto_original || ''),
  };
  textos.set(id, resultado);
  while (textos.size > TEXTOS_EM_MEMORIA) textos.delete(textos.keys().next().value);
  return resultado;
}

// ---------------------------------------------------------------- iniciar e atualizar

function guardarEstadoDoComputador(linhaDoEstado) {
  if (!linhaDoEstado) {
    computador = null;
    return;
  }
  const atualizadoEm = linhaDoEstado.atualizado_em || null;
  computador = {
    atualizadoEm,
    epoch: atualizadoEm ? epochDe(atualizadoEm) : null,
    versao: linhaDoEstado.pc_versao || null,
    contagens: linhaDoEstado.contagens && typeof linhaDoEstado.contagens === 'object' ? linhaDoEstado.contagens : {},
  };
  if (!Number.isFinite(computador.epoch)) computador.epoch = null;
}

/** Abre o armazenamento local e carrega o que ja estava guardado (cache). Seguro chamar varias vezes. Devolve { temCache }. */
export function iniciar() {
  if (iniciado) return iniciado;
  iniciado = (async () => {
    const lidas = await Promise.all(TABELAS.map((t) => armazenamento.lerTudo(t)));
    const guardadas = Object.fromEntries(TABELAS.map((t, i) => [t, lidas[i]]));
    const quando = await armazenamento.lerMeta('atualizado_local_em');
    const estadoGuardado = await armazenamento.lerMeta('estado_nuvem');
    const usuario = await armazenamento.lerMeta('usuario_id');
    const atual = auth.usuarioAtual();
    if (usuario && atual && atual.id && usuario !== atual.id) {
      await esquecerTudo();   // cache de outra pessoa neste aparelho: nunca mostrar
      return { temCache: false };
    }
    const temCache = Number.isFinite(quando) && quando > 0;
    if (temCache) {
      trocarMemoria(guardadas);
      atualizadoLocalEm = quando;
      guardarEstadoDoComputador(estadoGuardado);
      estadoInterno.carregado = true;
    }
    const todosOsComandos = await armazenamento.lerTudo(armazenamento.LOJA_COMANDOS);
    const limite = Date.now() - VALIDADE_DOS_COMANDOS_MS;
    comandos = [];
    for (const c of todosOsComandos) {
      if (c.enviado_em < limite) await armazenamento.apagar(armazenamento.LOJA_COMANDOS, c.id);
      else comandos.push(c);
    }
    notificar();
    agendarAcompanhamento();
    return { temCache };
  })();
  return iniciado;
}

async function baixarTudo(aoProgresso) {
  const desde = somarDias(hojeEmCuiaba(), -DIAS_DE_PUBLICACOES);
  const trabalhos = TABELAS.map((tabela) => ({
    tabela,
    rodar: () => auth.comSessao((token) => (tabela === 'comunicacao'
      ? api.lerTudo('comunicacao', { token, select: COLUNAS_DA_LISTA_DE_PUBLICACOES, filtros: [api.filtro.maiorOuIgual('data_disponibilizacao', desde)] })
      : api.lerTudo(tabela, { token }))),
  }));
  // O carimbo "o computador sincronizou agora". Se so ele falhar (sem permissao, por exemplo), o resto continua e o aviso fica "desconhecido".
  trabalhos.push({
    tabela: 'estado_nuvem',
    rodar: () => auth.comSessao((token) => api.ler('estado_nuvem', { token, limite: 1 }))
      .then((r) => ({ linha: r.linhas[0] || null, hora: r.horaDoServidor, horaDoAparelho: Date.now() }))
      .catch((erro) => {
        if (erro instanceof api.ErroApi && (erro.rede || erro.status === 401)) throw erro;
        return { linha: null, hora: null };
      }),
  });
  const resultados = {};
  let feitas = 0;
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < trabalhos.length) {
      const t = trabalhos[proximo];
      proximo += 1;
      resultados[t.tabela] = await t.rodar();
      feitas += 1;
      aoProgresso(feitas, trabalhos.length);
    }
  };
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
  return resultados;
}

/**
 * Baixa o espelho inteiro. Devolve { ok, offline, erro }. Se falhar, os dados que ja estavam continuam (nada e trocado pela metade).
 * Pode ser chamada a qualquer momento: se ja houver uma atualizacao andando, devolve a mesma promessa.
 */
export function atualizar() {
  if (atualizando) return atualizando;
  atualizando = (async () => {
    await iniciar();
    estadoInterno.atualizando = true;
    estadoInterno.progresso = { feitas: 0, total: TABELAS.length + 1 };
    estadoInterno.erro = null;
    ultimaTentativaEm = Date.now();
    notificar();
    try {
      const r = await baixarTudo((feitas, total) => { estadoInterno.progresso = { feitas, total }; notificar(); });
      const novas = Object.fromEntries(TABELAS.map((t) => [t, r[t]]));
      const quando = Date.now();
      const usuario = auth.usuarioAtual();
      trocarMemoria(novas);
      guardarEstadoDoComputador(r.estado_nuvem.linha);
      if (Number.isFinite(r.estado_nuvem.hora)) definirDesvioDoRelogio(r.estado_nuvem.hora - (r.estado_nuvem.horaDoAparelho || quando));
      atualizadoLocalEm = quando;
      estadoInterno.carregado = true;
      estadoInterno.offline = false;
      const gravadas = await Promise.all(TABELAS.map((t) => armazenamento.substituirLoja(t, novas[t])));
      // Carimbo "dados de HH:MM" so com a copia COMPLETA no aparelho: se uma tabela nao coube (espaco, navegador), a tela segue com os dados novos
      // em memoria, mas o que fica guardado nao pode ser apresentado como copia desta hora.
      if (gravadas.every(Boolean)) {
        await armazenamento.gravarMeta('atualizado_local_em', quando);
        await armazenamento.gravarMeta('estado_nuvem', r.estado_nuvem.linha);
        if (usuario && usuario.id) await armazenamento.gravarMeta('usuario_id', usuario.id);
      }
      return { ok: true, offline: false, erro: null };
    } catch (erro) {
      const rede = erro instanceof api.ErroApi && erro.rede;
      estadoInterno.offline = rede;
      estadoInterno.erro = rede ? null : api.mensagemDeErro(erro);
      return { ok: false, offline: rede, erro: estadoInterno.erro };
    } finally {
      estadoInterno.atualizando = false;
      estadoInterno.progresso = null;
      atualizando = null;
      notificar();
    }
  })();
  return atualizando;
}

/** Atualiza se a ultima tentativa foi ha mais de 60 s (usado ao voltar para o aplicativo). */
export function atualizarSeVelho() {
  if (Date.now() - ultimaTentativaEm < INTERVALO_MINIMO_AO_VOLTAR_MS) return Promise.resolve(null);
  return atualizar();
}

/** Apaga TUDO que o aplicativo guardou neste aparelho (memoria e IndexedDB). Chamado ao sair. */
export async function esquecerTudo() {
  if (temporizadorDosComandos) window.clearTimeout(temporizadorDosComandos);
  temporizadorDosComandos = null;
  memoria = Object.fromEntries(TABELAS.map((t) => [t, []]));
  versaoDosDados += 1;
  cacheDeIndices = new Map();
  cacheDeGrupos = new Map();
  computador = null;
  atualizadoLocalEm = null;
  comandos = [];
  textos.clear();
  estadoInterno.carregado = false;
  estadoInterno.offline = false;
  estadoInterno.erro = null;
  iniciado = null;
  await armazenamento.apagarTudo();
  notificar();
}
auth.aoSair(esquecerTudo);

// ---------------------------------------------------------------- comandos para o computador

/** Erro de um pedido mal feito, ANTES de sair do aparelho. `.message` ja e uma frase simples para mostrar. */
export class ErroDeComando extends Error {}

/** A anotacao (opcional) de um pedido de editar ou excluir: texto de ate `limite` letras. Devolve o texto sem espacos nas pontas ('' se nao ha). */
function anotacaoDoPedido(d, limite) {
  if (d.nota === undefined || d.nota === null) return '';
  if (typeof d.nota !== 'string') throw new ErroDeComando('A anotação precisa ser um texto.');
  const nota = d.nota.trim();
  if (nota.length > limite) throw new ErroDeComando(`A anotação pode ter até ${limite} letras.`);
  return nota;
}

/** A nuvem recusa dados grandes (4000 bytes): melhor dizer isso aqui, em frase simples, do que deixar o pedido falhar na rede. */
function conferirTamanhoDoPedido(saida) {
  if (new TextEncoder().encode(JSON.stringify(saida)).length > LIMITE_DE_BYTES_DO_PEDIDO) {
    throw new ErroDeComando('O pedido ficou grande demais. Escreva menos na observação ou na anotação.');
  }
  return saida;
}

/** prazo_editar: pelo menos um de ato, data_fatal, data_interna e observacao (mais nota). As mesmas regras do computador (app/nuvem/comandos.py). */
function validarEdicao(alvoId, d) {
  const permitidas = new Set([...CAMPOS_EDITAVEIS, 'nota']);
  if (Object.keys(d).some((k) => !permitidas.has(k))) throw new ErroDeComando('O pedido traz dados que o celular não pode mandar.');
  const campos = Object.fromEntries(CAMPOS_EDITAVEIS.filter((c) => Object.prototype.hasOwnProperty.call(d, c)).map((c) => [c, d[c]]));
  if (!Object.keys(campos).length) throw new ErroDeComando('Escolha o que mudar no prazo.');
  const { erros, tudo } = analisarEdicaoDoPrazo(campos, linha('prazo', alvoId), { conferirTodos: true });
  const primeiro = CAMPOS_EDITAVEIS.find((c) => erros[c]);
  if (primeiro) throw new ErroDeComando(erros[primeiro]);
  const nota = anotacaoDoPedido(d, LIMITE_DA_NOTA_DE_EDICAO);
  return conferirTamanhoDoPedido({ ...tudo, ...(nota ? { nota } : {}) });
}

/** prazo_excluir: so a anotacao. Prazo "Nao cumprido" nao sai (o registro fica para controle). */
function validarExclusao(alvoId, d) {
  if (Object.keys(d).some((k) => k !== 'nota')) throw new ErroDeComando('O pedido traz dados que o celular não pode mandar.');
  const nota = anotacaoDoPedido(d, LIMITE_DA_NOTA_DE_EXCLUSAO);
  const prazo = linha('prazo', alvoId);
  if (prazo && prazo.status === 'perdido') throw new ErroDeComando(FRASE_NAO_EXCLUI_NAO_CUMPRIDO);
  return nota ? { nota } : {};
}

function validarComando(tipo, alvoId, dados) {
  if (typeof alvoId !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(alvoId)) throw new ErroDeComando('Não foi possível identificar o prazo.');
  const d = dados && typeof dados === 'object' && !Array.isArray(dados) ? dados : {};
  if (tipo === 'prazo_editar') return validarEdicao(alvoId, d);
  if (tipo === 'prazo_excluir') return validarExclusao(alvoId, d);
  const nota = typeof d.nota === 'string' ? d.nota.trim() : '';
  if (nota.length > LIMITE_DA_NOTA) throw new ErroDeComando(`A anotação pode ter até ${LIMITE_DA_NOTA} letras.`);
  if (tipo === 'prazo_conferir') {
    // data_vista: a data fatal que a pessoa viu ao confirmar. Sem ela o computador nao sabe qual data foi conferida; a tela sempre a manda.
    // (Chamada sem `data_vista` usa a data que o espelho tem agora.) O computador recusa se a data dele ja for outra.
    const prazo = linha('prazo', alvoId);
    const vista = d.data_vista !== undefined && d.data_vista !== null ? d.data_vista : (prazo ? prazo.data_fatal : null);
    let dataVista = null;
    if (vista !== null && vista !== undefined && vista !== '') {
      dataVista = typeof vista === 'string' ? vista.trim() : '';
      if (!dataDoPrazoValida(dataVista)) throw new ErroDeComando('O celular não consegue ler a data fatal deste prazo. Veja o prazo no computador.');
    }
    return { ...(dataVista ? { data_vista: dataVista } : {}), ...(nota ? { nota } : {}) };
  }
  if (tipo !== 'prazo_status') throw new ErroDeComando('Pedido desconhecido.');
  if (!STATUS_DO_COMANDO.includes(d.status)) throw new ErroDeComando('Situação desconhecida.');
  const prazo = linha('prazo', alvoId);
  const reabrindo = prazo && STATUS_ENCERRADOS.includes(prazo.status) && STATUS_ABERTOS.includes(d.status);
  if (d.status === 'perdido' && !nota) throw new ErroDeComando('Para marcar como não cumprido, escreva o motivo.');
  if (reabrindo && !nota) throw new ErroDeComando('Para reabrir o prazo, escreva o motivo.');
  const saida = { status: d.status };
  if (nota) saida.nota = nota;
  if (d.protocolado_em) {
    if (d.status !== 'protocolado') throw new ErroDeComando('A data do protocolo só vale para prazo protocolado.');
    if (!Number.isFinite(epochDe(d.protocolado_em))) throw new ErroDeComando('A data do protocolo não está certa.');
    saida.protocolado_em = d.protocolado_em;
  }
  return saida;
}

/**
 * Pede ao computador para fazer algo. NAO muda nada na tela nem nos dados: o computador aplica quando estiver ligado e o espelho
 * reflete depois. Tipos (dados):
 *   'prazo_status'   { status: aberto|em_producao|protocolado|cumprido|perdido, nota?, protocolado_em? }
 *                    "perdido" (Nao cumprido) exige `nota` com o motivo; reabrir um prazo encerrado exige `nota`.
 *   'prazo_conferir' { data_vista?, nota? }   o advogado conferiu a data fatal. `data_vista` (AAAA-MM-DD) e a data que ele tinha na tela ao
 *                    confirmar: o computador so confere se a data fatal dele ainda for essa (se um pedido de edicao a mudou antes, recusa).
 *   'prazo_editar'   { ato?, data_fatal?, data_interna?, observacao?, nota? }   pelo menos um dos quatro primeiros (data interna e observacao
 *                    vazias ou nulas = tirar). So o que mudou deve ir. O celular PEDE a mudanca (inclusive da data fatal); quem aplica e o
 *                    computador, que zera a conferencia: o prazo volta a "nao conferido" ate o advogado conferir de novo.
 *   'prazo_excluir'  { nota? }   tira o prazo de tudo (o registro continua guardado no sistema; nao ha como desfazer pela tela). Prazo "Nao cumprido" nao sai.
 * Devolve o comando guardado { id, tipo, alvo_id, dados, enviado_em, estado: 'enviado', ... }.
 * Levanta ErroDeComando (pedido mal feito) ou ErroApi (sem internet, sem permissao...). Nao ha fila offline de proposito.
 */
export async function enviarComando(tipo, alvoId, dados = {}) {
  const limpos = validarComando(tipo, alvoId, dados);
  const criado = await auth.comSessao((token) => api.inserir('comando_celular', { tipo, alvo_id: alvoId, dados: limpos }, { token }));
  if (!criado || typeof criado.id !== 'string') throw new api.ErroApi('resposta sem id', { status: 0, codigo: 'resposta_invalida' });
  const comando = {
    id: criado.id, tipo, alvo_id: alvoId, dados: limpos, criado_em: criado.criado_em || null,
    enviado_em: Date.now(), estado: 'enviado', resultado: null, aplicado_em: null,
  };
  comandos = [comando, ...comandos];
  await armazenamento.gravar(armazenamento.LOJA_COMANDOS, comando);
  notificar();
  agendarAcompanhamento();
  return comando;
}

/** Comandos deste alvo (por exemplo um prazo), do mais novo para o mais antigo: pendentes, aplicados e recusados dos ultimos 7 dias. */
export function comandosDoAlvo(alvoId) {
  return comandos.filter((c) => c.alvo_id === alvoId).sort((a, b) => b.enviado_em - a.enviado_em);
}

export function comandosPendentes() {
  return comandos.filter((c) => c.estado === 'enviado');
}

/** Tira da lista um comando ja respondido (o botao "Entendi" do aviso). Comando pendente nao sai. */
export async function dispensarComando(id) {
  const c = comandos.find((x) => x.id === id);
  if (!c || c.estado === 'enviado') return;
  comandos = comandos.filter((x) => x.id !== id);
  await armazenamento.apagar(armazenamento.LOJA_COMANDOS, id);
  notificar();
}

async function consultarComandos() {
  const pendentes = comandosPendentes();
  if (!pendentes.length) return;
  const { linhas } = await auth.comSessao((token) => api.ler('comando_celular', {
    token, select: 'id,aplicado_em,ok,resultado', filtros: [api.filtro.em('id', pendentes.map((c) => c.id))],
  }));
  let aplicouAlgum = false;
  for (const resposta of linhas) {
    const c = comandos.find((x) => x.id === resposta.id);
    if (!c || !resposta.aplicado_em) continue;
    c.estado = resposta.ok ? 'aplicado' : 'recusado';
    c.aplicado_em = resposta.aplicado_em;
    c.resultado = resposta.resultado ? String(resposta.resultado) : null;
    aplicouAlgum = aplicouAlgum || resposta.ok === true;
    await armazenamento.gravar(armazenamento.LOJA_COMANDOS, c);
  }
  notificar();
  if (aplicouAlgum) atualizar();   // o espelho costuma refletir logo depois; se ainda nao, a proxima atualizacao pega
}

function agendarAcompanhamento() {
  if (temporizadorDosComandos) window.clearTimeout(temporizadorDosComandos);
  temporizadorDosComandos = null;
  const pendentes = comandosPendentes();
  if (!pendentes.length || !auth.temSessaoCompleta()) return;
  const maisAntigo = Math.min(...pendentes.map((c) => c.enviado_em));
  const idade = Date.now() - maisAntigo;
  const espera = idade < 60 * 1000 ? 4000 : idade < 10 * 60 * 1000 ? 15000 : 60000;
  temporizadorDosComandos = window.setTimeout(async () => {
    temporizadorDosComandos = null;
    if (document.visibilityState === 'visible') {
      try { await consultarComandos(); } catch { /* sem internet agora: tenta na proxima rodada */ }
    }
    agendarAcompanhamento();
  }, espera);
}

/** Consulta ja, sem esperar o relogio (usado ao voltar para a tela e por quem acabou de enviar). */
export function acompanharComandosAgora() {
  return consultarComandos().catch(() => {});
}
