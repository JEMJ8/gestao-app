// Tela de PRAZOS: a lista (com filtros, busca e paginas) e o detalhe de um prazo (datas, memoria de calculo, publicacao de origem e os pedidos
// ao computador). Rotas: /prazos e /prazo/:id. Veja docs/CELULAR-APP.md.
//
// Convencao de ligacao vinda de Hoje: #/prazos?situacao=vencido|hoje|proximo|futuro|encerrado|atencao e #/prazos?nao_conferidos=1.
//
// O que esta tela NUNCA faz: mudar a data fatal, conferir prazo por conta propria, mostrar a situacao nova antes de o computador aplicar.
// Os botoes do detalhe so PEDEM (comando prazo_status ou prazo_conferir); o pedido aparece como "Enviado, aguardando o computador" ate o
// computador responder e o espelho mudar.

import { registrar, href } from '../rotas.js';
import * as dados from '../dados.js';
import { h, preencher, anunciar } from '../ui.js';
import { icone } from '../icones.js';
import { dataBR, dataComDia, dataExtenso, hojeEmCuiaba, momentoEmCuiaba, textoDeDias } from '../datas.js';
import { plural } from '../formato.js';
import { criadoAutomaticamente, prazoAberto, prazoNaoConferido, rotuloDaOrigem, situacaoDoPrazo, ROTULO_STATUS } from '../dominio.js';
import { cartao } from '../componentes/cartao.js';
import { lista, linhaDePrazo, linhaDePrazoComProblema, numeroDoProcesso } from '../componentes/linha.js';
import { selo, seloConferido, seloCriadoPeloSistema, seloDeSituacao, seloDeStatus, seloNaoConferido } from '../componentes/selo.js';
import { vazio } from '../componentes/vazio.js';
import { confirmar } from '../componentes/confirmacao.js';
import { blocoDeComandos } from '../componentes/comando.js';
import { campoDeBusca, grupoDeChips, semDadosAinda } from '../componentes/filtros-de-lista.js';
import {
  achaNaBusca, contagensDePrazo, ehFiltroExtra, filtroDaConsulta, opcoesDeFiltroDePrazo, paginar, prazosDoFiltro, textoDeBuscaDoPrazo,
} from '../componentes/consultas-lista.js';
import { memoriaDeCalculo } from '../componentes/memoria-calculo.js';
import { textoDaPublicacao } from '../componentes/texto-da-publicacao.js';

const POR_PAGINA = 30;

// ---------------------------------------------------------------- memoria da lista (enquanto o aplicativo esta aberto)

/**
 * O que a lista lembra para o Voltar do aparelho devolve-la como estava: filtro, busca, quantas paginas foram abertas e onde a rolagem parou.
 * `preservar` e ligado pelo DETALHE quando ele volta para a lista: nesse caso um link com filtro (#/prazos?situacao=vencido) nao zera a busca.
 */
const lembrete = { filtro: 'abertos', busca: '', limite: POR_PAGINA, rolagem: 0, preservar: false };

// ---------------------------------------------------------------- pecas comuns

const capitalizar = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

function momentoOuData(texto) {
  if (!texto) return '';
  const m = momentoEmCuiaba(texto);
  if (!m) return '';
  return /[T ]\d{2}:\d{2}/.test(texto) ? `${dataBR(m.data)} às ${m.hora}` : dataBR(m.data);
}

function par(rotulo, valor) {
  return h('div', null, h('dt', { class: 'par-rotulo' }, rotulo), h('dd', { class: 'par-valor' }, valor));
}

/** Acrescenta um selo a uma linha ja pronta (linhaDePrazo nao tem lugar para o selo de "pedido enviado"). */
function acrescentarSelo(linha, etiqueta) {
  const texto = linha.querySelector('.linha-texto');
  if (!texto) return;
  let selos = texto.querySelector(':scope > .selos');
  if (!selos) {
    selos = h('span', { class: 'selos' });
    texto.append(selos);
  }
  selos.append(etiqueta);
}

