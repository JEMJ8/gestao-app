// Folha de EDICAO de um prazo: ato, data fatal, data interna e observacao, ja preenchidos com o que o prazo tem hoje, mais uma anotacao opcional.
//
//   const edicao = abrirEdicaoDoPrazo({ prazo, aoEnviar: async (dados) => { ...manda o pedido...; return null; /* ou uma frase de erro */ } });
//   const { enviado } = await edicao.fechada;      // resolve quando a folha fecha, por qualquer caminho
//
// O celular so PEDE a mudanca: `aoEnviar` recebe SO o que mudou (mais a anotacao, se houver) e devolve null se o pedido saiu, ou uma frase simples
// se falhou (a folha continua aberta, com o que a pessoa escreveu). Quem aplica e o computador. Se a data fatal mudar, o prazo volta a ficar como
// "nao conferido" e a pessoa precisa conferir de novo: o aviso fixo da folha diz isso antes de enviar.
//
// Se a pessoa ja escreveu ou mudou alguma coisa, sair da folha (X, tocar fora, Esc, Cancelar ou Voltar do aparelho) PERGUNTA antes, ali mesmo na folha:
// "Descartar o que você escreveu?" com "Continuar editando" e "Descartar". Sem nada digitado, a folha fecha direto.
//
// As regras de tamanho e de data sao as de dominio.js (as mesmas do computador): o erro aparece em frase simples junto do campo. O botao
// "Enviar pedido" fica desligado enquanto nada mudou. Este modulo nao fala com a nuvem: quem envia e a tela.

import { h, novoId, anunciar } from '../ui.js';
import { icone } from '../icones.js';
import { dataComDia, dataValida } from '../datas.js';
import {
  analisarEdicaoDoPrazo, ANO_MAXIMO_DA_DATA, ANO_MINIMO_DA_DATA, LIMITE_DA_NOTA_DE_EDICAO, LIMITE_DO_ATO,
} from '../dominio.js';
import { abrirFolha } from './folha.js';

export const AVISO_DA_DATA_FATAL = 'Se você mudar a data fatal, o prazo volta a ficar como não conferido e você precisa conferir de novo.';
const ORDEM = ['ato', 'data_fatal', 'data_interna', 'observacao'];
const FRASE_FALHA = 'Não foi possível enviar o pedido. Tente de novo.';

function campoComRotulo({ nome, rotulo, ajuda, controle, extra }) {
  const idErro = novoId(`edicao-${nome}-erro`);
  const idAjuda = ajuda ? novoId(`edicao-${nome}-ajuda`) : null;
  controle.setAttribute('aria-describedby', [idAjuda, idErro].filter(Boolean).join(' '));
  const erro = h('p', { class: 'campo-erro', id: idErro, role: 'alert', hidden: true });
  const elemento = h('div', { class: 'campo' },
    h('label', { class: 'campo-rotulo', for: controle.id }, rotulo),
    ajuda ? h('span', { class: 'campo-ajuda', id: idAjuda }, ajuda) : null,
    controle,
    extra,
    erro);
  return { elemento, erro };
}

