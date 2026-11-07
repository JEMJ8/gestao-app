// Linha de uma pessoa do cadastro (cliente ou outra pessoa). Usada na lista de Clientes e nos resultados da busca geral do menu Mais.
//
//   linhaDePessoa(pessoa)                          -> <li> com nome, tipo, quantos processos e (se nao for cliente) o selo "Outra pessoa"
//   linhaDePessoa(pessoa, { selo: false })         -> sem o selo (quando o titulo do grupo ja diz que nao sao clientes)

import { href } from '../rotas.js';
import * as dados from '../dados.js';
import { contemBusca, plural } from '../formato.js';
import { linhaDeLista } from './linha.js';
import { selo } from './selo.js';

export const ROTULO_TIPO_DE_PESSOA = { PF: 'Pessoa física', PJ: 'Pessoa jurídica' };

export function ehCliente(pessoa) {
  return Number(pessoa.eh_cliente) === 1;
}

/**
 * As pessoas que a lista de Clientes mostra: por padrao so as do escritorio (eh_cliente = 1); com `soClientes: false`, todas.
 * `busca` filtra pelo nome (sem acento e sem diferenciar maiuscula; todas as palavras precisam aparecer). Ordem alfabetica.
 */
export function filtrarPessoas(pessoas, { busca = '', soClientes = true } = {}) {
  return pessoas
    .filter((p) => (!soClientes || ehCliente(p)) && contemBusca(p.nome, busca))
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' }) || String(a.id).localeCompare(String(b.id)));
}

export function linhaDePessoa(pessoa, { selo: comSelo = true } = {}) {
  const processos = dados.processosDaPessoa(pessoa.id).length;
  return linhaDeLista({
    href: href('/cliente/:id', { id: pessoa.id }),
    icone: 'pessoas',
    titulo: pessoa.nome,
    subtitulo: [ROTULO_TIPO_DE_PESSOA[pessoa.tipo] || 'Cadastro', plural(processos, 'processo', 'processos')].join(' · '),
    selos: [comSelo && !ehCliente(pessoa) ? selo('neutro', 'Outra pessoa') : null],
    rotulo: `${pessoa.nome}, ${ehCliente(pessoa) ? 'cliente' : 'outra pessoa'}, ${plural(processos, 'processo', 'processos')}. Abrir o cadastro.`,
  });
}
