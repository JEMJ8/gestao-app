// Clientes: lista com busca pelo nome e a ficha de cada cadastro (contatos com acao direta, processos, prazos abertos, contratos e parcelas).
//
// Lista (/clientes): por padrao so os clientes do escritorio (eh_cliente = 1); um alternador mostra todas as pessoas (outro lado, contatos).
// Ficha (/cliente/:id): serve para qualquer cadastro, cliente ou nao. Somente leitura: o celular nao muda cadastro, contrato nem parcela.
// Tudo que vem da nuvem entra como texto. O que foi digitado e o filtro escolhido voltam quando a pessoa aperta Voltar da ficha.

import { registrar, href } from '../rotas.js';
import * as dados from '../dados.js';
import { h, preencher } from '../ui.js';
import { dataBR, hojeEmCuiaba } from '../datas.js';
import { dinheiro, iniciais, plural } from '../formato.js';
import { prazoAberto, ordenarPorDataFatal } from '../dominio.js';
import { cartao } from '../componentes/cartao.js';
import { lista, linhaDeLista, linhaDePrazo, numeroDoProcesso } from '../componentes/linha.js';
import { selo } from '../componentes/selo.js';
import { vazio } from '../componentes/vazio.js';
import { campoDeBusca, alternador, lembrar, lembrado } from '../componentes/filtros.js';
import { avisoDeCarga } from '../componentes/carga.js';
import { linhaDePessoa, filtrarPessoas, ehCliente, ROTULO_TIPO_DE_PESSOA } from '../componentes/pessoa.js';
import { blocoDoContato } from '../componentes/contato.js';
import {
  ROTULO_CONTRATO, ROTULO_MODALIDADE, blocoDeValores, centavos, linhaDeParcela, resumoDoContrato,
} from '../componentes/parcela.js';

const PESSOAS_POR_PAGINA = 60;
const PRAZOS_VISIVEIS = 10;
const PROCESSOS_VISIVEIS = 10;
const PARCELAS_VISIVEIS = 12;

const ROTULO_POLO = { ativo: 'Polo ativo', passivo: 'Polo passivo', terceiro: 'Terceiro' };
const ROTULO_PROCESSO = { ativo: 'Ativo', sobrestado: 'Sobrestado', suspenso: 'Suspenso', arquivado: 'Arquivado', encerrado: 'Encerrado' };
const VARIANTE_DO_PROCESSO = { sobrestado: 'atencao', suspenso: 'atencao', arquivado: 'neutro', encerrado: 'neutro' };

// ---------------------------------------------------------------- lista

function frasePessoas(quantas, total, soClientes, comBusca) {
  const nome = soClientes ? plural(total, 'cliente', 'clientes') : plural(total, 'pessoa', 'pessoas');
  if (!comBusca) return nome;
  return `${quantas} de ${nome}`;
}

