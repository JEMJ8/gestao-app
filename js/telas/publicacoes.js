// Tela de PUBLICACOES: a lista (ultimos 180 dias, mais recentes primeiro, com filtros, busca e paginas) e a leitura de uma publicacao do DJEN.
// Rotas: /publicacoes e /publicacao/:id. Veja docs/CELULAR-APP.md.
//
// O texto da publicacao NAO vem na lista: e buscado so quando a publicacao e aberta (dados.carregarTextoPublicacao) e fica so na memoria da visita.
// Todo texto de publicacao e de terceiros e nao confiavel: entra na tela sempre como texto (nunca HTML), e o link do Diario so abre se for https.
//
// O celular NAO confirma publicacao e NAO cria prazo: isso e do computador e da automacao. A tela diz isso quando a publicacao espera leitura.

import { registrar, href } from '../rotas.js';
import * as dados from '../dados.js';
import { h, preencher } from '../ui.js';
import { icone } from '../icones.js';
import { DIAS_ABREV, dataBR, dataCurta, dataExtenso, diaDaSemana, hojeEmCuiaba, momentoEmCuiaba, somarDias } from '../datas.js';
import { plural, linkHttps } from '../formato.js';
import { prazoNaoConferido, publicacaoNova, ROTULO_PUBLICACAO } from '../dominio.js';
import { cartao } from '../componentes/cartao.js';
import { lista, linhaDeLista, linhaDePrazo, numeroDoProcesso } from '../componentes/linha.js';
import { selo, seloNaoConferido } from '../componentes/selo.js';
import { vazio } from '../componentes/vazio.js';
import { campoDeBusca, grupoDeChips, semDadosAinda } from '../componentes/filtros-de-lista.js';
import {
  achaNaBusca, contagensDePublicacao, FILTROS_DE_PUBLICACAO, paginar, publicacaoComPrazo, publicacoesDoFiltro, textoDeBuscaDaPublicacao,
} from '../componentes/consultas-lista.js';
import { textoDaPublicacao } from '../componentes/texto-da-publicacao.js';

const POR_PAGINA = 30;

/** O que a lista lembra para o Voltar do aparelho devolve-la como estava. `filtro` null = ainda nao escolhido (Novas, se houver; senao Todas). */
const lembrete = { filtro: null, busca: '', limite: POR_PAGINA, rolagem: 0 };

// ---------------------------------------------------------------- pecas comuns

function par(rotulo, valor) {
  return h('div', null, h('dt', { class: 'par-rotulo' }, rotulo), h('dd', { class: 'par-valor' }, valor));
}

function tituloDaPublicacao(c) {
  return [c.tipo_comunicacao, c.tipo_documento].filter(Boolean).join(' · ') || 'Publicação';
}

function momentoPorExtenso(texto) {
  const m = texto ? momentoEmCuiaba(texto) : null;
  return m ? `${dataBR(m.data)} às ${m.hora}` : '';
}

/** Os selos da situacao da publicacao (sempre com texto): Nova, Em revisao, Com prazo, Sem prazo, Descartada e, se o prazo ligado nao foi conferido, o aviso. */
function selosDaPublicacao(c) {
  const selos = [];
  if (c.situacao === 'nova') selos.push(selo('info', ROTULO_PUBLICACAO.nova, { icone: 'info' }));
  else if (c.situacao === 'em_revisao') selos.push(selo('atencao', ROTULO_PUBLICACAO.em_revisao, { icone: 'alerta' }));
  if (publicacaoComPrazo(c)) selos.push(selo('ok', 'Com prazo', { icone: 'relogio' }));
  else if (c.situacao === 'sem_prazo') selos.push(selo('neutro', ROTULO_PUBLICACAO.sem_prazo));
  else if (c.situacao === 'descartada') selos.push(selo('neutro', ROTULO_PUBLICACAO.descartada));
  const prazo = c.prazo_id ? dados.linha('prazo', c.prazo_id) : null;
  if (prazo && prazoNaoConferido(prazo)) selos.push(seloNaoConferido());
  return selos;
}

