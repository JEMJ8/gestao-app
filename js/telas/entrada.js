// Tela de entrada: e-mail e senha, depois o codigo de 6 numeros do aplicativo autenticador.
// No primeiro acesso mostra o passo a passo para cadastrar o autenticador NO MESMO CELULAR: copiar a chave e colar no aplicativo (o QR so serve
// para quem esta no computador, porque no celular ninguem consegue apontar a camera para a propria tela). No Android ha ainda um atalho que tenta
// abrir o autenticador; no iPhone ele nao e confiavel e nao aparece. Se a pagina recarregar no meio (a pessoa foi ao autenticador e voltou),
// a entrada continua de onde parou, sem pedir a senha de novo.
// Nao e uma rota: app.js a desenha no lugar do aplicativo enquanto nao houver sessao completa (senha + codigo).

import { h, preencher, novoId, focar, copiarTexto, esperar, anunciar } from '../ui.js';
import { icone } from '../icones.js';
import { marca } from '../marca.js';
import { linkHttps } from '../formato.js';
import * as auth from '../auth.js';
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
  return /^otpauth:\/\/totp\/[^\s"'<>]+$/.test(texto) && /[?&]secret=[A-Za-z2-7]+/.test(texto) ? texto : null;
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

/** Desenha a entrada em `raiz`. `aoConcluir()` e chamada quando a sessao completa (aal2) estiver guardada. */
export function montarEntrada(raiz, { aoConcluir }) {
  document.title = 'Entrar · Gestão JEMJ';
  const folha = esqueleto(raiz);
  const noCelular = plataforma() !== 'outro';

  /** Troca o passo: volta ao topo, leva o foco ao titulo (leitor de tela e teclado) e fala o aviso, que entra ja escrito e o leitor nao leria sozinho. */
  function mostrar(aviso, ...filhos) {
    preencher(folha, h('div', { class: 'entrada-passo' }, ...filhos, rodape()));
    window.scrollTo(0, 0);
    const titulo = folha.querySelector('.entrada-passo-titulo');
    if (titulo) {
      titulo.setAttribute('tabindex', '-1');
      focar(titulo);
    }
    if (aviso) anunciar(aviso);
  }

  async function sucesso(primeiraVez) {
    raiz.appendChild(h('div', { class: 'entrada-sucesso', role: 'status' },
      h('div', { class: 'entrada-sucesso-bola' }, icone('check', { tamanho: 44 })),
      h('span', null, 'Tudo certo. Abrindo…'),
      primeiraVez ? h('p', { class: 'entrada-sucesso-nota' }, 'Da próxima vez, depois da senha, o Gestão JEMJ vai pedir o código do seu autenticador.') : null));
    anunciar(primeiraVez ? 'Tudo certo. Da próxima vez, depois da senha, o Gestão JEMJ vai pedir o código do seu autenticador.' : 'Tudo certo. Abrindo.');
    await esperar(primeiraVez ? 1800 : 650);   // o movimento reduzido tira a animacao (base.css), nao o tempo de leitura
    aoConcluir();
  }

  // ---------------------------------------------------------------- passo 1: e-mail e senha
  function telaDeSenha(avisoInicial = '') {
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
    const formulario = h('form', { class: 'entrada-formulario', novalidate: true },
      h('div', { class: 'campo' }, h('label', { class: 'campo-rotulo', for: idEmail }, 'E-mail'), campoComIcone('email', email)),
      h('div', { class: 'campo' }, h('label', { class: 'campo-rotulo', for: idSenha }, 'Senha'), campoComIcone('cadeado', senha, olho)),
      erro,
      entrar);
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
    });
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
      await sucesso(Boolean(cadastro));
    }, [voltar]);

    if (cadastro) {
      mostrar(aviso,
        h('div', { class: 'entrada-aviso entrada-aviso--ok' }, icone('check'), h('span', null, 'Senha confirmada. Falta uma etapa de segurança: ligar o Gestão JEMJ a um aplicativo autenticador.')),
        h('div', null, h('h2', { class: 'entrada-passo-titulo' }, 'Proteja seu acesso'), h('p', { class: 'entrada-passo-texto' }, 'Você faz isso só na primeira vez. Nas próximas entradas, depois da senha, você digita o código do autenticador.')),
        aviso ? h('div', { class: 'entrada-aviso entrada-aviso--atencao', role: 'status' }, icone('alerta'), h('span', null, aviso)) : null,
        ...cartoesDoCadastro(cadastro),
        h('section', { class: 'passo-cartao' }, formulario),
        voltar);
    } else {
      mostrar('',
        h('div', null, h('h2', { class: 'entrada-passo-titulo' }, 'Código de segurança'), h('p', { class: 'entrada-passo-texto' }, 'Abra o seu autenticador e digite o código que ele mostra para Gestão JEMJ.')),
        formulario,
        voltar);
      focar(codigo.campo);
    }
  }

  // Pagina recarregada no meio da entrada (a pessoa foi ao autenticador e voltou): continua de onde parou, sem pedir a senha de novo.
  const retomada = auth.retomarEntrada();
  if (retomada) telaDeCodigo({ cadastro: retomada.passo === 'cadastro' ? retomada.cadastro : null });
  else telaDeSenha();
}
