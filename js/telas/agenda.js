// Tela Agenda: os proximos 30 dias, dia a dia, com eventos (audiencias, reunioes...) e prazos (data fatal e data interna) misturados e
// ordenados. Toque num prazo abre o prazo (#/prazo/ID); toque num evento abre o detalhe em folha inferior (com o link para o processo).
// Tambem registra #/evento/ID: o mesmo detalhe em tela inteira (e o endereco que a tela Hoje usa).
//
// Regras desta tela:
//  - o dia de cada coisa e o de CUIABA (um evento com hora e convertido; um de dia inteiro vale a data escrita);
//  - dia sem nada nao ganha linha; "Nada marcado" so aparece se a janela inteira estiver vazia; so o dia de hoje sempre tem cabecalho;
//  - so entram prazos ABERTOS (como na agenda do computador). O celular nunca confere nem muda prazo: tocar abre o prazo;
//  - prazo aberto vencido antes do comeco da lista nao aparece nela: um aviso no alto leva a lista de vencidos (area de risco);
//  - "Ver dias anteriores" abre mais 14 dias para tras; "Ver mais 30 dias" no fim; "Ir para hoje" aparece quando hoje sai de vista.
//
// A logica de montar os dias (diasDaAgenda, tituloDoDia) e pura e exportada: o teste a roda no navegador.

import { registrar, href } from '../rotas.js';
import * as dados from '../dados.js';
import { h, preencher, anunciar, focar } from '../ui.js';
import { icone } from '../icones.js';
import {
  DIAS_SEMANA, MESES, somarDias, diferencaDias, diaDaSemana, partesDaData, dataBR, dataValida, dataComDia, dataComDiaCurta, epochDe,
  hojeEmCuiaba, textoDeDias,
} from '../datas.js';
import { criadoAutomaticamente, prazoAberto, prazoNaoConferido, situacaoDoPrazo } from '../dominio.js';
import { cartao } from '../componentes/cartao.js';
import { lista, linhaDeLista, numeroDoProcesso } from '../componentes/linha.js';
import { seloCriadoPeloSistema, seloDeStatus, seloNaoConferido } from '../componentes/selo.js';
import { vazio } from '../componentes/vazio.js';
import { avisoDeCarga } from '../componentes/carga.js';
import { fotografiaDosDados, dadosMudaram } from '../componentes/fotografia-dos-dados.js';
import {
  linhaDoEvento, abrirDetalheDoEvento, detalheDoEvento, acoesDoEvento, diaDeInicioDoEvento, diaDeFimDoEvento, horarioDoEvento,
} from '../componentes/evento-detalhe.js';

export const DIAS_PARA_FRENTE = 30;
export const DIAS_PARA_TRAS_POR_VEZ = 14;
export const LIMITE_PARA_TRAS = 365;
export const LIMITE_PARA_FRENTE = 365;
const MINUTOS_PARA_LEMBRAR_A_POSICAO = 30;

const TABELAS_USADAS = ['evento', 'prazo', 'processo', 'parte', 'pessoa'];
const VARIANTE_DA_SITUACAO = { vencido: 'perigo', hoje: 'atencao', proximo: 'info' };
// ordem dentro do dia: prazo fatal, evento de dia inteiro, data interna, eventos com hora (por hora)
const GRUPO = { prazoFatal: 0, eventoDiaInteiro: 1, prazoInterno: 2, eventoComHora: 3 };

// ---------------------------------------------------------------- logica pura

function textoOrdenavel(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'pt-BR');
}

function compararItens(a, b) {
  if (a.grupo !== b.grupo) return a.grupo - b.grupo;
  if (a.grupo === GRUPO.eventoComHora && a.epoch !== b.epoch) return a.epoch - b.epoch;
  if (a.prazo && b.prazo) {
    return (Number(a.prazo.conferido) - Number(b.prazo.conferido)) || textoOrdenavel(a.prazo.ato, b.prazo.ato) || textoOrdenavel(a.prazo.id, b.prazo.id);
  }
  return textoOrdenavel(a.evento && a.evento.titulo, b.evento && b.evento.titulo) || textoOrdenavel(a.evento && a.evento.id, b.evento && b.evento.id);
}

