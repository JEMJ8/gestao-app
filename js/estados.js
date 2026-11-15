// As 27 unidades da federacao: sigla de duas letras -> nome por extenso. Serve a etiqueta de estado das linhas de prazo ("MT", com a dica
// "Mato Grosso"). A UF vem da coluna `uf` do processo, que o aplicativo ja baixa no espelho; nada novo e pedido a nuvem.
// Modulo puro (sem DOM, sem rede). E uma copia deliberada do mapa do sistema do computador (app/web/js/nucleo/estados.js): o aplicativo
// e publicado sozinho e nao importa nada de la; um teste confere que os dois mapas sao iguais.

export const ESTADOS = Object.freeze({
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
});

/** A sigla pronta para mostrar ("mt" e " MT " viram "MT"), ou '' quando nao ha estado conhecido (vazio, nulo, outro tipo, duas letras que nao sao de estado). */
export function siglaDoEstado(valor) {
  if (typeof valor !== 'string') return '';
  const sigla = valor.trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(ESTADOS, sigla) ? sigla : '';
}

/** O nome por extenso ("Mato Grosso") de uma sigla, ou '' se ela nao for de um estado. */
export function nomeDoEstado(valor) {
  const sigla = siglaDoEstado(valor);
  return sigla ? ESTADOS[sigla] : '';
}