export function abrirEdicaoDoPrazo({ prazo, aoEnviar }) {
  const texto = (v) => (typeof v === 'string' ? v : '');
  const data = (v) => (dataValida(v) ? v : '');
  // O que o prazo tem hoje, na forma do formulario. Data que o celular nao entende vira vazio: assim nao conta como mudanca nem trava o pedido.
  const base = { ato: texto(prazo.ato), data_fatal: data(prazo.data_fatal), data_interna: data(prazo.data_interna), observacao: texto(prazo.observacao) };

  const controles = {
    ato: h('input', {
      id: novoId('edicao-ato'), class: 'entrada', type: 'text', value: base.ato, maxlength: LIMITE_DO_ATO, autocomplete: 'off',
      autocapitalize: 'sentences', enterkeyhint: 'done',
    }),
    data_fatal: h('input', {
      id: novoId('edicao-data-fatal'), class: ['entrada', 'entrada--data'], type: 'date', value: base.data_fatal, required: true, autocomplete: 'off',
      min: `${ANO_MINIMO_DA_DATA}-01-01`, max: `${ANO_MAXIMO_DA_DATA}-12-31`,
    }),
    data_interna: h('input', {
      id: novoId('edicao-data-interna'), class: ['entrada', 'entrada--data'], type: 'date', value: base.data_interna, autocomplete: 'off',
      min: `${ANO_MINIMO_DA_DATA}-01-01`, max: `${ANO_MAXIMO_DA_DATA}-12-31`,
    }),
    observacao: h('textarea', { id: novoId('edicao-observacao'), class: 'entrada', rows: 4, autocomplete: 'off', autocapitalize: 'sentences' }, base.observacao),
  };
  const campoDaNota = h('textarea', {
    id: novoId('edicao-nota'), class: 'entrada', rows: 2, maxlength: LIMITE_DA_NOTA_DE_EDICAO, autocomplete: 'off', autocapitalize: 'sentences',
  });
  const previas = { data_fatal: h('p', { class: 'campo-previa', 'aria-live': 'polite' }), data_interna: h('p', { class: 'campo-previa', 'aria-live': 'polite' }) };
  const botaoTirar = h('button', { class: ['botao', 'botao--discreto', 'botao--tirar'], type: 'button' }, icone('fechar', { tamanho: 18 }), 'Tirar a data interna');

  const campos = {
    ato: campoComRotulo({ nome: 'ato', rotulo: 'Ato do prazo', controle: controles.ato }),
    data_fatal: campoComRotulo({ nome: 'data-fatal', rotulo: 'Data fatal', ajuda: 'O último dia do prazo.', controle: controles.data_fatal, extra: previas.data_fatal }),
    data_interna: campoComRotulo({
      nome: 'data-interna', rotulo: 'Data interna (opcional)', ajuda: 'É a sua folga. Não pode ser depois da data fatal.', controle: controles.data_interna,
      extra: [previas.data_interna, botaoTirar],
    }),
    observacao: campoComRotulo({ nome: 'observacao', rotulo: 'Observação (opcional)', controle: controles.observacao }),
  };
  // os erros ficam guardados pelo nome do campo do pedido (data_fatal), nao pelo do id (data-fatal)
  const erroDe = (nome) => campos[nome].erro;
  const nota = campoComRotulo({
    nome: 'nota', rotulo: 'Anotação (opcional)', ajuda: `Fica registrada no histórico do prazo, junto com a data e a hora do pedido. Até ${LIMITE_DA_NOTA_DE_EDICAO} letras.`,
    controle: campoDaNota,
  });

  const idDica = novoId('edicao-dica');
  const dica = h('p', { class: 'texto-2 texto-pequeno', id: idDica }, 'Mude pelo menos uma coisa para poder enviar o pedido.');
  const erroDoEnvio = h('p', { class: 'campo-erro', role: 'alert', hidden: true });
  const botaoCancelar = h('button', { class: 'botao', type: 'button' }, 'Cancelar');
  // A pergunta de descartar fica na propria folha (sem abrir outra folha em cima: o Voltar do aparelho continua com um passo so).
  const botaoContinuar = h('button', { class: ['botao', 'botao--seguro'], type: 'button' }, 'Continuar editando');
  const botaoDescartar = h('button', { class: ['botao', 'botao--perigo'], type: 'button' }, 'Descartar');
  const pergunta = h('div', { class: 'edicao-pergunta', role: 'alertdialog', 'aria-labelledby': 'edicao-pergunta-titulo', hidden: true },
    h('p', { class: 'edicao-pergunta-titulo', id: 'edicao-pergunta-titulo' }, 'Descartar o que você escreveu?'),
    h('p', { class: 'texto-2 texto-pequeno' }, 'Se descartar, nada disto é enviado ao computador.'),
    h('div', { class: 'grupo-botoes' }, botaoContinuar, botaoDescartar));
  const botaoEnviar = h('button', { class: ['botao', 'botao--primario'], type: 'button', disabled: true, 'aria-describedby': idDica }, 'Enviar pedido');

  const tocados = new Set();
  let tentou = false;
  let enviando = false;
  let enviado = false;

  const lerCampos = () => Object.fromEntries(ORDEM.map((c) => [c, controles[c].value]));
  // Comparacao so do texto (sem espaco nas pontas e com a quebra de linha sempre igual): mexer so nisso nao conta como "escreveu alguma coisa".
  const limpo = (v) => String(v === null || v === undefined ? '' : v).replace(/\r\n?/g, '\n').trim();
  const temAlgoAPerder = () => !enviado && (ORDEM.some((c) => limpo(controles[c].value) !== limpo(base[c])) || limpo(campoDaNota.value) !== '');

  function atualizarPrevia(nome) {
    const valor = controles[nome].value;
    previas[nome].textContent = dataValida(valor) ? `Dia escolhido: ${dataComDia(valor)}` : '';
  }

  function atualizar() {
    const { erros, mudancas } = analisarEdicaoDoPrazo(lerCampos(), base);
    atualizarPrevia('data_fatal');
    atualizarPrevia('data_interna');
    for (const nome of ORDEM) {
      // o erro aparece depois de a pessoa mexer no campo (ou de tentar enviar); o da data interna tambem quando ela mexe na data fatal
      const aparece = Boolean(erros[nome]) && (tentou || tocados.has(nome) || (nome === 'data_interna' && tocados.has('data_fatal')));
      const p = erroDe(nome);
      p.textContent = aparece ? erros[nome] : '';
      p.hidden = !aparece;
      if (aparece) controles[nome].setAttribute('aria-invalid', 'true');
      else controles[nome].removeAttribute('aria-invalid');
    }
    botaoTirar.hidden = !controles.data_interna.value;
    const algumaCoisa = Object.keys(mudancas).length > 0 || Object.keys(erros).length > 0;
    botaoEnviar.disabled = enviando || !algumaCoisa;
    dica.hidden = algumaCoisa;
    return { erros, mudancas };
  }

  for (const nome of ORDEM) {
    const dataDoCampo = nome === 'data_fatal' || nome === 'data_interna';
    controles[nome].addEventListener('input', () => { if (dataDoCampo) tocados.add(nome); atualizar(); });
    if (dataDoCampo) controles[nome].addEventListener('change', () => { tocados.add(nome); atualizar(); });
    else controles[nome].addEventListener('blur', () => { tocados.add(nome); atualizar(); });
  }
  controles.ato.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); controles.ato.blur(); } });
  botaoTirar.addEventListener('click', () => {
    controles.data_interna.value = '';
    tocados.add('data_interna');
    atualizar();
    controles.data_interna.focus();
  });

  async function enviar() {
    if (enviando) return;
    tentou = true;
    const { erros, mudancas } = atualizar();
    const primeiro = ORDEM.find((c) => erros[c]);
    if (primeiro) {
      anunciar(erros[primeiro]);
      controles[primeiro].focus();
      return;
    }
    if (!Object.keys(mudancas).length) return;
    const anotacao = campoDaNota.value.trim();
    enviando = true;
    botaoEnviar.disabled = true;
    botaoCancelar.disabled = true;
    erroDoEnvio.hidden = true;
    botaoEnviar.textContent = 'Enviando…';
    let falha = null;
    try {
      falha = await aoEnviar({ ...mudancas, ...(anotacao ? { nota: anotacao } : {}) });
    } catch {
      falha = FRASE_FALHA;
    }
    enviando = false;
    botaoCancelar.disabled = false;
    botaoEnviar.textContent = 'Enviar pedido';
    if (falha) {
      erroDoEnvio.textContent = String(falha);
      erroDoEnvio.hidden = false;
      atualizar();
      botaoEnviar.focus();
      return;
    }
    enviado = true;
    await folha.fechar();
  }

  let respostaDaPergunta = null;
  /** Mostra a pergunta de descartar e devolve uma promessa: true = descartar, false = continuar editando. */
  function perguntarSeDescarta() {
    pergunta.hidden = false;
    botaoCancelar.hidden = true;
    botaoEnviar.hidden = true;
    anunciar('Descartar o que você escreveu?');
    botaoContinuar.focus();
    return new Promise((resolve) => {
      respostaDaPergunta = (descartar) => {
        respostaDaPergunta = null;
        pergunta.hidden = true;
        botaoCancelar.hidden = false;
        botaoEnviar.hidden = false;
        resolve(descartar);
      };
    });
  }
  botaoContinuar.addEventListener('click', () => { if (respostaDaPergunta) respostaDaPergunta(false); });
  botaoDescartar.addEventListener('click', () => { if (respostaDaPergunta) respostaDaPergunta(true); });

  let concluir;
  const fechada = new Promise((resolve) => { concluir = resolve; });
  const folha = abrirFolha({
    titulo: 'Editar o prazo',
    conteudo: [
      h('p', { class: 'texto-2 texto-pequeno' }, 'O celular pede a mudança e o computador aplica quando estiver ligado e com internet.'),
      h('div', { class: 'aviso aviso--aviso edicao-aviso', role: 'note' }, icone('alerta', { tamanho: 22 }), h('p', { class: 'aviso-texto' }, AVISO_DA_DATA_FATAL)),
      campos.ato.elemento, campos.data_fatal.elemento, campos.data_interna.elemento, campos.observacao.elemento, nota.elemento,
      dica, erroDoEnvio,
    ],
    rodape: [pergunta, botaoCancelar, botaoEnviar],
    aoFechar: () => concluir({ enviado }),
    guarda: {
      sujo: temAlgoAPerder,
      perguntar: perguntarSeDescarta,
      continuar: () => { if (respostaDaPergunta) respostaDaPergunta(false); },   // Esc, tocar fora ou Voltar com a pergunta aberta: continua editando
    },
  });
  botaoCancelar.addEventListener('click', () => folha.tentarFechar());
  botaoEnviar.addEventListener('click', enviar);
  atualizar();
  return { folha, fechada };
}