/**
 * Os dias da agenda entre `de` e `ate` (inclusive, AAAA-MM-DD de Cuiaba) que tem alguma coisa, do mais antigo ao mais novo:
 * [{ data, itens: [{ tipo: 'evento'|'prazo'|'prazo_interno', grupo, evento?, prazo?, epoch?, indiceDoDia?, totalDeDias? }] }]
 *  - evento com hora: no dia em que comeca; evento de dia inteiro: em cada dia de inicio ate fim (fim inclusivo);
 *  - prazo ABERTO: na data fatal; e na data interna, se houver e for outra;
 *  - evento ou prazo com data invalida e ignorado (nunca derruba a tela).
 */
export function diasDaAgenda({ eventos, prazos, de, ate }) {
  const porDia = new Map();
  const colocar = (dia, item) => {
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(item);
  };
  for (const evento of eventos) {
    const inicio = diaDeInicioDoEvento(evento);
    if (!inicio || inicio > ate) continue;
    const fim = diaDeFimDoEvento(evento);
    if (fim < de) continue;
    const horario = horarioDoEvento(evento);
    const totalDeDias = diferencaDias(inicio, fim) + 1;
    const grupo = horario.diaInteiro || horario.semHora ? GRUPO.eventoDiaInteiro : GRUPO.eventoComHora;
    const epoch = epochDe(evento.inicio);
    const primeiro = inicio < de ? de : inicio;
    const ultimo = fim > ate ? ate : fim;
    for (let dia = primeiro; dia <= ultimo; dia = somarDias(dia, 1)) {
      colocar(dia, { tipo: 'evento', grupo, evento, epoch, indiceDoDia: diferencaDias(inicio, dia) + 1, totalDeDias });
    }
  }
  for (const prazo of prazos) {
    if (!prazoAberto(prazo)) continue;
    const fatal = dataValida(prazo.data_fatal) ? prazo.data_fatal : null;
    if (fatal && fatal >= de && fatal <= ate) colocar(fatal, { tipo: 'prazo', grupo: GRUPO.prazoFatal, prazo });
    const interna = dataValida(prazo.data_interna) ? prazo.data_interna : null;
    if (interna && interna !== fatal && interna >= de && interna <= ate) colocar(interna, { tipo: 'prazo_interno', grupo: GRUPO.prazoInterno, prazo });
  }
  return [...porDia.keys()].sort().map((data) => ({ data, itens: porDia.get(data).sort(compararItens) }));
}

/** Prazos abertos cuja data fatal e anterior a `de`: nao aparecem na lista, entram no aviso do alto. */
export function prazosVencidosAntesDe(prazos, de) {
  return prazos.filter((p) => prazoAberto(p) && dataValida(p.data_fatal) && p.data_fatal < de);
}

