// Telas de Processos: a lista com busca (#/processos) e o detalhe (#/processo/ID).
//
// Lista: busca local e rapida por numero (em qualquer formato, com ou sem pontuacao, inteiro ou so um pedaco), nome de cliente ou de
// parte, acao, vara ou foro. Sem busca, mostra os processos alterados por ultimo. O texto da busca e lembrado quando a pessoa abre um
// processo e volta.
// Detalhe: numero com botao copiar, cliente, situacao (sobrestado com tema, motivo e desde quando), julgamento marcado, prazos (abertos
// primeiro; toque abre o prazo), agenda do processo, publicacoes recentes, partes por polo com o cliente marcado, dados do processo,
// processo de origem e observacoes.
//
// Tudo que vem da nuvem (nomes, observacoes, motivos) entra como TEXTO. A logica da busca e pura e exportada: o teste a roda no navegador.

import { registrar, href } from '../rotas.js';
import * as dados from '../dados.js';
import { h, preencher, copiarTexto, anunciar, novoId } from '../ui.js';
import { icone } from '../icones.js';
import { dataBR, dataComDia, dataDoMomento, dataValida, diferencaDias, hojeEmCuiaba, horaDoMomento } from '../datas.js';
import { dinheiro, plural, processoCNJ, semAcento, somenteDigitos } from '../formato.js';
import { prazoAberto, prazoNaoConferido, situacaoDoPrazo } from '../dominio.js';
import { cartao } from '../componentes/cartao.js';
import { lista, linhaDeLista, linhaDePrazo, linhaDePublicacao, numeroDoProcesso } from '../componentes/linha.js';
import { selo, seloNaoConferido } from '../componentes/selo.js';
import { vazio } from '../componentes/vazio.js';
import { avisoDeCarga } from '../componentes/carga.js';
import { fotografiaDosDados, dadosMudaram } from '../componentes/fotografia-dos-dados.js';
import { linhaDoEvento, abrirDetalheDoEvento, diaDeInicioDoEvento } from '../componentes/evento-detalhe.js';

export const LIMITE_DE_RESULTADOS = 60;
export const LIMITE_DE_RECENTES = 30;
const ITENS_VISIVEIS_NO_DETALHE = 5;
const MINUTOS_PARA_LEMBRAR = 30;
const TABELAS_DA_LISTA = ['processo', 'parte', 'pessoa', 'prazo'];
const TABELAS_DO_DETALHE = ['processo', 'parte', 'pessoa', 'prazo', 'evento', 'comunicacao'];

// ---------------------------------------------------------------- busca (logica pura)

function maisRecenteDoQueOutro(a, b) {
  return String(b.atualizado_em || b.criado_em || '').localeCompare(String(a.atualizado_em || a.criado_em || '')) || String(a.numero).localeCompare(String(b.numero));
}

/**
 * Monta o indice de busca: uma entrada por processo, na ordem "alterado por ultimo primeiro".
 * `partesPorProcesso`: Map processo_id -> lista de partes; `pessoaPorId`: Map id -> pessoa.
 * Cada entrada: { processo, digitos (so os numeros do processo), texto (tudo que se busca, sem acento e em minusculas), textoClientes }.
 */
export function montarIndiceDeBusca(processos, partesPorProcesso, pessoaPorId) {
  return [...processos].sort(maisRecenteDoQueOutro).map((processo) => {
    const clientes = [];
    const outros = [];
    for (const parte of partesPorProcesso.get(processo.id) || []) {
      const pessoa = pessoaPorId.get(parte.pessoa_id);
      if (pessoa && pessoa.nome) (Number(parte.cliente_escritorio) === 1 ? clientes : outros).push(pessoa.nome);
    }
    const texto = [
      processoCNJ(processo.numero), processo.numero, processo.acao_descricao, processo.orgao_julgador, processo.foro, processo.tribunal_codigo,
      processo.uf, processo.sobrestado_tema, ...clientes, ...outros,
    ].filter(Boolean).join(' ');
    return { processo, digitos: somenteDigitos(processo.numero), texto: semAcento(texto), textoClientes: semAcento(clientes.join(' ')) };
  });
}

