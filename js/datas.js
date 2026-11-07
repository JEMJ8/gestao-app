// TODA a logica de data e hora do aplicativo mora aqui. Nenhuma outra tela calcula data por conta propria.
//
// Regras que valem para o aplicativo inteiro:
//  - O fuso e o de Cuiaba, UTC-4 o ano todo (o Brasil nao tem horario de verao desde 2019). "Hoje" e a data de Cuiaba, nunca a de UTC
//    e nunca a do aparelho: o advogado pode estar em outro fuso e o prazo continua sendo o de Cuiaba.
//  - Datas viajam como TEXTO "AAAA-MM-DD". Momentos viajam como texto ISO com fuso ("2026-11-09T14:00:00-04:00") ou com Z.
//    Nada aqui usa Date.parse nem o fuso do aparelho: o texto e lido por expressao regular e a conta e feita com Date.UTC.
//  - Momento SEM fuso no texto e entendido como horario de Cuiaba (e assim que o banco do computador grava os eventos).
//  - Todas as funcoes que dependem do relogio recebem o instante como argumento opcional (milissegundos), para o teste poder fixa-lo.
//
// Modulo puro (sem DOM, sem rede): e testado no navegador por testes/test_celular_app_nucleo_js.py.

export const DESLOCAMENTO_CUIABA_MIN = -240;
const DESLOCAMENTO_MS = DESLOCAMENTO_CUIABA_MIN * 60000;
const MS_DIA = 86400000;

export const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const DIAS_ABREV = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const dois = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- datas "AAAA-MM-DD"

export function isoDe(ano, mes, dia) {
  return `${String(ano).padStart(4, '0')}-${dois(mes)}-${dois(dia)}`;
}

export function ultimoDiaDoMes(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** [ano, mes, dia] de um texto AAAA-MM-DD que existe no calendario; senao null (31/02 e 2025-13-01 nao existem). */
export function partesDaData(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof iso === 'string' ? iso : '');
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > ultimoDiaDoMes(ano, mes)) return null;
  return [ano, mes, dia];
}

export function dataValida(iso) {
  return partesDaData(iso) !== null;
}

function utcDe(iso) {
  const p = partesDaData(iso);
  if (!p) throw new RangeError(`data invalida: ${iso}`);
  return Date.UTC(p[0], p[1] - 1, p[2]);
}

