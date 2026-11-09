// Ajustes: situacao da sincronizacao, tema, trava do aplicativo, sair e versao do aplicativo.
//
// O cartao "Trava do aplicativo" liga, testa, refaz, tranca e desliga a trava. Ele so fecha a porta do aplicativo: nao protege os dados guardados
// no aparelho, nao mexe na sessao e nao fala com a nuvem (a regra mora em auth.js e biometria.js). Cinco estados:
//   A o navegador nao oferece a trava       B o celular nao confirmou ter bloqueio de tela que sirva
//   C desligada                              D ligada e completa          E ligada, porem incompleta (so Refazer e Sair)
// Toda funcao aoToque* que chama o celular (criar ou verificar) sai do proprio toque: nao e assincrona e continua pelo then da promessa. O iPhone
// so abre a janela do desbloqueio a partir do toque. Desligar, Sair e a troca para um prazo MAIOR passam por componentes/confirmacao-verificada.js.

import { registrar } from '../rotas.js';
import * as dados from '../dados.js';
import * as auth from '../auth.js';
import * as bio from '../biometria.js';
import * as trava from './trava.js';
import { h, preencher, novoId, anunciar, focar } from '../ui.js';
import { icone } from '../icones.js';
import { quandoFoi, emCuiaba, dataBR, duracaoEmPalavras } from '../datas.js';
import { plural } from '../formato.js';
import { cartao } from '../componentes/cartao.js';
import { selo } from '../componentes/selo.js';
import { confirmar } from '../componentes/confirmacao.js';
import { confirmarComVerificacao } from '../componentes/confirmacao-verificada.js';
import { OPCOES_DE_TEMA, definirTema, preferenciaDeTema } from '../tema.js';
import { VERSAO_APP } from '../versao.js';

// ---------------------------------------------------------------- textos do cartao da trava (catalogo do contrato, secoes 12.2 e 12.5)