/** Cada palavra da busca: { palavra (sem acento), digitos } ; `digitos` so existe quando a palavra e numero (ex.: 9000012-45.2024). */
export function palavrasDaBusca(termo) {
  return String(termo ?? '').trim().split(/\s+/).filter(Boolean).map((p) => ({
    palavra: semAcento(p),
    digitos: /^[\d.\-/]+$/.test(p) && /\d/.test(p) ? somenteDigitos(p) : '',
  }));
}

/**
 * Procura no indice. Todas as palavras precisam aparecer. Palavra que e numero casa com os numeros do processo (com ou sem pontos);
 * as outras casam com nomes, acao, vara e foro, sem diferenciar maiuscula nem acento. Ordem: achou pelo numero, depois achou pelo
 * nome do cliente, depois o resto, sempre mantendo a ordem de "alterado por ultimo". Devolve a lista de processos.
 */
export function buscarNoIndice(indice, termo) {
  const palavras = palavrasDaBusca(termo);
  if (!palavras.length) return indice.map((e) => e.processo);
  const achados = [];
  for (const entrada of indice) {
    const todas = palavras.every((p) => (p.digitos && entrada.digitos.includes(p.digitos)) || entrada.texto.includes(p.palavra));
    if (!todas) continue;
    const pelaNumeracao = palavras.some((p) => p.digitos && entrada.digitos.includes(p.digitos));
    const pelosClientes = !pelaNumeracao && palavras.every((p) => entrada.textoClientes.includes(p.palavra));
    achados.push({ processo: entrada.processo, pontos: pelaNumeracao ? 0 : pelosClientes ? 1 : 2 });
  }
  return achados.sort((a, b) => a.pontos - b.pontos).map((a) => a.processo);
}

let memoriaDoIndice = { chave: null, indice: null };

function indiceDosDados() {
  const chave = [dados.obter('processo'), dados.obter('parte'), dados.obter('pessoa')];
  if (memoriaDoIndice.chave && chave.every((v, i) => v === memoriaDoIndice.chave[i])) return memoriaDoIndice.indice;
  memoriaDoIndice = { chave, indice: montarIndiceDeBusca(chave[0], dados.agrupar('parte', 'processo_id'), dados.indice('pessoa')) };
  return memoriaDoIndice.indice;
}

// ---------------------------------------------------------------- rotulos

function humanizar(texto) {
  const limpo = String(texto ?? '').replace(/_/g, ' ').trim();
  return limpo ? limpo.charAt(0).toUpperCase() + limpo.slice(1) : '';
}

const ROTULO_DA_SITUACAO = { ativo: 'Ativo', sobrestado: 'Sobrestado', encerrado: 'Encerrado' };
const ROTULO_DA_MODALIDADE = { virtual: 'Virtual', presencial: 'Presencial', hibrido: 'Híbrido', misto: 'Misto' };

function rotuloDaSituacao(situacao) {
  return ROTULO_DA_SITUACAO[situacao] || humanizar(situacao) || 'Situação não informada';
}

function seloDaSituacao(processo, { incluirAtivo = false } = {}) {
  if (processo.situacao === 'sobrestado') return selo('atencao', 'Sobrestado', { icone: 'relogio' });
  if (processo.situacao === 'encerrado') return selo('neutro', 'Encerrado', { icone: 'ok' });
  return incluirAtivo ? selo('ok', rotuloDaSituacao(processo.situacao), { icone: 'ok' }) : null;
}

function rotuloDoGrau(grau) {
  return /^\d$/.test(String(grau ?? '')) ? `${grau}º grau` : humanizar(grau);
}

function dataOuMomentoPorExtenso(texto) {
  const t = String(texto ?? '').trim();
  if (dataValida(t)) return dataComDia(t);
  const dia = dataDoMomento(t);
  return dia ? `${dataComDia(dia)} às ${horaDoMomento(t)}` : t.slice(0, 40);
}

function par(rotulo, valor) {
  return h('div', null, h('dt', { class: 'par-rotulo' }, rotulo), h('dd', { class: 'par-valor' }, valor));
}

// ---------------------------------------------------------------- posicao lembrada (abrir um processo e voltar para a lista)

let listaLembrada = null;

