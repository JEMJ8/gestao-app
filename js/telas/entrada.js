// Tela de entrada: e-mail e senha, depois o codigo de 6 numeros do aplicativo autenticador.
// No primeiro acesso mostra o passo a passo para cadastrar o autenticador NO MESMO CELULAR: copiar a chave e colar no aplicativo (o QR so serve
// para quem esta no computador, porque no celular ninguem consegue apontar a camera para a propria tela). No Android ha ainda um atalho que tenta
// abrir o autenticador; no iPhone ele nao e confiavel e nao aparece. Se a pagina recarregar no meio (a pessoa foi ao autenticador e voltou),
// a entrada continua de onde parou, sem pedir a senha de novo.
// Nao e uma rota: app.js a desenha no lugar do aplicativo enquanto nao houver sessao completa (senha + codigo).
//
// Depois do codigo aceito vem a oferta da trava do aplicativo (telaDeOferta): em todo login completo enquanto a trava estiver desligada,
// ou, com a trava ja registrada, "Manter / Refazer / Desligar". A oferta so mexe na trava por auth.js (ligar, desligar) e pede a criacao
// da credencial a biometria.js; falha nenhuma grava nada. Erro na oferta nunca prende a pessoa: a sessao completa ja esta guardada e o
// aplicativo abre do mesmo jeito (aposOCodigo).
// A tela de senha tambem e usada pela trava (daTrava): a pessoa tocou em "Entrar com senha e codigo" e pode voltar ao desbloqueio.

import { h, preencher, novoId, focar, copiarTexto, esperar, anunciar } from '../ui.js';
import { icone } from '../icones.js';
import { marca } from '../marca.js';
import { linkHttps } from '../formato.js';
import { emCuiaba, dataBR } from '../datas.js';
import * as auth from '../auth.js';
import * as bio from '../biometria.js';
import * as trava from './trava.js';
import { VERSAO_APP } from '../versao.js';

// ---------------------------------------------------------------- aparelho e instalacao

/**
 * 'ios', 'android', 'celular' (outro celular, ou celular com "Site para computador" ligado) ou 'outro' (computador). Serve so para escolher o texto
 * e o link da loja certos, nunca para liberar ou negar nada.
 */
export function plataforma() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  // "Site para computador" ligado no celular: o aparelho diz que e um computador, mas o toque e a tela pequena entregam
  const toque = navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches;
  return toque && Math.min(window.screen.width, window.screen.height) < 820 ? 'celular' : 'outro';
}

const LOJAS = {
  android: [
    { nome: 'Google Authenticator', url: 'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2' },
    { nome: 'Microsoft Authenticator', url: 'https://play.google.com/store/apps/details?id=com.azure.authenticator' },
  ],
  ios: [
    { nome: 'Google Authenticator', url: 'https://apps.apple.com/br/app/google-authenticator/id388497605' },
    { nome: 'Microsoft Authenticator', url: 'https://apps.apple.com/br/app/microsoft-authenticator/id983156458' },
  ],
};

const AVISO_CHAVE_NOVA = 'A chave anterior perdeu a validade e geramos uma chave nova. Se você já tinha adicionado "Gestão JEMJ" no autenticador, apague essa entrada antiga e adicione a nova.';

// ---------------------------------------------------------------- textos da trava (catalogo do contrato, secoes 12.2 a 12.4)

// A oferta de ligar a trava. "Senha" nas telas e sempre a senha da conta; o desbloqueio do celular e descrito como "o mesmo desbloqueio que
// voce usa para abrir o celular". Nenhuma promessa de rapidez e nenhum numero de dias.
const OF = {
  TITULO: 'Trava do aplicativo',
  LEAD: 'Isto não deixa o acesso mais rápido, deixa mais protegido.',
  L1: 'O aplicativo só abre depois do desbloqueio do celular, normalmente o mesmo que você usa para abrir o próprio celular.',
  L2: 'Quem consegue desbloquear o seu celular também abre o aplicativo.',
  L3: 'Se o desbloqueio falhar, só se entra com senha e código, e isso precisa de internet.',
  LIGAR: 'Ligar a trava',
  AGORA_NAO: 'Agora não',
  // depois de uma falha as frases dizem "continuar sem a trava": o botao de saida tem o mesmo nome
  CONTINUAR_SEM: 'Continuar sem a trava',
  MANTER: 'Manter a trava como está',
  REFAZER: 'Refazer a trava',
  DESLIGAR: 'Desligar a trava',
  TENTAR: 'Tentar de novo',
  CONTINUAR: 'Continuar',
  AGUARDANDO: 'Aguardando o celular…',
  SAIBA_MAIS: 'Saiba mais',
  FAIXA_HAVIA: 'Você entrou com senha e código. A trava continua ligada. Se ela não abriu o aplicativo, toque em Refazer a trava.',
  JANELA: 'O celular vai abrir uma janela própria. Ela pode falar em chave de acesso e mostrar jemj8.github.io. É normal. Siga as instruções dela.',
  FALHOU: 'Não foi ligada. Você pode tentar de novo ou continuar sem a trava.',
  FALHOU_REFAZER: 'Não foi refeita. A trava antiga continua como estava.',
  DEMOROU: 'A confirmação demorou e foi encerrada. Você pode tentar de novo ou continuar sem a trava.',
  GRAVACAO: 'Não foi possível guardar a trava neste celular. Você pode tentar de novo ou continuar sem ela.',
  SEM_SUPORTE: 'Este navegador não consegue ligar a trava do aplicativo agora. Você pode continuar sem ela.',
  ICONE_FALHOU: 'A trava não funcionou neste aparelho, no ícone da tela inicial. Você pode continuar sem ela.',
  // Refazer, com trava antiga: ela segue ligada, entao nao se pode dizer que se continua sem ela
  ICONE_FALHOU_REFAZER: 'A trava não funcionou neste aparelho, no ícone da tela inicial. A trava antiga continua como estava.',
  // fora do catalogo: o contrato nao cobre a gravacao do "desligar" falhar (ver o relatorio da F4)
  DESLIGAR_FALHOU: 'Não foi possível desligar a trava agora. Ela continua ligada. Você pode tentar de novo ou manter a trava como está.',
};