const TX = {
  TITULO: 'Trava do aplicativo',
  SELO_INDISPONIVEL: 'Indisponível',
  SELO_DESLIGADA: 'Desligada',
  SELO_LIGADA: 'Ligada',
  A: 'Este navegador não oferece a trava do aplicativo. Abra o aplicativo pelo ícone da tela inicial, ou pelo mesmo navegador que você costuma usar, e ligue por lá.',
  B: 'O celular não confirmou ter um bloqueio de tela que sirva para isso (digital, rosto, PIN ou padrão). Confira nas configurações do celular e toque em Conferir de novo.',
  B_PASSOU: 'Agora dá para ligar a trava do aplicativo.',
  B_AINDA_NAO: 'Conferido agora: o celular ainda não confirmou ter um bloqueio de tela.',
  C: 'Agora o Gestão JEMJ abre sem pedir confirmação do celular. Com a trava ligada, ele pede o desbloqueio do celular, normalmente o mesmo que você usa para abrir o próprio celular.',
  C_PEQUENO: 'Isto não deixa o acesso mais rápido, deixa mais protegido. Se o desbloqueio falhar, só se entra com senha e código, e isso precisa de internet.',
  C_IPHONE: 'No iPhone, ligue por onde você usa o aplicativo: o ícone da tela inicial costuma guardar os dados à parte do Safari.',
  D: 'O aplicativo pede o desbloqueio do celular quando você o abre e quando volta a ele depois do prazo escolhido.',
  E: 'A trava guardada neste celular está incompleta. Toque em Refazer a trava ou use Sair deste aparelho, mais abaixo.',
  JANELA: 'O celular vai abrir uma janela própria. Ela pode falar em chave de acesso e mostrar jemj8.github.io. É normal. Siga as instruções dela.',
  AGUARDANDO: 'Aguardando o celular…',
  ERRO_LIGAR: 'Não foi ligada. Toque em Ligar a trava para tentar de novo.',
  ERRO_GRAVAR: 'Não foi possível guardar a trava neste celular. Tente de novo.',
  ICONE_FALHOU: 'A trava não funcionou neste aparelho, no ícone da tela inicial. Você pode continuar sem ela.',
  // com trava antiga (estados D e E, Refazer): ela segue ligada, entao nao se pode dizer que se continua sem ela
  ICONE_FALHOU_REFAZER: 'A trava não funcionou neste aparelho, no ícone da tela inicial. A trava antiga continua como estava.',
  LIGADA_OK: 'Trava ligada.',
  DESLIGADA_OK: 'Trava desligada.',
  TESTE_OK: 'A trava funcionou.',
  TESTE_FALHOU: 'Não funcionou. Toque em Testar agora para tentar de novo. Se continuar assim, toque em Refazer a trava, em Mais opções.',
  REFEITA_OK: 'Trava refeita.',
  REFEITA_FALHOU: 'Não foi refeita. A trava antiga continua como estava.',
  PRAZO_LEGENDA: 'Pedir de novo quando eu voltar ao aplicativo',
  PEQUENO_1: 'O aplicativo tranca quando você sai dele e volta depois do prazo escolhido. Com ele aberto na sua mão, não tranca sozinho: toque em Trancar agora.',
  PEQUENO_2: 'Sem internet, se o desbloqueio falhar, você só volta a entrar quando o sinal voltar. Teste uma vez com sinal: toque em Testar agora.',
  PEQUENO_3: 'Quem tem o seu celular desbloqueado, a sua senha e o autenticador no mesmo celular consegue entrar de novo com senha e código, mesmo com a trava ligada. Essa porta só fica fechada se o autenticador tiver bloqueio próprio e a senha não ficar salva no celular.',
  MAIOR_TEXTO: 'Quem pegar o celular desbloqueado poderá abrir o aplicativo se voltar a ele nesse intervalo.',
  MAIOR_FALHA: 'Não foi confirmado. O prazo continua como estava.',
  MAIOR_OK: 'Prazo mudado.',
  DESLIGAR_TEXTO: 'O Gestão JEMJ volta a abrir direto neste celular, sem pedir nada. Quem pegar o celular desbloqueado poderá ver os prazos e os clientes. Você continua conectado à sua conta. O celular pode continuar mostrando uma chave de acesso do Gestão JEMJ nas configurações dele. É normal e pode ficar lá.',
  DESLIGAR_FALHA: 'Continua ligada. Para desligar, confirme com o desbloqueio do celular. Se ele não funciona, use Sair deste aparelho.',
  SAIR_COM_TRAVA: 'Isso apaga os dados guardados aqui e desliga a trava do aplicativo. Para entrar de novo você vai precisar da senha e do código do autenticador, e depois pode ligar a trava de novo. O celular pode continuar mostrando uma chave de acesso do Gestão JEMJ nas configurações dele. É normal e pode ficar lá.',
  SAIR_FALHA: 'Não foi confirmado. Toque em Sair e apagar para tentar de novo.',
  SAIR_ESCAPE: 'Sair mesmo sem confirmar',
  SAIR_ESCAPE_TEXTO: 'Isso só apaga os dados deste celular; nada fica visível.',
  // texto de hoje, sem a trava: byte a byte
  SAIR_SEM_TRAVA: 'Isso apaga os dados guardados aqui. Para entrar de novo você vai precisar da senha e do código do autenticador.',
  CONTA: 'Este aparelho só mostra dados depois de e-mail, senha e código de segurança.',
  CONTA_COM_TRAVA: 'Este aparelho só mostra dados depois de e-mail, senha e código de segurança. Com a trava ligada, ele também pede o desbloqueio do celular ao abrir e quando você volta depois do prazo escolhido.',
  SOBRE_GUARDADO: 'Uma cópia dos prazos, processos, cadastros, agenda e publicações (sem o texto das publicações), para ver sem internet. Sair apaga tudo.',
  SOBRE_COM_TRAVA: ' Também fica guardada a informação de que a trava do aplicativo está ligada.',
};