function lembrarAoSair(termo) {
  listaLembrada = /^#[/](processo|prazo|cliente|publicacao|evento)[/]/.test(window.location.hash) ? { termo, y: window.scrollY, em: performance.now() } : null;
}

function recuperarLista() {
  const l = listaLembrada;
  listaLembrada = null;
  return l && performance.now() - l.em <= MINUTOS_PARA_LEMBRAR * 60000 ? l : null;
}

// ---------------------------------------------------------------- lista

function resumoDosPrazosAbertos(processo, hoje) {
  const abertos = (dados.agrupar('prazo', 'processo_id').get(processo.id) || []).filter(prazoAberto);
  if (!abertos.length) return { abertos, vencidos: 0, selos: [] };
  const situacoes = abertos.map((p) => situacaoDoPrazo(p, hoje).chave);
  const vencidos = situacoes.filter((s) => s === 'vencido').length;
  const variante = vencidos ? 'perigo' : situacoes.includes('hoje') ? 'atencao' : situacoes.includes('proximo') ? 'info' : 'neutro';
  const texto = `${plural(abertos.length, 'prazo aberto', 'prazos abertos')}${vencidos ? `, ${vencidos} ${vencidos === 1 ? 'vencido' : 'vencidos'}` : ''}`;
  return {
    abertos,
    vencidos,
    selos: [selo(variante, texto, { icone: vencidos ? 'alerta' : 'relogio' }), abertos.some(prazoNaoConferido) ? seloNaoConferido() : null],
  };
}

function linhaDoProcesso(processo, hoje) {
  const cliente = dados.nomeDoClienteDoProcesso(processo.id);
  const resumo = resumoDosPrazosAbertos(processo, hoje);
  const acao = [processo.acao_descricao, processo.orgao_julgador].filter(Boolean).join(' · ');
  return linhaDeLista({
    href: href('/processo/:id', { id: processo.id }),
    icone: 'processo',
    titulo: numeroDoProcesso(processo.numero),
    subtitulo: cliente || 'Sem cliente cadastrado',
    subtitulo2: acao || null,
    selos: [
      seloDaSituacao(processo),
      Number(processo.segredo_justica) === 1 ? selo('neutro', 'Segredo de justiça', { icone: 'cadeado' }) : null,
      ...resumo.selos,
    ],
    variante: resumo.vencidos ? 'perigo' : null,
    rotulo: `Processo ${processoCNJ(processo.numero)}, ${cliente ? `cliente ${cliente}` : 'sem cliente cadastrado'}${acao ? `, ${acao}` : ''}${resumo.abertos.length ? `, ${plural(resumo.abertos.length, 'prazo aberto', 'prazos abertos')}` : ''}`,
  });
}