const SAIBA_MAIS_ANTES = [
  'Quando você abrir o Gestão JEMJ, o celular vai pedir o desbloqueio dele, normalmente o mesmo que você usa para abrir o celular: digital, rosto, PIN ou padrão, conforme o seu aparelho. Esses dados ficam no celular, não no aplicativo. A chave de acesso pode aparecer em outros aparelhos da mesma conta Apple ou Google, mas sem a sessão guardada neles ela não abre nada.',
  'A trava vale para abrir o aplicativo de novo. Quando a sessão acabar, ou depois de sair, o primeiro acesso continua sendo com senha e código.',
  'Isto fecha a porta do aplicativo. Os dados guardados no celular não ficam embaralhados.',
  'Vale o que vale o bloqueio de tela do seu celular. Qualquer digital ou rosto cadastrado nele abre o aplicativo.',
  'Quem tem o seu celular desbloqueado, a sua senha e o autenticador no mesmo celular consegue entrar de novo com senha e código, mesmo com a trava ligada. Se o autenticador tem bloqueio próprio e a senha não fica salva no celular, essa porta fica fechada.',
  'O aplicativo tranca quando você sai dele e volta depois do prazo escolhido. Com ele aberto na sua mão, não tranca sozinho.',
  'Se o desbloqueio não funcionar, você entra com senha e código, e para isso precisa de internet. Teste uma vez com sinal, em Mais, Ajustes, no botão Testar agora.',
  'O celular vai abrir uma janela própria, que pode falar em chave de acesso e mostrar o endereço jemj8.github.io. É normal.',
];
const SAIBA_MAIS_IPHONE_NO_SAFARI = 'No iPhone, o ícone da tela inicial costuma guardar os dados à parte do Safari. Ligue a trava no mesmo lugar onde você usa o aplicativo.';
const SAIBA_MAIS_IPHONE_NO_ICONE = 'Você está usando o ícone da tela inicial. Ligue por aqui.';
const SAIBA_MAIS_DEPOIS = 'Você desliga quando quiser em Mais, Ajustes.';

// A tela "Tudo certo" e as notas dela.
const TX = {
  SU_PRIMEIRA: 'Da próxima vez, depois da senha, o Gestão JEMJ vai pedir o código do seu autenticador.',
  // com a trava ligada a proxima abertura pede so o desbloqueio: senha e codigo voltam quando a sessao acabar (SU_LIGOU diz a primeira parte)
  SU_PRIMEIRA_COM_TRAVA: 'Quando a sessão acabar, você entra de novo com a senha e o código do seu autenticador.',
  SU_LIGOU: 'Trava ligada. Da próxima vez que você abrir o aplicativo, o celular vai pedir o desbloqueio.',
  SU_CONTINUA: 'A trava continua ligada. Se ela não abrir o aplicativo da próxima vez, entre com senha e código.',
  SU_DESLIGOU: 'A trava foi desligada. O aplicativo vai abrir direto neste celular.',
  // a tela de senha aberta pela trava
  SENHA_INTERNET: 'Entrar com a senha precisa de internet. Se a senha for aceita e você não digitar o código, o aplicativo não abre sem internet até você entrar de novo.',
  VOLTAR: 'Voltar ao desbloqueio',
  CODIGO_OUTRA_CONTA: 'Se tocar em Usar outra conta, a trava do aplicativo é desligada neste celular e você entra de novo com senha e código.',
};

/** Os paragrafos do "Saiba mais": 10 no iPhone (o nono depende de Safari ou ícone) e 9 nos demais aparelhos, sempre na ordem do catalogo. */
function paragrafosDoSaibaMais() {
  const aparelho = bio.aparelho();
  const doIphone = aparelho.iphone ? [aparelho.instalado ? SAIBA_MAIS_IPHONE_NO_ICONE : SAIBA_MAIS_IPHONE_NO_SAFARI] : [];
  return [...SAIBA_MAIS_ANTES, ...doIphone, SAIBA_MAIS_DEPOIS];
}

/** "A trava foi desligada em dd/mm/aaaa porque a sessao acabou." Sem data legivel, a mesma frase sem a data. */
function textoDaFaixaCaiu(epoch) {
  const quando = emCuiaba(epoch);
  const data = quando ? dataBR(quando.data) : '';
  return `A trava do aplicativo foi desligada${data ? ` em ${data}` : ''} porque a sessão acabou. Ligue de novo para continuar protegido.`;
}

// Quantas vezes seguidas a criacao da credencial falhou nesta pagina. So memoria: some a cada recarga e volta a zero quando uma trava e ligada.
let falhasDeCriar = 0;

const CLASSES_PRINCIPAL = ['botao--primario', 'botao--grande', 'botao--cheio', 'botao--destaque'];
const CLASSES_SECUNDARIO = ['botao--contorno', 'botao--cheio'];
const CLASSES_DISCRETO = ['botao--discreto', 'botao--cheio'];

// Os nomes dos botoes dos aplicativos mudam de versao para versao e nao foram conferidos em fonte oficial: o texto descreve a funcao e traz o nome
// entre aspas como pista.
const GUIAS = [
  {
    id: 'google', nome: 'Google',
    passos: [
      'Abra o Google Authenticator e toque no botão +.',
      'Escolha a opção de inserir a chave à mão, que pode se chamar "Inserir uma chave de configuração".',
      'Em "Nome da conta", escreva Gestão JEMJ.',
      'Em "Sua chave", cole a chave que você copiou.',
      'Se pedir o tipo, deixe "Baseada no tempo" e toque em Adicionar.',
    ],
  },
  {
    id: 'microsoft', nome: 'Microsoft',
    passos: [
      'Abra o Microsoft Authenticator e toque no botão + (Adicionar conta).',
      'Escolha "Outra conta (Google, Facebook etc.)".',
      'Na tela da câmera, que você não precisa usar, toque em "Ou insira o código manualmente". Aqui, "código" quer dizer a chave que você copiou.',
      'No campo do nome, escreva Gestão JEMJ. No campo da chave, cole a chave que você copiou.',
      'Toque em Concluir.',
    ],
  },
  {
    id: 'outro', nome: 'Outro',
    passos: [
      'No seu autenticador, procure uma opção como "inserir chave" ou "adicionar manualmente".',
      'Se pedir o tipo, escolha "baseada no tempo" (em alguns aplicativos aparece como TOTP).',
      'Dê o nome Gestão JEMJ, cole a chave e salve.',
    ],
  },
];

/** O endereco otpauth:// que tenta abrir o autenticador no proprio aparelho. Qualquer outra coisa vira null (o atalho nem aparece). */
export function enderecoDoAutenticador(uri) {
  const texto = String(uri || '').trim();
  // sem literal de expressao regular com barras duplas ou aspas (a varredura sem_comentarios_js dos testes nao os entende): \x22 e \x27 sao " e '
  const prefixo = 'otpauth://totp/';
  const corpoLimpo = texto.length > prefixo.length && texto.startsWith(prefixo) && !/[\s\x22\x27<>]/.test(texto);
  return corpoLimpo && /[?&]secret=[A-Za-z2-7]+/.test(texto) ? texto : null;
}

let conviteDeInstalacao = null;
const ouvintesDoConvite = new Set();
window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  conviteDeInstalacao = ev;
  for (const fn of [...ouvintesDoConvite]) fn();
});
window.addEventListener('appinstalled', () => {
  conviteDeInstalacao = null;
  for (const fn of [...ouvintesDoConvite]) fn();
});

