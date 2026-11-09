// Confirmacao em folha inferior COM a verificacao do celular no proprio clique de confirmar. Devolve uma promessa com { confirmado, nota, semVerificacao }.
//
//   confirmarComVerificacao({
//     titulo: 'Desligar a trava?',
//     texto: 'O aplicativo volta a abrir direto neste celular.',
//     rotuloConfirmar: 'Desligar a trava',
//     textoFalha: 'Continua ligada. Para desligar, confirme com o desbloqueio do celular.',
//     escape: { rotulo: 'Sair mesmo sem confirmar', texto: 'Isso so apaga os dados deste celular.' },   // opcional: so aparece depois da 1a falha
//   }).then((r) => { /* r.confirmado; r.semVerificacao e true so quando a pessoa tocou no escape */ });
//
//   confirmarSensivel(config).then((s) => { /* ... */ });   // s = { confirmado, nota }: pede a verificacao SE a trava estiver ligada e completa; senao e o confirmar() de sempre
//
// Por que existe um componente proprio e nao "confirmar() e depois verificar": a promessa de confirmar() so se resolve quando a folha FECHA, ou
// seja, fora do toque. O iPhone so abre a janela do desbloqueio a partir do toque, entao a verificacao sai do clique do botao de confirmar
// (aoToqueConfirmar: funcao comum, nao assincrona, que continua pelo then da promessa). Cancelar, Esc, tocar fora e o Voltar do aparelho
// cancelam o pedido pendente.
//
// Esta peca nao guarda nada, nao fala com a nuvem e nao mexe na sessao. Uma verificacao que passa recomeca a contagem do prazo da trava.

import { h, novoId, focar } from '../ui.js';
import { abrirFolha } from './folha.js';
import { confirmar } from './confirmacao.js';
import * as auth from '../auth.js';
import * as bio from '../biometria.js';
import * as trava from '../telas/trava.js';

const FRASE_FIXA = 'O celular vai pedir o desbloqueio agora para confirmar.';
const ROTULO_AGUARDANDO = 'Aguardando o celular…';
const FRASE_DA_NOTA_OBRIGATORIA = 'Escreva o motivo para continuar.';

