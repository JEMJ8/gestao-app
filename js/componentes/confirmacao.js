// Confirmacao em folha inferior. Devolve uma promessa com { confirmado, nota }.
//
//   const r = await confirmar({
//     titulo: 'Marcar como não cumprido?',
//     texto: 'O computador vai registrar que este prazo não foi cumprido.',
//     rotuloConfirmar: 'Marcar como não cumprido',
//     perigo: true,
//     nota: { rotulo: 'Motivo', obrigatoria: true },     // opcional: pede uma anotacao
//   });
//   if (r.confirmado) await dados.enviarComando('prazo_status', prazo.id, { status: 'perdido', nota: r.nota });
//
// Cancelar, tocar fora, Esc e o Voltar do aparelho dao { confirmado: false }. Com nota obrigatoria, o botao so confirma com texto.

import { h, novoId } from '../ui.js';
import { abrirFolha } from './folha.js';

export function confirmar({ titulo, texto = null, rotuloConfirmar = 'Confirmar', rotuloCancelar = 'Cancelar', perigo = false, nota = null } = {}) {
  return new Promise((resolve) => {
    let resultado = { confirmado: false, nota: '' };
    const idNota = novoId('nota');
    const idErro = novoId('nota-erro');
    const campo = nota ? h('textarea', { id: idNota, class: 'entrada', rows: 3, maxlength: nota.maximo || 1000, 'aria-describedby': idErro, autocomplete: 'off' }) : null;
    const erro = h('p', { class: 'campo-erro', id: idErro, role: 'alert', hidden: true });
    const confirmarBotao = h('button', { class: ['botao', perigo ? 'botao--perigo' : 'botao--primario'], type: 'button' }, rotuloConfirmar);
    const cancelarBotao = h('button', { class: 'botao', type: 'button' }, rotuloCancelar);
    const folha = abrirFolha({
      titulo,
      conteudo: [
        texto ? h('p', null, texto) : null,
        nota ? h('div', { class: 'campo' },
          h('label', { class: 'campo-rotulo', for: idNota }, nota.rotulo || 'Anotação', nota.obrigatoria ? '' : ' (opcional)'),
          nota.ajuda ? h('span', { class: 'campo-ajuda' }, nota.ajuda) : null,
          campo,
          erro) : null,
      ],
      rodape: [cancelarBotao, confirmarBotao],
      aoFechar: () => resolve(resultado),
      focoInicial: campo,
    });
    cancelarBotao.addEventListener('click', () => folha.fechar());
    confirmarBotao.addEventListener('click', () => {
      const valor = campo ? campo.value.trim() : '';
      if (nota && nota.obrigatoria && !valor) {
        erro.textContent = 'Escreva o motivo para continuar.';
        erro.hidden = false;
        campo.focus();
        return;
      }
      resultado = { confirmado: true, nota: valor };
      folha.fechar();
    });
  });
}
