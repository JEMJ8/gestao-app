// Eventos da agenda (audiencia, pericia, reuniao, compromisso, lembrete, prazo interno): datas e horas com cuidado, a linha da lista,
// o detalhe e a folha inferior. Usado pela Agenda, pelo detalhe do evento (#/evento/ID) e pelo detalhe do processo.
//
//   linhaDoEvento(evento, { hoje, aoClicar })                 -> <li> da lista
//   abrirDetalheDoEvento(evento, { hoje })                    -> folha inferior com todos os dados e o link para o processo
//   detalheDoEvento(evento, { hoje }) + acoesDoEvento(evento) -> o mesmo conteudo, para uma tela inteira
//
// Cuidado com a data: o dia de um evento COM hora e o dia de Cuiaba do instante (um evento marcado para "2026-11-10T00:30:00Z" acontece
// no dia 9, as 20:30 de Cuiaba). Evento de DIA INTEIRO nao tem hora: vale a data escrita, sem conversao de fuso. O fim de um evento de dia
// inteiro e INCLUSIVO (de 09/11 ate 11/11 ocupa tres dias), como no computador.
// Todo texto do evento (titulo, local, link, observacao) e tratado como nao confiavel: entra como texto; link so se for https.

import * as dados from '../dados.js';
import { h } from '../ui.js';
import { icone } from '../icones.js';
import { href as enderecoDe } from '../rotas.js';
import { dataExtenso, dataCurta, dataDoMomento, dataValida, horaDoMomento, rotuloDoDia } from '../datas.js';
import { linkHttps } from '../formato.js';
import { ROTULO_EVENTO } from '../dominio.js';
import { abrirFolha } from './folha.js';
import { linhaDeLista, numeroDoProcesso } from './linha.js';
import { selo } from './selo.js';

const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

export const ROTULO_SITUACAO_DO_EVENTO = { agendado: 'Agendado', cancelado: 'Cancelado', realizado: 'Realizado' };

const ICONE_DO_TIPO = {
  audiencia: 'pessoas', reuniao: 'pessoas', pericia: 'processo', compromisso: 'calendario', lembrete: 'relogio', prazo_interno: 'relogio',
};

// ---------------------------------------------------------------- datas e horas do evento (logica pura, testada no navegador)

function diaInteiro(evento) {
  return Number(evento.dia_inteiro) === 1;
}

function textoDe(valor) {
  return String(valor ?? '').trim();
}

/** A data escrita no comeco do texto, se existir no calendario; senao null. */
function dataEscrita(texto) {
  const literal = textoDe(texto).slice(0, 10);
  return dataValida(literal) ? literal : null;
}

/** O dia (AAAA-MM-DD) em que o evento comeca, ou null se a data do evento nao e valida. */
export function diaDeInicioDoEvento(evento) {
  const texto = textoDe(evento.inicio);
  if (diaInteiro(evento) || SO_DATA.test(texto)) return dataEscrita(texto) || dataDoMomento(texto);
  return dataDoMomento(texto);
}

/** O ultimo dia do evento. So o evento de dia inteiro ocupa varios dias; o com hora conta no dia em que comeca. */
export function diaDeFimDoEvento(evento) {
  const inicio = diaDeInicioDoEvento(evento);
  if (!inicio) return null;
  const fim = textoDe(evento.fim);
  if (!fim || !(diaInteiro(evento) || SO_DATA.test(textoDe(evento.inicio)))) return inicio;
  const ultimo = dataEscrita(fim) || dataDoMomento(fim);
  return ultimo && ultimo > inicio ? ultimo : inicio;
}

/**
 * O horario do evento em palavras e em partes:
 * { diaInteiro, semHora, dia, diaFim, hora, horaFim, fimEmOutroDia: {dia, hora}|null, texto }
 * texto: "Dia inteiro", "Dia inteiro, de 09/11 a 11/11", "Sem hora marcada", "14:00", "14:00 às 15:30" ou "14:00 até 10/11 às 09:00".
 */