registrar('/processos', (ctx) => {
  ctx.titulo('Processos');
  const lembrada = recuperarLista();
  let termo = typeof ctx.consulta.q === 'string' ? ctx.consulta.q.slice(0, 120) : lembrada ? lembrada.termo : '';
  const idDoCampo = novoId('busca');
  const campo = h('input', {
    class: 'entrada', id: idDoCampo, type: 'search', name: 'busca', value: termo, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    enterkeyhint: 'search', placeholder: 'Número, cliente, parte ou ação', maxlength: 120,
  });
  const resultados = h('div', { class: 'resultados' });
  const blocoDaBusca = h('div', { class: 'campo busca' },
    h('label', { class: 'campo-rotulo', for: idDoCampo }, 'Buscar processo'),
    campo,
    h('p', { class: 'campo-ajuda' }, 'Escreva o número (com ou sem pontos, inteiro ou só um pedaço), o nome do cliente ou da parte, ou a ação.'));
  let fotografia = null;

  function desenharResultados() {
    const hoje = hojeEmCuiaba();
    const indice = indiceDosDados();
    const busca = termo.trim();
    if (!indice.length) {
      preencher(resultados, cartao({ corpo: 'lista', rotulo: 'Nenhum processo' }, vazio({
        icone: 'processo', titulo: 'Nenhum processo neste aparelho', texto: 'Quando o computador sincronizar, os processos aparecem aqui.',
      })));
      return;
    }
    if (!busca) {
      const recentes = indice.slice(0, LIMITE_DE_RECENTES).map((e) => e.processo);
      preencher(
        resultados,
        h('h2', { class: 'secao-titulo' }, 'Alterados por último'),
        h('p', { class: 'resultados-contagem texto-2', role: 'status' }, `Mostrando ${recentes.length} de ${plural(indice.length, 'processo', 'processos')}. Use a busca para achar os outros.`),
        cartao({ corpo: 'lista', rotulo: 'Processos alterados por último' }, lista(recentes.map((p) => linhaDoProcesso(p, hoje)))),
      );
      return;
    }
    const achados = buscarNoIndice(indice, busca);
    if (!achados.length) {
      preencher(resultados,
        h('p', { class: 'resultados-contagem texto-2', role: 'status' }, 'Nenhum processo encontrado.'),
        cartao({ corpo: 'lista', rotulo: 'Nenhum processo encontrado' }, vazio({
          icone: 'processo', titulo: 'Nenhum processo encontrado', texto: 'Confira o número ou escreva só uma parte do nome. A busca não diferencia maiúscula nem acento.',
        })));
      return;
    }
    const mostrados = achados.slice(0, LIMITE_DE_RESULTADOS);
    preencher(
      resultados,
      h('p', { class: 'resultados-contagem texto-2', role: 'status' },
        achados.length > mostrados.length
          ? `${plural(achados.length, 'processo encontrado', 'processos encontrados')}. Mostrando os primeiros ${mostrados.length}: escreva mais para afinar a busca.`
          : plural(achados.length, 'processo encontrado', 'processos encontrados') + '.'),
      cartao({ corpo: 'lista', rotulo: 'Resultado da busca' }, lista(mostrados.map((p) => linhaDoProcesso(p, hoje)))),
    );
  }

  function aoMudarOsDados() {
    const agora = fotografiaDosDados(TABELAS_DA_LISTA);
    if (!dadosMudaram(fotografia, agora)) return;
    const jaEstavaCarregado = fotografia !== null && fotografia.carregado;
    fotografia = agora;
    const espera = avisoDeCarga();
    if (espera) { preencher(ctx.raiz, espera); return; }
    if (!jaEstavaCarregado) preencher(ctx.raiz, blocoDaBusca, resultados);
    desenharResultados();
  }

  campo.addEventListener('input', () => {
    termo = campo.value;
    desenharResultados();
  });
  campo.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); campo.blur(); }   // fecha o teclado do celular
  });

  aoMudarOsDados();
  if (lembrada) window.scrollTo(0, lembrada.y);
  ctx.aoMudarDados(aoMudarOsDados);
  ctx.aoVirarODia(() => { fotografia = null; aoMudarOsDados(); });
  ctx.aoLimpar(() => lembrarAoSair(termo));
}, { aba: 'mais', pai: '/mais' });

// ---------------------------------------------------------------- detalhe: cartoes

function nomeDoTribunal(processo) {
  const sigla = dados.publicacoesDoProcesso(processo.id).map((c) => c.sigla_tribunal).find(Boolean);
  if (sigla) return sigla;
  return [processo.tribunal_codigo ? `código ${processo.tribunal_codigo}` : '', processo.uf ? `(${processo.uf})` : ''].filter(Boolean).join(' ');
}

function cartaoDoCabecalho(processo, ctx) {
  const numero = processoCNJ(processo.numero);
  const clientes = dados.clientesDoProcesso(processo.id);
  const botao = h('button', { class: 'botao', type: 'button' }, icone('copiar'), 'Copiar número');
  let temporizador = null;
  botao.addEventListener('click', async () => {
    const copiou = await copiarTexto(numero);
    preencher(botao, icone(copiou ? 'ok' : 'info'), copiou ? 'Número copiado' : 'Não consegui copiar: segure o número para copiar');
    anunciar(copiou ? 'Número do processo copiado.' : 'Não foi possível copiar o número.');
    window.clearTimeout(temporizador);
    temporizador = window.setTimeout(() => { if (botao.isConnected) preencher(botao, icone('copiar'), 'Copiar número'); }, 3000);
  });
  ctx.aoLimpar(() => window.clearTimeout(temporizador));
  return cartao(
    { classe: 'processo-cabeca', rotulo: 'Dados principais do processo' },
    h('p', { class: 'processo-numero' }, numero),
    h('div', { class: 'selos' },
      seloDaSituacao(processo, { incluirAtivo: true }),
      Number(processo.segredo_justica) === 1 ? selo('neutro', 'Segredo de justiça', { icone: 'cadeado' }) : null),
    h('dl', { class: 'pares processo-pares' },
      par(clientes.length > 1 ? 'Clientes' : 'Cliente', clientes.length
        ? clientes.map((c) => h('a', { class: 'link-linha', href: href('/cliente/:id', { id: c.id }) }, c.nome))
        : 'Nenhum cliente cadastrado neste processo'),
      processo.acao_descricao ? par('Ação', processo.acao_descricao) : null),
    h('div', { class: 'cartao-acao' }, botao),
  );
}