function linhaDaLista(prazo, hoje) {
  let linha;
  try {
    linha = linhaDePrazo(prazo, { hoje });
  } catch {
    return linhaDePrazoComProblema(prazo);
  }
  const pedidos = dados.comandosDoAlvo(prazo.id);
  if (pedidos.some((c) => c.estado === 'enviado')) acrescentarSelo(linha, selo('info', 'Enviado, aguardando o computador', { icone: 'relogio' }));
  else if (pedidos.some((c) => c.estado === 'recusado')) acrescentarSelo(linha, selo('perigo', 'O computador não aplicou o pedido', { icone: 'erro' }));
  return linha;
}

// ---------------------------------------------------------------- a lista

const cacheDeBusca = new WeakMap();

function textoDeBusca(prazo) {
  let t = cacheDeBusca.get(prazo);
  if (t === undefined) {
    const processo = dados.linha('processo', prazo.processo_id);
    t = textoDeBuscaDoPrazo(prazo, { clientes: dados.clientesDoProcesso(prazo.processo_id).map((c) => c.nome), numero: processo ? processo.numero : '' });
    cacheDeBusca.set(prazo, t);
  }
  return t;
}

const VAZIO_POR_FILTRO = {
  abertos: { icone: 'ok', titulo: 'Nenhum prazo aberto', texto: 'Não há prazo em aberto ou em produção.' },
  hoje: { icone: 'ok', titulo: 'Nada vence hoje', texto: 'Nenhum prazo aberto tem a data fatal de hoje.' },
  proximos: { icone: 'ok', titulo: 'Nada nos próximos 7 dias', texto: 'Nenhum prazo aberto vence de amanhã até 7 dias.' },
  vencidos: { icone: 'ok', titulo: 'Nenhum prazo vencido', texto: 'Nenhum prazo aberto passou da data fatal.' },
  atencao: { icone: 'ok', titulo: 'Nada vencido nem para hoje', texto: 'Nenhum prazo aberto está vencido ou vence hoje.' },
  futuros: { icone: 'info', titulo: 'Nada mais adiante', texto: 'Nenhum prazo aberto vence daqui a mais de 7 dias.' },
  nao_conferidos: { icone: 'ok', titulo: 'Todos os prazos abertos estão conferidos', texto: 'Nenhum prazo aberto espera a sua conferência.' },
  encerrados: { icone: 'info', titulo: 'Nenhum prazo encerrado', texto: 'Ainda não há prazo protocolado, cumprido, não cumprido ou cancelado.' },
  todos: { icone: 'info', titulo: 'Nenhum prazo cadastrado', texto: 'Quando o computador enviar os prazos, eles aparecem aqui.' },
};