export function horarioDoEvento(evento) {
  const dia = diaDeInicioDoEvento(evento);
  const inteiro = diaInteiro(evento);
  const semHora = !inteiro && SO_DATA.test(textoDe(evento.inicio));
  const base = { diaInteiro: inteiro, semHora, dia, diaFim: dia, hora: null, horaFim: null, fimEmOutroDia: null, texto: '' };
  if (!dia) return base;
  if (inteiro || semHora) {
    const diaFim = diaDeFimDoEvento(evento);
    const rotulo = inteiro ? 'Dia inteiro' : 'Sem hora marcada';
    return { ...base, diaFim, texto: diaFim > dia ? `${rotulo}, de ${dataCurta(dia)} a ${dataCurta(diaFim)}` : rotulo };
  }
  const hora = horaDoMomento(evento.inicio);
  const fimTexto = textoDe(evento.fim);
  const diaDoFim = fimTexto ? dataDoMomento(fimTexto) : null;
  const horaDoFim = diaDoFim ? horaDoMomento(fimTexto) : null;
  let horaFim = null;
  let fimEmOutroDia = null;
  if (diaDoFim && diaDoFim === dia && horaDoFim > hora) horaFim = horaDoFim;
  else if (diaDoFim && diaDoFim > dia) fimEmOutroDia = { dia: diaDoFim, hora: horaDoFim };
  const texto = horaFim ? `${hora} às ${horaFim}` : fimEmOutroDia ? `${hora} até ${dataCurta(fimEmOutroDia.dia)} às ${fimEmOutroDia.hora}` : hora;
  return { ...base, hora, horaFim, fimEmOutroDia, texto };
}

export function rotuloDoTipoDeEvento(evento) {
  return ROTULO_EVENTO[evento.tipo] || 'Evento';
}

/** O cliente do evento: o do processo, ou a pessoa ligada ao evento, ou vazio. */
export function nomeDoClienteDoEvento(evento) {
  if (evento.processo_id) {
    const nome = dados.nomeDoClienteDoProcesso(evento.processo_id);
    if (nome) return nome;
  }
  if (evento.pessoa_id) {
    const pessoa = dados.linha('pessoa', evento.pessoa_id);
    if (pessoa) return pessoa.nome;
  }
  return '';
}

// ---------------------------------------------------------------- a linha da lista

/**
 * Linha de um evento. Opcoes: aoClicar, mostrarData (para listas sem cabecalho de dia: mostra 12/11 no lugar da hora), mostrarProcesso
 * (falso na lista do proprio processo, onde o numero so repetiria o titulo da tela),
 * indiceDoDia e totalDeDias (evento de dia inteiro que ocupa varios dias: "dia 2 de 3").
 * Cancelado e realizado ficam discretos (cor mais fraca, e o selo diz o que e).
 */
export function linhaDoEvento(evento, { aoClicar = null, mostrarData = false, mostrarProcesso = true, indiceDoDia = null, totalDeDias = null } = {}) {
  const horario = horarioDoEvento(evento);
  const cliente = nomeDoClienteDoEvento(evento);
  const processo = evento.processo_id ? dados.linha('processo', evento.processo_id) : null;
  const tipo = rotuloDoTipoDeEvento(evento);
  const cancelado = evento.situacao === 'cancelado';
  const realizado = evento.situacao === 'realizado';
  const selos = [
    cancelado ? selo('neutro', 'Cancelado', { icone: 'fechar' }) : null,
    realizado ? selo('neutro', 'Realizado', { icone: 'ok' }) : null,
    horario.diaInteiro ? selo('neutro', totalDeDias > 1 ? `Dia inteiro (dia ${indiceDoDia} de ${totalDeDias})` : 'Dia inteiro') : null,
    horario.semHora ? selo('neutro', 'Sem hora marcada') : null,
  ];
  const local = textoDe(evento.local);
  const numeroNaLinha = mostrarProcesso && processo ? numeroDoProcesso(processo.numero) : null;
  const processoELocal = numeroNaLinha || local ? [numeroNaLinha, numeroNaLinha && local ? ' · ' : null, local || null] : null;
  // coluna da direita: em lista de um dia so, a hora (e "até 15:30"); em lista sem cabecalho de dia, a data (e a hora embaixo)
  let data = null;
  let dataSub = null;
  if (mostrarData) {
    data = horario.dia ? dataCurta(horario.dia) : null;
    dataSub = horario.diaInteiro ? 'dia inteiro' : horario.hora;
  } else if (horario.hora) {
    data = horario.hora;
    dataSub = horario.horaFim ? `até ${horario.horaFim}` : horario.fimEmOutroDia ? `até ${dataCurta(horario.fimEmOutroDia.dia)}` : null;
  }
  const li = linhaDeLista({
    aoClicar,
    icone: ICONE_DO_TIPO[evento.tipo] || 'calendario',
    titulo: evento.titulo || tipo,
    subtitulo: [tipo, cliente].filter(Boolean).join(' · '),
    subtitulo2: processoELocal,
    data,
    dataSub,
    selos,
    rotulo: [evento.titulo || tipo, tipo, horario.dia ? dataExtenso(horario.dia) : '', horario.texto, cancelado ? 'cancelado' : realizado ? 'realizado' : '', cliente]
      .filter(Boolean).join(', '),
  });
  if (cancelado) li.classList.add('linha--discreta', 'linha--cancelada');
  else if (realizado) li.classList.add('linha--discreta');
  return li;
}

