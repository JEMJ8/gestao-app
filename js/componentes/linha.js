// Linha de lista: o bloco que se repete em todas as listas do aplicativo (toque de 56 px ou mais, titulo, subtitulo, data, selos).
//
//   linhaDeLista({ href: '#/prazo/abc', titulo: 'Contestação', subtitulo: 'Maria Souza', data: 'seg, 09/11', dataSub: 'vence hoje', selos: [...], variante: 'perigo' })
//   linhaDePrazo(prazo, { hoje })            -> linha pronta de um prazo (a MESMA em Hoje, Prazos e no processo)
//   linhaDeEvento(evento)                    -> linha pronta de um evento da agenda
//   linhaDePublicacao(comunicacao)           -> linha pronta de uma publicacao
//
// Devolvem <li>: ponha dentro de <ul class="lista"> (ou use lista()). Todo texto entra como texto.

import { h } from '../ui.js';
import { icone } from '../icones.js';
import * as dados from '../dados.js';
import { dataComDia, dataComDiaCurta, dataCurta, dataDoMomento, faixaDeHorario, rotuloDoDia, textoDeDias } from '../datas.js';
import { processoCNJ } from '../formato.js';
import { criadoAutomaticamente, prazoAberto, prazoNaoConferido, ROTULO_EVENTO, ROTULO_PUBLICACAO, situacaoDoPrazo } from '../dominio.js';
import { seloCriadoPeloSistema, seloDeSituacao, seloDeStatus, seloNaoConferido, selo } from './selo.js';

const VARIANTE_DA_SITUACAO = { vencido: 'perigo', hoje: 'atencao', proximo: 'info' };

/** <ul class="lista"> com as linhas. `solta` separa cada linha em uma caixa propria. */
export function lista(linhas, { solta = false } = {}) {
  return h('ul', { class: ['lista', solta && 'lista--solta'] }, linhas);
}

/** O numero do processo sem quebrar no meio (um numero cortado em duas linhas nao se le). */
export function numeroDoProcesso(numero) {
  return h('span', { class: 'nowrap' }, processoCNJ(numero));
}

/**
 * Opcoes: titulo (obrigatorio), subtitulo e subtitulo2 (texto ou elementos), `quando` (logo abaixo do titulo: ex. data fatal e quanto falta),
 * data e dataSub (coluna da direita, para valores curtos como a hora), selos (lista), variante ('perigo'|'atencao'|'ok'|'info': faixa de cor
 * na borda esquerda), icone, href (link) ou aoClicar (botao), rotulo (nome acessivel completo, se o texto da linha nao bastar).
 */
export function linhaDeLista({
  href = null, aoClicar = null, titulo, subtitulo = null, subtitulo2 = null, quando = null, data = null, dataSub = null, selos = [], variante = null,
  icone: nomeIcone = null, rotulo = null,
}) {
  const conteudo = [
    nomeIcone ? h('span', { class: 'linha-icone' }, icone(nomeIcone, { tamanho: 22 })) : null,
    h('span', { class: 'linha-texto' },
      h('span', { class: 'linha-titulo' }, titulo),
      quando ? h('span', { class: 'linha-quando' }, quando) : null,
      subtitulo ? h('span', { class: 'linha-sub' }, subtitulo) : null,
      subtitulo2 ? h('span', { class: 'linha-sub' }, subtitulo2) : null,
      selos.filter(Boolean).length ? h('span', { class: 'selos' }, selos.filter(Boolean)) : null),
    data || dataSub ? h('span', { class: 'linha-meta' },
      data ? h('span', { class: 'linha-data' }, data) : null,
      dataSub ? h('span', null, dataSub) : null) : null,
    href || aoClicar ? h('span', { class: 'linha-seta' }, icone('seta', { tamanho: 18 })) : null,
  ];
  const classe = ['linha-corpo'];
  const corpo = href
    ? h('a', { class: classe, href, 'aria-label': rotulo }, conteudo)
    : aoClicar
      ? h('button', { class: classe, type: 'button', onclick: aoClicar, 'aria-label': rotulo }, conteudo)
      : h('div', { class: classe }, conteudo);
  return h('li', { class: ['linha', variante && `linha--${variante}`] }, corpo);
}

/**
 * Prazo com dado que o aplicativo nao entende (ex.: data fatal que nao existe): aparece mesmo assim, com o aviso, e nunca derruba a tela.
 * E a linha que todas as listas mostram no lugar de linhaDePrazo quando a data fatal nao e valida.
 */