function cartaoSobrestado(processo, hoje) {
  if (processo.situacao !== 'sobrestado') return null;
  const desde = dataValida(processo.sobrestado_desde) ? processo.sobrestado_desde : null;
  const dias = desde ? diferencaDias(desde, hoje) : null;
  return cartao(
    { variante: 'atencao', titulo: 'Processo sobrestado (suspenso)', icone: 'relogio' },
    h('dl', { class: 'pares' },
      par('Tema', processo.sobrestado_tema || 'Não informado'),
      par('Motivo', processo.sobrestado_motivo ? h('span', { class: 'texto-corrido' }, processo.sobrestado_motivo) : 'Não informado'),
      par('Desde', desde ? `${dataBR(desde)}${dias > 0 ? ` (há ${plural(dias, 'dia', 'dias')})` : ''}` : 'Não informado')),
  );
}

function cartaoDoJulgamento(processo) {
  if (!processo.julgamento_inicio) return null;
  const modalidade = processo.julgamento_modalidade;
  return cartao(
    { variante: 'info', titulo: 'Julgamento marcado', icone: 'calendario' },
    h('dl', { class: 'pares' },
      par('Início', dataOuMomentoPorExtenso(processo.julgamento_inicio)),
      processo.julgamento_fim ? par('Fim', dataOuMomentoPorExtenso(processo.julgamento_fim)) : null,
      modalidade ? par('Modalidade', ROTULO_DA_MODALIDADE[modalidade] || humanizar(modalidade)) : null,
      processo.julgamento_orgao ? par('Órgão', processo.julgamento_orgao) : null,
      processo.julgamento_observacao ? par('Observação', h('span', { class: 'texto-corrido' }, processo.julgamento_observacao)) : null),
  );
}

/** "Mostrar mais N": o resto da lista fica dentro de um <details> (sem script), fechado. */
function maisItens(texto, linhas) {
  return h('details', { class: 'mais-itens' },
    h('summary', null, h('span', null, texto), icone('seta', { tamanho: 18 })),
    lista(linhas));
}

function cartaoDosPrazos(processo, hoje) {
  const todos = dados.prazosDoProcesso(processo.id);
  const abertos = todos.filter(prazoAberto);
  const encerrados = todos.filter((p) => !prazoAberto(p)).reverse();
  const titulo = `Prazos (${abertos.length} ${abertos.length === 1 ? 'aberto' : 'abertos'})`;
  if (!todos.length) {
    return cartao({ titulo, icone: 'relogio' }, h('p', { class: 'texto-2' }, 'Nenhum prazo cadastrado neste processo.'));
  }
  return cartao(
    { titulo, icone: 'relogio', corpo: 'lista' },
    abertos.length ? lista(abertos.map((p) => linhaDePrazo(p, { hoje, mostrarCliente: false }))) : h('p', { class: 'texto-2 cartao-nota' }, 'Nenhum prazo aberto neste processo.'),
    encerrados.length ? maisItens(`Prazos encerrados (${encerrados.length})`, encerrados.map((p) => linhaDePrazo(p, { hoje, mostrarCliente: false }))) : null,
  );
}

