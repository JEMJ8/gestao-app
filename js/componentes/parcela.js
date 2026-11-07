// Parcela de honorario: as regras de situacao e de soma (puras, sem tela) e a linha de lista pronta. Servem as telas Financeiro e Cliente.
//
// DINHEIRO: tudo em CENTAVOS INTEIROS. Soma-se inteiro com inteiro; so na hora de mostrar vira "R$ 1.234,56" (formato.dinheiro). Nunca ha
// ponto flutuante nas contas (nada de dividir, multiplicar por 0,01 ou arredondar).
//
// Valores reais (migrations/0003_financeiro.sql):
//   contrato.situacao: ativo | quitado | cancelado          contrato.modalidade: fixo | parcelado | exito | misto
//   parcela.situacao:  aberta | recebida | cancelada         parcela.numero 0 = entrada; 1..total = parcelas
// "Em atraso" = parcela ABERTA com vencimento antes de hoje (hoje de Cuiaba). Parcela aberta de contrato CANCELADO nao e cobranca
// (o computador as cancela junto; se uma sobrar, ela nao entra nas contas nem na lista de cobranca).
// O resumo do mes segue as mesmas regras de app/api/financeiro.py (resumo_financeiro): a receber = abertas com vencimento no mes;
// recebido = recebidas com data de recebimento no mes (valor recebido, ou o da parcela se nao houver); em atraso = todas as vencidas.

import { h } from '../ui.js';
import { icone } from '../icones.js';
import { dataComDiaCurta, dataBR, dataValida, diferencaDias, primeiroDiaDoMes, textoDeDias, ultimoDiaDoMesDe } from '../datas.js';
import { dinheiro, inteiro } from '../formato.js';
import { linhaDeLista } from './linha.js';
import { selo } from './selo.js';

export const ROTULO_CONTRATO = { ativo: 'Ativo', quitado: 'Quitado', cancelado: 'Cancelado' };
export const ROTULO_MODALIDADE = { fixo: 'Valor fixo', parcelado: 'Parcelado', exito: 'Êxito', misto: 'Misto' };
export const FILTROS_DE_PARCELA = ['a_vencer', 'atrasadas', 'recebidas'];

// ---------------------------------------------------------------- valores

/** Centavos inteiros de uma coluna (nula ou texto vira 0). */
export function centavos(valor) {
  return inteiro(valor, 0);
}

export function valorDaParcela(parcela) {
  return centavos(parcela.valor_centavos);
}

/** O que entrou de fato: o valor recebido, ou o da parcela se o recebido nao foi guardado (carga inicial). */
export function valorRecebidoDaParcela(parcela) {
  const r = parcela.valor_recebido_centavos;
  return r === null || r === undefined || r === '' ? valorDaParcela(parcela) : centavos(r);
}

/** "Entrada" ou "2/10". */
export function rotuloDaParcela(parcela) {
  const n = inteiro(parcela.numero, 0);
  if (n === 0) return 'Entrada';
  const total = inteiro(parcela.total, 0);
  return total > 0 ? `${n}/${total}` : String(n);
}

/** Dia (AAAA-MM-DD) de uma coluna de data, ou null. Aceita tambem um momento (usa so os 10 primeiros caracteres). */
export function diaDe(texto) {
  const dia = typeof texto === 'string' ? texto.slice(0, 10) : '';
  return dataValida(dia) ? dia : null;
}

// ---------------------------------------------------------------- situacao

/**
 * { chave, dias } da parcela em relacao a `hoje` (data de Cuiaba). `contrato` pode ser null.
 * chave: recebida | cancelada | contrato_cancelado | atrasada | vence_hoje | a_vencer | sem_data | desconhecida.
 * `dias` = vencimento - hoje (negativo = atrasada); null quando nao se aplica.
 */
export function situacaoDaParcela(parcela, contrato, hoje) {
  if (parcela.situacao === 'recebida') return { chave: 'recebida', dias: null };
  if (parcela.situacao === 'cancelada') return { chave: 'cancelada', dias: null };
  if (parcela.situacao !== 'aberta') return { chave: 'desconhecida', dias: null };
  if (contrato && contrato.situacao === 'cancelado') return { chave: 'contrato_cancelado', dias: null };
  const vencimento = diaDe(parcela.vencimento);
  if (!vencimento) return { chave: 'sem_data', dias: null };
  const dias = diferencaDias(hoje, vencimento);
  return { chave: dias < 0 ? 'atrasada' : dias === 0 ? 'vence_hoje' : 'a_vencer', dias };
}

const CHAVES_A_VENCER = ['vence_hoje', 'a_vencer', 'sem_data'];