function jaInstalado() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function agrupar(segredo) {
  return segredo.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

// ---------------------------------------------------------------- pecas de tela

/** Botao com icone e texto. `classes` junta ao estilo base. */
function botao(rotulo, { nome = null, classes = [], tipo = 'button', aoClicar = null } = {}) {
  const el = h('button', { class: ['botao', ...classes], type: tipo }, nome ? icone(nome) : null, rotulo);
  if (aoClicar) el.addEventListener('click', aoClicar);
  return el;
}

/** Botao da oferta da trava: o `nome` vai para data-oferta (ligar, agora-nao, manter, refazer, desligar, tentar, continuar). */
function botaoDaOferta(nome, rotulo, classes, aoClicar) {
  const el = botao(rotulo, { classes, aoClicar });
  el.setAttribute('data-oferta', nome);
  return el;
}

/** Link com cara de botao para fora do aplicativo (so https, abre em outra aba). */
function linkBotao(rotulo, endereco, { nome = null, classes = [] } = {}) {
  const seguro = linkHttps(endereco);
  if (!seguro) return null;
  return h('a', { class: ['botao', ...classes], href: seguro, target: '_blank', rel: 'noopener noreferrer' }, nome ? icone(nome) : null, rotulo);
}

/** Troca o conteudo do botao por "girando + texto" enquanto trabalha e devolve o que havia depois. */
function ocupado(el, sim, rotulo) {
  if (sim) {
    el.guardado = [...el.childNodes];
    el.classList.add('botao--ocupado');
    el.setAttribute('aria-busy', 'true');
    preencher(el, icone('atualizar', { classe: 'botao-giro' }), rotulo);
  } else if (el.guardado) {
    preencher(el, ...el.guardado);
    el.classList.remove('botao--ocupado');
    el.removeAttribute('aria-busy');
  }
}

/**
 * Liga o envio do formulario: trava o botao, mostra a mensagem de erro no campo e devolve o foco. `tambem` sao outros botoes que ficam travados
 * enquanto o envio esta em andamento (ex.: "Usar outra conta", para nao cancelar no meio).
 */
function ligar(formulario, el, rotuloOcupado, areaDeErro, trabalho, tambem = []) {
  formulario.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (el.disabled) return;
    el.disabled = true;
    for (const outro of tambem) outro.disabled = true;
    ocupado(el, true, rotuloOcupado);
    areaDeErro.hidden = true;
    areaDeErro.textContent = '';
    try {
      await trabalho();
    } catch (erro) {
      if (erro && erro.codigo === 'cancelado') return;   // a pessoa desistiu no meio ("Usar outra conta"): nada a mostrar
      areaDeErro.textContent = erro && erro.mensagemParaTela ? erro.mensagemParaTela : 'Não foi possível continuar. Tente de novo.';
      areaDeErro.hidden = false;
    } finally {
      el.disabled = false;
      for (const outro of tambem) outro.disabled = false;
      ocupado(el, false);
      if (formulario.isConnected && (!document.activeElement || document.activeElement === document.body)) focar(el);   // o botao travado perdeu o foco
    }
  });
}

/** Campo de e-mail ou senha com icone dentro. */
function campoComIcone(nomeDoIcone, entrada, ...extras) {
  return h('div', { class: ['entrada-com-icone', ...extras.length ? ['entrada-com-botao'] : []] }, icone(nomeDoIcone, { tamanho: 20 }), entrada, ...extras);
}

/**
 * As seis caixas do codigo. Por baixo existe UM campo de texto de verdade (teclado numerico, colar, leitor de tela, gerenciador de senhas),
 * transparente; as caixas so mostram o que foi digitado. `aoMudar()` roda a cada tecla (some a mensagem de erro) e `aoCompletar()` quando chegam
 * os 6 numeros (o teclado numerico do iPhone nao tem tecla Enter).
 */
function campoDoCodigo(idCodigo, idDica, idErro, { aoMudar = () => {}, aoCompletar = () => {} } = {}) {
  const campo = h('input', {
    id: idCodigo, class: 'otp-campo', type: 'text', name: 'otp', inputmode: 'numeric', pattern: '[0-9]*',
    autocomplete: 'one-time-code', required: true, autocapitalize: 'off', spellcheck: 'false',
    'aria-describedby': `${idDica} ${idErro}`,
  });
  const casas = Array.from({ length: 6 }, () => h('div', { class: 'otp-casa', 'aria-hidden': 'true' }));
  const caixa = h('div', { class: 'otp' }, ...casas, campo);
  const pintar = () => {
    const valor = campo.value;
    casas.forEach((casa, i) => {
      casa.textContent = valor[i] || '';
      casa.classList.toggle('otp-casa--ativa', document.activeElement === campo && i === Math.min(valor.length, 5));
    });
  };
  const fimDoTexto = () => {
    try { campo.setSelectionRange(campo.value.length, campo.value.length); } catch { /* alguns teclados nao deixam: segue */ }
    pintar();
  };
  campo.addEventListener('input', () => {
    campo.value = campo.value.replace(/\D/g, '').slice(0, 6);
    caixa.classList.remove('otp--erro');
    pintar();
    aoMudar();
    if (campo.value.length === 6) aoCompletar();
  });
  // Colar o codigo que o autenticador mostra (com espaco, como "123 456"): com 6 numeros ou mais, ele substitui o que ja estava digitado.
  campo.addEventListener('paste', (ev) => {
    const digitos = String((ev.clipboardData && ev.clipboardData.getData('text')) || '').replace(/\D/g, '');
    if (digitos.length < 6) return;   // pedaco curto: o navegador cola normalmente e o filtro de numeros cuida do resto
    ev.preventDefault();
    campo.value = digitos.slice(0, 6);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  });
  for (const nome of ['focus', 'blur', 'click', 'select', 'keyup']) campo.addEventListener(nome, fimDoTexto);
  return {
    caixa,
    campo,
    limpar() { campo.value = ''; pintar(); },
    marcarErro() {
      caixa.classList.remove('otp--erro');
      void caixa.offsetWidth;   // reinicia a animacao do tremor
      caixa.classList.add('otp--erro');
    },
  };
}

/** Cabeca da entrada (marca do escritorio em cima) e a folha onde cada passo e desenhado. */
function esqueleto(raiz) {
  const hero = h('header', { class: 'entrada-hero' },
    h('div', { class: 'entrada-fundo-marca', 'aria-hidden': 'true' }, marca({ tamanho: 300 })),
    h('div', { class: 'entrada-marca', 'aria-hidden': 'true' }, marca({ tamanho: 52 })),
    h('h1', { class: 'entrada-titulo' }, 'Gestão JEMJ'),
    h('p', { class: 'entrada-sub' }, 'Prazos, publicações e agenda do escritório'));
  const folha = h('div', { class: 'entrada-folha' });
  preencher(raiz, h('div', { class: 'entrada-tela' }, h('div', { class: 'entrada-cartao' }, hero, folha)));
  return folha;
}

function rodape() {
  return h('p', { class: 'entrada-rodape texto-pequeno' }, icone('cadeado', { tamanho: 16 }), `Acesso restrito · Versão ${VERSAO_APP}`);
}

function cartaoDePasso(numero, titulo, ...filhos) {
  return h('section', { class: 'passo-cartao' },
    h('div', { class: 'passo-cartao-cabeca' }, h('span', { class: 'passo-numero', 'aria-hidden': 'true' }, String(numero)), h('h2', { class: 'passo-titulo' }, titulo)),
    ...filhos);
}