function cartaoDaAgenda(processo, hoje) {
  const eventos = dados.eventosDoProcesso(processo.id);
  if (!eventos.length) return null;
  const doDia = (e) => diaDeInicioDoEvento(e) || '';
  const proximos = eventos.filter((e) => doDia(e) >= hoje);
  const passados = eventos.filter((e) => doDia(e) < hoje).reverse();
  const linhas = [...proximos, ...passados].map((e) => linhaDoEvento(e, { mostrarData: true, mostrarProcesso: false, aoClicar: () => abrirDetalheDoEvento(e, { hoje, semProcesso: true }) }));
  return cartao(
    { titulo: `Agenda do processo (${eventos.length})`, icone: 'calendario', corpo: 'lista' },
    lista(linhas.slice(0, ITENS_VISIVEIS_NO_DETALHE)),
    linhas.length > ITENS_VISIVEIS_NO_DETALHE ? maisItens(`Mostrar mais ${linhas.length - ITENS_VISIVEIS_NO_DETALHE}`, linhas.slice(ITENS_VISIVEIS_NO_DETALHE)) : null,
  );
}

function cartaoDasPublicacoes(processo) {
  const publicacoes = dados.publicacoesDoProcesso(processo.id);
  if (!publicacoes.length) {
    return cartao({ titulo: 'Publicações recentes', icone: 'jornal' }, h('p', { class: 'texto-2' }, `Nenhuma publicação deste processo nos últimos ${dados.DIAS_DE_PUBLICACOES} dias.`));
  }
  const linhas = publicacoes.map((c) => linhaDePublicacao(c));
  return cartao(
    { titulo: `Publicações recentes (${publicacoes.length})`, icone: 'jornal', corpo: 'lista' },
    lista(linhas.slice(0, ITENS_VISIVEIS_NO_DETALHE)),
    linhas.length > ITENS_VISIVEIS_NO_DETALHE ? maisItens(`Mostrar mais ${linhas.length - ITENS_VISIVEIS_NO_DETALHE}`, linhas.slice(ITENS_VISIVEIS_NO_DETALHE)) : null,
    h('p', { class: 'texto-2 texto-pequeno cartao-nota' }, `Mostra as publicações dos últimos ${dados.DIAS_DE_PUBLICACOES} dias.`),
  );
}

function linhaDaParte({ parte, pessoa }) {
  const nosso = Number(parte.cliente_escritorio) === 1;
  return linhaDeLista({
    href: nosso && pessoa ? href('/cliente/:id', { id: pessoa.id }) : null,
    icone: 'pessoas',
    titulo: pessoa ? pessoa.nome : 'Cadastro não encontrado neste aparelho',
    subtitulo: parte.papel ? humanizar(parte.papel) : null,
    selos: [nosso ? selo('ok', 'Cliente do escritório', { icone: 'ok' }) : null],
    rotulo: nosso && pessoa ? `${pessoa.nome}, cliente do escritório. Abrir o cadastro.` : null,
  });
}

function cartaoDasPartes(processo) {
  const partes = dados.partesDoProcesso(processo.id);
  if (!partes.length) return cartao({ titulo: 'Partes', icone: 'pessoas' }, h('p', { class: 'texto-2' }, 'Nenhuma parte cadastrada neste processo.'));
  const grupos = [['ativo', 'Polo ativo'], ['passivo', 'Polo passivo']];
  const conhecidos = new Set(grupos.map(([chave]) => chave));
  const outras = partes.filter(({ parte }) => !conhecidos.has(parte.polo));
  const ordenar = (lote) => [...lote].sort((a, b) => (Number(b.parte.cliente_escritorio) - Number(a.parte.cliente_escritorio))
    || String(a.pessoa ? a.pessoa.nome : '').localeCompare(String(b.pessoa ? b.pessoa.nome : ''), 'pt-BR'));
  const blocos = grupos.map(([chave, rotulo]) => [rotulo, ordenar(partes.filter(({ parte }) => parte.polo === chave))]);
  if (outras.length) blocos.push(['Outras partes', ordenar(outras)]);
  return cartao(
    { titulo: 'Partes', icone: 'pessoas', corpo: 'lista' },
    blocos.filter(([, lote]) => lote.length).map(([rotulo, lote]) => h('section', { class: 'polo' },
      h('h3', { class: 'polo-titulo' }, rotulo),
      lista(lote.map(linhaDaParte)))),
  );
}