const OPCOES_DE_PRAZO = [
  { minutos: 0, rotulo: 'Sempre', ajuda: 'Toda vez que você sair e voltar', anuncio: 'Vai pedir de novo toda vez que você sair e voltar.', quanto: null },
  { minutos: 1, rotulo: 'Depois de 1 minuto', ajuda: 'Recomendado', anuncio: 'Vai pedir de novo depois de 1 minuto.', quanto: '1 minuto' },
  { minutos: 5, rotulo: 'Depois de 5 minutos', ajuda: 'Mais prático, menos protegido', anuncio: 'Vai pedir de novo depois de 5 minutos.', quanto: '5 minutos' },
];

// ---------------------------------------------------------------- memoria do modulo (some a cada recarga; nunca gravada)

/** O que se soube por ultimo sobre o aparelho: 'indisponivel_a' | 'indisponivel_b' | 'desligado' (da para usar) | 'desconhecido'. */
let ultimoEstado = 'desconhecido';
/** Falhas seguidas ao CRIAR a credencial neste arquivo. Zera no primeiro sucesso. */
let falhasDeCriar = 0;
/** iPhone pelo icone da tela inicial com duas falhas seguidas: os botoes que criam a credencial somem ate recarregar. */
let semCriarNoIcone = false;

// ---------------------------------------------------------------- cartoes que ja existiam

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

// ---------------------------------------------------------------- Conta (sair) e Sobre

/**
 * Sair deste aparelho. Com a trava ligada e completa pede a verificacao do celular, e depois da PRIMEIRA falha oferece "Sair mesmo sem confirmar"
 * (quem perdeu o desbloqueio nao fica preso). Sem trava, ou com o campo incompleto, e a confirmacao de sempre.
 */
function aoToqueSair(botao) {
  const guardada = auth.biometriaLigada() ? auth.biometriaDados() : null;
  const pedido = guardada && guardada.valido
    ? confirmarComVerificacao({
      titulo: 'Sair deste aparelho?',
      texto: TX.SAIR_COM_TRAVA,
      rotuloConfirmar: 'Sair e apagar',
      perigo: true,
      textoFalha: TX.SAIR_FALHA,
      escape: { rotulo: TX.SAIR_ESCAPE, texto: TX.SAIR_ESCAPE_TEXTO },
    })
    : confirmar({
      titulo: 'Sair deste aparelho?',
      texto: TX.SAIR_SEM_TRAVA,
      rotuloConfirmar: 'Sair e apagar',
      perigo: true,
    });
  pedido.then((r) => {
    if (!r.confirmado) return null;
    botao.disabled = true;
    return auth.sair().then(
      () => { window.location.replace(window.location.pathname); },
      () => { botao.disabled = false; },
    );
  });
}

function cartaoDeConta() {
  const usuario = auth.usuarioAtual();
  const botao = h('button', { class: 'botao botao--cheio', type: 'button' }, icone('sair'), 'Sair deste aparelho');
  botao.addEventListener('click', () => aoToqueSair(botao));
  return cartao(
    { titulo: 'Conta', icone: 'cadeado' },
    usuario && usuario.email ? h('p', null, 'Você entrou como ', h('strong', null, usuario.email), '.') : null,
    h('p', { class: 'texto-2 texto-pequeno' }, auth.biometriaLigada() ? TX.CONTA_COM_TRAVA : TX.CONTA),
    h('div', { class: 'cartao-acao' }, botao),
  );
}

function cartaoSobre() {
  return cartao(
    { titulo: 'Sobre', icone: 'info' },
    h('dl', { class: 'pares' },
      par('Versão do aplicativo', VERSAO_APP),
      par('O que fica guardado neste aparelho', TX.SOBRE_GUARDADO + (auth.biometriaLigada() ? TX.SOBRE_COM_TRAVA : ''))),
  );
}

// ---------------------------------------------------------------- cartao "Trava do aplicativo"
// `t` e o estado desta abertura da tela de Ajustes: { vivo, cartao, conta, sobre, estado, pendente, minhaMudanca }.

function guardarDisponibilidade(resposta) {
  ultimoEstado = resposta === 'nao' ? 'indisponivel_b' : resposta === 'sim' ? 'desligado' : 'desconhecido';
}

