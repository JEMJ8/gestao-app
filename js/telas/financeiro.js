// Financeiro (SOMENTE LEITURA): resumo do mes em reais e a lista de parcelas por vencimento, com tres filtros: A vencer, Em atraso e Recebidas.
// O celular nao registra recebimento: isso e feito no computador. Cada linha mostra o cliente, o contrato (objeto), o numero da parcela (2/10),
// o valor, o vencimento e a situacao; tocar abre o cliente.
//
// Dinheiro e sempre CENTAVOS INTEIROS somados como inteiros (ver componentes/parcela.js); so na tela vira "R$ 1.234,56".
// Ligacao vinda de outras telas: #/financeiro?filtro=atrasadas (ou a_vencer, recebidas).

import { registrar, href } from '../rotas.js';
import * as dados from '../dados.js';
import { h, preencher } from '../ui.js';
import { hojeEmCuiaba, mesPorExtenso } from '../datas.js';
import { dinheiro, plural } from '../formato.js';
import { cartao } from '../componentes/cartao.js';
import { lista } from '../componentes/linha.js';
import { vazio } from '../componentes/vazio.js';
import { alternador, lembrar, lembrado } from '../componentes/filtros.js';
import { avisoDeCarga } from '../componentes/carga.js';
import { FILTROS_DE_PARCELA, blocoDeValores, linhaDeParcela, repartirParcelas, resumoDoMes, somaDoFiltro } from '../componentes/parcela.js';

const PARCELAS_POR_PAGINA = 40;
const ROTULO_DO_FILTRO = { a_vencer: 'A vencer', atrasadas: 'Em atraso', recebidas: 'Recebidas' };
const VAZIO_DO_FILTRO = {
  a_vencer: { icone: 'ok', titulo: 'Nenhuma parcela a vencer', texto: 'Não há parcela aberta com vencimento de hoje em diante.' },
  atrasadas: { icone: 'ok', titulo: 'Nenhuma parcela em atraso', texto: 'Todas as parcelas vencidas já foram recebidas.', variante: 'ok' },
  recebidas: { icone: 'info', titulo: 'Nenhuma parcela recebida', texto: 'Quando o computador registrar recebimentos, eles aparecem aqui.' },
};
const FRASE_DO_TOTAL = { a_vencer: 'A receber nesta lista', atrasadas: 'Em atraso nesta lista', recebidas: 'Recebido nesta lista' };

function maiuscula(texto) {
  return texto ? texto[0].toUpperCase() + texto.slice(1) : texto;
}

function filtroDaLigacao(consulta) {
  if (FILTROS_DE_PARCELA.includes(consulta.filtro)) return consulta.filtro;
  if (consulta.atrasadas === '1') return 'atrasadas';      // o mesmo nome que o computador usa
  return null;
}

function cartaoDoMes(hoje, contratos) {
  const r = resumoDoMes(dados.obter('parcela'), contratos, hoje);
  const mes = mesPorExtenso(hoje);
  const nomeDoMes = mes.slice(0, mes.indexOf(' de '));
  return cartao(
    { titulo: maiuscula(mes), icone: 'dinheiro', classe: 'fin-mes' },
    blocoDeValores([
      { rotulo: `A receber em ${nomeDoMes}`, centavos: r.aReceber, variante: 'info', icone: 'relogio', ajuda: `${plural(r.aReceberQtd, 'parcela aberta', 'parcelas abertas')} com vencimento neste mês` },
      { rotulo: `Recebido em ${nomeDoMes}`, centavos: r.recebido, variante: 'ok', icone: 'ok', ajuda: `${plural(r.recebidoQtd, 'parcela recebida', 'parcelas recebidas')} neste mês` },
      { rotulo: 'Em atraso', centavos: r.emAtraso, variante: r.emAtraso > 0 ? 'perigo' : null, icone: 'alerta', ajuda: `${plural(r.emAtrasoQtd, 'parcela vencida e não recebida', 'parcelas vencidas e não recebidas')}, de todos os meses` },
    ]),
    r.recebidasSemData
      ? h('p', { class: 'fin-nota texto-2 texto-pequeno' }, `${plural(r.recebidasSemData, 'parcela recebida não tem', 'parcelas recebidas não têm')} data de recebimento registrada e ${r.recebidasSemData === 1 ? 'fica' : 'ficam'} fora do recebido do mês.`)
      : null,
  );
}