function montarLista(ctx) {
  ctx.titulo('Prazos');
  const doLink = filtroDaConsulta(ctx.consulta);
  if (doLink && !lembrete.preservar) Object.assign(lembrete, { filtro: doLink, busca: '', limite: POR_PAGINA, rolagem: 0 });
  const rolagemParaRestaurar = doLink && !lembrete.preservar ? 0 : lembrete.rolagem;
  lembrete.preservar = false;
  if (!opcoesDeFiltroDePrazo(lembrete.filtro).some((o) => o.valor === lembrete.filtro)) lembrete.filtro = 'abertos';

  const chips = grupoDeChips({
    rotulo: 'Filtrar os prazos',
    aoEscolher: (valor) => {
      lembrete.filtro = valor;
      lembrete.limite = POR_PAGINA;
      desenhar(true);
    },
  });
  const busca = campoDeBusca({
    rotulo: 'Buscar prazo por cliente, processo ou ato',
    placeholder: 'Buscar por cliente, processo ou ato',
    valor: lembrete.busca,
    aoMudar: (texto) => {
      lembrete.busca = texto.trim();
      lembrete.limite = POR_PAGINA;
      desenhar(true);
    },
  });
  const resumo = h('p', { class: 'lista-resumo', role: 'status', 'aria-live': 'polite' });
  const resultado = h('div', { class: 'lista-resultado' });
  preencher(ctx.raiz, h('div', { class: 'lista-topo' }, busca.elemento, chips.elemento), resumo, resultado);
  ctx.aoLimpar(busca.parar);

  let ultima = null;      // o que foi desenhado por ultimo: evita redesenhar a cada passo do download
  function desenhar(forcar = false) {
    const estado = dados.estado();
    const espera = semDadosAinda(estado, () => dados.atualizar());
    if (espera) {
      chips.elemento.hidden = busca.elemento.hidden = true;
      resumo.textContent = '';
      preencher(resultado, espera);
      ultima = null;
      return;
    }
    chips.elemento.hidden = busca.elemento.hidden = false;
    const hoje = hojeEmCuiaba();
    const prazos = dados.obter('prazo');
    const assinatura = [prazos, dados.obter('processo'), dados.obter('parte'), dados.obter('pessoa'), hoje, lembrete.filtro, lembrete.busca, lembrete.limite,
      dados.comandosPendentes().map((c) => `${c.id}${c.estado}`).join(',')];
    if (!forcar && ultima && assinatura.every((x, i) => x === ultima[i])) return;
    ultima = assinatura;

    const contagens = contagensDePrazo(prazos, hoje);
    const opcoes = opcoesDeFiltroDePrazo(lembrete.filtro)
      .map((o) => ({ valor: o.valor, rotulo: o.rotulo, tom: o.tom, contagem: o.contar || ehFiltroExtra(o.valor) ? contagens[o.valor] : undefined }));
    chips.atualizar(opcoes, lembrete.filtro);

    let linhas = prazosDoFiltro(prazos, lembrete.filtro, hoje);
    if (lembrete.busca) linhas = linhas.filter((p) => achaNaBusca(textoDeBusca(p), lembrete.busca));
    const { itens, restantes } = paginar(linhas, lembrete.limite);

    const nome = (opcoes.find((o) => o.valor === lembrete.filtro) || { rotulo: '' }).rotulo;
    resumo.textContent = lembrete.busca
      ? `${linhas.length === 1 ? '1 prazo encontrado' : `${linhas.length} prazos encontrados`} · ${nome}`
      : `${plural(linhas.length, 'prazo', 'prazos')} · ${nome}`;

    const filhos = [];
    if (!linhas.length) {
      const base = VAZIO_POR_FILTRO[lembrete.filtro] || VAZIO_POR_FILTRO.abertos;
      filhos.push(lembrete.busca
        ? vazio({
          icone: 'busca', titulo: 'Nenhum prazo encontrado', texto: `Nada em “${lembrete.busca}” neste filtro.`,
          acao: h('div', { class: 'grupo-botoes' },
            h('button', { class: 'botao', type: 'button', onclick: () => { busca.definir(''); lembrete.busca = ''; desenhar(true); } }, 'Limpar a busca'),
            lembrete.filtro !== 'todos' ? h('button', { class: 'botao', type: 'button', onclick: () => { lembrete.filtro = 'todos'; lembrete.limite = POR_PAGINA; desenhar(true); } }, 'Procurar em todos os prazos') : null),
        })
        : vazio({ icone: base.icone, titulo: base.titulo, texto: base.texto, variante: base.icone === 'ok' ? 'ok' : null }));
    } else if (lembrete.filtro === 'todos') {
      const abertos = itens.filter(prazoAberto);
      const encerrados = itens.filter((p) => !prazoAberto(p));
      if (abertos.length) {
        filhos.push(h('h2', { class: 'secao-titulo' }, `Em aberto (${contagens.abertos})`), cartao({ corpo: 'lista', rotulo: 'Prazos em aberto' }, lista(abertos.map((p) => linhaDaLista(p, hoje)))));
      }
      if (encerrados.length) {
        filhos.push(h('h2', { class: 'secao-titulo' }, `Encerrados (${contagens.encerrados})`), cartao({ corpo: 'lista', rotulo: 'Prazos encerrados' }, lista(encerrados.map((p) => linhaDaLista(p, hoje)))));
      }
    } else {
      filhos.push(cartao({ corpo: 'lista', rotulo: 'Lista de prazos' }, lista(itens.map((p) => linhaDaLista(p, hoje)))));
    }
    if (restantes > 0) {
      filhos.push(h('button', {
        class: 'botao botao--cheio mais-linhas', type: 'button',
        onclick: () => { lembrete.limite += POR_PAGINA; desenhar(true); },
      }, `Mostrar mais (${plural(restantes, 'prazo restante', 'prazos restantes')})`));
    }
    preencher(resultado, filhos);
  }

  desenhar(true);
  if (rolagemParaRestaurar > 0) window.scrollTo(0, rolagemParaRestaurar);
  ctx.aoMudarDados(() => desenhar());
  ctx.aoVirarODia(() => desenhar(true));
  ctx.aoLimpar(() => { lembrete.rolagem = window.scrollY; });
}