/** Qual dos cinco estados o cartao deve mostrar AGORA. A ordem importa: a trava ligada vale mais que a disponibilidade. */
function estadoDoCartao() {
  if (!bio.suportado()) return 'A';
  if (auth.biometriaLigada()) return auth.biometriaDados().valido ? 'D' : 'E';
  return ultimoEstado === 'indisponivel_b' ? 'B' : 'C';
}

/** A frase do icone: com trava ja ligada (D ou E) o toque era um Refazer e a trava antiga segue como estava; sem trava (C), segue-se sem ela. */
function textoDoIcone(estado) {
  return estado === 'D' || estado === 'E' ? TX.ICONE_FALHOU_REFAZER : TX.ICONE_FALHOU;
}

function pedacoDoCartao(t, nome) {
  return t.cartao ? t.cartao.querySelector(`[data-trava-cartao="${nome}"]`) : null;
}

function aparecer(el) {
  try { el.scrollIntoView({ block: 'nearest' }); } catch { /* sem rolagem */ }
}

/** Limpa o status e o erro. O aviso de que o icone nao serve para criar a trava continua na tela enquanto os botoes de criar estiverem sumidos. */
function limparMensagens(t) {
  const status = pedacoDoCartao(t, 'status');
  const erro = pedacoDoCartao(t, 'erro');
  if (status) status.textContent = '';
  if (!erro) return;
  const avisoFixo = semCriarNoIcone && (t.estado === 'C' || t.estado === 'D' || t.estado === 'E');
  erro.textContent = avisoFixo ? textoDoIcone(t.estado) : '';
  erro.hidden = !avisoFixo;
}

function mostrarStatus(t, frase) {
  limparMensagens(t);
  const status = pedacoDoCartao(t, 'status');
  if (!status) return;
  status.textContent = frase;
  aparecer(status);
}

function mostrarErro(t, frase) {
  limparMensagens(t);
  const erro = pedacoDoCartao(t, 'erro');
  if (!erro) return;
  erro.textContent = frase;
  erro.hidden = false;
  aparecer(erro);
}

function focarAcao(t, acao) {
  if (t.cartao) focar(t.cartao.querySelector(`[data-acao="${acao}"]`));
}

/** Roda uma mudanca da trava sem o ouvinte do proprio cartao redesenhar no meio do caminho. */
function gravar(t, fazer) {
  t.minhaMudanca = true;
  try {
    return fazer();
  } finally {
    t.minhaMudanca = false;
  }
}

function ocupar(t, botao) {
  t.pendente = true;
  botao.setAttribute('aria-busy', 'true');
  botao.setAttribute('aria-disabled', 'true');
  botao.textContent = TX.AGUARDANDO;
}

function soltar(t, botao, rotulo) {
  t.pendente = false;
  botao.removeAttribute('aria-busy');
  botao.removeAttribute('aria-disabled');
  botao.textContent = rotulo;
}

function botaoDaTrava(acao, rotulo, classes, aoClicar) {
  const botao = h('button', { class: ['botao', 'botao--cheio', ...classes], type: 'button', 'data-acao': acao }, rotulo);
  botao.addEventListener('click', () => aoClicar(botao));
  return botao;
}

function marcarPrazo(t, minutos) {
  const radio = t.cartao ? t.cartao.querySelector(`input[data-minutos="${minutos}"]`) : null;
  if (radio) radio.checked = true;
}

/** Desenha o cartao de novo (o estado mudou) e devolve o foco a um botao do cartao novo. Nada acontece se a tela ja foi fechada. */
function redesenharTrava(t, { foco = null, manterMais = false, status = null } = {}) {
  if (!t.vivo) return;
  const mais = manterMais ? pedacoDoCartao(t, 'mais') : null;
  const novo = desenharTrava(t, estadoDoCartao(), { maisAberto: Boolean(mais && mais.open) });
  if (t.cartao && t.cartao.isConnected) t.cartao.replaceWith(novo);
  t.cartao = novo;
  atualizarContaESobre(t);
  if (status) mostrarStatus(t, status);
  if (foco) focarAcao(t, foco);
}

