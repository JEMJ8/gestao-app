// Menu Mais: busca geral (clientes, processos e prazos), atalhos para Processos, Clientes, Financeiro e Ajustes, e a hora em que o
// COMPUTADOR sincronizou pela ultima vez (ambar quando passa de 3 horas).
//
// A busca fica no alto. Sem nada digitado aparece o menu; digitando, aparecem os resultados agrupados e cada toque abre o destino certo
// (cliente, processo ou prazo). O que foi digitado volta quando a pessoa aperta Voltar de dentro de um resultado (ver componentes/filtros.js).
// Nenhuma rota nova: a busca vive dentro de /mais.

import { registrar, href } from '../rotas.js';
import * as dados from '../dados.js';
import { h, preencher, anunciar } from '../ui.js';
import { dataBR, emCuiaba, hojeEmCuiaba, quandoFoi } from '../datas.js';
import { dinheiro, plural } from '../formato.js';
import { cartao } from '../componentes/cartao.js';
import { lista, linhaDeLista, linhaDePrazo, numeroDoProcesso } from '../componentes/linha.js';
import { vazio } from '../componentes/vazio.js';
import { campoDeBusca, lembrar, lembrado } from '../componentes/filtros.js';
import { buscarEmTudo, interpretarBusca, totalDeAchados, MINIMO_DE_LETRAS, MINIMO_DE_DIGITOS } from '../componentes/busca-geral.js';
import { avisoDeCarga } from '../componentes/carga.js';
import { linhaDePessoa, ehCliente } from '../componentes/pessoa.js';
import { repartirParcelas, somaDoFiltro } from '../componentes/parcela.js';

const LINHAS_POR_GRUPO = 8;
const LIMITE_AO_EXPANDIR = 100;

// ---------------------------------------------------------------- menu

function itemDoFinanceiro(hoje) {
  const contratos = dados.indice('contrato');
  const atrasadas = repartirParcelas(dados.obter('parcela'), contratos, hoje).atrasadas;
  if (!atrasadas.length) return linhaDeLista({ href: href('/financeiro'), icone: 'dinheiro', titulo: 'Financeiro', subtitulo: 'Honorários, contratos e parcelas' });
  return linhaDeLista({
    href: href('/financeiro', {}, { filtro: 'atrasadas' }),
    icone: 'dinheiro',
    titulo: 'Financeiro',
    subtitulo: `${plural(atrasadas.length, 'parcela em atraso', 'parcelas em atraso')} (${dinheiro(somaDoFiltro(atrasadas, 'atrasadas'))})`,
    variante: 'perigo',
  });
}

function menu(hoje) {
  const carregado = dados.estado().carregado;
  const processos = dados.obter('processo').length;
  const clientes = dados.obter('pessoa').filter(ehCliente).length;
  return cartao({ corpo: 'lista', rotulo: 'Mais opções' }, lista([
    linhaDeLista({ href: href('/processos'), icone: 'processo', titulo: 'Processos', subtitulo: carregado ? plural(processos, 'processo', 'processos') : null }),
    linhaDeLista({ href: href('/clientes'), icone: 'pessoas', titulo: 'Clientes', subtitulo: carregado ? plural(clientes, 'cliente', 'clientes') : null }),
    carregado ? itemDoFinanceiro(hoje) : linhaDeLista({ href: href('/financeiro'), icone: 'dinheiro', titulo: 'Financeiro' }),
    linhaDeLista({ href: href('/ajustes'), icone: 'ajustes', titulo: 'Ajustes', subtitulo: 'Sincronização, aparência, sair' }),
  ]));
}

// ---------------------------------------------------------------- resultados da busca

function linhaDeProcessoAchado({ processo, motivo }) {
  const cliente = dados.nomeDoClienteDoProcesso(processo.id);
  const outroLado = motivo.tipo === 'parte' && !motivo.doEscritorio;
  return linhaDeLista({
    href: href('/processo/:id', { id: processo.id }),
    icone: 'processo',
    titulo: numeroDoProcesso(processo.numero),
    subtitulo: cliente || null,
    subtitulo2: outroLado ? `Parte: ${motivo.nome}` : (processo.acao_descricao || null),
  });
}

function grupo({ chave, titulo, nomeIcone, itens, linhaDe, expandidos, aoExpandir }) {
  if (!itens.length) return null;
  const aberto = expandidos.has(chave);
  const mostrados = itens.slice(0, aberto ? LIMITE_AO_EXPANDIR : LINHAS_POR_GRUPO);
  const rodape = [];
  if (!aberto && itens.length > mostrados.length) {
    rodape.push(h('div', { class: 'mais-rodape' },
      h('button', { class: 'botao botao--discreto botao--cheio', type: 'button', onclick: () => aoExpandir(chave) }, `Mostrar todos (${itens.length})`)));
  } else if (itens.length > mostrados.length) {
    rodape.push(h('p', { class: 'mais-rodape texto-2 texto-pequeno' }, `Mostrando os primeiros ${mostrados.length} de ${itens.length}. Digite mais letras para afinar a busca.`));
  }
  return cartao({ titulo: `${titulo} (${itens.length})`, icone: nomeIcone, corpo: 'lista' }, lista(mostrados.map(linhaDe)), rodape);
}

function frasePara(resultado) {
  const partes = [
    [resultado.clientes.length, 'cliente', 'clientes'],
    [resultado.outras.length, 'outra pessoa', 'outras pessoas'],
    [resultado.processos.length, 'processo', 'processos'],
    [resultado.prazos.length, 'prazo', 'prazos'],
  ].filter(([n]) => n > 0).map(([n, s, p]) => plural(n, s, p));
  return partes.length ? `Encontrado: ${partes.join(', ')}.` : 'Nada encontrado.';
}