// ---------------------------------------------------------------- o detalhe

const AJUDA_DA_NOTA = 'Este texto fica registrado no histórico do prazo, junto com a data e a hora do pedido.';

/** O que cada botao do detalhe pede ao computador e como confirma. */
const ACOES = {
  conferir: {
    tipo: 'prazo_conferir', estilo: 'primaria', icone: 'escudo', titulo: 'Conferi a data fatal', ajuda: 'Registra que você conferiu a contagem e a data.',
    dados: (nota) => ({ ...(nota ? { nota } : {}) }),
    confirmacao: (prazo) => ({
      titulo: 'Você conferiu a data fatal?',
      texto: `O computador vai registrar que você conferiu a data fatal de ${dataComDia(prazo.data_fatal)}. Só confirme se você mesmo conferiu a contagem, a publicação e o calendário.`,
      rotuloConfirmar: 'Sim, conferi', nota: { rotulo: 'Anotação', ajuda: 'Se quiser, diga como conferiu.' },
    }),
  },
  protocolado: {
    tipo: 'prazo_status', status: 'protocolado', estilo: 'normal', icone: 'processo', titulo: 'Protocolado', ajuda: 'A peça deste prazo já foi protocolada.',
    dados: (nota) => ({ status: 'protocolado', ...(nota ? { nota } : {}) }),
    confirmacao: () => ({
      titulo: 'Marcar como protocolado?', texto: 'O computador vai registrar que a peça deste prazo foi protocolada.', rotuloConfirmar: 'Marcar como protocolado',
      nota: { rotulo: 'Anotação' },
    }),
  },
  cumprido: {
    tipo: 'prazo_status', status: 'cumprido', estilo: 'normal', icone: 'ok', titulo: 'Cumprido', ajuda: 'O prazo foi cumprido.',
    dados: (nota) => ({ status: 'cumprido', ...(nota ? { nota } : {}) }),
    confirmacao: () => ({
      titulo: 'Marcar como cumprido?', texto: 'O computador vai registrar que este prazo foi cumprido.', rotuloConfirmar: 'Marcar como cumprido', nota: { rotulo: 'Anotação' },
    }),
  },
  perdido: {
    tipo: 'prazo_status', status: 'perdido', estilo: 'perigo', icone: 'erro', titulo: 'Não cumprido', ajuda: 'O prazo passou sem ser cumprido. Pede o motivo.',
    dados: (nota) => ({ status: 'perdido', nota }),
    confirmacao: () => ({
      titulo: 'Marcar como não cumprido?',
      texto: 'O computador vai registrar que este prazo não foi cumprido. Escreva o motivo com suas palavras.',
      rotuloConfirmar: 'Marcar como não cumprido', perigo: true,
      nota: { rotulo: 'Motivo', obrigatoria: true, ajuda: AJUDA_DA_NOTA },
    }),
  },
  reabrir: {
    tipo: 'prazo_status', status: 'aberto', estilo: 'normal', icone: 'atualizar', titulo: 'Reabrir o prazo', ajuda: 'Volta o prazo para “Em aberto”. Pede o motivo.',
    dados: (nota) => ({ status: 'aberto', nota }),
    confirmacao: (prazo) => ({
      titulo: 'Reabrir o prazo?',
      texto: `O computador vai trocar a situação de “${ROTULO_STATUS[prazo.status] || prazo.status}” para “Em aberto”.`,
      rotuloConfirmar: 'Reabrir o prazo', nota: { rotulo: 'Motivo', obrigatoria: true, ajuda: AJUDA_DA_NOTA },
    }),
  },
};