/** Os cartoes Conta e Sobre dizem algo a mais com a trava ligada: acompanham a mudanca. */
function atualizarContaESobre(t) {
  if (t.conta && t.conta.isConnected) {
    const novo = cartaoDeConta();
    t.conta.replaceWith(novo);
    t.conta = novo;
  }
  if (t.sobre && t.sobre.isConnected) {
    const novo = cartaoSobre();
    t.sobre.replaceWith(novo);
    t.sobre = novo;
  }
}

// ---- ligar, testar, refazer, trancar, conferir (toques)

/**
 * Criar a credencial nao deu certo. Cancelado por nos (abortado) nao conta nem avisa. Duas falhas seguidas no iPhone aberto pelo icone da tela
 * inicial: o botao que cria some ate recarregar e o cartao explica (nao adianta ficar tentando).
 */
function aoFalharAoCriar(t, botao, rotulo, erro, frase) {
  soltar(t, botao, rotulo);
  if (erro && erro.codigo === 'abortado') {
    if (t.vivo) limparMensagens(t);
    return;
  }
  falhasDeCriar += 1;
  if (!t.vivo) return;
  const aparelho = bio.aparelho();
  if (falhasDeCriar >= 2 && aparelho.iphone && aparelho.instalado) {
    semCriarNoIcone = true;
    const pai = botao.parentElement;
    botao.remove();
    if (pai && !pai.children.length) pai.remove();
    mostrarErro(t, textoDoIcone(t.estado));
    return;
  }
  mostrarErro(t, frase);
  focar(botao);
}

function aoToqueLigar(t, botao) {
  if (t.pendente) return;
  const pedido = bio.criar({ limiteMs: 60000 });
  ocupar(t, botao);
  mostrarStatus(t, TX.JANELA);
  pedido.then((r) => {
    const ok = gravar(t, () => auth.ligarBiometria({ id: r.id, transports: r.transports, minutos: 1 }));
    if (!ok) {
      bio.esquecer(r.id);
      soltar(t, botao, 'Ligar a trava');
      if (t.vivo) mostrarErro(t, TX.ERRO_GRAVAR);
      return;
    }
    falhasDeCriar = 0;
    t.pendente = false;
    trava.carimbarVerificacao();
    if (!t.vivo) return;
    redesenharTrava(t, { foco: 'testar' });
    anunciar(TX.LIGADA_OK);
  }, (e) => aoFalharAoCriar(t, botao, 'Ligar a trava', e, TX.ERRO_LIGAR));
}

function aoToqueTestar(t, botao) {
  if (t.pendente) return;
  const { id, transports } = auth.biometriaDados();
  const pedido = bio.verificar({ id, transports });
  ocupar(t, botao);
  limparMensagens(t);
  pedido.then(() => {
    trava.carimbarVerificacao();
    soltar(t, botao, 'Testar agora');
    if (t.vivo) mostrarStatus(t, TX.TESTE_OK);
  }, (e) => {
    soltar(t, botao, 'Testar agora');
    if (!t.vivo || (e && e.codigo === 'abortado')) return;
    mostrarErro(t, TX.TESTE_FALHOU);
  });
}

function aoToqueRefazer(t, botao) {
  if (t.pendente) return;
  const antigo = auth.biometriaDados().id;
  const pedido = bio.criar({ limiteMs: 60000 });
  ocupar(t, botao);
  mostrarStatus(t, TX.JANELA);
  pedido.then((r) => {
    const minutos = auth.biometriaDados().minutos;
    const ok = gravar(t, () => auth.ligarBiometria({ id: r.id, transports: r.transports, minutos }));
    if (!ok) {
      bio.esquecer(r.id);
      soltar(t, botao, 'Refazer a trava');
      if (t.vivo) mostrarErro(t, TX.ERRO_GRAVAR);
      return;
    }
    if (antigo) bio.esquecer(antigo);
    falhasDeCriar = 0;
    t.pendente = false;
    trava.carimbarVerificacao();
    if (!t.vivo) return;
    // vindo do estado E o cartao vira D com "Mais opções" fechado: o foco vai para Testar agora, que fica a vista
    const foco = t.estado === 'D' ? 'refazer' : 'testar';
    redesenharTrava(t, { manterMais: true, foco, status: TX.REFEITA_OK });
    anunciar(TX.REFEITA_OK);
  }, (e) => aoFalharAoCriar(t, botao, 'Refazer a trava', e, TX.REFEITA_FALHOU));
}