function linhaDaPublicacao(c, hoje) {
  const cliente = c.processo_id ? dados.nomeDoClienteDoProcesso(c.processo_id) : '';
  const dia = c.data_disponibilizacao;
  const diaValido = typeof dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dia);
  const quando = !diaValido ? null : dia === hoje ? 'Hoje' : dia === somarDias(hoje, -1) ? 'Ontem' : DIAS_ABREV[diaDaSemana(dia)];
  return linhaDeLista({
    href: `#/publicacao/${encodeURIComponent(c.id)}`,
    icone: 'jornal',
    titulo: tituloDaPublicacao(c),
    subtitulo: cliente || null,
    subtitulo2: c.processo_numero ? [numeroDoProcesso(c.processo_numero), c.sigla_tribunal ? ` · ${c.sigla_tribunal}` : null] : (c.sigla_tribunal || null),
    data: diaValido ? dataCurta(dia) : null,
    dataSub: quando,
    selos: selosDaPublicacao(c),
    variante: c.situacao === 'nova' ? 'info' : c.situacao === 'em_revisao' ? 'atencao' : null,
    rotulo: `${tituloDaPublicacao(c)}${cliente ? `, ${cliente}` : ''}${diaValido ? `, disponibilizada em ${dataBR(dia)}` : ''}`,
  });
}

// ---------------------------------------------------------------- a lista

const cacheDeBusca = new WeakMap();

function textoDeBusca(c) {
  let t = cacheDeBusca.get(c);
  if (t === undefined) {
    t = textoDeBuscaDaPublicacao(c, { clientes: c.processo_id ? dados.clientesDoProcesso(c.processo_id).map((p) => p.nome) : [] });
    cacheDeBusca.set(c, t);
  }
  return t;
}

const VAZIO_POR_FILTRO = {
  novas: { icone: 'ok', titulo: 'Nenhuma publicação nova', texto: 'Todas as publicações recentes já foram lidas no computador.', variante: 'ok' },
  com_prazo: { icone: 'info', titulo: 'Nenhuma publicação com prazo', texto: 'Nos últimos 180 dias nenhuma publicação gerou prazo.' },
  sem_prazo: { icone: 'info', titulo: 'Nenhuma publicação sem prazo', texto: 'Nos últimos 180 dias nenhuma publicação foi marcada como sem prazo.' },
  todas: { icone: 'info', titulo: 'Nenhuma publicação', texto: 'Quando o computador enviar publicações dos últimos 180 dias, elas aparecem aqui.' },
};

function montarLista(ctx) {
  ctx.titulo('Publicações');
  const chips = grupoDeChips({
    rotulo: 'Filtrar as publicações',
    aoEscolher: (valor) => {
      lembrete.filtro = valor;
      lembrete.limite = POR_PAGINA;
      desenhar(true);
    },
  });
  const busca = campoDeBusca({
    rotulo: 'Buscar publicação por processo ou título',
    placeholder: 'Buscar por processo, cliente ou tipo',
    valor: lembrete.busca,
    aoMudar: (texto) => {
      lembrete.busca = texto.trim();
      lembrete.limite = POR_PAGINA;
      desenhar(true);
    },
  });
  const resumo = h('p', { class: 'lista-resumo', role: 'status', 'aria-live': 'polite' });
  const aviso = h('p', { class: 'lista-aviso texto-2 texto-pequeno' }, 'O celular só mostra as publicações dos últimos 180 dias e não as confirma: isso é feito no computador.');
  const resultado = h('div', { class: 'lista-resultado' });
  preencher(ctx.raiz, h('div', { class: 'lista-topo' }, busca.elemento, chips.elemento), resumo, resultado, aviso);
  ctx.aoLimpar(busca.parar);

  let ultima = null;
  function desenhar(forcar = false) {
    const espera = semDadosAinda(dados.estado(), () => dados.atualizar());
    if (espera) {
      chips.elemento.hidden = busca.elemento.hidden = aviso.hidden = true;
      resumo.textContent = '';
      preencher(resultado, espera);
      ultima = null;
      return;
    }
    chips.elemento.hidden = busca.elemento.hidden = aviso.hidden = false;
    const hoje = hojeEmCuiaba();
    const todas = dados.publicacoesRecentes();
    const contagens = contagensDePublicacao(todas);
    if (lembrete.filtro === null || !FILTROS_DE_PUBLICACAO.some((f) => f.valor === lembrete.filtro)) lembrete.filtro = contagens.novas > 0 ? 'novas' : 'todas';
    const assinatura = [dados.obter('comunicacao'), dados.obter('prazo'), dados.obter('processo'), dados.obter('parte'), dados.obter('pessoa'), hoje, lembrete.filtro, lembrete.busca, lembrete.limite];
    if (!forcar && ultima && assinatura.every((x, i) => x === ultima[i])) return;
    ultima = assinatura;

    chips.atualizar(FILTROS_DE_PUBLICACAO.map((f) => ({ valor: f.valor, rotulo: f.rotulo, tom: f.tom, contagem: contagens[f.valor] })), lembrete.filtro);
    let linhas = publicacoesDoFiltro(todas, lembrete.filtro);
    if (lembrete.busca) linhas = linhas.filter((c) => achaNaBusca(textoDeBusca(c), lembrete.busca));
    const { itens, restantes } = paginar(linhas, lembrete.limite);
    const nome = FILTROS_DE_PUBLICACAO.find((f) => f.valor === lembrete.filtro).rotulo;
    resumo.textContent = lembrete.busca
      ? `${linhas.length === 1 ? '1 publicação encontrada' : `${linhas.length} publicações encontradas`} · ${nome}`
      : `${plural(linhas.length, 'publicação', 'publicações')} · ${nome}`;

    const filhos = [];
    if (!linhas.length) {
      const base = VAZIO_POR_FILTRO[lembrete.filtro];
      filhos.push(lembrete.busca
        ? vazio({
          icone: 'busca', titulo: 'Nenhuma publicação encontrada', texto: `Nada em “${lembrete.busca}” neste filtro.`,
          acao: h('div', { class: 'grupo-botoes' },
            h('button', { class: 'botao', type: 'button', onclick: () => { busca.definir(''); lembrete.busca = ''; desenhar(true); } }, 'Limpar a busca'),
            lembrete.filtro !== 'todas' ? h('button', { class: 'botao', type: 'button', onclick: () => { lembrete.filtro = 'todas'; lembrete.limite = POR_PAGINA; desenhar(true); } }, 'Procurar em todas') : null),
        })
        : vazio(base));
    } else {
      filhos.push(cartao({ corpo: 'lista', rotulo: 'Lista de publicações' }, lista(itens.map((c) => linhaDaPublicacao(c, hoje)))));
    }
    if (restantes > 0) {
      filhos.push(h('button', {
        class: 'botao botao--cheio mais-linhas', type: 'button',
        onclick: () => { lembrete.limite += POR_PAGINA; desenhar(true); },
      }, `Mostrar mais (${plural(restantes, 'publicação restante', 'publicações restantes')})`));
    }
    preencher(resultado, filhos);
  }

  desenhar(true);
  if (lembrete.rolagem > 0) window.scrollTo(0, lembrete.rolagem);
  ctx.aoMudarDados(() => desenhar());
  ctx.aoVirarODia(() => desenhar(true));
  ctx.aoLimpar(() => { lembrete.rolagem = window.scrollY; });
}