/** Comparador por vencimento: `sentido` 1 = mais antigo primeiro, -1 = mais recente primeiro. Sem data de vencimento vai sempre para o fim. */
function porVencimento(a, b, sentido = 1) {
  const va = diaDe(a.vencimento);
  const vb = diaDe(b.vencimento);
  if (va !== vb) {
    if (va === null) return 1;
    if (vb === null) return -1;
    return va < vb ? -sentido : sentido;
  }
  return String(a.contrato_id).localeCompare(String(b.contrato_id)) || inteiro(a.numero, 0) - inteiro(b.numero, 0) || String(a.id).localeCompare(String(b.id));
}

/**
 * Reparte as parcelas nos tres filtros da tela: a_vencer (hoje em diante e sem data), atrasadas (mais antigas primeiro) e recebidas
 * (vencimento mais recente primeiro). Parcela cancelada e de contrato cancelado ficam de fora de todos. `contratos` = Map id -> contrato.
 */
export function repartirParcelas(parcelas, contratos, hoje) {
  const grupos = { a_vencer: [], atrasadas: [], recebidas: [] };
  for (const parcela of parcelas) {
    const { chave } = situacaoDaParcela(parcela, contratos.get(parcela.contrato_id) || null, hoje);
    if (chave === 'atrasada') grupos.atrasadas.push(parcela);
    else if (CHAVES_A_VENCER.includes(chave)) grupos.a_vencer.push(parcela);
    else if (chave === 'recebida') grupos.recebidas.push(parcela);
  }
  grupos.a_vencer.sort(porVencimento);
  grupos.atrasadas.sort(porVencimento);
  grupos.recebidas.sort((a, b) => porVencimento(a, b, -1));
  return grupos;
}

/** Soma (centavos) de uma lista de um filtro: o recebido de verdade nas recebidas; o valor da parcela nas outras. */
export function somaDoFiltro(lista, filtro) {
  let soma = 0;
  for (const p of lista) soma += filtro === 'recebidas' ? valorRecebidoDaParcela(p) : valorDaParcela(p);
  return soma;
}

// ---------------------------------------------------------------- resumos

/**
 * Resumo do mes de `hoje`, nas regras do computador. Devolve centavos e quantidades:
 * { mes, primeiro, ultimo, aReceber, aReceberQtd, recebido, recebidoQtd, emAtraso, emAtrasoQtd, recebidasSemData }.
 * `recebidasSemData` = parcelas recebidas sem data de recebimento (nao entram no "recebido do mes": o sistema nao inventa data).
 */
export function resumoDoMes(parcelas, contratos, hoje) {
  const primeiro = primeiroDiaDoMes(hoje);
  const ultimo = ultimoDiaDoMesDe(hoje);
  const r = { mes: hoje.slice(0, 7), primeiro, ultimo, aReceber: 0, aReceberQtd: 0, recebido: 0, recebidoQtd: 0, emAtraso: 0, emAtrasoQtd: 0, recebidasSemData: 0 };
  for (const p of parcelas) {
    const { chave } = situacaoDaParcela(p, contratos.get(p.contrato_id) || null, hoje);
    if (chave === 'recebida') {
      const quando = diaDe(p.recebida_em);
      if (!quando) {
        r.recebidasSemData += 1;
      } else if (quando >= primeiro && quando <= ultimo) {
        r.recebido += valorRecebidoDaParcela(p);
        r.recebidoQtd += 1;
      }
      continue;
    }
    if (chave === 'atrasada') {
      r.emAtraso += valorDaParcela(p);
      r.emAtrasoQtd += 1;
    }
    if (chave === 'atrasada' || CHAVES_A_VENCER.includes(chave)) {
      const vencimento = diaDe(p.vencimento);
      if (vencimento && vencimento >= primeiro && vencimento <= ultimo) {
        r.aReceber += valorDaParcela(p);
        r.aReceberQtd += 1;
      }
    }
  }
  return r;
}

/** Resumo de um contrato: { recebido, aVencer, emAtraso } em centavos (parcelas canceladas e de contrato cancelado nao contam). */
export function resumoDoContrato(parcelas, contrato, hoje) {
  const r = { recebido: 0, aVencer: 0, emAtraso: 0 };
  for (const p of parcelas) {
    const { chave } = situacaoDaParcela(p, contrato, hoje);
    if (chave === 'recebida') r.recebido += valorRecebidoDaParcela(p);
    else if (chave === 'atrasada') r.emAtraso += valorDaParcela(p);
    else if (CHAVES_A_VENCER.includes(chave)) r.aVencer += valorDaParcela(p);
  }
  return r;
}

// ---------------------------------------------------------------- bloco de valores

/**
 * Lista de valores em reais, um por linha: nome a esquerda, valor a direita, e uma frase de ajuda embaixo.
 * `linhas`: [{ rotulo, centavos, variante: 'ok'|'perigo'|'info'|null, icone?, ajuda? }]. A cor da variante vem sempre com o nome e o icone.
 */
