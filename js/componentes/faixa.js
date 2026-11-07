// Faixas no alto da tela sobre a sincronizacao. Sao a resposta a duas perguntas que o advogado faz sempre:
//   "Estes dados estao em dia?"  e  "Estou vendo a copia guardada ou a do momento?"
//
//   - Sempre: "Computador sincronizou há 12 min" (neutra). Passou de 3 horas, ou nunca sincronizou: AMBAR, com a frase
//     "O computador está desligado ou sem internet; prazos novos podem faltar".
//   - Sem internet: "Sem conexão: mostrando os dados de HH:MM".
//   - Falha da nuvem (nao e falta de internet): "Não foi possível atualizar agora".
// A funcao so monta elementos; quem decide quando redesenhar e a casca.

import { h } from '../ui.js';
import { icone } from '../icones.js';
import { quandoFoi, emCuiaba, dataCurta, hojeEmCuiaba } from '../datas.js';
import { LIMITE_COMPUTADOR_ATRASADO_MS } from '../dados.js';

function faixa(variante, nomeIcone, ...texto) {
  return h('div', { class: ['faixa', variante && `faixa--${variante}`], role: variante ? 'status' : null },
    icone(nomeIcone, { tamanho: 18 }),
    h('span', { class: 'faixa-texto' }, texto));
}

/** "08:42" se for de hoje; "08/11 às 08:42" se for de outro dia. */
function horaDoAparelho(ms) {
  const m = emCuiaba(ms);
  if (!m) return '';
  return m.data === hojeEmCuiaba(Date.now()) ? m.hora : `${dataCurta(m.data)} às ${m.hora}`;
}

export function faixasDeSincronia(estado, agoraMs) {
  const faixas = [];
  const c = estado.computador;
  if (estado.carregado || c.conhecido) {
    if (!c.conhecido || c.epoch === null) {
      faixas.push(faixa('atencao', 'alerta', 'Não sei quando o computador sincronizou. Ele pode estar desligado ou sem internet; prazos novos podem faltar.'));
    } else if (c.atrasoMs > LIMITE_COMPUTADOR_ATRASADO_MS) {
      faixas.push(faixa('atencao', 'alerta', `O computador está desligado ou sem internet; prazos novos podem faltar. Última sincronização: ${quandoFoi(c.epoch, agoraMs)}.`));
    } else {
      faixas.push(faixa(null, 'computador', `Computador sincronizou ${quandoFoi(c.epoch, agoraMs)}`));
    }
  }
  if (estado.offline) {
    faixas.push(faixa('info', 'semRede', estado.atualizadoLocalEm
      ? `Sem conexão: mostrando os dados de ${horaDoAparelho(estado.atualizadoLocalEm)}`
      : 'Sem conexão e sem dados guardados neste aparelho.'));
  } else if (estado.erro) {
    faixas.push(faixa('perigo', 'erro', 'Não foi possível atualizar agora. Mostrando os últimos dados guardados.'));
  }
  return faixas;
}