// ---------------------------------------------------------------- o detalhe

function par(rotulo, valor) {
  return h('div', null, h('dt', { class: 'par-rotulo' }, rotulo), h('dd', { class: 'par-valor' }, valor));
}

/** O conteudo do detalhe: todos os dados do evento, em texto. `hoje` (opcional) acrescenta "Hoje", "Amanhã"... ao lado da data. */
export function detalheDoEvento(evento, { hoje = null } = {}) {
  const horario = horarioDoEvento(evento);
  const processo = evento.processo_id ? dados.linha('processo', evento.processo_id) : null;
  const cliente = nomeDoClienteDoEvento(evento);
  const local = textoDe(evento.local);
  const observacao = textoDe(evento.observacao);
  const enderecoTexto = textoDe(evento.link);
  const seguro = linkHttps(enderecoTexto);
  const situacao = evento.situacao;
  const rotuloLink = evento.tipo === 'audiencia' ? 'Link da audiência virtual' : 'Link';
  const proximo = horario.dia && hoje ? rotuloDoDia(horario.dia, hoje) : '';
  const quando = horario.dia
    ? `${dataExtenso(horario.dia)}${horario.diaFim && horario.diaFim > horario.dia ? ` até ${dataExtenso(horario.diaFim)}` : ''}`
    : 'Data do evento inválida';
  return h(
    'div',
    { class: 'evento-detalhe' },
    h('div', { class: 'selos' },
      selo('info', rotuloDoTipoDeEvento(evento), { icone: ICONE_DO_TIPO[evento.tipo] || 'calendario' }),
      situacao === 'cancelado' ? selo('perigo', 'Cancelado', { icone: 'erro' })
        : situacao === 'realizado' ? selo('ok', 'Realizado', { icone: 'ok' })
          : selo('neutro', ROTULO_SITUACAO_DO_EVENTO[situacao] || 'Agendado', { icone: 'calendario' })),
    h('dl', { class: 'pares' },
      par('Quando', [quando, proximo && /^(Hoje|Amanhã|Ontem)$/.test(proximo) ? ` (${proximo.toLowerCase()})` : '']),
      par('Horário', horario.texto || 'Não informado'),
      local ? par('Local', local) : null,
      enderecoTexto ? par(rotuloLink, seguro
        ? h('span', { class: 'texto-quebra' }, seguro)
        : h('span', { class: 'texto-quebra' }, `Endereço que não é seguro (precisa começar com https), por isso não abre aqui: ${enderecoTexto}`)) : null,
      cliente ? par('Cliente', cliente) : null,
      processo ? par('Processo', numeroDoProcesso(processo.numero)) : null,
      observacao ? par('Observação', h('span', { class: 'texto-corrido' }, observacao)) : null,
      horario.dia ? null : par('Atenção', `O computador mandou uma data que não consigo ler (${textoDe(evento.inicio).slice(0, 40)}).`)),
  );
}

/** Os botoes do evento: entrar na audiencia (so se o link for https) e abrir o processo. Devolve uma lista (pode ser vazia). */
export function acoesDoEvento(evento, { semProcesso = false } = {}) {
  const seguro = linkHttps(evento.link);
  const processo = evento.processo_id ? dados.linha('processo', evento.processo_id) : null;
  return [
    seguro ? h('a', { class: 'botao botao--primario botao--bloco', href: seguro, target: '_blank', rel: 'noopener noreferrer' }, icone('link'), evento.tipo === 'audiencia' ? 'Entrar na audiência virtual' : 'Abrir o link') : null,
    processo && !semProcesso ? h('a', { class: 'botao botao--bloco', href: enderecoDe('/processo/:id', { id: processo.id }) }, icone('processo'), 'Abrir o processo') : null,
  ].filter(Boolean);
}

/** Abre a folha inferior com o detalhe do evento. Devolve a folha (tem .fechar()). */
export function abrirDetalheDoEvento(evento, { hoje = null, semProcesso = false } = {}) {
  const acoes = acoesDoEvento(evento, { semProcesso });
  return abrirFolha({
    titulo: evento.titulo || rotuloDoTipoDeEvento(evento),
    conteudo: detalheDoEvento(evento, { hoje }),
    rodape: acoes.length ? acoes : null,
  });
}
