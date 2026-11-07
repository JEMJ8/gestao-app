// Busca geral do menu Mais: procura em clientes (nome), processos (numero, com ou sem pontuacao, e nome das partes) e prazos (ato).
// Modulo puro (sem tela e sem rede): recebe as listas e devolve os resultados agrupados. A tela decide como mostrar.
//
//   buscarEmTudo('banco modelo', { pessoas, processos, partes, prazos })
//     -> { termo, valida, numero, clientes: [pessoa], outras: [pessoa], processos: [{ processo, motivo }], prazos: [prazo] }
//
// Regras:
//   - Nome e ato: sem diferenciar maiuscula nem acento; todas as palavras digitadas precisam aparecer (formato.contemBusca).
//   - Numero de processo: se o que foi digitado so tem digitos e pontuacao (. - / espaco) e pelo menos 3 digitos, compara so os digitos:
//     "0000001-00.2024" acha o mesmo que "000000100 2024". O trecho pode estar em qualquer lugar do numero.
//   - Partes: o processo aparece quando o nome de UMA das partes (cliente ou outro lado) tem todas as palavras. `motivo` diz por que achou.
//   - Cliente e a pessoa com eh_cliente = 1. Quem nao e cliente (outro lado, contato) vem em `outras`, para nao sumir da busca.
//   - Busca com menos de 2 letras (e que nao seja um numero) nao procura nada: `valida` fica falso.

import { contemBusca, semAcento, somenteDigitos } from '../formato.js';
import { ordenarPorDataFatal, prazoAberto } from '../dominio.js';

export const MINIMO_DE_LETRAS = 2;
export const MINIMO_DE_DIGITOS = 3;

/** Entende o que foi digitado: { texto, digitos, numero, valida }. */
export function interpretarBusca(termo) {
  const texto = String(termo ?? '').replace(/\s+/g, ' ').trim();
  const digitos = somenteDigitos(texto);
  const numero = /^[\d\s.\-\/]+$/.test(texto) && digitos.length >= MINIMO_DE_DIGITOS;
  const letras = (semAcento(texto).match(/[\p{L}\p{N}]/gu) || []).length;      // so letra ou numero conta: pontuacao sozinha nao e busca
  return { texto, digitos, numero, valida: numero || letras >= MINIMO_DE_LETRAS };
}

function porNome(a, b) {
  return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' }) || String(a.id).localeCompare(String(b.id));
}

export function buscarEmTudo(termo, { pessoas = [], processos = [], partes = [], prazos = [] } = {}) {
  const b = interpretarBusca(termo);
  const resultado = { termo: b.texto, valida: b.valida, numero: b.numero, clientes: [], outras: [], processos: [], prazos: [] };
  if (!b.valida) return resultado;

  const achadas = pessoas.filter((p) => contemBusca(p.nome, b.texto));
  resultado.clientes = achadas.filter((p) => Number(p.eh_cliente) === 1).sort(porNome);
  resultado.outras = achadas.filter((p) => Number(p.eh_cliente) !== 1).sort(porNome);

  const pessoaPorId = new Map(pessoas.map((p) => [p.id, p]));
  const partesDoProcesso = new Map();
  for (const parte of partes) {
    const pessoa = pessoaPorId.get(parte.pessoa_id);
    if (!pessoa) continue;
    if (!partesDoProcesso.has(parte.processo_id)) partesDoProcesso.set(parte.processo_id, []);
    partesDoProcesso.get(parte.processo_id).push({ parte, pessoa });
  }
  for (const processo of processos) {
    if (b.numero && somenteDigitos(processo.numero).includes(b.digitos)) {
      resultado.processos.push({ processo, motivo: { tipo: 'numero' } });
      continue;
    }
    const achada = (partesDoProcesso.get(processo.id) || []).find(({ pessoa }) => contemBusca(pessoa.nome, b.texto));
    if (achada) resultado.processos.push({ processo, motivo: { tipo: 'parte', nome: achada.pessoa.nome, doEscritorio: Number(achada.parte.cliente_escritorio) === 1 } });
  }
  resultado.processos.sort((a, c) => String(a.processo.numero).localeCompare(String(c.processo.numero)) || String(a.processo.id).localeCompare(String(c.processo.id)));

  const dosAtos = prazos.filter((p) => contemBusca(p.ato, b.texto));
  const abertos = ordenarPorDataFatal(dosAtos.filter(prazoAberto));
  const encerrados = ordenarPorDataFatal(dosAtos.filter((p) => !prazoAberto(p))).reverse();     // os encerrados mais recentes primeiro
  resultado.prazos = [...abertos, ...encerrados];
  return resultado;
}

/** Quantos achados no total (para dizer "nada encontrado" e para o leitor de tela). */
export function totalDeAchados(resultado) {
  return resultado.clientes.length + resultado.outras.length + resultado.processos.length + resultado.prazos.length;
}