function nomeDaSemana(iso) {
  const nome = DIAS_SEMANA[diaDaSemana(iso)].replace('-feira', '');
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

/**
 * O cabecalho de um dia: "Hoje", "Amanhã", "Ontem" (com a data ao lado) ou "Quarta, 12 de novembro" (com o ano so se for outro ano).
 * Devolve { principal, secundario }.
 */
export function tituloDoDia(iso, hoje) {
  const [ano, mes, dia] = partesDaData(iso);
  const data = `${dia} de ${MESES[mes - 1]}${ano === Number(hoje.slice(0, 4)) ? '' : ` de ${ano}`}`;
  const completo = `${nomeDaSemana(iso)}, ${data}`;
  const distancia = diferencaDias(hoje, iso);
  if (distancia === 0) return { principal: 'Hoje', secundario: completo };
  if (distancia === 1) return { principal: 'Amanhã', secundario: completo };
  if (distancia === -1) return { principal: 'Ontem', secundario: completo };
  return { principal: completo, secundario: '' };
}

// ---------------------------------------------------------------- linhas

// A linha do prazo aqui nao leva o selo "Vencido" nem "Vence hoje": a frase colorida ("Data fatal · vence hoje") ja diz o mesmo, e sem o selo cada
// dia ocupa bem menos tela. Os avisos que nunca saem: PRAZO NAO CONFERIDO, criado pelo sistema e a situacao de trabalho (em producao).

function linhaDoPrazo(prazo, hoje, interna) {
  const situacao = situacaoDoPrazo(prazo, hoje);
  const processo = dados.linha('processo', prazo.processo_id);
  const cliente = dados.nomeDoClienteDoProcesso(prazo.processo_id);
  const quando = interna
    ? [h('strong', null, 'Data interna'), ` · a data fatal é ${dataValida(prazo.data_fatal) ? dataComDiaCurta(prazo.data_fatal, hoje) : 'uma data que o celular não entende'}`]
    : [h('strong', null, 'Data fatal'), ` · ${textoDeDias(situacao.dias)}`];
  return linhaDeLista({
    href: href('/prazo/:id', { id: prazo.id }),
    icone: 'relogio',
    titulo: prazo.ato,
    quando,
    subtitulo: cliente || null,
    subtitulo2: processo ? numeroDoProcesso(processo.numero) : null,
    variante: interna ? null : VARIANTE_DA_SITUACAO[situacao.chave] || null,
    selos: [
      prazoNaoConferido(prazo) ? seloNaoConferido() : null,
      criadoAutomaticamente(prazo) ? seloCriadoPeloSistema() : null,
      seloDeStatus(prazo.status),
    ],
    rotulo: `${interna ? 'Data interna' : 'Data fatal'} do prazo ${prazo.ato}, ${cliente ? `${cliente}, ` : ''}${interna ? `a data fatal é ${dataValida(prazo.data_fatal) ? dataComDia(prazo.data_fatal) : 'uma data que o celular não entende'}` : textoDeDias(situacao.dias)}${prazoNaoConferido(prazo) ? ', prazo não conferido' : ''}`,
  });
}

function linhaDoItem(item, hoje) {
  if (item.tipo === 'evento') {
    return linhaDoEvento(item.evento, {
      aoClicar: () => abrirDetalheDoEvento(item.evento, { hoje }),
      indiceDoDia: item.indiceDoDia,
      totalDeDias: item.totalDeDias,
    });
  }
  return linhaDoPrazo(item.prazo, hoje, item.tipo === 'prazo_interno');
}

function secaoDoDia(dia, hoje) {
  const titulo = tituloDoDia(dia.data, hoje);
  const corpo = dia.itens.length
    ? cartao({ corpo: 'lista', rotulo: `Compromissos e prazos: ${titulo.principal}` }, lista(dia.itens.map((item) => linhaDoItem(item, hoje))))
    : h('p', { class: 'texto-2 agenda-dia-vazio' }, 'Hoje não há compromissos nem prazos.');
  return h(
    'section',
    { class: ['agenda-dia', dia.data === hoje && 'agenda-dia--hoje', dia.data < hoje && 'agenda-dia--passado'], dataset: { dia: dia.data } },
    h('h2', { class: 'agenda-dia-titulo' }, h('span', null, titulo.principal), titulo.secundario ? h('span', { class: 'agenda-dia-data' }, titulo.secundario) : null),
    corpo,
  );
}

function avisoDeVencidos(vencidos) {
  const n = vencidos.length;
  return cartao({ corpo: 'lista', variante: 'perigo', classe: 'agenda-vencidos', rotulo: 'Prazos vencidos que não aparecem nesta lista' }, lista([
    linhaDeLista({
      href: href('/prazos', {}, { situacao: 'vencido' }),
      icone: 'alerta',
      titulo: n === 1 ? '1 prazo aberto já venceu' : `${n} prazos abertos já venceram`,
      subtitulo: 'Não aparecem nesta lista. Toque para ver.',
    }),
  ]));
}

// ---------------------------------------------------------------- posicao lembrada (voltar de um prazo, evento ou processo)

let lembrada = null;

function lembrarAoSair(tela) {
  // so lembra quando a pessoa foi ver o detalhe de algo; ao tocar de novo na aba Agenda, a lista comeca limpa
  lembrada = /^#\/(prazo|evento|processo|publicacao|cliente)\//.test(window.location.hash)
    ? { diasAntes: tela.diasAntes, diasDepois: tela.diasDepois, y: window.scrollY, em: performance.now(), dia: hojeEmCuiaba() }
    : null;
}

function recuperarPosicao() {
  const l = lembrada;
  lembrada = null;
  if (!l || l.dia !== hojeEmCuiaba() || performance.now() - l.em > MINUTOS_PARA_LEMBRAR_A_POSICAO * 60000) return null;
  return l;
}

function alturaDoQueFicaNoTopo() {
  const topo = document.getElementById('topo');
  const faixas = document.getElementById('faixas');
  return (topo ? topo.offsetHeight : 56) + (faixas && !faixas.hidden ? faixas.offsetHeight : 0);
}

function movimentoReduzido() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------- a tela

registrar('/agenda', (ctx) => {
  ctx.titulo('Agenda');
  const recuperada = recuperarPosicao();
  const tela = { diasAntes: recuperada ? recuperada.diasAntes : 0, diasDepois: recuperada ? recuperada.diasDepois : DIAS_PARA_FRENTE };
  let fotografia = null;
  let observador = null;

  const irParaHoje = () => {
    const alvo = ctx.raiz.querySelector('.agenda-dia--hoje');
    if (!alvo) return;
    const y = alvo.getBoundingClientRect().top + window.scrollY - alturaDoQueFicaNoTopo() - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: movimentoReduzido() ? 'auto' : 'smooth' });
  };

  const maisParaTras = () => {
    tela.diasAntes = Math.min(LIMITE_PARA_TRAS, tela.diasAntes + DIAS_PARA_TRAS_POR_VEZ);
    desenhar(true);
    anunciar(`Mostrando também os dias a partir de ${dataBR(somarDias(hojeEmCuiaba(), -tela.diasAntes))}.`);
    focar(ctx.raiz.querySelector('[data-acao="anteriores"]'));
  };

  const maisParaFrente = () => {
    tela.diasDepois = Math.min(LIMITE_PARA_FRENTE, tela.diasDepois + DIAS_PARA_FRENTE);
    desenhar(true);
    anunciar(`Mostrando também os dias até ${dataBR(somarDias(hojeEmCuiaba(), tela.diasDepois))}.`);
    focar(ctx.raiz.querySelector('[data-acao="adiante"]'));
  };

  function desenhar(forcar) {
    const agora = fotografiaDosDados(TABELAS_USADAS);
    if (!forcar && !dadosMudaram(fotografia, agora)) return;
    fotografia = agora;
    if (observador) { observador.disconnect(); observador = null; }
    const espera = avisoDeCarga();
    if (espera) { preencher(ctx.raiz, espera); return; }

    const hoje = hojeEmCuiaba();
    const de = somarDias(hoje, -tela.diasAntes);
    const ate = somarDias(hoje, tela.diasDepois);
    const dias = diasDaAgenda({ eventos: dados.obter('evento'), prazos: dados.obter('prazo'), de, ate });
    if (dias.length && !dias.some((d) => d.data === hoje)) {
      dias.push({ data: hoje, itens: [] });   // hoje sempre tem cabecalho, para a pessoa saber que hoje esta livre
      dias.sort((a, b) => (a.data < b.data ? -1 : 1));
    }
    const vencidos = prazosVencidosAntesDe(dados.obter('prazo'), de);

    const botaoAnteriores = tela.diasAntes < LIMITE_PARA_TRAS
      ? h('button', { class: 'botao botao--cheio', type: 'button', onclick: maisParaTras, dataset: { acao: 'anteriores' } }, icone('voltar'), 'Ver dias anteriores')
      : null;
    const botaoAdiante = tela.diasDepois < LIMITE_PARA_FRENTE
      ? h('button', { class: 'botao botao--cheio', type: 'button', onclick: maisParaFrente, dataset: { acao: 'adiante' } }, icone('seta'), `Ver mais ${DIAS_PARA_FRENTE} dias`)
      : null;
    const irHoje = h('button', { class: 'botao botao--primario agenda-flutuante', type: 'button', hidden: true, onclick: irParaHoje, dataset: { acao: 'hoje' } }, icone('sol'), 'Ir para hoje');

    preencher(
      ctx.raiz,
      vencidos.length ? avisoDeVencidos(vencidos) : null,
      h('div', { class: 'agenda-ponta' },
        botaoAnteriores,
        h('p', { class: 'agenda-intervalo texto-2' }, `A lista começa em ${dataBR(de)}.`)),
      dias.length
        ? dias.map((dia) => secaoDoDia(dia, hoje))
        : cartao({ corpo: 'lista', rotulo: 'Agenda vazia' }, vazio({
          icone: 'calendario', titulo: 'Nada marcado', texto: `Não há compromissos nem prazos de ${dataBR(de)} a ${dataBR(ate)}.`,
        })),
      h('div', { class: 'agenda-ponta agenda-ponta--fim' },
        h('p', { class: 'agenda-intervalo texto-2' }, `A lista vai até ${dataBR(ate)}.`),
        botaoAdiante),
      irHoje,
    );

    const secaoDeHoje = ctx.raiz.querySelector('.agenda-dia--hoje');
    if (secaoDeHoje && typeof IntersectionObserver === 'function') {
      observador = new IntersectionObserver((entradas) => { irHoje.hidden = entradas[entradas.length - 1].isIntersecting; });
      observador.observe(secaoDeHoje);
    }
  }

  desenhar(true);
  if (recuperada) window.scrollTo(0, recuperada.y);
  ctx.aoMudarDados(() => desenhar(false));
  ctx.aoVirarODia(() => desenhar(true));
  ctx.aoLimpar(() => {
    if (observador) observador.disconnect();
    lembrarAoSair(tela);
  });
}, { aba: 'agenda' });