export function blocoDeValores(linhas) {
  return h('dl', { class: 'resumo-fin' }, linhas.map((l) => h('div', { class: ['resumo-fin-linha', l.variante && `resumo-fin-linha--${l.variante}`] },
    h('dt', { class: 'resumo-fin-rotulo' }, l.icone ? icone(l.icone, { tamanho: 18 }) : null, h('span', null, l.rotulo)),
    h('dd', { class: 'resumo-fin-valor' }, dinheiro(l.centavos)),
    l.ajuda ? h('dd', { class: 'resumo-fin-ajuda' }, l.ajuda) : null)));
}

// ---------------------------------------------------------------- a linha

function seloDaParcela(chave) {
  switch (chave) {
    case 'atrasada': return selo('perigo', 'Em atraso', { icone: 'alerta', forte: true });
    case 'vence_hoje': return selo('atencao', 'Vence hoje', { icone: 'relogio', forte: true });
    case 'a_vencer': return selo('info', 'A vencer', { icone: 'relogio' });
    case 'sem_data': return selo('neutro', 'Sem data de vencimento');
    case 'recebida': return selo('ok', 'Recebida', { icone: 'ok' });
    case 'cancelada': return selo('neutro', 'Cancelada', { icone: 'fechar' });
    case 'contrato_cancelado': return selo('neutro', 'Contrato cancelado', { icone: 'fechar' });
    default: return null;
  }
}

const VARIANTE_DA_PARCELA = { atrasada: 'perigo', vence_hoje: 'atencao' };
const FRASE_DA_SITUACAO = { atrasada: 'em atraso', vence_hoje: 'vence hoje', a_vencer: 'a vencer', sem_data: 'sem data de vencimento', recebida: 'recebida', cancelada: 'cancelada', contrato_cancelado: 'contrato cancelado' };

function quandoDaParcela(parcela, situacao, hoje) {
  const vencimento = diaDe(parcela.vencimento);
  switch (situacao.chave) {
    case 'atrasada':
    case 'vence_hoje':
    case 'a_vencer':
      return [h('strong', null, dataComDiaCurta(vencimento, hoje)), ` · ${textoDeDias(situacao.dias)}`];
    case 'recebida': {
      const quando = diaDe(parcela.recebida_em);
      return quando ? `Recebida em ${dataBR(quando)}` : 'Recebida (a data do recebimento não foi registrada)';
    }
    case 'sem_data': return 'Sem data de vencimento';
    default: return vencimento ? `Vencimento: ${dataBR(vencimento)}` : null;
  }
}

/**
 * Linha de uma parcela (<li>). Mostra: cliente, contrato (objeto), numero da parcela (2/10), valor, vencimento e situacao.
 * `hoje` = hojeEmCuiaba(). `contrato` e `pessoa` podem ser null. `mostrarCliente: false` (na ficha do proprio cliente) troca o titulo por
 * "Parcela 2/10". `href` leva ao cliente (passe null para linha sem link).
 */
export function linhaDeParcela(parcela, { hoje, contrato = null, pessoa = null, mostrarCliente = true, href = null } = {}) {
  const situacao = situacaoDaParcela(parcela, contrato, hoje);
  const rotulo = rotuloDaParcela(parcela);
  const valor = valorDaParcela(parcela);
  const recebido = valorRecebidoDaParcela(parcela);
  const recebida = situacao.chave === 'recebida';
  const cliente = pessoa ? pessoa.nome : 'Cliente não identificado';
  const objeto = contrato && contrato.objeto ? contrato.objeto : 'Contrato sem descrição';
  const diferente = recebida && recebido !== valor;
  return linhaDeLista({
    href,
    titulo: mostrarCliente ? cliente : (rotulo === 'Entrada' ? 'Entrada' : `Parcela ${rotulo}`),
    quando: quandoDaParcela(parcela, situacao, hoje),
    subtitulo: mostrarCliente ? objeto : null,
    subtitulo2: mostrarCliente
      ? (rotulo === 'Entrada' ? 'Entrada' : `Parcela ${rotulo}`) + (diferente ? ` · valor da parcela ${dinheiro(valor)}` : '')
      : (diferente ? `Valor da parcela: ${dinheiro(valor)}` : null),
    data: dinheiro(recebida ? recebido : valor),
    selos: [seloDaParcela(situacao.chave)],
    variante: VARIANTE_DA_PARCELA[situacao.chave] || null,
    rotulo: href ? `${mostrarCliente ? cliente : 'Parcela'}, parcela ${rotulo}, ${dinheiro(recebida ? recebido : valor)}, ${FRASE_DA_SITUACAO[situacao.chave] || 'situação não informada'}. Abrir o cliente.` : null,
  });
}
