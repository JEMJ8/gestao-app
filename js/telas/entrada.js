// Tela de entrada: e-mail e senha, depois o codigo de 6 digitos do aplicativo autenticador.
// No primeiro acesso mostra o QR (e a chave em texto) para cadastrar o autenticador, e pede o primeiro codigo.
// Nao e uma rota: app.js a desenha no lugar do aplicativo enquanto nao houver sessao completa (senha + codigo).

import { h, preencher, novoId, focar, copiarTexto } from '../ui.js';
import { icone } from '../icones.js';
import * as auth from '../auth.js';
import { VERSAO_APP } from '../versao.js';

function agrupar(segredo) {
  return segredo.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/** Desenha a entrada em `raiz`. `aoConcluir()` e chamada quando a sessao completa (aal2) estiver guardada. */
export function montarEntrada(raiz, { aoConcluir }) {
  document.title = 'Entrar · Gestão JEMJ';
  const painel = h('div', { class: 'entrada-painel' });
  preencher(raiz, h('div', { class: 'entrada-tela' }, painel, h('p', { class: 'entrada-versao texto-pequeno texto-2' }, `Versão ${VERSAO_APP}`)));

  function cabecalho(titulo, texto) {
    return [
      h('div', { class: 'entrada-marca', 'aria-hidden': 'true' }, icone('escudo', { tamanho: 30 })),
      h('h1', { class: 'entrada-titulo' }, titulo),
      texto ? h('p', { class: 'texto-2' }, texto) : null,
    ];
  }

  /** Liga o envio do formulario: trava o botao, mostra a mensagem de erro no campo e devolve o foco. */
  function ligar(formulario, botao, rotuloOcupado, areaDeErro, trabalho) {
    formulario.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (botao.disabled) return;
      const rotuloNormal = botao.textContent;
      botao.disabled = true;
      botao.textContent = rotuloOcupado;
      areaDeErro.hidden = true;
      try {
        await trabalho();
      } catch (erro) {
        areaDeErro.textContent = erro && erro.mensagemParaTela ? erro.mensagemParaTela : 'Não foi possível continuar. Tente de novo.';
        areaDeErro.hidden = false;
      } finally {
        botao.disabled = false;
        botao.textContent = rotuloNormal;
      }
    });
  }

  // ---------------------------------------------------------------- passo 1: e-mail e senha
  function telaDeSenha() {
    const idEmail = novoId('email');
    const idSenha = novoId('senha');
    const idErro = novoId('erro');
    const email = h('input', { id: idEmail, class: 'entrada', type: 'email', name: 'email', autocomplete: 'username', inputmode: 'email', required: true, autocapitalize: 'none', spellcheck: 'false', 'aria-describedby': idErro });
    const senha = h('input', { id: idSenha, class: 'entrada', type: 'password', name: 'password', autocomplete: 'current-password', required: true, 'aria-describedby': idErro });
    const olho = h('button', { class: 'entrada-botao', type: 'button', 'aria-label': 'Mostrar a senha', 'aria-pressed': 'false' }, icone('olho', { tamanho: 22 }));
    const mostrarOuEsconder = (mostrar) => {
      senha.type = mostrar ? 'text' : 'password';
      olho.setAttribute('aria-pressed', String(mostrar));
      olho.setAttribute('aria-label', mostrar ? 'Esconder a senha' : 'Mostrar a senha');
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
    const botao = h('button', { class: 'botao botao--primario botao--cheio', type: 'submit' }, 'Entrar');
    const formulario = h('form', { class: 'entrada-formulario', novalidate: true },
      h('div', { class: 'campo' }, h('label', { class: 'campo-rotulo', for: idEmail }, 'E-mail'), email),
      h('div', { class: 'campo' }, h('label', { class: 'campo-rotulo', for: idSenha }, 'Senha'), h('div', { class: 'entrada-com-botao' }, senha, olho)),
      erro,
      botao);
    formulario.addEventListener('submit', esconderSenha);
    document.addEventListener('visibilitychange', aoMudarDeAba);
    ligar(formulario, botao, 'Entrando…', erro, async () => {
      if (!email.value.trim() || !senha.value) {
        throw Object.assign(new Error('faltam dados'), { mensagemParaTela: 'Preencha o e-mail e a senha.' });
      }
      let proximo;
      try {
        proximo = await auth.entrar(email.value, senha.value);
      } catch (e) {
        throw Object.assign(e, { mensagemParaTela: auth.mensagemDeEntrada(e, 'senha') });
      }
      senha.value = '';
      if (proximo.passo === 'codigo') telaDeCodigo({ cadastro: null });
      else await telaDeCadastro();
    });
    preencher(painel, cabecalho('Gestão JEMJ', 'Entre com seu e-mail e senha.'), formulario);
    focar(email);
  }

  // ---------------------------------------------------------------- passo 2a: primeiro acesso, cadastrar o autenticador
  async function telaDeCadastro() {
    let dadosDoFator;
    try {
      dadosDoFator = await auth.iniciarCadastro();
    } catch (e) {
      throw Object.assign(e, { mensagemParaTela: 'Não foi possível preparar o segundo fator agora. Tente de novo em instantes.' });
    }
    telaDeCodigo({ cadastro: dadosDoFator });
  }

  // ---------------------------------------------------------------- passo 2b: o codigo de 6 digitos
  function telaDeCodigo({ cadastro }) {
    const idCodigo = novoId('codigo');
    const idErro = novoId('erro');
    const codigo = h('input', {
      id: idCodigo, class: 'entrada entrada--codigo', type: 'text', name: 'otp', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 6,
      autocomplete: 'one-time-code', required: true, 'aria-describedby': idErro, 'aria-label': 'Código de 6 dígitos',
    });
    codigo.addEventListener('input', () => { codigo.value = codigo.value.replace(/\D/g, '').slice(0, 6); });
    const erro = h('p', { class: 'campo-erro', id: idErro, role: 'alert', hidden: true });
    const botao = h('button', { class: 'botao botao--primario botao--cheio', type: 'submit' }, cadastro ? 'Confirmar e entrar' : 'Entrar');
    const voltar = h('button', { class: 'botao botao--discreto botao--cheio', type: 'button', onclick: () => { auth.cancelarEntrada(); telaDeSenha(); } }, 'Usar outra conta');
    const formulario = h('form', { class: 'entrada-formulario', novalidate: true },
      h('div', { class: 'campo' },
        h('label', { class: 'campo-rotulo', for: idCodigo }, 'Código do aplicativo autenticador'),
        h('span', { class: 'campo-ajuda' }, 'Seis números. Se o código não funcionar, confira se a hora do celular está certa.'),
        codigo),
      erro,
      botao);
    ligar(formulario, botao, 'Conferindo…', erro, async () => {
      try {
        await auth.verificarCodigo(codigo.value);
      } catch (e) {
        codigo.value = '';
        focar(codigo);
        throw Object.assign(e, { mensagemParaTela: auth.mensagemDeEntrada(e, 'codigo') });
      }
      aoConcluir();
    });

    const partes = [];
    if (cadastro) {
      const imagem = cadastro.qrSvg
        ? h('img', { class: 'entrada-qr', alt: 'QR code para cadastrar o aplicativo autenticador', width: 200, height: 200, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cadastro.qrSvg)}` })
        : null;
      const copiar = h('button', { class: 'botao', type: 'button' }, icone('copiar'), 'Copiar a chave');
      copiar.addEventListener('click', async () => {
        const ok = await copiarTexto(cadastro.segredo);
        copiar.textContent = ok ? 'Chave copiada' : 'Selecione a chave acima e copie';
      });
      partes.push(
        cabecalho('Primeiro acesso', 'Para sua segurança, o acesso pede um código a cada entrada. Cadastre o aplicativo autenticador uma vez.'),
        h('ol', { class: 'entrada-passos' },
          h('li', null, 'Abra um aplicativo autenticador no celular (por exemplo o Google Authenticator, o Microsoft Authenticator ou o Authy).'),
          h('li', null, 'Escaneie o QR abaixo. Se não conseguir escanear, digite a chave.'),
          h('li', null, 'Digite aqui o código de 6 números que o aplicativo mostrar.')),
        imagem ? h('div', { class: 'entrada-qr-caixa' }, imagem) : null,
        h('p', { class: 'campo-rotulo' }, 'Chave para digitar'),
        h('p', { class: 'entrada-chave', 'data-chave': 'segredo' }, agrupar(cadastro.segredo)),
        copiar,
      );
    } else {
      partes.push(cabecalho('Código de segurança', 'Abra o aplicativo autenticador e digite o código de 6 números.'));
    }
    preencher(painel, ...partes, formulario, voltar);
    focar(codigo);
  }

  telaDeSenha();
}