/** Escolha entre Google, Microsoft e outro autenticador: mostra so o passo a passo do que a pessoa usa. */
function guiaDoAutenticador() {
  const lista = h('ol', { class: 'entrada-instalar-passos', 'aria-live': 'polite' });
  const botoes = GUIAS.map((guia) => h('button', { class: 'entrada-aba', type: 'button', 'aria-pressed': 'false' }, guia.nome));
  const escolher = (id) => {
    GUIAS.forEach((guia, i) => botoes[i].setAttribute('aria-pressed', String(guia.id === id)));
    preencher(lista, ...GUIAS.find((guia) => guia.id === id).passos.map((passo) => h('li', null, passo)));
  };
  botoes.forEach((b, i) => b.addEventListener('click', () => escolher(GUIAS[i].id)));
  escolher(GUIAS[0].id);
  return h('div', { class: 'entrada-guia' },
    h('div', { class: 'entrada-abas', role: 'group', 'aria-label': 'Qual aplicativo autenticador você usa' }, ...botoes),
    lista,
    h('p', { class: 'passo-texto' }, 'Os nomes dos botões podem ser um pouco diferentes no seu celular. Se não achar o nome igual, procure a opção parecida.'),
    h('p', { class: 'passo-texto' }, 'Se o autenticador já tiver uma entrada "Gestão JEMJ" de uma tentativa anterior, apague essa antiga antes.'),
    h('p', { class: 'passo-texto' }, 'Quando terminar, o autenticador mostra um código de 6 números. Volte para esta tela e digite esse código no passo 4.'));
}

/** Como colocar o aplicativo na tela inicial: botao de instalar quando o navegador oferece, passo a passo quando nao. Nada no computador. */
function blocoDeInstalacao() {
  const onde = plataforma();
  if (onde === 'outro' || jaInstalado()) return null;
  const caixa = h('div', { class: 'entrada-instalar' });
  const desenhar = () => {
    if (!caixa.isConnected && caixa.dataset.pronto) { ouvintesDoConvite.delete(desenhar); return; }
    caixa.dataset.pronto = '1';
    if (jaInstalado()) { preencher(caixa); return; }
    if (caixa.querySelector('details[open]')) return;   // a pessoa esta lendo o passo a passo: nao troca por baixo dela
    if (conviteDeInstalacao) {
      const instalar = botao('Instalar na tela inicial', { nome: 'baixar', classes: ['botao--contorno', 'botao--cheio'] });
      instalar.addEventListener('click', async () => {
        const convite = conviteDeInstalacao;
        conviteDeInstalacao = null;
        try { await convite.prompt(); } catch { /* o navegador pode recusar: a pessoa ainda tem o passo a passo */ }
        desenhar();
      });
      preencher(caixa, instalar);
      return;
    }
    const passos = onde === 'ios'
      ? [h('li', null, 'Toque em Compartilhar ', icone('compartilhar', { tamanho: 16 }), ', na barra do Safari.'), h('li', null, 'Escolha "Adicionar à Tela de Início".'), h('li', null, 'Toque em Adicionar.')]
      : [h('li', null, 'Toque nos três pontinhos do navegador, no canto de cima.'), h('li', null, 'Escolha "Instalar aplicativo" ou "Adicionar à tela inicial".'), h('li', null, 'Confirme em Instalar.')];
    preencher(caixa,
      h('details', { class: 'entrada-detalhes' },
        h('summary', { class: 'botao botao--contorno botao--cheio' }, icone('celular'), 'Colocar na tela inicial'),
        h('ol', { class: 'entrada-instalar-passos' }, ...passos),
        h('p', { class: 'passo-texto' }, 'Assim o Gestão JEMJ ganha um ícone na tela inicial e abre como um aplicativo, sem a barra do navegador.')));
  };
  ouvintesDoConvite.add(desenhar);
  desenhar();
  return caixa;
}

// ---------------------------------------------------------------- a tela

/**
 * Desenha a entrada em `raiz`. `aoConcluir()` e chamada quando a sessao completa (aal2) estiver guardada.
 * `daTrava` ({ aoVoltar }) so existe quando a pessoa chegou aqui pelo botao "Entrar com senha e codigo" da trava: a primeira tela de senha
 * ganha o aviso de internet e o botao "Voltar ao desbloqueio".
 */