/** Frase simples para a falha de enviar um pedido. */
export function fraseDeErroDeEnvio(erro) {
  if (erro instanceof dados.ErroDeComando) return erro.message;
  if (erro && erro.rede) return 'Sem conexão com a internet. O pedido não foi enviado: tente de novo quando houver internet.';
  if (erro && erro.status === 401) return 'Sua sessão terminou. Entre de novo e repita o pedido.';
  if (erro && erro.status === 403) return 'Este acesso não tem permissão para enviar pedidos ao computador.';
  if (erro && erro.status >= 500) return 'A nuvem está com problema agora. O pedido não foi enviado; tente de novo em instantes.';
  return 'Não foi possível enviar o pedido. Tente de novo.';
}

function botaoDeAcao(acao, { desativado, aoClicar }) {
  return h('button', { class: ['acao', `acao--${acao.estilo}`], type: 'button', disabled: desativado, onclick: aoClicar },
    h('span', { class: 'acao-icone' }, icone(acao.icone, { tamanho: 24 })),
    h('span', { class: 'acao-texto' },
      h('span', { class: 'acao-titulo' }, acao.titulo),
      h('span', { class: 'acao-ajuda' }, desativado ? 'Pedido já enviado: aguardando o computador.' : acao.ajuda)));
}

function cabecalhoDoPrazo(prazo, hoje) {
  const aberto = prazoAberto(prazo);
  const situacao = situacaoDoPrazo(prazo, hoje);
  const variante = aberto
    ? ({ vencido: 'perigo', hoje: 'atencao', proximo: 'info' }[situacao.chave] || null)
    : (prazo.status === 'perdido' ? 'perigo' : null);
  const quando = aberto
    ? h('p', { class: ['prazo-quando', `prazo-quando--${situacao.chave}`] }, icone(situacao.chave === 'vencido' ? 'alerta' : 'relogio', { tamanho: 22 }), capitalizar(textoDeDias(situacao.dias)))
    : (prazo.protocolado_em && momentoOuData(prazo.protocolado_em)
      ? h('p', { class: 'prazo-quando prazo-quando--encerrado' }, icone('ok', { tamanho: 22 }), `Protocolado em ${momentoOuData(prazo.protocolado_em)}`)
      : null);
  return cartao(
    { variante, classe: 'prazo-cabeca', rotulo: `Prazo: ${prazo.ato}` },
    h('h2', { class: 'prazo-ato' }, prazo.ato),
    h('div', { class: 'selos' },
      prazoNaoConferido(prazo) ? seloNaoConferido() : null,
      aberto && Number(prazo.conferido) === 1 ? seloConferido() : null,
      criadoAutomaticamente(prazo) ? seloCriadoPeloSistema() : null,
      aberto ? seloDeSituacao(situacao) : null,
      prazo.status === 'aberto' ? selo('neutro', ROTULO_STATUS.aberto) : seloDeStatus(prazo.status)),
    h('div', { class: 'prazo-fatal' },
      h('span', { class: 'prazo-fatal-rotulo' }, 'Data fatal'),
      h('strong', { class: 'prazo-fatal-data' }, dataExtenso(prazo.data_fatal) || 'Data que o celular não entende (veja no computador)'),
      quando),
  );
}

function cartaoDoProcesso(prazo) {
  const processo = dados.linha('processo', prazo.processo_id);
  if (!processo) {
    return cartao({ titulo: 'Processo e cliente', icone: 'processo' }, h('p', { class: 'texto-2' }, 'O processo deste prazo não está nos dados deste aparelho.'));
  }
  const clientes = dados.clientesDoProcesso(processo.id);
  const contrarios = dados.contrariosDoProcesso(processo.id);
  const nomes = (pessoas) => pessoas.map((p) => h('span', { class: 'par-linha' }, h('a', { href: href('/cliente/:id', { id: p.id }) }, p.nome)));
  return cartao(
    { titulo: 'Processo e cliente', icone: 'processo' },
    h('dl', { class: 'pares' },
      par(clientes.length > 1 ? 'Clientes' : 'Cliente', clientes.length ? nomes(clientes) : 'Nenhum cliente cadastrado neste processo'),
      par('Processo', h('a', { href: href('/processo/:id', { id: processo.id }) }, numeroDoProcesso(processo.numero))),
      processo.acao_descricao ? par('Ação', processo.acao_descricao) : null,
      processo.orgao_julgador ? par('Órgão julgador', processo.orgao_julgador) : null,
      contrarios.length ? par('Parte contrária', contrarios.map((p) => h('span', { class: 'par-linha' }, p.nome))) : null),
  );
}