export function linhaDePrazoComProblema(prazo, href = `#/prazo/${encodeURIComponent(prazo.id)}`) {
  return linhaDeLista({
    href, titulo: String(prazo.ato || 'Prazo'), variante: 'perigo',
    subtitulo: 'Este prazo tem uma data que o celular não entende. Veja no computador.',
    selos: [selo('perigo', 'Dado com problema', { icone: 'alerta', forte: true })],
  });
}

/**
 * Linha de um prazo. Mostra sempre: o ato, o cliente e o numero do processo, a data fatal e quanto falta, e os avisos
 * (PRAZO NÃO CONFERIDO, criado pelo sistema, situacao). `hoje` = datas.hojeEmCuiaba().
 */
export function linhaDePrazo(prazo, { hoje, mostrarCliente = true, href = `#/prazo/${encodeURIComponent(prazo.id)}` } = {}) {
  const situacao = situacaoDoPrazo(prazo, hoje);
  if (situacao.dataInvalida) return linhaDePrazoComProblema(prazo, href);
  const processo = dados.linha('processo', prazo.processo_id);
  const cliente = mostrarCliente ? dados.nomeDoClienteDoProcesso(prazo.processo_id) : '';
  const aberto = prazoAberto(prazo);
  return linhaDeLista({
    href,
    titulo: prazo.ato,
    quando: [h('strong', null, dataComDiaCurta(prazo.data_fatal, hoje)), aberto ? ` · ${textoDeDias(situacao.dias)}` : null],
    subtitulo: cliente || null,
    subtitulo2: processo ? numeroDoProcesso(processo.numero) : null,
    variante: aberto ? VARIANTE_DA_SITUACAO[situacao.chave] || null : null,
    selos: [
      prazoNaoConferido(prazo) ? seloNaoConferido() : null,
      criadoAutomaticamente(prazo) ? seloCriadoPeloSistema() : null,
      aberto ? seloDeSituacao(situacao) : null,
      seloDeStatus(prazo.status),
    ],
    rotulo: `${prazo.ato}, ${cliente ? `${cliente}, ` : ''}data fatal ${dataComDia(prazo.data_fatal)}${prazoNaoConferido(prazo) ? ', prazo não conferido' : ''}`,
  });
}

/** Linha de um evento da agenda (audiencia, reuniao, pericia...). `hoje` e opcional: com ele, mostra "Hoje", "Amanhã" no lugar da data. */
export function linhaDeEvento(evento, { hoje = null, href = `#/evento/${encodeURIComponent(evento.id)}` } = {}) {
  const dia = dataDoMomento(evento.inicio);
  const cliente = evento.processo_id ? dados.nomeDoClienteDoProcesso(evento.processo_id) : '';
  const processo = evento.processo_id ? dados.linha('processo', evento.processo_id) : null;
  return linhaDeLista({
    href,
    icone: evento.tipo === 'audiencia' ? 'pessoas' : 'calendario',
    titulo: evento.titulo,
    subtitulo: [ROTULO_EVENTO[evento.tipo] || 'Evento', cliente].filter(Boolean).join(' · '),
    subtitulo2: processo || evento.local ? [processo ? numeroDoProcesso(processo.numero) : null, processo && evento.local ? ' · ' : null, evento.local || null] : null,
    data: faixaDeHorario(evento.inicio, null, Number(evento.dia_inteiro) === 1) || null,
    dataSub: dia ? (hoje ? rotuloDoDia(dia, hoje) : dataCurta(dia)) : null,
  });
}

/** Linha de uma publicacao do DJEN (a lista nao traz o texto: ele vem ao abrir). */
export function linhaDePublicacao(comunicacao, { href = `#/publicacao/${encodeURIComponent(comunicacao.id)}` } = {}) {
  const cliente = comunicacao.processo_id ? dados.nomeDoClienteDoProcesso(comunicacao.processo_id) : '';
  const nova = comunicacao.situacao === 'nova';
  return linhaDeLista({
    href,
    icone: 'jornal',
    titulo: comunicacao.tipo_comunicacao || comunicacao.tipo_documento || 'Publicação',
    subtitulo: cliente || null,
    subtitulo2: comunicacao.processo_numero ? [numeroDoProcesso(comunicacao.processo_numero), comunicacao.sigla_tribunal ? ` · ${comunicacao.sigla_tribunal}` : null] : null,
    data: dataCurta(comunicacao.data_disponibilizacao) || null,
    selos: [nova ? selo('info', 'Nova', { icone: 'info' }) : comunicacao.situacao === 'em_revisao' ? selo('atencao', ROTULO_PUBLICACAO.em_revisao) : null],
    variante: nova ? 'info' : null,
  });
}