export function confirmarComVerificacao({
  titulo, texto = null, rotuloConfirmar, rotuloCancelar = 'Cancelar', perigo = false, textoFalha, nota = null, escape = null,
} = {}) {
  return new Promise((resolve) => {
    let resultado = { confirmado: false, nota: '', semVerificacao: false };
    let aguardando = false;
    let encerrada = false;
    const idNota = novoId('nota');
    const idErro = novoId('verificacao-erro');
    const campo = nota ? h('textarea', { id: idNota, class: 'entrada', rows: 3, maxlength: nota.maximo || 1000, 'aria-describedby': idErro, autocomplete: 'off' }) : null;
    const erro = h('p', { class: 'campo-erro', id: idErro, role: 'alert', hidden: true });
    const confirmarBotao = h('button', { class: ['botao', perigo ? 'botao--perigo' : 'botao--primario'], type: 'button' }, rotuloConfirmar);
    const cancelarBotao = h('button', { class: 'botao', type: 'button' }, rotuloCancelar);
    const escapeBotao = escape ? h('button', { class: ['botao', 'botao--discreto'], type: 'button', 'data-acao': 'escape', hidden: true }, escape.rotulo) : null;
    const escapeTexto = escape ? h('p', { class: ['texto-2', 'texto-pequeno'], 'data-verificacao': 'escape', hidden: true }, escape.texto) : null;

    const folha = abrirFolha({
      titulo,
      conteudo: [
        h('p', null, texto ? `${texto} ${FRASE_FIXA}` : FRASE_FIXA),
        nota ? h('div', { class: 'campo' },
          h('label', { class: 'campo-rotulo', for: idNota }, nota.rotulo || 'Anotação', nota.obrigatoria ? '' : ' (opcional)'),
          nota.ajuda ? h('span', { class: 'campo-ajuda' }, nota.ajuda) : null,
          campo) : null,
        erro,
        escapeTexto,
      ],
      rodape: [cancelarBotao, confirmarBotao, escapeBotao],
      // abortar() e inofensivo depois de um sucesso e solta o pedido pendente quando a folha fecha por Esc, toque fora ou Voltar do aparelho
      aoFechar: () => { encerrada = true; bio.abortar(); resolve(resultado); },
      focoInicial: campo,
    });

    function valorDaNota() {
      return campo ? campo.value.trim() : '';
    }

    /** A folha rola e o rodape fica por cima do fim do corpo: o aviso (e, depois da falha, a explicacao do escape) sobe para a vista. */
    function levarAVista(el) {
      try { el.scrollIntoView({ block: 'nearest' }); } catch { /* o navegador pode nao ter: o aviso continua na folha */ }
    }

    function mostrarErro(frase) {
      erro.textContent = frase;
      erro.hidden = false;
      levarAVista(erro);
    }

    function esperarOCelular() {
      aguardando = true;
      erro.hidden = true;
      confirmarBotao.textContent = ROTULO_AGUARDANDO;
      confirmarBotao.setAttribute('aria-busy', 'true');
      confirmarBotao.setAttribute('aria-disabled', 'true');
    }

    function pararDeEsperar() {
      aguardando = false;
      confirmarBotao.textContent = rotuloConfirmar;
      confirmarBotao.removeAttribute('aria-busy');
      confirmarBotao.removeAttribute('aria-disabled');
    }

    function mostrarEscape() {
      if (escapeBotao) escapeBotao.hidden = false;
      if (escapeTexto) {
        escapeTexto.hidden = false;
        levarAVista(escapeTexto);
      }
    }

    /** A nota obrigatoria vazia barra ANTES de chamar o celular (a pessoa ainda nao decidiu nada). */
    function faltaANota() {
      if (!(nota && nota.obrigatoria && !valorDaNota())) return false;
      mostrarErro(FRASE_DA_NOTA_OBRIGATORIA);
      focar(campo);
      return true;
    }

    function aoToqueConfirmar() {
      if (aguardando || encerrada) return;
      if (faltaANota()) return;
      const { id, transports } = auth.biometriaDados();
      const pedido = bio.verificar({ id, transports });           // direto no toque: o iPhone so abre a janela do desbloqueio daqui
      esperarOCelular();
      pedido.then(() => {
        if (encerrada) return;
        trava.carimbarVerificacao();
        resultado = { confirmado: true, nota: valorDaNota(), semVerificacao: false };
        folha.fechar();
      }, (e) => {
        if (encerrada) return;
        pararDeEsperar();
        if (e && e.codigo === 'abortado') return;                 // outro pedido tomou o lugar (ou a pessoa cancelou): sem aviso
        mostrarErro(textoFalha);
        mostrarEscape();
      });
    }

    cancelarBotao.addEventListener('click', () => { bio.abortar(); folha.fechar(); });
    confirmarBotao.addEventListener('click', aoToqueConfirmar);
    if (escapeBotao) {
      escapeBotao.addEventListener('click', () => {
        if (encerrada || faltaANota()) return;
        bio.abortar();
        resultado = { confirmado: true, nota: valorDaNota(), semVerificacao: true };
        folha.fechar();
      });
    }
  });
}

/**
 * Para as acoes que nao se desfazem pela tela (excluir prazo). Com a trava ligada e completa pede a verificacao do celular no clique;
 * sem trava, ou com o campo da trava incompleto, e o confirmar() de sempre, sem verificacao.
 */
export function confirmarSensivel(config) {
  const verificar = auth.biometriaLigada() && auth.biometriaDados().valido;
  if (!verificar) return confirmar(config);
  const rotulo = config.rotuloConfirmar || 'Confirmar';
  return confirmarComVerificacao({
    ...config,
    rotuloConfirmar: rotulo,
    textoFalha: `Não foi confirmado. Nada foi alterado. Toque em ${rotulo} para tentar de novo.`,
  }).then((r) => ({ confirmado: r.confirmado, nota: r.nota }));
}