function cartaoDasDatas(prazo) {
  const diferente = prazo.data_fatal_calculada && prazo.data_fatal_calculada !== prazo.data_fatal;
  const quantos = Number.isInteger(prazo.dias) && prazo.dias > 0 ? prazo.dias : null;
  const contagem = quantos && (prazo.tipo_dias === 'uteis' || prazo.tipo_dias === 'corridos')
    ? `${quantos} ${prazo.tipo_dias === 'uteis' ? (quantos === 1 ? 'dia útil' : 'dias úteis') : (quantos === 1 ? 'dia corrido' : 'dias corridos')}${prazo.regra_ref ? ` (${prazo.regra_ref})` : ''}`
    : '';
  return cartao(
    { titulo: 'Datas', icone: 'calendario' },
    h('dl', { class: 'pares pares--duplo' },
      par('Data fatal', dataComDia(prazo.data_fatal)),
      diferente ? par('Calculada pelo sistema', dataComDia(prazo.data_fatal_calculada)) : null,
      prazo.data_interna ? par('Data interna (folga)', dataComDia(prazo.data_interna)) : null,
      prazo.data_disponibilizacao ? par('Disponibilizada no Diário', dataComDia(prazo.data_disponibilizacao)) : null,
      prazo.data_publicacao ? par('Publicação', dataComDia(prazo.data_publicacao)) : null,
      prazo.data_inicio_contagem ? par('Início da contagem', dataComDia(prazo.data_inicio_contagem)) : null,
      contagem ? par('Prazo', contagem) : null,
      prazo.protocolado_em && momentoOuData(prazo.protocolado_em) ? par('Protocolado em', momentoOuData(prazo.protocolado_em)) : null,
      Number(prazo.conferido) === 1 ? par('Data fatal conferida', momentoOuData(prazo.conferido_em) || 'Sim') : par('Data fatal conferida', 'Ainda não'),
      par('Origem do prazo', rotuloDaOrigem(prazo.origem)),
      prazo.criado_em && momentoOuData(prazo.criado_em) ? par('Cadastrado em', momentoOuData(prazo.criado_em)) : null),
  );
}

function cartaoDaPublicacaoDeOrigem(prazo, ctx) {
  const publicacao = dados.publicacaoDoPrazo(prazo);
  const idDaPublicacao = publicacao ? publicacao.id : (prazo.comunicacao_id || null);
  if (!idDaPublicacao) {
    return cartao({ titulo: 'Publicação de origem', icone: 'jornal' },
      h('p', null, 'Este prazo não está ligado a uma publicação do DJEN.'),
      h('p', { class: 'texto-2' }, `Origem do prazo: ${rotuloDaOrigem(prazo.origem)}.`));
  }
  const texto = textoDaPublicacao({ id: idDaPublicacao, recolhido: true, rotulo: 'Texto da publicação de origem', sinal: ctx.sinal });
  const botao = h('button', { class: 'botao botao--cheio', type: 'button', onclick: () => { botao.hidden = true; texto.carregar(); } }, icone('jornal'), 'Ler o texto da publicação');
  const resumo = publicacao
    ? h('dl', { class: 'pares' },
      par('Tipo', [publicacao.tipo_comunicacao, publicacao.tipo_documento].filter(Boolean).join(' · ') || 'Publicação'),
      publicacao.data_disponibilizacao ? par('Disponibilizada em', dataComDia(publicacao.data_disponibilizacao)) : null,
      publicacao.nome_orgao || publicacao.sigla_tribunal ? par('Órgão', [publicacao.nome_orgao, publicacao.sigla_tribunal].filter(Boolean).join(' · ')) : null)
    : h('p', { class: 'texto-2' }, 'Esta publicação é mais antiga que os últimos 180 dias e não está guardada neste aparelho, mas o texto ainda pode ser lido com internet.');
  return cartao(
    { titulo: 'Publicação de origem', icone: 'jornal', acao: publicacao ? h('a', { class: 'secao-link', href: href('/publicacao/:id', { id: publicacao.id }) }, 'Abrir') : null },
    resumo,
    h('div', { class: 'origem-texto' }, botao, texto.elemento),
  );
}