function aoToqueTrancar(t) {
  if (t.pendente) return;
  // false: nada subiu (a trava foi desligada em outra janela, ja esta trancada, ou a trava falhou e vai recarregar)
  if (!trava.trancarAgora() && t.vivo && estadoDoCartao() !== t.estado) redesenharTrava(t);
}

/** Pergunta de novo ao celular se ele tem bloqueio de tela. Nao usa credencial nenhuma. */
function aoToqueConferir(t, botao) {
  if (t.pendente) return;
  ocupar(t, botao);
  bio.disponivel().then((resposta) => {
    guardarDisponibilidade(resposta);
    soltar(t, botao, 'Conferir de novo');
    if (!t.vivo) return;
    if (resposta === 'nao') {
      mostrarStatus(t, TX.B_AINDA_NAO);      // quem enxerga tambem precisa ver que a conferencia aconteceu
      anunciar(TX.B_AINDA_NAO);
      return;
    }
    redesenharTrava(t, { foco: 'ligar', status: resposta === 'sim' ? TX.B_PASSOU : null });
    if (resposta === 'sim') anunciar(TX.B_PASSOU);
  });
}

function aoToqueDesligar(t) {
  if (t.pendente) return;
  limparMensagens(t);
  confirmarComVerificacao({
    titulo: 'Desligar a trava?',
    texto: TX.DESLIGAR_TEXTO,
    rotuloConfirmar: 'Desligar a trava',
    rotuloCancelar: 'Manter ligada',
    textoFalha: TX.DESLIGAR_FALHA,
  }).then((r) => {
    if (!r.confirmado) return;
    const { id } = auth.biometriaDados();
    const ok = gravar(t, () => auth.desligarBiometria());
    if (ok && id) bio.esquecer(id);
    if (!t.vivo) return;
    if (!ok) {
      mostrarErro(t, TX.ERRO_GRAVAR);
      return;
    }
    redesenharTrava(t, { foco: 'ligar' });
    anunciar(TX.DESLIGADA_OK);
  });
}

/**
 * Prazo MENOR ou igual (5 para 1, 5 ou 1 para sempre) so deixa o aplicativo mais protegido: aplica direto. Prazo MAIOR afrouxa a trava: o radio
 * volta ao valor atual e a mudanca so vale depois da verificacao do celular.
 */
function aoMudarPrazo(t, opcao) {
  const atual = auth.biometriaDados().minutos;
  if (opcao.minutos === atual) return;
  if (opcao.minutos < atual) {
    const ok = gravar(t, () => auth.trocarMinutosBiometria(opcao.minutos));
    if (ok) {
      marcarPrazo(t, opcao.minutos);
      mostrarStatus(t, opcao.anuncio);
    } else {
      marcarPrazo(t, atual);
      mostrarErro(t, TX.ERRO_GRAVAR);
    }
    return;
  }
  marcarPrazo(t, atual);
  limparMensagens(t);
  confirmarComVerificacao({
    titulo: `Pedir de novo só depois de ${opcao.quanto}?`,
    texto: TX.MAIOR_TEXTO,
    rotuloConfirmar: 'Mudar o prazo',
    rotuloCancelar: 'Cancelar',
    textoFalha: TX.MAIOR_FALHA,
  }).then((r) => {
    if (!r.confirmado) return;
    const ok = gravar(t, () => auth.trocarMinutosBiometria(opcao.minutos));
    if (!t.vivo) return;
    if (ok) {
      marcarPrazo(t, opcao.minutos);
      mostrarStatus(t, TX.MAIOR_OK);
    } else {
      mostrarErro(t, TX.ERRO_GRAVAR);
    }
  });
}