registrar('/clientes', (ctx) => {
  ctx.titulo('Clientes');
  let busca = String(lembrado('clientes.busca', '') || '');
  let soClientes = lembrado('clientes.quem', 'clientes') !== 'todas';
  let visiveis = PESSOAS_POR_PAGINA;

  const campo = campoDeBusca({
    rotulo: 'Buscar cliente pelo nome',
    placeholder: 'Buscar pelo nome',
    valor: busca,
    aoMudar: (texto) => {
      busca = texto;
      visiveis = PESSOAS_POR_PAGINA;
      lembrar('clientes.busca', texto);
      desenhar();
    },
  });
  ctx.aoLimpar(campo.parar);
  const quem = alternador({
    rotulo: 'Quem mostrar',
    opcoes: [{ valor: 'clientes', rotulo: 'Clientes', contagem: 0 }, { valor: 'todas', rotulo: 'Todas as pessoas', contagem: 0 }],
    atual: soClientes ? 'clientes' : 'todas',
    aoEscolher: (valor) => {
      soClientes = valor === 'clientes';
      visiveis = PESSOAS_POR_PAGINA;
      lembrar('clientes.quem', valor);
      desenhar();
    },
  });
  const resumo = h('p', { class: 'clientes-resumo texto-2', role: 'status' });
  const area = h('div', { class: 'clientes-area' });
  preencher(ctx.raiz, campo.el, quem.el, resumo, area);

  function desenhar() {
    const aviso = avisoDeCarga();
    if (aviso) {
      resumo.textContent = '';
      preencher(area, aviso);
      return;
    }
    const todas = dados.obter('pessoa');
    const clientes = todas.filter(ehCliente).length;
    quem.atualizar({ atual: soClientes ? 'clientes' : 'todas', contagens: { clientes, todas: todas.length } });
    const achadas = filtrarPessoas(todas, { busca, soClientes });
    const comBusca = busca.trim() !== '';
    resumo.textContent = frasePessoas(achadas.length, soClientes ? clientes : todas.length, soClientes, comBusca);

    if (!achadas.length) {
      const outras = comBusca && soClientes ? filtrarPessoas(todas, { busca, soClientes: false }).length : 0;
      preencher(area, comBusca
        ? vazio({
          icone: 'busca',
          titulo: 'Nada encontrado',
          texto: outras
            ? `Nenhum cliente com “${busca.trim()}”, mas há ${plural(outras, 'cadastro', 'cadastros')} com esse nome entre todas as pessoas.`
            : `Nenhum cadastro combina com “${busca.trim()}”. Confira a grafia ou digite menos palavras.`,
          acao: outras ? h('button', { class: 'botao', type: 'button', onclick: () => { soClientes = false; lembrar('clientes.quem', 'todas'); desenhar(); } }, 'Procurar em todas as pessoas') : null,
        })
        : vazio({ icone: 'pessoas', titulo: soClientes ? 'Nenhum cliente cadastrado' : 'Nenhum cadastro', texto: 'Quando o computador sincronizar, os cadastros aparecem aqui.' }));
      return;
    }
    const mostradas = achadas.slice(0, visiveis);
    const restantes = achadas.length - mostradas.length;
    preencher(area,
      cartao({ corpo: 'lista', rotulo: soClientes ? 'Lista de clientes' : 'Lista de pessoas' }, lista(mostradas.map((p) => linhaDePessoa(p, { selo: !soClientes })))),
      restantes > 0
        ? h('div', { class: 'clientes-mais' },
          h('button', { class: 'botao botao--cheio', type: 'button', onclick: () => { visiveis += PESSOAS_POR_PAGINA; desenhar(); } },
            `Mostrar mais ${Math.min(restantes, PESSOAS_POR_PAGINA)} (faltam ${restantes})`))
        : null);
  }

  desenhar();
  ctx.aoMudarDados(() => {
    const estado = dados.estado();
    if (!(estado.atualizando && estado.carregado)) desenhar();
  });
}, { aba: 'mais', pai: '/mais' });

// ---------------------------------------------------------------- ficha

function papelNoProcesso(pessoaId, processoId) {
  const ditos = new Set();
  for (const parte of dados.agrupar('parte', 'processo_id').get(processoId) || []) {
    if (parte.pessoa_id !== pessoaId) continue;
    ditos.add(parte.papel || ROTULO_POLO[parte.polo] || 'Parte');
  }
  return [...ditos].join(' / ');
}

function linhaDoProcesso(processo, pessoaId) {
  const situacao = ROTULO_PROCESSO[processo.situacao];
  return linhaDeLista({
    href: href('/processo/:id', { id: processo.id }),
    icone: 'processo',
    titulo: numeroDoProcesso(processo.numero),
    subtitulo: processo.acao_descricao || null,
    subtitulo2: papelNoProcesso(pessoaId, processo.id) || null,
    selos: [processo.situacao && processo.situacao !== 'ativo' && situacao ? selo(VARIANTE_DO_PROCESSO[processo.situacao] || 'neutro', situacao) : null],
  });
}