function montarDetalhe(ctx) {
  ctx.titulo('Prazo');
  const id = ctx.params.id;
  const slots = ['cabecalho', 'pedidos', 'acoes', 'processo', 'datas', 'memoria', 'origem', 'observacao']
    .reduce((mapa, nome) => mapa.set(nome, { el: h('div', { class: `slot slot-${nome}` }), assinatura: null }), new Map());
  const erroDeEnvio = h('p', { class: 'campo-erro', role: 'alert', hidden: true });
  const pedidosSecao = h('section', { class: 'pedidos', 'aria-label': 'Pedidos enviados do celular' },
    h('h2', { class: 'secao-titulo' }, 'Pedidos enviados deste aparelho'), blocoDeComandos(id, ctx));
  slots.get('pedidos').el.append(pedidosSecao);
  slots.get('pedidos').el.hidden = true;     // so aparece quando ha algum pedido deste aparelho para este prazo
  const botoesDeAcao = h('div', { class: 'acoes' });
  const secaoDeAcoes = cartao({ titulo: 'Pedir ao computador', icone: 'computador', classe: 'cartao--acoes' },
    h('p', { class: 'texto-2 texto-pequeno acoes-aviso' }, 'O celular não muda o prazo sozinho: ele pede, e o computador aplica quando estiver ligado e com internet.'),
    botoesDeAcao, erroDeEnvio);
  slots.get('acoes').el.append(secaoDeAcoes);

  let montado = false;
  let enviando = false;
  let assinaturaDasAcoes = null;

  /** Refaz uma parte do detalhe so quando o que ela mostra mudou (assim o texto aberto e a rolagem nao se perdem a cada passo do download). */
  function atualizarSlot(nome, assinatura, construir) {
    const slot = slots.get(nome);
    if (slot.assinatura === assinatura) return;
    slot.assinatura = assinatura;
    let conteudo;
    try {
      conteudo = construir();
    } catch {
      conteudo = cartao({ variante: 'atencao', titulo: 'Esta parte não pôde ser mostrada', icone: 'alerta' }, h('p', null, 'Algum dado desta parte do prazo está fora do formato que o celular entende. Veja o prazo no computador.'));
    }
    slot.el.replaceChildren(...(Array.isArray(conteudo) ? conteudo : [conteudo]).filter(Boolean));
  }

  async function pedir(acao) {
    if (enviando) return;
    const prazo = dados.linha('prazo', id);
    if (!prazo) return;
    const config = acao.confirmacao(prazo);
    const aguardando = dados.comandosDoAlvo(id).filter((c) => c.estado === 'enviado').length;
    if (aguardando) config.texto = `${config.texto} Já existe um pedido aguardando o computador para este prazo: este vai depois dele.`;
    const resposta = await confirmar(config);
    if (!resposta.confirmado) return;
    enviando = true;
    erroDeEnvio.hidden = true;
    try {
      await dados.enviarComando(acao.tipo, prazo.id, acao.dados(resposta.nota));
      anunciar('Pedido enviado. Aguardando o computador.');
      pedidosSecao.scrollIntoView({ block: 'center' });
    } catch (erro) {
      erroDeEnvio.textContent = fraseDeErroDeEnvio(erro);
      erroDeEnvio.hidden = false;
    } finally {
      enviando = false;
    }
  }

  function construirAcoes(prazo) {
    const pendentes = dados.comandosDoAlvo(id).filter((c) => c.estado === 'enviado');
    const jaPediuConferir = pendentes.some((c) => c.tipo === 'prazo_conferir');
    const jaPediuStatus = (status) => pendentes.some((c) => c.tipo === 'prazo_status' && c.dados && c.dados.status === status);
    const botao = (chave) => {
      const acao = ACOES[chave];
      const desativado = chave === 'conferir' ? jaPediuConferir : jaPediuStatus(acao.status);
      return botaoDeAcao(acao, { desativado, aoClicar: () => pedir(acao) });
    };
    if (!prazoAberto(prazo)) {
      return [h('p', null, `Este prazo está encerrado (${(ROTULO_STATUS[prazo.status] || prazo.status).toLowerCase()}). Se precisar mexer nele de novo, peça para reabrir.`), botao('reabrir')];
    }
    const filhos = [];
    if (prazoNaoConferido(prazo)) {
      filhos.push(h('div', { class: 'aviso-conferencia', role: 'note' },
        icone('alerta', { tamanho: 24 }),
        h('div', null,
          h('p', { class: 'aviso-conferencia-titulo' }, 'A data fatal ainda não foi conferida por você.'),
          h('p', null, 'Não confie nela até conferir: veja abaixo como o prazo foi contado e a publicação de origem.'))),
      botao('conferir'));
    } else {
      filhos.push(h('p', { class: 'conferido-aviso' }, icone('ok', { tamanho: 20 }), `Data fatal conferida${prazo.conferido_em && momentoOuData(prazo.conferido_em) ? ` em ${momentoOuData(prazo.conferido_em)}` : ''}.`));
    }
    filhos.push(botao('protocolado'), botao('cumprido'), botao('perdido'));
    return filhos;
  }

  function desenhar() {
    const estado = dados.estado();
    const prazo = dados.linha('prazo', id);
    if (!prazo) {
      montado = false;
      assinaturaDasAcoes = null;
      for (const s of slots.values()) s.assinatura = null;
      preencher(ctx.raiz, semDadosAinda(estado, () => dados.atualizar()) || vazio({
        icone: 'info', titulo: 'Prazo não encontrado',
        texto: 'Este prazo não está nos dados deste aparelho. Ele pode ter sido arquivado ou o computador ainda não o enviou.',
        acao: h('a', { class: 'botao', href: href('/prazos') }, 'Ver os prazos'),
      }));
      return;
    }
    if (!montado) {
      preencher(ctx.raiz, [...slots.values()].map((s) => s.el));
      montado = true;
    }
    const hoje = hojeEmCuiaba();
    const json = JSON.stringify;
    const pendentes = dados.comandosDoAlvo(id).filter((c) => c.estado === 'enviado').map((c) => `${c.id}:${c.tipo}:${c.dados && c.dados.status}`).join(',');
    atualizarSlot('cabecalho', json([prazo, hoje]), () => cabecalhoDoPrazo(prazo, hoje));
    const deAcoes = json([prazo.status, prazo.conferido, prazo.conferido_em, prazo.data_fatal, pendentes]);
    if (deAcoes !== assinaturaDasAcoes) {
      assinaturaDasAcoes = deAcoes;
      preencher(botoesDeAcao, construirAcoes(prazo));
    }
    slots.get('pedidos').el.hidden = dados.comandosDoAlvo(id).length === 0;
    const processo = dados.linha('processo', prazo.processo_id);
    atualizarSlot('processo', json([processo, dados.clientesDoProcesso(prazo.processo_id), dados.contrariosDoProcesso(prazo.processo_id)]), () => cartaoDoProcesso(prazo));
    atualizarSlot('datas', json(prazo), () => cartaoDasDatas(prazo));
    atualizarSlot('memoria', json([prazo.calculo_memoria, prazo.data_fatal, prazo.data_fatal_calculada, prazo.dias, prazo.tipo_dias, prazo.regra_ref]), () => memoriaDeCalculo(prazo));
    atualizarSlot('origem', json([prazo.comunicacao_id, prazo.origem, dados.publicacaoDoPrazo(prazo)]), () => cartaoDaPublicacaoDeOrigem(prazo, ctx));
    atualizarSlot('observacao', json(prazo.observacao), () => (prazo.observacao
      ? cartao({ titulo: 'Observação', icone: 'info' }, h('p', { class: 'texto-livre' }, prazo.observacao))
      : null));
  }

  desenhar();
  ctx.aoMudarDados(desenhar);
  ctx.aoVirarODia(desenhar);
  // ao voltar para a lista, ela guarda o filtro e a busca (um link com filtro nao deve zera-los)
  ctx.aoLimpar(() => { lembrete.preservar = /^#\/prazos(\?|$)/.test(window.location.hash); });
}

registrar('/prazos', montarLista, { aba: 'prazos' });
registrar('/prazo/:id', montarDetalhe, { aba: 'prazos', pai: '/prazos' });