// ---------------------------------------------------------------- detalhe do evento em tela inteira

registrar('/evento/:id', (ctx) => {
  ctx.titulo('Evento');
  let fotografia = null;
  const desenhar = () => {
    const agora = fotografiaDosDados(TABELAS_USADAS);
    if (!dadosMudaram(fotografia, agora)) return;
    fotografia = agora;
    const espera = avisoDeCarga();
    if (espera) { preencher(ctx.raiz, espera); return; }
    const evento = dados.linha('evento', ctx.params.id);
    if (!evento) {
      preencher(ctx.raiz, cartao({ corpo: 'lista', rotulo: 'Evento não encontrado' }, vazio({
        icone: 'calendario',
        titulo: 'Evento não encontrado',
        texto: 'Ele pode ter sido apagado no computador. Volte à agenda e atualize.',
        acao: h('a', { class: 'botao', href: href('/agenda') }, 'Voltar à agenda'),
      })));
      return;
    }
    const acoes = acoesDoEvento(evento);
    preencher(
      ctx.raiz,
      cartao({ titulo: evento.titulo || 'Evento', icone: 'calendario' },
        detalheDoEvento(evento, { hoje: hojeEmCuiaba() }),
        acoes.length ? h('div', { class: 'cartao-acao grupo-botoes grupo-botoes--coluna' }, acoes) : null),
    );
  };
  desenhar();
  ctx.aoMudarDados(desenhar);
  ctx.aoVirarODia(() => { fotografia = null; desenhar(); });
}, { aba: 'agenda', pai: '/agenda' });