// ---- desenho

function desenharPrazos(t, minutosAtuais) {
  const nome = novoId('prazo-da-trava');
  return h('fieldset', { class: 'opcoes' },
    h('legend', { class: 'campo-rotulo' }, TX.PRAZO_LEGENDA),
    OPCOES_DE_PRAZO.map((o) => h('label', { class: 'opcao' },
      h('input', {
        type: 'radio', name: nome, value: String(o.minutos), 'data-minutos': String(o.minutos), checked: o.minutos === minutosAtuais,
        onchange: () => aoMudarPrazo(t, o),
      }),
      h('span', null, h('strong', null, o.rotulo), h('br'), h('span', { class: 'texto-2 texto-pequeno' }, o.ajuda)))));
}

function avisoDeTravaCaida() {
  const aviso = auth.avisoDaTrava();
  const quando = aviso ? emCuiaba(aviso.em) : null;
  if (!quando) return null;
  return h('p', { class: 'trava-cartao-aviso' }, icone('alerta'), h('span', null, `A trava foi desligada em ${dataBR(quando.data)} porque a sessão acabou.`));
}

function desenharTrava(t, estado, { maisAberto = false } = {}) {
  const textos = { A: TX.A, B: TX.B, C: TX.C, D: TX.D, E: TX.E };
  const rotuloDoSelo = estado === 'D' || estado === 'E' ? TX.SELO_LIGADA : estado === 'C' ? TX.SELO_DESLIGADA : TX.SELO_INDISPONIVEL;
  const status = h('p', { role: 'status', 'data-trava-cartao': 'status' });
  const erro = h('p', { class: 'campo-erro', role: 'alert', 'data-trava-cartao': 'erro', hidden: true });
  if (semCriarNoIcone && (estado === 'C' || estado === 'D' || estado === 'E')) {
    erro.textContent = textoDoIcone(estado);
    erro.hidden = false;
  }
  const filhos = [h('p', { 'data-trava-cartao': 'estado' }, textos[estado])];
  if (estado === 'C') {
    filhos.push(avisoDeTravaCaida());
    filhos.push(h('p', { class: 'texto-2 texto-pequeno' }, TX.C_PEQUENO));
    if (bio.aparelho().iphone) filhos.push(h('p', { class: 'texto-2 texto-pequeno' }, TX.C_IPHONE));
  }
  filhos.push(status, erro);
  if (estado === 'B') {
    filhos.push(h('div', { class: 'cartao-acoes' },
      botaoDaTrava('conferir', 'Conferir de novo', ['botao--primario'], (b) => aoToqueConferir(t, b))));
  } else if (estado === 'C' && !semCriarNoIcone) {
    filhos.push(h('div', { class: 'cartao-acoes' },
      botaoDaTrava('ligar', 'Ligar a trava', ['botao--primario'], (b) => aoToqueLigar(t, b))));
  } else if (estado === 'D') {
    filhos.push(h('div', { class: 'cartao-acoes' },
      botaoDaTrava('testar', 'Testar agora', ['botao--primario'], (b) => aoToqueTestar(t, b)),
      botaoDaTrava('desligar', 'Desligar a trava', [], () => aoToqueDesligar(t))));
    filhos.push(h('details', { class: 'entrada-detalhes', 'data-trava-cartao': 'mais', open: maisAberto },
      h('summary', { class: 'botao botao--discreto botao--cheio' }, 'Mais opções'),
      desenharPrazos(t, auth.biometriaDados().minutos),
      h('div', { class: 'cartao-acoes' },
        botaoDaTrava('trancar', 'Trancar agora', [], () => aoToqueTrancar(t)),
        semCriarNoIcone ? null : botaoDaTrava('refazer', 'Refazer a trava', [], (b) => aoToqueRefazer(t, b))),
      h('p', { class: 'texto-2 texto-pequeno' }, TX.PEQUENO_1),
      h('p', { class: 'texto-2 texto-pequeno' }, TX.PEQUENO_2),
      h('p', { class: 'texto-2 texto-pequeno' }, TX.PEQUENO_3)));
  } else if (estado === 'E' && !semCriarNoIcone) {
    filhos.push(h('div', { class: 'cartao-acoes' },
      botaoDaTrava('refazer', 'Refazer a trava', ['botao--primario'], (b) => aoToqueRefazer(t, b))));
  }
  const el = cartao({ titulo: TX.TITULO, icone: 'escudo', acao: selo('neutro', rotuloDoSelo) }, ...filhos);
  el.dataset.cartao = 'trava';
  t.estado = estado;
  return el;
}

