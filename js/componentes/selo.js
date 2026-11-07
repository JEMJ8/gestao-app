// Selo: etiqueta pequena SEMPRE com texto (e, quando faz sentido, icone). Cor sozinha nunca diz nada.
//   selo('atencao', 'Em produção', { icone: 'relogio' })
// Variantes: 'neutro' | 'perigo' | 'atencao' | 'ok' | 'info'.
// Os selos de dominio abaixo (nao conferido, situacao, status, criado pelo sistema) existem para todas as telas mostrarem o mesmo.

import { h } from '../ui.js';
import { icone } from '../icones.js';
import { ROTULO_STATUS } from '../dominio.js';

export function selo(variante, texto, { icone: nomeIcone = null, forte = false, titulo = null } = {}) {
  return h(
    'span',
    { class: ['selo', variante && variante !== 'neutro' && `selo--${variante}`, forte && 'selo--forte'], title: titulo },
    nomeIcone ? icone(nomeIcone, { tamanho: 14 }) : null,
    texto,
  );
}

/** O aviso mais importante do aplicativo: a data fatal ainda nao foi conferida por uma pessoa. */
export function seloNaoConferido() {
  return selo('atencao', 'PRAZO NÃO CONFERIDO', { icone: 'alerta', forte: true, titulo: 'Ninguém conferiu a data fatal deste prazo' });
}

export function seloConferido() {
  return selo('ok', 'Conferido', { icone: 'ok' });
}

/** O prazo nasceu sem ninguem digitar (o sistema criou a partir de uma publicacao). */
export function seloCriadoPeloSistema() {
  return selo('info', 'Criado pelo sistema', { icone: 'raio', titulo: 'O sistema criou este prazo a partir de uma publicação; confira os dados' });
}

/** Selo da situacao do prazo em relacao a hoje. `situacao` = { chave, dias } de dominio.situacaoDoPrazo. */
export function seloDeSituacao(situacao) {
  switch (situacao.chave) {
    case 'vencido': return selo('perigo', 'Vencido', { icone: 'alerta', forte: true });
    case 'hoje': return selo('atencao', 'Vence hoje', { icone: 'relogio', forte: true });
    case 'proximo': return selo('info', `Em ${situacao.dias} ${situacao.dias === 1 ? 'dia' : 'dias'}`, { icone: 'relogio' });
    default: return null;
  }
}

/** Selo do status (aberto nao leva selo: e o normal). */
export function seloDeStatus(status) {
  const rotulo = ROTULO_STATUS[status] || status;
  switch (status) {
    case 'em_producao': return selo('info', rotulo, { icone: 'relogio' });
    case 'protocolado': return selo('ok', rotulo, { icone: 'ok' });
    case 'cumprido': return selo('ok', rotulo, { icone: 'ok' });
    case 'perdido': return selo('perigo', rotulo, { icone: 'erro' });
    case 'cancelado': return selo('neutro', rotulo, { icone: 'fechar' });
    default: return null;
  }
}
