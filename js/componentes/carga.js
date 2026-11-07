// O que uma tela mostra enquanto os dados ainda nao chegaram (primeira abertura, sem internet e sem copia guardada, ou erro da nuvem).
//
//   const aviso = avisoDeCarga();                 // null quando os dados ja estao carregados
//   if (aviso) { preencher(ctx.raiz, aviso); return; }
//
// A tela Hoje faz o mesmo por conta propria; este arquivo existe para as telas de Mais, Clientes e Financeiro nao repetirem a conta.

import * as dados from '../dados.js';
import { carregando } from './carregando.js';
import { erroDeTela } from './erro.js';

export function avisoDeCarga() {
  const estado = dados.estado();
  if (estado.carregado) return null;
  if (estado.erro && !estado.atualizando) return erroDeTela(estado.erro, { aoTentar: () => dados.atualizar() });
  if (estado.offline && !estado.atualizando) {
    return erroDeTela('Sem conexão e nenhum dado guardado neste aparelho. Conecte-se à internet para baixar os dados.', { titulo: 'Sem dados ainda', aoTentar: () => dados.atualizar() });
  }
  return carregando(estado.progresso ? `Baixando os dados… ${estado.progresso.feitas} de ${estado.progresso.total}` : 'Baixando os dados…');
}