function resultados(termo, hoje, expandidos, aoExpandir) {
  const achados = buscarEmTudo(termo, {
    pessoas: dados.obter('pessoa'), processos: dados.obter('processo'), partes: dados.obter('parte'), prazos: dados.obter('prazo'),
  });
  if (!totalDeAchados(achados)) {
    return {
      frase: frasePara(achados),
      conteudo: vazio({ icone: 'busca', titulo: 'Nada encontrado', texto: `Nenhum cliente, processo ou prazo combina com “${achados.termo}”. Confira a grafia ou digite menos palavras.` }),
    };
  }
  const blocos = [
    grupo({ chave: 'clientes', titulo: 'Clientes', nomeIcone: 'pessoas', itens: achados.clientes, linhaDe: (p) => linhaDePessoa(p, { selo: false }), expandidos, aoExpandir }),
    grupo({ chave: 'processos', titulo: 'Processos', nomeIcone: 'processo', itens: achados.processos, linhaDe: linhaDeProcessoAchado, expandidos, aoExpandir }),
    grupo({ chave: 'prazos', titulo: 'Prazos', nomeIcone: 'relogio', itens: achados.prazos, linhaDe: (p) => linhaDePrazo(p, { hoje }), expandidos, aoExpandir }),
    grupo({ chave: 'outras', titulo: 'Outras pessoas', nomeIcone: 'pessoas', itens: achados.outras, linhaDe: (p) => linhaDePessoa(p, { selo: false }), expandidos, aoExpandir }),
  ].filter(Boolean);
  return { frase: frasePara(achados), conteudo: h('div', { class: 'mais-resultados' }, blocos) };
}

// ---------------------------------------------------------------- quando o computador sincronizou

function momentoPorExtenso(ms) {
  const m = emCuiaba(ms);
  return m ? `${dataBR(m.data)} às ${m.hora}` : '';
}

function cartaoDaSincronia() {
  const estado = dados.estado();
  const c = estado.computador;
  if (!estado.carregado && !c.conhecido) return null;
  const agora = dados.agoraCorrigido();
  if (!c.conhecido || c.epoch === null) {
    return cartao({ titulo: 'Computador', icone: 'computador', variante: 'atencao', classe: 'mais-sincronia-cartao' },
      h('p', null, 'Não sei quando o computador sincronizou pela última vez. Ele pode estar desligado ou sem internet; prazos novos podem faltar.'));
  }
  return cartao(
    { titulo: 'Computador', icone: 'computador', variante: c.atrasado ? 'atencao' : null, classe: 'mais-sincronia-cartao' },
    h('p', null, 'Última sincronização do computador: ', h('strong', null, momentoPorExtenso(c.epoch)), ` (${quandoFoi(c.epoch, agora)}).`),
    c.atrasado ? h('p', { class: 'mais-sincronia-aviso' }, 'O computador está desligado ou sem internet; prazos novos podem faltar.') : null,
  );
}

// ---------------------------------------------------------------- a tela

registrar('/mais', (ctx) => {
  ctx.titulo('Mais');
  const expandidos = new Set();
  let termo = String(lembrado('mais.busca', '') || '');
  let ultimaFrase = '';

  const area = h('div', { class: 'mais-area' });
  const sincronia = h('div', { class: 'mais-sincronia' });

  function desenharArea(anunciarResultado = false) {
    const hoje = hojeEmCuiaba();
    const busca = interpretarBusca(termo);
    if (!busca.texto) {
      expandidos.clear();
      preencher(area, menu(hoje));
      return;
    }
    const aviso = avisoDeCarga();
    if (aviso) { preencher(area, aviso); return; }
    if (!busca.valida) {
      preencher(area, h('p', { class: 'mais-dica texto-2' }, `Digite pelo menos ${MINIMO_DE_LETRAS} letras, ou ${MINIMO_DE_DIGITOS} números do processo.`));
      return;
    }
    const r = resultados(termo, hoje, expandidos, (chave) => { expandidos.add(chave); desenharArea(); });
    preencher(area, r.conteudo);
    if (anunciarResultado && r.frase !== ultimaFrase) anunciar(r.frase);
    ultimaFrase = r.frase;
  }

  function desenharSincronia() {
    preencher(sincronia, cartaoDaSincronia());
  }

  const campo = campoDeBusca({
    rotulo: 'Buscar em clientes, processos e prazos',
    placeholder: 'Buscar cliente, processo ou prazo',
    valor: termo,
    aoMudar: (texto) => {
      termo = texto;
      expandidos.clear();
      lembrar('mais.busca', texto);
      desenharArea(true);
    },
  });
  ctx.aoLimpar(campo.parar);

  preencher(ctx.raiz, campo.el, area, sincronia);
  desenharArea();
  desenharSincronia();

  ctx.aoMudarDados(() => {
    const estado = dados.estado();
    if (!(estado.atualizando && estado.carregado)) desenharArea();    // durante a atualizacao os dados ainda nao mudaram
    desenharSincronia();
  });
  ctx.aoVirarODia(() => desenharArea());
  const relogio = window.setInterval(desenharSincronia, 30000);       // o "ha 12 min" anda sozinho
  ctx.aoLimpar(() => window.clearInterval(relogio));
}, { aba: 'mais' });