// ---------------------------------------------------------------- a leitura

function cartaoDoPrazoLigado(c, hoje) {
  if (!c.prazo_id) return null;
  const prazo = dados.linha('prazo', c.prazo_id);
  if (!prazo) {
    return cartao({ titulo: 'Prazo desta publicação', icone: 'relogio' }, h('p', { class: 'texto-2' }, 'A publicação tem um prazo ligado, mas ele não está nos dados deste aparelho.'));
  }
  return cartao({ titulo: 'Prazo desta publicação', icone: 'relogio', corpo: 'lista' }, lista([linhaDePrazo(prazo, { hoje })]));
}

function cartaoDosDados(c) {
  const processo = c.processo_id ? dados.linha('processo', c.processo_id) : null;
  const clientes = c.processo_id ? dados.clientesDoProcesso(c.processo_id) : [];
  const enderecoDoDiario = linkHttps(c.link);
  return cartao(
    { titulo: 'Sobre a publicação', icone: 'info' },
    h('dl', { class: 'pares pares--duplo' },
      clientes.length ? par(clientes.length > 1 ? 'Clientes' : 'Cliente', clientes.map((p) => h('span', { class: 'par-linha' }, h('a', { href: href('/cliente/:id', { id: p.id }) }, p.nome)))) : null,
      c.processo_numero ? par('Processo', processo
        ? h('a', { href: href('/processo/:id', { id: processo.id }) }, numeroDoProcesso(processo.numero))
        : [numeroDoProcesso(c.processo_numero), h('span', { class: 'par-linha texto-2' }, 'Este processo ainda não está cadastrado no sistema.')]) : null,
      c.nome_orgao ? par('Órgão', c.nome_orgao) : null,
      c.sigla_tribunal ? par('Tribunal', c.sigla_tribunal) : null,
      c.tipo_comunicacao ? par('Tipo de comunicação', c.tipo_comunicacao) : null,
      c.tipo_documento ? par('Tipo de documento', c.tipo_documento) : null,
      c.nome_classe ? par('Classe', c.nome_classe) : null,
      c.data_disponibilizacao ? par('Disponibilizada em', dataBR(c.data_disponibilizacao)) : null,
      c.coletada_em && momentoPorExtenso(c.coletada_em) ? par('Recebida pelo sistema em', momentoPorExtenso(c.coletada_em)) : null),
    h('p', { class: 'cartao-acao' }, enderecoDoDiario
      ? h('a', { class: 'botao botao--cheio', href: enderecoDoDiario, target: '_blank', rel: 'noopener noreferrer' }, icone('link'), 'Abrir no Diário (outra aba)')
      : h('span', { class: 'texto-2 texto-pequeno' }, 'Esta publicação não tem um link seguro (https) para o Diário.')),
  );
}