function cartaoDosDados(processo) {
  const tribunal = nomeDoTribunal(processo);
  const distribuido = dataValida(processo.distribuido_em) ? dataBR(processo.distribuido_em) : '';
  const valor = dinheiro(processo.valor_causa_centavos);
  return cartao(
    { titulo: 'Dados do processo', icone: 'info' },
    h('dl', { class: 'pares' },
      tribunal ? par('Tribunal', tribunal) : null,
      processo.orgao_julgador ? par('Órgão julgador', processo.orgao_julgador) : null,
      processo.foro ? par('Foro', processo.foro) : null,
      processo.grau ? par('Grau', rotuloDoGrau(processo.grau)) : null,
      par('Valor da causa', valor || 'Não informado'),
      distribuido ? par('Distribuído em', distribuido) : null,
      par('Situação', rotuloDaSituacao(processo.situacao)),
      par('Segredo de justiça', Number(processo.segredo_justica) === 1 ? 'Sim' : 'Não')),
  );
}

function linhaDeProcessoLigado(outro, rotulo) {
  return linhaDeLista({
    href: href('/processo/:id', { id: outro.id }),
    icone: 'processo',
    titulo: numeroDoProcesso(outro.numero),
    subtitulo: rotulo,
    subtitulo2: outro.acao_descricao || null,
  });
}

function cartaoDaOrigem(processo) {
  const origem = processo.processo_origem_id ? dados.linha('processo', processo.processo_origem_id) : null;
  const derivados = dados.agrupar('processo', 'processo_origem_id').get(processo.id) || [];
  if (!processo.processo_origem_id && !derivados.length) return null;
  const linhas = [];
  if (processo.processo_origem_id) {
    linhas.push(origem
      ? linhaDeProcessoLigado(origem, 'Processo de origem')
      : linhaDeLista({ titulo: 'Processo de origem', subtitulo: 'Não está neste aparelho (pode estar arquivado no computador).' }));
  }
  for (const outro of derivados) linhas.push(linhaDeProcessoLigado(outro, 'Veio deste processo (recurso ou desdobramento)'));
  return cartao({ titulo: 'Processos ligados', icone: 'processo', corpo: 'lista' }, lista(linhas));
}

function cartaoDasObservacoes(processo) {
  if (!processo.observacoes) return null;
  return cartao({ titulo: 'Observações', icone: 'info' }, h('p', { class: 'texto-corrido' }, processo.observacoes));
}

function desenharDetalhe(ctx, processo) {
  const hoje = hojeEmCuiaba();
  preencher(
    ctx.raiz,
    cartaoDoCabecalho(processo, ctx),
    cartaoSobrestado(processo, hoje),
    cartaoDoJulgamento(processo),
    cartaoDosPrazos(processo, hoje),
    cartaoDaAgenda(processo, hoje),
    cartaoDasPublicacoes(processo),
    cartaoDasPartes(processo),
    cartaoDosDados(processo),
    cartaoDaOrigem(processo),
    cartaoDasObservacoes(processo),
  );
}

registrar('/processo/:id', (ctx) => {
  ctx.titulo('Processo');
  let fotografia = null;
  const desenhar = () => {
    const agora = fotografiaDosDados(TABELAS_DO_DETALHE);
    if (!dadosMudaram(fotografia, agora)) return;
    fotografia = agora;
    const espera = avisoDeCarga();
    if (espera) { preencher(ctx.raiz, espera); return; }
    const processo = dados.linha('processo', ctx.params.id);
    if (!processo) {
      preencher(ctx.raiz, cartao({ corpo: 'lista', rotulo: 'Processo não encontrado' }, vazio({
        icone: 'processo',
        titulo: 'Processo não encontrado',
        texto: 'Ele pode ter sido arquivado ou apagado no computador. Volte à lista e atualize.',
        acao: h('a', { class: 'botao', href: href('/processos') }, 'Voltar à lista de processos'),
      })));
      return;
    }
    desenharDetalhe(ctx, processo);
  };
  desenhar();
  ctx.aoMudarDados(desenhar);
  ctx.aoVirarODia(() => { fotografia = null; desenhar(); });
}, { aba: 'mais', pai: '/processos' });