function botaoMostrarTodos(total, aoClicar) {
  return h('div', { class: 'ficha-mais' }, h('button', { class: 'botao botao--discreto botao--cheio', type: 'button', onclick: aoClicar }, `Mostrar todos (${total})`));
}

function cabecalho(pessoa) {
  return h('header', { class: 'ficha-cabeca' },
    h('span', { class: 'ficha-iniciais', 'aria-hidden': 'true' }, iniciais(pessoa.nome)),
    h('div', { class: 'ficha-titulos' },
      h('h2', { class: 'ficha-nome' }, pessoa.nome),
      h('div', { class: 'selos' },
        selo('neutro', ROTULO_TIPO_DE_PESSOA[pessoa.tipo] || 'Cadastro'),
        ehCliente(pessoa) ? selo('ok', 'Cliente do escritório', { icone: 'ok' }) : selo('neutro', 'Outra pessoa'))));
}

function cartaoDeContatos(pessoa) {
  const contatos = dados.contatosDaPessoa(pessoa.id);
  if (!contatos.length) {
    return cartao({ titulo: 'Contatos', icone: 'telefone' }, h('p', { class: 'texto-2' }, 'Nenhum contato cadastrado.'));
  }
  return cartao({ titulo: 'Contatos', icone: 'telefone', corpo: 'lista' },
    h('ul', { class: 'contatos' }, contatos.map(blocoDoContato)),
    h('p', { class: 'ficha-nota texto-2 texto-pequeno' }, 'Os botões só abrem o telefone, o e-mail ou o WhatsApp. Nada é enviado sozinho.'));
}

function cartaoDePrazos(prazos, hoje, expandido, aoExpandir) {
  const titulo = `Prazos abertos (${prazos.length})`;
  if (!prazos.length) {
    return cartao({ titulo, icone: 'relogio' }, h('p', { class: 'texto-2' }, 'Nenhum prazo aberto nos processos deste cadastro.'));
  }
  const mostrados = expandido ? prazos : prazos.slice(0, PRAZOS_VISIVEIS);
  return cartao({ titulo, icone: 'relogio', corpo: 'lista' },
    lista(mostrados.map((p) => linhaDePrazo(p, { hoje, mostrarCliente: false }))),
    prazos.length > mostrados.length ? botaoMostrarTodos(prazos.length, aoExpandir) : null);
}

function cartaoDeProcessos(processos, pessoaId, expandido, aoExpandir) {
  const titulo = `Processos (${processos.length})`;
  if (!processos.length) {
    return cartao({ titulo, icone: 'processo' }, h('p', { class: 'texto-2' }, 'Este cadastro não é parte em nenhum processo.'));
  }
  const mostrados = expandido ? processos : processos.slice(0, PROCESSOS_VISIVEIS);
  return cartao({ titulo, icone: 'processo', corpo: 'lista' },
    lista(mostrados.map((p) => linhaDoProcesso(p, pessoaId))),
    processos.length > mostrados.length ? botaoMostrarTodos(processos.length, aoExpandir) : null);
}