registrar('/financeiro', (ctx) => {
  ctx.titulo('Financeiro');
  let filtro = filtroDaLigacao(ctx.consulta) || lembrado('financeiro.filtro', null);
  if (!FILTROS_DE_PARCELA.includes(filtro)) filtro = null;       // null = o mais urgente que tiver parcela (escolhido no primeiro desenho)
  let visiveis = PARCELAS_POR_PAGINA;

  const resumo = h('div', { class: 'fin-resumo' });
  const filtros = alternador({
    rotulo: 'Quais parcelas mostrar',
    opcoes: FILTROS_DE_PARCELA.map((valor) => ({ valor, rotulo: ROTULO_DO_FILTRO[valor], contagem: 0 })),
    atual: filtro || 'a_vencer',
    aoEscolher: (valor) => {
      filtro = valor;
      visiveis = PARCELAS_POR_PAGINA;
      lembrar('financeiro.filtro', valor);
      desenhar();
    },
  });
  const total = h('p', { class: 'fin-total', role: 'status' });
  const area = h('div', { class: 'fin-area' });
  const nota = h('p', { class: 'fin-nota-final texto-2 texto-pequeno' }, 'Aqui só se consulta. Os recebimentos são registrados no computador.');
  preencher(ctx.raiz, resumo, filtros.el, total, area, nota);

  function desenhar() {
    const aviso = avisoDeCarga();
    if (aviso) {
      preencher(resumo);
      total.textContent = '';
      preencher(area, aviso);
      return;
    }
    const hoje = hojeEmCuiaba();
    const contratos = dados.indice('contrato');
    const pessoas = dados.indice('pessoa');
    const grupos = repartirParcelas(dados.obter('parcela'), contratos, hoje);
    if (!filtro) filtro = grupos.atrasadas.length ? 'atrasadas' : 'a_vencer';
    preencher(resumo, cartaoDoMes(hoje, contratos));
    filtros.atualizar({
      atual: filtro,
      contagens: { a_vencer: grupos.a_vencer.length, atrasadas: grupos.atrasadas.length, recebidas: grupos.recebidas.length },
    });

    const lote = grupos[filtro];
    if (!lote.length) {
      total.textContent = '';
      preencher(area, vazio(VAZIO_DO_FILTRO[filtro]));
      return;
    }
    total.textContent = `${FRASE_DO_TOTAL[filtro]}: ${dinheiro(somaDoFiltro(lote, filtro))} (${plural(lote.length, 'parcela', 'parcelas')})`;
    const mostradas = lote.slice(0, visiveis);
    const restantes = lote.length - mostradas.length;
    const linhas = mostradas.map((parcela) => {
      const contrato = contratos.get(parcela.contrato_id) || null;
      const pessoa = contrato ? pessoas.get(contrato.pessoa_id) || null : null;
      return linhaDeParcela(parcela, { hoje, contrato, pessoa, href: pessoa ? href('/cliente/:id', { id: pessoa.id }) : null });
    });
    preencher(area,
      cartao({ corpo: 'lista', rotulo: `Parcelas: ${ROTULO_DO_FILTRO[filtro]}` }, lista(linhas)),
      restantes > 0
        ? h('div', { class: 'fin-mais' },
          h('button', { class: 'botao botao--cheio', type: 'button', onclick: () => { visiveis += PARCELAS_POR_PAGINA; desenhar(); } },
            `Mostrar mais ${Math.min(restantes, PARCELAS_POR_PAGINA)} (faltam ${restantes})`))
        : null);
  }

  desenhar();
  ctx.aoMudarDados(() => {
    const estado = dados.estado();
    if (!(estado.atualizando && estado.carregado)) desenhar();
  });
  ctx.aoVirarODia(desenhar);
}, { aba: 'mais', pai: '/mais' });