function montarLeitura(ctx) {
  ctx.titulo('Publicação');
  const id = ctx.params.id;
  const nomes = ['cabecalho', 'pendente', 'prazo', 'dados', 'texto'];
  const partes = nomes.reduce((mapa, nome) => mapa.set(nome, { el: h('div', { class: `slot slot-${nome}` }), assinatura: null }), new Map());
  const texto = textoDaPublicacao({ id, recolhido: false, rotulo: 'Texto da publicação', sinal: ctx.sinal });
  partes.get('texto').el.append(cartao({ titulo: 'Texto da publicação', icone: 'jornal' }, texto.elemento));
  let montado = false;
  let pediuTexto = false;

  function atualizarParte(nome, assinatura, construir) {
    const parte = partes.get(nome);
    if (parte.assinatura === assinatura) return;
    parte.assinatura = assinatura;
    let conteudo;
    try {
      conteudo = construir();
    } catch {
      conteudo = cartao({ variante: 'atencao', titulo: 'Esta parte não pôde ser mostrada', icone: 'alerta' }, h('p', null, 'Algum dado desta publicação está fora do formato que o celular entende.'));
    }
    parte.el.replaceChildren(...(Array.isArray(conteudo) ? conteudo : [conteudo]).filter(Boolean));
  }

  function desenhar() {
    const estado = dados.estado();
    const c = dados.linha('comunicacao', id);
    if (!c) {
      montado = false;
      for (const parte of partes.values()) parte.assinatura = null;
      preencher(ctx.raiz, semDadosAinda(estado, () => dados.atualizar()) || vazio({
        icone: 'info', titulo: 'Publicação não encontrada',
        texto: 'O aplicativo guarda as publicações dos últimos 180 dias. Esta não está nos dados deste aparelho.',
        acao: h('a', { class: 'botao', href: href('/publicacoes') }, 'Ver as publicações'),
      }));
      return;
    }
    if (!montado) {
      preencher(ctx.raiz, [...partes.values()].map((p) => p.el));
      montado = true;
    }
    if (!pediuTexto) {
      pediuTexto = true;
      texto.carregar();
    }
    const hoje = hojeEmCuiaba();
    const json = JSON.stringify;
    atualizarParte('cabecalho', json(c), () => cartao(
      { variante: c.situacao === 'nova' ? 'info' : c.situacao === 'em_revisao' ? 'atencao' : null, classe: 'prazo-cabeca', rotulo: `Publicação: ${tituloDaPublicacao(c)}` },
      h('h2', { class: 'prazo-ato' }, tituloDaPublicacao(c)),
      h('div', { class: 'selos' }, selosDaPublicacao(c)),
      c.data_disponibilizacao ? h('p', { class: 'publicacao-data' }, icone('calendario', { tamanho: 20 }), `Disponibilizada em ${dataExtenso(c.data_disponibilizacao)}`) : null));
    atualizarParte('pendente', json([c.situacao]), () => (publicacaoNova(c)
      ? cartao({ variante: 'info', titulo: 'Esta publicação ainda espera leitura', icone: 'info' },
        h('p', null, 'O celular serve só para ler. Confirmar a publicação e criar o prazo é feito no computador (ou pela automação do sistema).'))
      : null));
    atualizarParte('prazo', json([c.prazo_id, c.situacao, c.prazo_id ? dados.linha('prazo', c.prazo_id) : null, hoje]), () => cartaoDoPrazoLigado(c, hoje));
    atualizarParte('dados', json([c, dados.linha('processo', c.processo_id), c.processo_id ? dados.clientesDoProcesso(c.processo_id) : []]), () => cartaoDosDados(c));
  }

  desenhar();
  ctx.aoMudarDados(desenhar);
  ctx.aoVirarODia(desenhar);
}

registrar('/publicacoes', montarLista, { aba: 'publicacoes' });
registrar('/publicacao/:id', montarLeitura, { aba: 'publicacoes', pai: '/publicacoes' });