export function montarEntrada(raiz, { aoConcluir, daTrava = null }) {
  document.title = 'Entrar · Gestão JEMJ';
  const folha = esqueleto(raiz);
  const noCelular = plataforma() !== 'outro';

  /**
   * Troca o passo: volta ao topo, leva o foco ao titulo (leitor de tela e teclado) e fala o aviso, que entra ja escrito e o leitor nao leria sozinho.
   * Devolve o elemento do passo (a oferta da trava poe nele a sua classe).
   */
  function mostrar(aviso, ...filhos) {
    const passo = h('div', { class: 'entrada-passo' }, ...filhos, rodape());
    preencher(folha, passo);
    window.scrollTo(0, 0);
    const titulo = folha.querySelector('.entrada-passo-titulo');
    if (titulo) {
      titulo.setAttribute('tabindex', '-1');
      focar(titulo);
    }
    if (aviso) anunciar(aviso);
    return passo;
  }

  /**
   * A tela "Tudo certo". Sem nota importante ela avanca sozinha, como sempre (650 ms, ou 1800 ms com a nota do primeiro acesso). Com nota importante
   * (a trava foi ligada, desligada ou continua ligada) espera o toque em Continuar, para dar tempo de ler. `tinha`: a trava ja estava ligada antes
   * desta entrada. `resultado`: a escolha na oferta (ou null se nao houve oferta).
   */
  async function sucesso(primeiraVez, { tinha = false, resultado = null } = {}) {
    const acao = resultado && typeof resultado === 'object' ? resultado.acao : null;
    const notas = [];
    let importante = false;
    let ligadaAgora = false;
    try { ligadaAgora = auth.biometriaLigada(); } catch { ligadaAgora = false; }
    if (primeiraVez) notas.push(ligadaAgora ? TX.SU_PRIMEIRA_COM_TRAVA : TX.SU_PRIMEIRA);
    if (acao === 'ligou' || acao === 'refez') {
      notas.push(TX.SU_LIGOU);
      importante = true;
    } else if (acao === 'desligou') {
      notas.push(TX.SU_DESLIGOU);
      importante = true;
    } else if (tinha && (acao === null || acao === 'sem_suporte')) {
      // a trava ja estava ligada e a oferta nao mudou nada (nao houve oferta, ou o navegador nao deixou refazer)
      notas.push(TX.SU_CONTINUA);
      importante = true;
    }
    const continuar = importante
      ? h('button', { class: 'botao botao--primario botao--grande', type: 'button', 'data-sucesso': 'continuar' }, OF.CONTINUAR)
      : null;
    // o que esta por baixo (a oferta, por exemplo) fica inerte: nem o teclado nem o leitor de tela chegam a botoes que o cartao cobre
    for (const filho of [...raiz.children]) {
      filho.inert = true;
      filho.setAttribute('aria-hidden', 'true');
    }
    raiz.appendChild(h('div', { class: 'entrada-sucesso', role: 'status' },
      h('div', { class: 'entrada-sucesso-bola' }, icone('check', { tamanho: 44 })),
      h('span', null, continuar ? 'Tudo certo.' : 'Tudo certo. Abrindo…'),   // com Continuar nada abre sozinho: so diz "Abrindo" quando abre
      notas.map((texto) => h('p', { class: 'entrada-sucesso-nota' }, texto)),
      continuar));
    anunciar(notas.length ? `Tudo certo. ${notas.join(' ')}` : 'Tudo certo. Abrindo.');
    if (continuar) {
      focar(continuar);
      await new Promise((resolver) => continuar.addEventListener('click', resolver, { once: true }));
    } else {
      await esperar(primeiraVez ? 1800 : 650);   // o movimento reduzido tira a animacao (base.css), nao o tempo de leitura
    }
    aoConcluir();
  }

  /**
   * Depois do codigo aceito: a oferta da trava (se o celular confirma ter bloqueio de tela) e a tela "Tudo certo". Erro na oferta nunca prende a
   * pessoa: segue sem oferta, o campo da trava fica como estava e o aplicativo abre.
   */
  async function aposOCodigo(primeiraVez) {
    let tinha = false;
    let resultado = null;
    // O vigia da trava ja vigia daqui, nao so depois de o aplicativo abrir: a pessoa pode largar o celular na oferta ou em "Tudo certo" e voltar
    // horas depois, e a trava (se ligada) tem de trancar antes de o aplicativo abrir. Chamar de novo e inofensivo (abrirAplicativo chama tambem).
    try { trava.vigiar(); } catch { /* sem o vigia antecipado o aplicativo abre do mesmo jeito: o vigia de abrirAplicativo continua valendo */ }
    try {
      tinha = auth.biometriaLigada();
      const disponivel = await bio.disponivel();
      if (disponivel !== 'nao') resultado = await telaDeOferta({ tinha });   // 'desconhecido' ainda oferece; so 'nao' pula
    } catch {
      resultado = null;
    }
    await sucesso(primeiraVez, { tinha, resultado });
  }

  // ---------------------------------------------------------------- passo 1: e-mail e senha
  // `daTrava` (este parametro, que esconde o de montarEntrada de proposito): so a primeira tela de senha, quando a pessoa veio da trava.
  // "Usar outra conta" chama telaDeSenha() sem ele, e a tela volta a ser a de sempre.
  function telaDeSenha(avisoInicial = '', { daTrava = null } = {}) {
    const idEmail = novoId('email');
    const idSenha = novoId('senha');
    const idErro = novoId('erro');
    const email = h('input', { id: idEmail, class: 'entrada', type: 'email', name: 'email', autocomplete: 'username', inputmode: 'email', required: true, autocapitalize: 'none', spellcheck: 'false', 'aria-describedby': idErro });
    // autocapitalize e corretor desligados tambem aqui: com o olhinho aberto o campo vira texto e o teclado trataria a senha como frase
    const senha = h('input', { id: idSenha, class: 'entrada', type: 'password', name: 'password', autocomplete: 'current-password', required: true, autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', 'aria-describedby': idErro });
    const olho = h('button', { class: 'entrada-botao', type: 'button', 'aria-label': 'Mostrar a senha', 'aria-pressed': 'false' }, icone('olho', { tamanho: 22 }));
    const mostrarOuEsconder = (mostrar) => {
      senha.type = mostrar ? 'text' : 'password';
      olho.setAttribute('aria-pressed', String(mostrar));   // o nome do botao fica fixo; so o estado muda (botao de alternar)
      preencher(olho, icone(mostrar ? 'olhoRisco' : 'olho', { tamanho: 22 }));
    };
    const esconderSenha = () => { if (senha.type !== 'password') mostrarOuEsconder(false); };
    olho.addEventListener('click', () => mostrarOuEsconder(senha.type === 'password'));
    // A senha nunca fica a mostra sozinha: volta a esconder ao enviar e quando o aplicativo vai para o fundo (aparelho trocado de mao, tela compartilhada).
    const aoMudarDeAba = () => {
      if (!formulario.isConnected) document.removeEventListener('visibilitychange', aoMudarDeAba);
      else if (document.visibilityState === 'hidden') esconderSenha();
    };
    const erro = h('p', { class: 'campo-erro', id: idErro, role: 'alert', hidden: true });
    if (avisoInicial) { erro.textContent = avisoInicial; erro.hidden = false; }
    const entrar = botao('Entrar', { classes: ['botao--primario', 'botao--grande', 'botao--cheio', 'botao--destaque'], tipo: 'submit' });
    entrar.append(icone('avancar'));
    // Vindo da trava: o aviso de internet e o caminho de volta ao desbloqueio, logo depois do botao Entrar. Os campos ficam como sempre.
    const voltarAoDesbloqueio = daTrava && typeof daTrava.aoVoltar === 'function'
      ? botao(TX.VOLTAR, { classes: ['botao--discreto', 'botao--cheio'], aoClicar: () => daTrava.aoVoltar() })
      : null;
    if (voltarAoDesbloqueio) voltarAoDesbloqueio.setAttribute('data-entrada', 'voltar-trava');
    const formulario = h('form', { class: 'entrada-formulario', novalidate: true },
      h('div', { class: 'campo' }, h('label', { class: 'campo-rotulo', for: idEmail }, 'E-mail'), campoComIcone('email', email)),
      h('div', { class: 'campo' }, h('label', { class: 'campo-rotulo', for: idSenha }, 'Senha'), campoComIcone('cadeado', senha, olho)),
      erro,
      entrar,
      voltarAoDesbloqueio ? h('p', { class: 'entrada-nota' }, TX.SENHA_INTERNET) : null,
      voltarAoDesbloqueio);
    formulario.addEventListener('submit', esconderSenha);
    document.addEventListener('visibilitychange', aoMudarDeAba);
    ligar(formulario, entrar, 'Entrando…', erro, async () => {
      if (!email.value.trim() || !senha.value) {
        throw Object.assign(new Error('faltam dados'), { mensagemParaTela: 'Preencha o e-mail e a senha.' });
      }
      let proximo;
      try {
        proximo = await auth.entrar(email.value, senha.value);
      } catch (e) {
        throw Object.assign(e, { mensagemParaTela: auth.mensagemDeEntrada(e, 'senha') });
      }
      if (proximo.passo === 'codigo') {
        senha.value = '';
        telaDeCodigo({ cadastro: null });
      } else {
        await telaDeCadastro();   // se falhar, a senha continua no campo: a pessoa so toca em Entrar de novo
        senha.value = '';
      }
    }, voltarAoDesbloqueio ? [voltarAoDesbloqueio] : []);
    const instalar = blocoDeInstalacao();
    mostrar('',
      h('div', null, h('h2', { class: 'entrada-passo-titulo' }, 'Entrar na sua conta'), h('p', { class: 'entrada-passo-texto' }, 'Use o e-mail e a senha do seu acesso.')),
      formulario,
      h('div', { class: 'entrada-aviso' }, icone('escudo'), h('span', null, 'Acesso protegido. Depois da senha, o Gestão JEMJ pede um código de 6 números, gerado por um aplicativo no seu celular.')),
      instalar);
    if (!noCelular) focar(email);   // no celular o teclado subiria na hora e esconderia a marca
  }

  // ---------------------------------------------------------------- passo 2a: primeiro acesso, cadastrar o autenticador
  async function telaDeCadastro(aviso = '') {
    let dadosDoFator;
    try {
      dadosDoFator = await auth.iniciarCadastro();
    } catch (e) {
      if (e && e.codigo === 'cancelado') throw e;
      const semConexaoOuMuitasTentativas = e && (e.rede || e.status === 429);
      throw Object.assign(e, {
        mensagemParaTela: semConexaoOuMuitasTentativas
          ? auth.mensagemDeEntrada(e, 'senha')
          : 'Sua senha está certa, mas não foi possível preparar o código de segurança agora. Espere um instante e toque em Entrar de novo.',
      });
    }
    telaDeCodigo({ cadastro: dadosDoFator, aviso: aviso || (dadosDoFator.substituiu ? AVISO_CHAVE_NOVA : '') });
  }

  /** Os cartoes do primeiro acesso, antes do codigo: um jeito para o celular (copiar a chave) e outro para o computador (QR). */
  function cartoesDoCadastro(cadastro) {
    const onde = plataforma();
    const lojas = (LOJAS[onde] || []).map((loja) => linkBotao(loja.nome, loja.url, { nome: 'baixar', classes: ['botao--contorno', 'botao--cheio'] })).filter(Boolean);
    const cartaoUm = cartaoDePasso(1, 'Tenha um aplicativo autenticador',
      h('p', { class: 'passo-texto' }, onde === 'outro'
        ? 'No seu celular, instale o Google Authenticator ou o Microsoft Authenticator. É um aplicativo que mostra um código de 6 números, e o código muda sozinho. Se você já tem um autenticador no celular, vá para o passo 2.'
        : 'É um aplicativo que mostra um código de 6 números, e o código muda sozinho. É a segunda proteção da sua conta, depois da senha. Se você já tem um autenticador, vá para o passo 2.'
          + (lojas.length ? ' Se não tem, toque em um dos botões abaixo para abrir a loja.' : ' Se não tem, procure o Google Authenticator ou o Microsoft Authenticator na loja do seu celular.')),
      lojas.length ? h('div', { class: 'passo-acoes' }, ...lojas) : null);

    const botaoDeCopiar = botao('Copiar chave', { nome: 'copiar', classes: ['botao--cheio'] });
    const copiarEFalar = async () => {
      const ok = await copiarTexto(cadastro.segredo);
      preencher(botaoDeCopiar, icone(ok ? 'check' : 'info'), ok ? 'Chave copiada' : 'Selecione a chave abaixo e copie');
      anunciar(ok ? 'Chave copiada' : 'Não foi possível copiar. Selecione a chave e copie.');
    };
    botaoDeCopiar.addEventListener('click', copiarEFalar);
    const chave = h('div', { class: 'entrada-chave-caixa' },
      h('p', { class: 'campo-rotulo' }, 'Chave para o autenticador'),
      h('p', { class: 'entrada-chave', 'data-chave': 'segredo' }, agrupar(cadastro.segredo)));
    const imagem = cadastro.qrSvg
      ? h('div', { class: 'entrada-qr-bloco' },
        h('div', { class: 'entrada-qr-caixa' }, h('img', { class: 'entrada-qr', alt: 'QR code para cadastrar o aplicativo autenticador', width: 200, height: 200, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cadastro.qrSvg)}` })),
        h('p', { class: 'passo-texto' }, 'No autenticador, toque em + e escolha a opção de ler ou escanear o código QR. Depois aponte a câmera para o quadrado acima.'))
      : null;
    const avisoDaChave = h('p', { class: 'passo-texto' }, 'Esta chave é só sua: não envie a ninguém. Depois de colar no autenticador, apague a cópia do histórico do teclado, se houver.');

    if (onde === 'outro') {
      // computador: o QR e o caminho principal (o celular le a tela do computador)
      const cartaoDois = cartaoDePasso(2, 'Escaneie o QR com o celular',
        imagem || h('p', { class: 'passo-texto' }, 'O QR não carregou. Abra "Mostrar a chave", logo abaixo.'),
        h('details', { class: 'entrada-detalhes' },
          h('summary', { class: 'botao botao--discreto botao--cheio' }, icone('chave'), 'Não consegue ler? Mostrar a chave'),
          h('div', { class: 'passo-acoes' }, chave, avisoDaChave, botaoDeCopiar)));
      return [cartaoUm, cartaoDois];
    }
    // celular: copiar a chave e colar no autenticador. No Android ha tambem um atalho que tenta abrir o aplicativo.
    const enderecoAbrir = onde === 'android' ? enderecoDoAutenticador(cadastro.uri) : null;
    botaoDeCopiar.classList.add('botao--primario', 'botao--grande', 'botao--destaque');
    const cartaoDois = cartaoDePasso(2, 'Copie a chave',
      h('p', { class: 'passo-texto' }, 'Toque em "Copiar chave". Depois, leia o passo 3 e abra o autenticador. Você pode sair desta tela e voltar em até 15 minutos; depois disso será preciso copiar uma chave nova.'),
      botaoDeCopiar,
      chave,
      avisoDaChave,
      enderecoAbrir
        ? h('div', { class: 'passo-acoes' },
          h('a', { class: 'botao botao--discreto botao--cheio', href: enderecoAbrir, 'data-abrir': 'autenticador' }, icone('celular'), 'Tentar abrir direto no autenticador'),
          h('p', { class: 'passo-texto' }, 'Se nada acontecer, ou o aplicativo abrir e não adicionar a conta, use a chave acima.'))
        : null,
      imagem
        ? h('details', { class: 'entrada-detalhes' },
          h('summary', { class: 'botao botao--discreto botao--cheio' }, icone('qr'), 'Escanear QR com outro aparelho'),
          imagem)
        : null);
    const cartaoTres = cartaoDePasso(3, 'Cole a chave no autenticador', guiaDoAutenticador());
    return [cartaoUm, cartaoDois, cartaoTres];
  }

  // ---------------------------------------------------------------- passo 2b / 3: o codigo de 6 numeros
  function telaDeCodigo({ cadastro, aviso = '' }) {
    const idCodigo = novoId('codigo');
    const idDica = novoId('dica');
    const idErro = novoId('erro');
    const erro = h('p', { class: 'campo-erro', id: idErro, role: 'alert', hidden: true });
    const codigo = campoDoCodigo(idCodigo, idDica, idErro, {
      aoMudar: () => { erro.hidden = true; },
      aoCompletar: () => formulario.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),   // 6 numeros: envia sozinho
    });
    const confirmar = botao(cadastro ? 'Confirmar e entrar' : 'Entrar', { classes: ['botao--primario', 'botao--grande', 'botao--cheio', 'botao--destaque'], tipo: 'submit' });
    confirmar.append(icone('avancar'));
    const voltar = botao('Usar outra conta', { nome: 'voltar', classes: ['botao--discreto', 'botao--cheio'], aoClicar: () => { auth.cancelarEntrada(); telaDeSenha(); } });
    const numeroDoCartao = cadastro ? (plataforma() === 'outro' ? 3 : 4) : null;
    const formulario = h('form', { class: 'entrada-formulario', novalidate: true },
      h('div', { class: 'campo' },
        h('label', { class: 'campo-rotulo', for: idCodigo }, cadastro ? `${numeroDoCartao}. Digite o código que o autenticador mostra para Gestão JEMJ` : 'Código do autenticador'),
        codigo.caixa,
        h('span', { class: 'otp-dica', id: idDica }, 'São 6 números e eles mudam sozinhos. Se mudarem enquanto você digita, use os novos. Se der erro, confira se a data e a hora do celular estão no automático.')),
      erro,
      confirmar);
    ligar(formulario, confirmar, 'Conferindo…', erro, async () => {
      if (codigo.campo.value.length !== 6) {
        codigo.marcarErro();
        focar(codigo.campo);
        throw Object.assign(new Error('codigo curto'), { mensagemParaTela: 'Digite os 6 números do código.' });
      }
      try {
        await auth.verificarCodigo(codigo.campo.value);
      } catch (e) {
        if (e && e.codigo === 'cancelado') throw e;
        if (!auth.nivelAtual()) {
          telaDeSenha('Sua sessão acabou. Entre de novo com o e-mail e a senha.');
          return;
        }
        if (e && e.codigo === 'fator_sumiu') {
          if (cadastro) {
            // a nuvem apagou o autenticador que ficou tempo demais sem ser confirmado: gera outro e explica o que fazer
            await telaDeCadastro(AVISO_CHAVE_NOVA);
          } else {
            auth.cancelarEntrada();
            telaDeSenha('Não encontramos o seu autenticador na conta. Entre de novo com a senha para cadastrar outro.');
          }
          return;
        }
        // so o codigo errado limpa as caixas; sem internet ou com muitas tentativas a pessoa nao precisa digitar tudo de novo
        if (e && !e.rede && (e.status === 400 || e.status === 422)) codigo.limpar();
        codigo.marcarErro();
        focar(codigo.campo);
        throw Object.assign(e, { mensagemParaTela: auth.mensagemDeEntrada(e, cadastro ? 'cadastro' : 'codigo') });
      }
      await aposOCodigo(Boolean(cadastro));   // a oferta da trava e/ou "Tudo certo"; erro ali dentro nunca prende a pessoa
    }, [voltar]);

    // "Usar outra conta" larga a sessao e o campo da trava (o cache de dados fica ate o Sair ou ate outra conta entrar): com a trava ligada, a pessoa e avisada antes de tocar
    const notaDaOutraConta = auth.biometriaLigada() ? h('p', { class: 'entrada-nota' }, TX.CODIGO_OUTRA_CONTA) : null;

    if (cadastro) {
      mostrar(aviso,
        h('div', { class: 'entrada-aviso entrada-aviso--ok' }, icone('check'), h('span', null, 'Senha confirmada. Falta uma etapa de segurança: ligar o Gestão JEMJ a um aplicativo autenticador.')),
        h('div', null, h('h2', { class: 'entrada-passo-titulo' }, 'Proteja seu acesso'), h('p', { class: 'entrada-passo-texto' }, 'Você faz isso só na primeira vez. Nas próximas entradas, depois da senha, você digita o código do autenticador.')),
        aviso ? h('div', { class: 'entrada-aviso entrada-aviso--atencao', role: 'status' }, icone('alerta'), h('span', null, aviso)) : null,
        ...cartoesDoCadastro(cadastro),
        h('section', { class: 'passo-cartao' }, formulario),
        notaDaOutraConta,
        voltar);
    } else {
      mostrar('',
        h('div', null, h('h2', { class: 'entrada-passo-titulo' }, 'Código de segurança'), h('p', { class: 'entrada-passo-texto' }, 'Abra o seu autenticador e digite o código que ele mostra para Gestão JEMJ.')),
        formulario,
        notaDaOutraConta,
        voltar);
      focar(codigo.campo);
    }
  }

  // ---------------------------------------------------------------- passo 4: a oferta da trava do aplicativo
  /**
   * Devolve a escolha da pessoa: { acao: 'ligou' | 'refez' | 'manteve' | 'desligou' | 'agora_nao' | 'sem_suporte' }.
   * Sem trava antes (`tinha` falso): [Ligar a trava, Agora nao]. Com trava ja registrada: [Manter, Refazer, Desligar].
   * Falha de criacao ou de gravacao nunca grava nada e nunca prende a pessoa: sempre ha uma saida na tela. Os botoes de saida nunca ficam
   * desabilitados, nem durante a espera do celular.
   * Cada aoToque* chama a biometria direto do toque (sem async e sem await antes), porque o iPhone so abre a janela do desbloqueio assim.
   */
  function telaDeOferta({ tinha }) {
    return new Promise((resolver) => {
      const aviso = auth.avisoDaTrava();   // "a trava caiu": so existe se a sessao acabou com a trava ligada
      let resolvido = false;
      let aguardando = false;
      let botaoOcupado = null;
      const estado = h('p', { class: 'trava-estado', role: 'status', 'aria-live': 'polite', 'data-oferta': 'estado' });
      const acoes = h('div', { class: 'trava-acoes' });

      /** A mensagem da tela (status ou erro). Rola ate ela: as acoes ficam presas na base e podem cobrir o lugar dela numa tela baixa. */
      function dizer(texto, atencao = false) {
        estado.classList.toggle('trava-estado--atencao', atencao);
        if (atencao) preencher(estado, icone('alerta', { tamanho: 20 }), h('span', null, texto));
        else estado.textContent = texto;
        try { estado.scrollIntoView({ block: 'center' }); } catch { /* o navegador pode nao ter: a mensagem continua na tela */ }
      }

      function calar() {
        estado.classList.remove('trava-estado--atencao');
        estado.textContent = '';
      }

      function terminar(resultado) {
        if (resolvido) return;
        resolvido = true;
        aguardando = false;
        const tela = folha.closest('.entrada-tela');
        if (tela) tela.classList.remove('entrada-tela--compacta');
        resolver(resultado);
      }

      /** O botao tocado vira "Aguardando o celular…" e a mensagem explica a janela propria do celular. */
      function aguardar(ev) {
        aguardando = true;
        const alvo = (ev && ev.currentTarget) || acoes.querySelector('[data-oferta="ligar"], [data-oferta="tentar"], [data-oferta="refazer"]');
        if (alvo) {
          botaoOcupado = alvo;
          ocupado(alvo, true, OF.AGUARDANDO);
        }
        dizer(OF.JANELA);
        anunciar(OF.JANELA);
      }

      /** Troca os botoes por uma saida depois de uma falha. `soContinuar`: o navegador ou o aparelho nao deixa mesmo, so resta seguir sem a trava. */
      function falhar(texto, refazer, soContinuar = false) {
        aguardando = false;
        botaoOcupado = null;
        dizer(texto, true);
        const novos = soContinuar
          ? [botaoDaOferta('continuar', OF.CONTINUAR, CLASSES_PRINCIPAL, aoToqueContinuar)]
          : [
            botaoDaOferta('tentar', OF.TENTAR, CLASSES_PRINCIPAL, refazer ? aoToqueRefazer : aoToqueLigar),
            refazer
              ? botaoDaOferta('manter', OF.MANTER, CLASSES_DISCRETO, aoToqueManter)
              : botaoDaOferta('agora-nao', OF.CONTINUAR_SEM, CLASSES_DISCRETO, aoToqueAgoraNao),
          ];
        preencher(acoes, ...novos);
        focar(novos[0]);
      }

      /** A credencial nasceu: so conta como ligada se o armazenamento guardou mesmo (ligarBiometria confere de novo). Senao ela e esquecida. */
      function aoCriada(credencial, antigo, refazer, minutos) {
        if (resolvido) {
          bio.esquecer(credencial.id);   // a pessoa ja saiu da oferta: a credencial que acabou de nascer nao serve a ninguem
          return;
        }
        aguardando = false;
        let gravou = false;
        try {
          gravou = auth.ligarBiometria({ id: credencial.id, transports: credencial.transports, minutos });
        } catch {
          gravou = false;
        }
        if (!gravou) {
          bio.esquecer(credencial.id);
          falhar(refazer ? OF.FALHOU_REFAZER : OF.GRAVACAO, refazer);
          return;
        }
        falhasDeCriar = 0;
        if (antigo && antigo !== credencial.id) bio.esquecer(antigo);
        try { trava.carimbarVerificacao(); } catch { /* so memoria do vigia: nao pode prender a pessoa */ }
        terminar({ acao: refazer ? 'refez' : 'ligou' });
      }

      function aoNaoCriada(erro, refazer) {
        if (resolvido) return;   // por exemplo, abortado porque a pessoa tocou em Agora nao: a tela ja resolveu
        aguardando = false;
        const codigo = erro && erro.codigo;
        if (codigo === 'abortado') {
          // nada a dizer: so tira o "Aguardando" do botao (algo abortou o pedido sem a pessoa sair da oferta)
          if (botaoOcupado) ocupado(botaoOcupado, false);
          botaoOcupado = null;
          if (estado.textContent === OF.JANELA) calar();
          return;
        }
        if (codigo === 'demorou') {
          falhar(refazer ? OF.FALHOU_REFAZER : OF.DEMOROU, refazer);
          return;
        }
        if (codigo === 'nao_suportado' || codigo === 'inseguro') {
          falhar(OF.SEM_SUPORTE, refazer, true);
          return;
        }
        falhasDeCriar += 1;
        const aparelho = bio.aparelho();
        if (aparelho.iphone && aparelho.instalado && falhasDeCriar >= 2) {
          falhar(refazer ? OF.ICONE_FALHOU_REFAZER : OF.ICONE_FALHOU, refazer, true);   // dentro do icone da tela inicial, duas falhas seguidas: nao adianta insistir
          return;
        }
        falhar(refazer ? OF.FALHOU_REFAZER : OF.FALHOU, refazer);
      }

      function aoToqueLigar(ev) {
        if (aguardando || resolvido) return;   // segundo toque enquanto espera: ignorado
        const antigo = auth.biometriaDados().id;
        const pedido = bio.criar({ limiteMs: 60000 });
        pedido.then((credencial) => aoCriada(credencial, antigo, false, 1), (erro) => aoNaoCriada(erro, false));
        aguardar(ev);
      }

      function aoToqueRefazer(ev) {
        if (aguardando || resolvido) return;
        const dados = auth.biometriaDados();
        const antigo = dados.id;
        const minutos = dados.minutos;   // a trava refeita guarda o mesmo prazo da antiga
        const pedido = bio.criar({ limiteMs: 60000 });
        pedido.then((credencial) => aoCriada(credencial, antigo, true, minutos), (erro) => aoNaoCriada(erro, true));
        aguardar(ev);
      }

      function aoToqueAgoraNao() {
        bio.abortar();
        if (aviso) {
          try { auth.limparAvisoDaTrava(); } catch { /* o aviso fica e a oferta volta no proximo login completo */ }
        }
        terminar({ acao: 'agora_nao' });
      }

      function aoToqueManter() {
        bio.abortar();
        terminar({ acao: 'manteve' });
      }

      function aoToqueContinuar() {
        bio.abortar();
        terminar({ acao: 'sem_suporte' });
      }

      function aoToqueDesligar() {
        bio.abortar();
        const antigo = auth.biometriaDados().id;
        let desligou = false;
        try {
          desligou = auth.desligarBiometria();
        } catch {
          desligou = false;
        }
        if (!desligou) {
          dizer(OF.DESLIGAR_FALHOU, true);   // nao diz "desligada" quando o armazenamento nao gravou: a trava continua ligada
          return;
        }
        if (antigo) bio.esquecer(antigo);
        terminar({ acao: 'desligou' });
      }

      let textoDaFaixa = null;
      if (tinha) textoDaFaixa = OF.FAIXA_HAVIA;
      else if (aviso) textoDaFaixa = textoDaFaixaCaiu(aviso.em);
      preencher(acoes, ...(tinha
        ? [
          botaoDaOferta('manter', OF.MANTER, CLASSES_PRINCIPAL, aoToqueManter),
          botaoDaOferta('refazer', OF.REFAZER, CLASSES_SECUNDARIO, aoToqueRefazer),
          botaoDaOferta('desligar', OF.DESLIGAR, CLASSES_DISCRETO, aoToqueDesligar),
        ]
        : [
          botaoDaOferta('ligar', OF.LIGAR, CLASSES_PRINCIPAL, aoToqueLigar),
          botaoDaOferta('agora-nao', OF.AGORA_NAO, CLASSES_DISCRETO, aoToqueAgoraNao),
        ]));

      // a oferta usa a cabeca menor da trava, para o botao principal caber na primeira tela; sai de novo quando a oferta resolve
      const tela = folha.closest('.entrada-tela');
      if (tela) tela.classList.add('entrada-tela--compacta');
      const passo = mostrar('',
        textoDaFaixa
          ? h('div', { class: 'entrada-aviso entrada-aviso--atencao', role: 'status', 'data-oferta': 'faixa' }, icone('alerta'), h('span', null, textoDaFaixa))
          : null,
        h('div', null,
          h('h2', { class: 'entrada-passo-titulo', tabindex: '-1' }, OF.TITULO),
          h('p', { class: 'entrada-passo-texto', 'data-oferta': 'lead' }, OF.LEAD)),
        h('ul', { class: 'oferta-linhas' }, h('li', null, OF.L1), h('li', null, OF.L2), h('li', null, OF.L3)),
        estado,
        acoes,
        h('details', { class: 'entrada-detalhes', 'data-oferta': 'saiba-mais' },
          h('summary', { class: 'botao botao--discreto botao--cheio' }, OF.SAIBA_MAIS),
          ...paragrafosDoSaibaMais().map((texto) => h('p', { class: 'passo-texto' }, texto))));
      passo.classList.add('oferta');
      passo.setAttribute('data-oferta', tinha ? 'havia' : 'padrao');
    });
  }

  // Pagina recarregada no meio da entrada (a pessoa foi ao autenticador e voltou): continua de onde parou, sem pedir a senha de novo.
  const retomada = auth.retomarEntrada();
  if (retomada) telaDeCodigo({ cadastro: retomada.passo === 'cadastro' ? retomada.cadastro : null });
  else telaDeSenha('', { daTrava });
}
