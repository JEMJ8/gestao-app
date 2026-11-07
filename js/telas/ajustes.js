// Ajustes: situacao da sincronizacao, tema, sair e versao do aplicativo.

import { registrar } from '../rotas.js';
import * as dados from '../dados.js';
import * as auth from '../auth.js';
import { h, preencher, novoId } from '../ui.js';
import { icone } from '../icones.js';
import { quandoFoi, emCuiaba, dataBR, duracaoEmPalavras } from '../datas.js';
import { plural } from '../formato.js';
import { cartao } from '../componentes/cartao.js';
import { confirmar } from '../componentes/confirmacao.js';
import { OPCOES_DE_TEMA, definirTema, preferenciaDeTema } from '../tema.js';
import { VERSAO_APP } from '../versao.js';

function par(rotulo, valor) {
  return h('div', null, h('dt', { class: 'par-rotulo' }, rotulo), h('dd', { class: 'par-valor' }, valor));
}

function momentoPorExtenso(ms) {
  const m = emCuiaba(ms);
  return m ? `${dataBR(m.data)} às ${m.hora}` : '';
}

function cartaoDeSincronia() {
  const estado = dados.estado();
  const c = estado.computador;
  const agora = dados.agoraCorrigido();
  const frasesDoComputador = !c.conhecido || c.epoch === null
    ? 'Não sei: o computador ainda não avisou que sincronizou.'
    : `${quandoFoi(c.epoch, agora)} (${momentoPorExtenso(c.epoch)})`;
  const contagens = [
    ['prazo', 'prazo', 'prazos'], ['processo', 'processo', 'processos'], ['pessoa', 'cadastro', 'cadastros'],
    ['comunicacao', 'publicação', 'publicações'], ['evento', 'evento', 'eventos'],
  ].map(([tabela, s, p]) => plural(dados.obter(tabela).length, s, p)).join(', ');
  const botao = h('button', { class: 'botao botao--primario botao--cheio', type: 'button', onclick: () => dados.atualizar(), disabled: estado.atualizando },
    icone('atualizar'), estado.atualizando ? 'Atualizando…' : 'Atualizar agora');
  return cartao(
    { titulo: 'Sincronização', icone: 'computador', variante: c.atrasado && estado.carregado ? 'atencao' : null },
    h('dl', { class: 'pares' },
      par('Última vez que o computador sincronizou', frasesDoComputador),
      par('Última vez que este aparelho baixou os dados', estado.atualizadoLocalEm ? `${quandoFoi(estado.atualizadoLocalEm, Date.now())} (${momentoPorExtenso(estado.atualizadoLocalEm)})` : 'Ainda não baixou'),
      par('O que há neste aparelho', estado.carregado ? contagens : 'Nada ainda'),
      c.atrasoMs !== null && c.atrasado ? par('Aviso', `O computador está há ${duracaoEmPalavras(c.atrasoMs)} sem sincronizar. Ele está desligado ou sem internet; prazos novos podem faltar.`) : null,
      estado.offline ? par('Conexão', 'Sem internet agora. O aplicativo mostra a última cópia guardada.') : null,
      estado.erro ? par('Problema', estado.erro) : null,
      c.versao ? par('Programa do computador', `versão ${c.versao}`) : null),
    h('div', { class: 'cartao-acao' }, botao),
  );
}

function cartaoDeTema() {
  const nome = novoId('tema');
  const atual = preferenciaDeTema();
  return cartao(
    { titulo: 'Aparência', icone: 'lua' },
    h('fieldset', { class: 'opcoes' },
      h('legend', { class: 'so-leitor' }, 'Tema do aplicativo'),
      OPCOES_DE_TEMA.map((o) => h('label', { class: 'opcao' },
        h('input', { type: 'radio', name: nome, value: o.valor, checked: o.valor === atual, onchange: () => definirTema(o.valor) }),
        h('span', null, h('strong', null, o.rotulo), h('br'), h('span', { class: 'texto-2 texto-pequeno' }, o.ajuda))))),
  );
}

function cartaoDeConta() {
  const usuario = auth.usuarioAtual();
  const botao = h('button', { class: 'botao botao--cheio', type: 'button' }, icone('sair'), 'Sair deste aparelho');
  botao.addEventListener('click', async () => {
    const r = await confirmar({
      titulo: 'Sair deste aparelho?',
      texto: 'Isso apaga os dados guardados aqui. Para entrar de novo você vai precisar da senha e do código do autenticador.',
      rotuloConfirmar: 'Sair e apagar',
      perigo: true,
    });
    if (!r.confirmado) return;
    botao.disabled = true;
    await auth.sair();
    window.location.replace(window.location.pathname);
  });
  return cartao(
    { titulo: 'Conta', icone: 'cadeado' },
    usuario && usuario.email ? h('p', null, 'Você entrou como ', h('strong', null, usuario.email), '.') : null,
    h('p', { class: 'texto-2 texto-pequeno' }, 'Este aparelho só mostra dados depois de e-mail, senha e código de segurança.'),
    h('div', { class: 'cartao-acao' }, botao),
  );
}

function cartaoSobre() {
  return cartao(
    { titulo: 'Sobre', icone: 'info' },
    h('dl', { class: 'pares' },
      par('Versão do aplicativo', VERSAO_APP),
      par('O que fica guardado neste aparelho', 'Uma cópia dos prazos, processos, cadastros, agenda e publicações (sem o texto das publicações), para ver sem internet. Sair apaga tudo.')),
  );
}

registrar('/ajustes', (ctx) => {
  ctx.titulo('Ajustes');
  const redesenhar = () => {
    preencher(ctx.raiz, cartaoDeSincronia(), cartaoDeTema(), cartaoDeConta(), cartaoSobre());
  };
  redesenhar();
  ctx.aoMudarDados(() => {
    // so a sincronizacao muda sozinha; o resto (tema escolhido, foco) nao deve piscar
    const velho = ctx.raiz.querySelector('.cartao');
    if (velho) velho.replaceWith(cartaoDeSincronia());
  });
  ctx.aoVirarODia(redesenhar);
}, { aba: 'mais', pai: '/mais' });