function cartaoDoContrato(contrato, pessoa, hoje, expandido, aoExpandir) {
  const parcelas = dados.parcelasDoContrato(contrato.id);
  const soma = resumoDoContrato(parcelas, contrato, hoje);
  const mostradas = expandido ? parcelas : parcelas.slice(0, PARCELAS_VISIVEIS);
  const cancelado = contrato.situacao === 'cancelado';
  const situacao = ROTULO_CONTRATO[contrato.situacao] || contrato.situacao;
  return cartao({ titulo: contrato.objeto || 'Contrato sem descrição', icone: 'dinheiro', corpo: 'lista', classe: 'contrato' },
    h('div', { class: 'contrato-cabeca' },
      h('div', { class: 'selos' },
        selo('neutro', ROTULO_MODALIDADE[contrato.modalidade] || 'Contrato'),
        selo(contrato.situacao === 'quitado' ? 'ok' : 'neutro', situacao, { icone: contrato.situacao === 'quitado' ? 'ok' : cancelado ? 'fechar' : null })),
      h('p', { class: 'texto-2' },
        `Valor do contrato: ${dinheiro(centavos(contrato.valor_total_centavos))}`,
        contrato.data_contrato ? ` · assinado em ${dataBR(String(contrato.data_contrato).slice(0, 10))}` : null),
      cancelado
        ? h('p', { class: 'texto-2' }, 'Contrato cancelado: as parcelas abertas não são mais cobradas.')
        : blocoDeValores([
          { rotulo: 'Recebido', centavos: soma.recebido, variante: 'ok', icone: 'ok' },
          { rotulo: 'A vencer', centavos: soma.aVencer, variante: 'info', icone: 'relogio' },
          { rotulo: 'Em atraso', centavos: soma.emAtraso, variante: soma.emAtraso > 0 ? 'perigo' : null, icone: 'alerta' },
        ])),
    parcelas.length
      ? lista(mostradas.map((p) => linhaDeParcela(p, { hoje, contrato, pessoa, mostrarCliente: false })))
      : h('p', { class: 'ficha-nota texto-2' }, 'Este contrato não tem parcelas cadastradas.'),
    parcelas.length > mostradas.length ? botaoMostrarTodos(parcelas.length, aoExpandir) : null);
}

function cartoesDeContratos(pessoa, hoje, expandidos, aoExpandir) {
  const contratos = [...dados.contratosDaPessoa(pessoa.id)].sort((a, b) => (
    Number(b.situacao === 'ativo') - Number(a.situacao === 'ativo')
    || String(b.data_contrato || '').localeCompare(String(a.data_contrato || ''))
    || String(a.id).localeCompare(String(b.id))));
  if (!contratos.length) {
    return cartao({ titulo: 'Contratos e parcelas (0)', icone: 'dinheiro' }, h('p', { class: 'texto-2' }, 'Nenhum contrato de honorários cadastrado.'));
  }
  return [
    h('h2', { class: 'secao-titulo' }, `Contratos e parcelas (${contratos.length})`),
    contratos.map((c) => cartaoDoContrato(c, pessoa, hoje, expandidos.has(c.id), () => aoExpandir(c.id))),
  ];
}

registrar('/cliente/:id', (ctx) => {
  ctx.titulo('Cliente');
  const id = ctx.params.id;
  const expandidos = new Set();

  function expandir(chave) {
    expandidos.add(chave);
    desenhar();
  }

  function desenhar() {
    const aviso = avisoDeCarga();
    if (aviso) { preencher(ctx.raiz, aviso); return; }
    const pessoa = dados.linha('pessoa', id);
    if (!pessoa) {
      preencher(ctx.raiz, vazio({
        icone: 'pessoas',
        titulo: 'Cadastro não encontrado',
        texto: 'Este cadastro não está neste aparelho. Atualize os dados ou volte para a lista de clientes.',
        acao: h('a', { class: 'botao', href: href('/clientes') }, 'Ver a lista de clientes'),
      }));
      return;
    }
    const hoje = hojeEmCuiaba();
    const processos = [...dados.processosDaPessoa(id)].sort((a, b) => (
      Number(b.situacao === 'ativo') - Number(a.situacao === 'ativo') || String(a.numero).localeCompare(String(b.numero))));
    const prazos = ordenarPorDataFatal(processos.flatMap((p) => dados.prazosDoProcesso(p.id)).filter(prazoAberto));
    preencher(ctx.raiz,
      cabecalho(pessoa),
      cartaoDeContatos(pessoa),
      cartaoDePrazos(prazos, hoje, expandidos.has('prazos'), () => expandir('prazos')),
      cartaoDeProcessos(processos, id, expandidos.has('processos'), () => expandir('processos')),
      cartoesDeContratos(pessoa, hoje, expandidos, expandir));
  }

  desenhar();
  ctx.aoMudarDados(() => {
    const estado = dados.estado();
    if (!(estado.atualizando && estado.carregado)) desenhar();
  });
  ctx.aoVirarODia(desenhar);
}, { aba: 'mais', pai: '/clientes' });