export function somarDias(iso, n) {
  const d = new Date(utcDe(iso) + n * MS_DIA);
  return isoDe(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Quantos dias de `deIso` ate `ateIso` (negativo se `ateIso` e anterior). */
export function diferencaDias(deIso, ateIso) {
  return Math.round((utcDe(ateIso) - utcDe(deIso)) / MS_DIA);
}

/** 0 = domingo ... 6 = sabado. */
export function diaDaSemana(iso) {
  return new Date(utcDe(iso)).getUTCDay();
}

export function somarMeses(iso, meses) {
  const p = partesDaData(iso);
  if (!p) throw new RangeError(`data invalida: ${iso}`);
  const [a, m, d] = p;
  const indice = a * 12 + (m - 1) + meses;
  const ano = Math.floor(indice / 12);
  const mes = (indice % 12) + 1;
  return isoDe(ano, mes, Math.min(d, ultimoDiaDoMes(ano, mes)));
}

export function primeiroDiaDoMes(iso) {
  const [a, m] = partesDaData(iso);
  return isoDe(a, m, 1);
}

export function ultimoDiaDoMesDe(iso) {
  const [a, m] = partesDaData(iso);
  return isoDe(a, m, ultimoDiaDoMes(a, m));
}

/** Segunda-feira da semana de `iso` (a semana do aplicativo comeca na segunda). */
export function inicioDaSemana(iso) {
  const dow = diaDaSemana(iso);
  return somarDias(iso, -((dow + 6) % 7));
}

/** Os 7 dias da semana (segunda a domingo) que contem `iso`. */
export function diasDaSemana(iso) {
  const inicio = inicioDaSemana(iso);
  return Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
}

// ---------------------------------------------------------------- formatos pt-BR

export function dataBR(iso) {
  const p = partesDaData(iso);
  return p ? `${dois(p[2])}/${dois(p[1])}/${p[0]}` : '';
}

/** 09/11 */
export function dataCurta(iso) {
  const p = partesDaData(iso);
  return p ? `${dois(p[2])}/${dois(p[1])}` : '';
}

/** seg, 09/11/2026 */
export function dataComDia(iso) {
  return partesDaData(iso) ? `${DIAS_ABREV[diaDaSemana(iso)]}, ${dataBR(iso)}` : '';
}

/** seg, 09/11 (no ano de `hoje`) ou seg, 09/11/2027 (em outro ano): para linhas de lista, onde o ano so atrapalha quando e o mesmo. */
export function dataComDiaCurta(iso, hoje) {
  if (!partesDaData(iso)) return '';
  return hoje && iso.slice(0, 4) === hoje.slice(0, 4) ? `${DIAS_ABREV[diaDaSemana(iso)]}, ${dataCurta(iso)}` : dataComDia(iso);
}

/** segunda-feira, 9 de novembro de 2026 */
export function dataExtenso(iso) {
  const p = partesDaData(iso);
  return p ? `${DIAS_SEMANA[diaDaSemana(iso)]}, ${p[2]} de ${MESES[p[1] - 1]} de ${p[0]}` : '';
}

/** 9 de nov */
export function diaEMes(iso) {
  const p = partesDaData(iso);
  return p ? `${p[2]} de ${MESES_ABREV[p[1] - 1]}` : '';
}

/** novembro de 2026 */
export function mesPorExtenso(iso) {
  const p = partesDaData(iso);
  return p ? `${MESES[p[1] - 1]} de ${p[0]}` : '';
}

/** "Hoje", "Amanhã", "Ontem" ou "seg, 09/11" (e o ano so quando nao e o de `hoje`). */
export function rotuloDoDia(iso, hoje) {
  if (!partesDaData(iso)) return '';
  const d = diferencaDias(hoje, iso);
  if (d === 0) return 'Hoje';
  if (d === 1) return 'Amanhã';
  if (d === -1) return 'Ontem';
  const mesmoAno = iso.slice(0, 4) === hoje.slice(0, 4);
  return mesmoAno ? `${DIAS_ABREV[diaDaSemana(iso)]}, ${dataCurta(iso)}` : dataComDia(iso);
}

/** Frase de prazo para quem le: "venceu há 3 dias", "vence hoje", "vence amanhã", "vence em 5 dias". `dias` = data fatal - hoje. */
export function textoDeDias(dias) {
  if (!Number.isFinite(dias)) return 'data fatal que o celular não entende';
  if (dias < -1) return `venceu há ${-dias} dias`;
  if (dias === -1) return 'venceu ontem';
  if (dias === 0) return 'vence hoje';
  if (dias === 1) return 'vence amanhã';
  return `vence em ${dias} dias`;
}

// ---------------------------------------------------------------- momentos (data + hora, com fuso)

const MOMENTO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/**
 * Le um texto de data ou de momento e devolve o instante absoluto (milissegundos desde 1970) ou NaN.
 * "2026-11-09T14:00:00-04:00" e "2026-11-09T18:00:00Z" dao o mesmo instante. Sem fuso no texto vale Cuiaba. So data vale 00:00 de Cuiaba.
 */
export function epochDe(texto) {
  const m = MOMENTO.exec(typeof texto === 'string' ? texto.trim() : '');
  if (!m) return NaN;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const hora = m[4] === undefined ? 0 : Number(m[4]);
  const minuto = m[5] === undefined ? 0 : Number(m[5]);
  const segundo = m[6] === undefined ? 0 : Number(m[6]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > ultimoDiaDoMes(ano, mes) || hora > 23 || minuto > 59 || segundo > 59) return NaN;
  const ms = m[7] === undefined ? 0 : Math.floor(Number(`0.${m[7]}`) * 1000);
  let deslocamentoMin = DESLOCAMENTO_CUIABA_MIN;
  if (m[8] !== undefined) {
    if (m[8].toUpperCase() === 'Z') {
      deslocamentoMin = 0;
    } else {
      const sinal = m[8][0] === '-' ? -1 : 1;
      const digitos = m[8].slice(1).replace(':', '');
      const hh = Number(digitos.slice(0, 2));
      const mm = digitos.length > 2 ? Number(digitos.slice(2)) : 0;
      if (hh > 14 || mm > 59) return NaN;
      deslocamentoMin = sinal * (hh * 60 + mm);
    }
  }
  return Date.UTC(ano, mes - 1, dia, hora, minuto, segundo, ms) - deslocamentoMin * 60000;
}

/** { epoch, data, hora, minutos } no relogio de Cuiaba para o instante `epoch`. `hora` e "HH:MM"; `minutos` e minutos desde 00:00. */
export function emCuiaba(epoch) {
  if (!Number.isFinite(epoch)) return null;
  const d = new Date(epoch + DESLOCAMENTO_MS);
  return {
    epoch,
    data: isoDe(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
    hora: `${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}`,
    minutos: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

/** O momento do texto, no relogio de Cuiaba (ver epochDe), ou null se o texto nao e uma data/hora valida. */
export function momentoEmCuiaba(texto) {
  return emCuiaba(epochDe(texto));
}

/** A data (AAAA-MM-DD) de Cuiaba em que o momento acontece; null se o texto for invalido. */
export function dataDoMomento(texto) {
  const m = momentoEmCuiaba(texto);
  return m ? m.data : null;
}

/** "14:00" (hora de Cuiaba) ou null. */
export function horaDoMomento(texto) {
  const m = momentoEmCuiaba(texto);
  return m ? m.hora : null;
}

/** Instante em que o dia `iso` de Cuiaba comeca (00:00) e termina (o instante seguinte ao ultimo milissegundo). */
export function limitesDoDia(iso) {
  const inicio = utcDe(iso) - DESLOCAMENTO_MS;
  return { de: inicio, ate: inicio + MS_DIA };
}

const MESES_EM_INGLES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Instante de um cabecalho "Date" de resposta HTTP ("Mon, 09 Nov 2026 18:00:00 GMT"), ou NaN. Serve para corrigir um relogio de aparelho errado. */
export function epochDeDataHttp(texto) {
  const m = /^[A-Za-z]{3}, (\d{2}) ([A-Za-z]{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(typeof texto === 'string' ? texto.trim() : '');
  if (!m) return NaN;
  const mes = MESES_EM_INGLES.indexOf(m[2].toLowerCase());
  if (mes < 0) return NaN;
  return Date.UTC(Number(m[3]), mes, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]));
}

// ---------------------------------------------------------------- agora e hoje

// Quanto o relogio do servidor esta a frente (+) ou atras (-) do relogio do aparelho, aprendido pelo cabecalho Date de uma leitura da nuvem
// (dados.js chama definirDesvioDoRelogio). Sem isso um aparelho com a hora errada diria "hoje" no dia errado e classificaria todos os prazos
// errado, sem aviso. Fica 0 ate a primeira leitura (e o relogio do aparelho vale).
let desvioDoRelogioMs = 0;

export function definirDesvioDoRelogio(ms) {
  desvioDoRelogioMs = Number.isFinite(ms) ? ms : 0;
}

/** O instante de agora (ms) pelo relogio do servidor: a hora do aparelho corrigida pelo desvio conhecido. */
export function agoraCerto() {
  return Date.now() + desvioDoRelogioMs;
}

/** O relogio de Cuiaba agora: { epoch, data, hora, minutos }. */
export function agoraEmCuiaba(agoraMs = agoraCerto()) {
  return emCuiaba(agoraMs);
}

/** Hoje em Cuiaba (AAAA-MM-DD). Perto da meia-noite de UTC a data do aparelho pode ser outra: aqui nao. */
export function hojeEmCuiaba(agoraMs = agoraCerto()) {
  return emCuiaba(agoraMs).data;
}

/**
 * Quando algo aconteceu, em palavras: "agora há pouco", "há 12 min", "hoje às 14:32", "ontem às 09:10", "05/11 às 16:00" (com o ano
 * se for de outro ano). `epoch` e o instante do fato.
 */
export function quandoFoi(epoch, agoraMs = agoraCerto()) {
  const f = emCuiaba(epoch);
  if (!f) return '';
  const minutos = Math.floor((agoraMs - epoch) / 60000);
  if (minutos < 1) return 'agora há pouco';
  if (minutos < 60) return `há ${minutos} min`;
  const hoje = hojeEmCuiaba(agoraMs);
  const dif = diferencaDias(f.data, hoje);
  if (dif === 0) return `hoje às ${f.hora}`;
  if (dif === 1) return `ontem às ${f.hora}`;
  const data = f.data.slice(0, 4) === hoje.slice(0, 4) ? dataCurta(f.data) : dataBR(f.data);
  return `${data} às ${f.hora}`;
}

/** Duracao em palavras: "5 min", "3 h", "2 h 10 min", "4 dias". Para "faz quanto tempo". */
export function duracaoEmPalavras(ms) {
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) {
    const resto = min % 60;
    return resto ? `${h} h ${resto} min` : `${h} h`;
  }
  const dias = Math.floor(h / 24);
  return dias === 1 ? '1 dia' : `${dias} dias`;
}

/** O horario de um evento em palavras: "14:00", "14:00 às 15:30" ou "dia inteiro". */
export function faixaDeHorario(inicio, fim, diaInteiro) {
  if (diaInteiro) return 'dia inteiro';
  const a = horaDoMomento(inicio);
  const b = fim ? horaDoMomento(fim) : null;
  if (!a) return '';
  return b && b !== a ? `${a} às ${b}` : a;
}