// ---- o que muda de fora e a disponibilidade do aparelho

function aoMudarTrava(t, evento) {
  if (!t.vivo || t.minhaMudanca || evento.tipo !== 'biometria') return;
  // outra janela ligou, desligou ou mudou o prazo: o cartao acompanha. Mudancas desta tela ja se desenharam sozinhas.
  if (evento.motivo === 'de-fora' || estadoDoCartao() !== t.estado) redesenharTrava(t, { manterMais: true });
}

/** Volta do celular (por exemplo das configuracoes): se o cartao esta em B, pergunta de novo se o aparelho ja tem bloqueio de tela. */
function aoVoltarVisivel(t) {
  if (!t.vivo || document.visibilityState !== 'visible' || t.estado !== 'B' || t.pendente || t.conferindo) return;
  t.conferindo = true;
  bio.disponivel().then((resposta) => {
    t.conferindo = false;
    guardarDisponibilidade(resposta);
    if (!t.vivo || t.pendente || estadoDoCartao() === t.estado) return;
    redesenharTrava(t, { status: resposta === 'sim' ? TX.B_PASSOU : null });
    if (resposta === 'sim') anunciar(TX.B_PASSOU);
  });
}

/** O cartao ja apareceu com o ultimo estado conhecido; aqui o aparelho confirma (ou muda) o que se sabia. Nao espera nada. */
function confirmarDisponibilidade(t) {
  if (!bio.suportado()) {
    ultimoEstado = 'indisponivel_a';
    return;
  }
  if (auth.biometriaLigada()) return;     // ligada: a disponibilidade nao muda nada no cartao
  bio.disponivel().then((resposta) => {
    guardarDisponibilidade(resposta);
    if (!t.vivo || t.pendente || estadoDoCartao() === t.estado) return;
    redesenharTrava(t);
  });
}

registrar('/ajustes', (ctx) => {
  ctx.titulo('Ajustes');
  const t = { vivo: true, cartao: null, conta: null, sobre: null, estado: null, pendente: false, minhaMudanca: false, conferindo: false };
  const redesenhar = () => {
    t.cartao = desenharTrava(t, estadoDoCartao());
    t.conta = cartaoDeConta();
    t.sobre = cartaoSobre();
    preencher(ctx.raiz, cartaoDeSincronia(), cartaoDeTema(), t.cartao, t.conta, t.sobre);
  };
  redesenhar();
  ctx.aoMudarDados(() => {
    // so a sincronizacao muda sozinha; o resto (tema escolhido, foco) nao deve piscar
    const velho = ctx.raiz.querySelector('.cartao');
    if (velho) velho.replaceWith(cartaoDeSincronia());
  });
  ctx.aoVirarODia(redesenhar);
  // tudo que a tela abre fecha na limpeza: depois de sair de Ajustes nenhum ouvinte chama o celular
  const emVisivel = () => aoVoltarVisivel(t);
  const desligarAuth = auth.aoMudar((evento) => aoMudarTrava(t, evento));
  document.addEventListener('visibilitychange', emVisivel);
  ctx.aoLimpar(() => {
    t.vivo = false;
    document.removeEventListener('visibilitychange', emVisivel);
    desligarAuth();
    if (t.pendente) bio.abortar();
  });
  confirmarDisponibilidade(t);
}, { aba: 'mais', pai: '/mais' });
