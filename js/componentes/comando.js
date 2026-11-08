// Bloco de comandos de um alvo (por exemplo um prazo): mostra o que ja foi pedido ao computador e em que pé esta.
//
//   container.append(blocoDeComandos(prazo.id, ctx));
//
// Estados que a pessoa ve:
//   Enviado, aguardando o computador   (com o horario do envio; o computador pode estar desligado)
//   Aplicado pelo computador           (com o texto que o computador devolveu, como o aviso da data fatal; sem texto, "a lista muda quando
//                                       o computador sincronizar")
//   O computador não aplicou           (com o motivo, em portugues, como o computador escreveu)
// O dado do prazo NAO muda por causa do pedido: a tela de Prazos continua mostrando o espelho ate o computador confirmar.
// O bloco se atualiza sozinho (dados.aoMudar) e conta o tempo de novo a cada 30 s. Some quando nao ha nenhum pedido.

import { h, preencher } from '../ui.js';
import { icone } from '../icones.js';
import * as dados from '../dados.js';
import { quandoFoi, momentoEmCuiaba } from '../datas.js';
import { detalhesDoPedido, frasePedido } from '../dominio.js';

function cartaoDoComando(c) {
  const quando = quandoFoi(c.enviado_em, Date.now());   // enviado_em e o relogio do aparelho: compara com o mesmo relogio
  const detalhes = detalhesDoPedido(c).map((linha) => h('p', { class: 'comando-detalhe' }, linha));   // o que o pedido de edicao quer mudar
  if (c.estado === 'enviado') {
    return h('div', { class: 'comando comando--enviado' }, icone('relogio'),
      h('div', { class: 'comando-texto' },
        h('p', { class: 'comando-titulo' }, 'Enviado, aguardando o computador'),
        h('p', null, frasePedido(c)), detalhes,
        h('p', { class: 'texto-2' }, `Enviado ${quando}. O computador aplica quando estiver ligado e com internet.`)));
  }
  const botao = h('button', { class: 'botao botao--discreto', type: 'button', onclick: () => dados.dispensarComando(c.id) }, 'Entendi');
  if (c.estado === 'aplicado') {
    const hora = c.aplicado_em ? momentoEmCuiaba(c.aplicado_em) : null;
    // O texto que o computador devolveu (por exemplo "A conferência da data fatal foi zerada..." e o aviso de domingo ou feriado) aparece inteiro: e a
    // parte que o advogado precisa ler. A frase fixa so fica quando o computador nao mandou texto.
    const resultado = typeof c.resultado === 'string' ? c.resultado.trim() : '';
    const linhaDaHora = `${hora ? `Às ${hora.hora}. ` : ''}${resultado ? '' : 'A lista muda quando o computador sincronizar.'}`.trim();
    return h('div', { class: 'comando comando--aplicado' }, icone('ok'),
      h('div', { class: 'comando-texto' },
        h('p', { class: 'comando-titulo' }, 'Aplicado pelo computador'),
        h('p', null, frasePedido(c)), detalhes,
        resultado ? h('p', { class: 'comando-resultado' }, resultado) : null,
        linhaDaHora ? h('p', { class: 'texto-2' }, linhaDaHora) : null,
        botao));
  }
  return h('div', { class: 'comando comando--recusado' }, icone('erro'),
    h('div', { class: 'comando-texto' },
      h('p', { class: 'comando-titulo' }, 'O computador não aplicou'),
      h('p', null, frasePedido(c)), detalhes,
      h('p', null, c.resultado || 'O computador recusou o pedido.'),
      botao));
}

export function blocoDeComandos(alvoId, ctx = null) {
  const caixa = h('div', { class: 'comandos', 'aria-live': 'polite' });
  const desenhar = () => {
    const lista = dados.comandosDoAlvo(alvoId);
    caixa.hidden = lista.length === 0;
    preencher(caixa, lista.map(cartaoDoComando));
  };
  desenhar();
  const desligar = dados.aoMudar(desenhar);
  const relogio = window.setInterval(desenhar, 30000);
  const parar = () => { desligar(); window.clearInterval(relogio); };
  if (ctx) ctx.aoLimpar(parar);
  caixa.parar = parar;
  return caixa;
}
