// Regras de negocio que mais de uma tela usa: o que e prazo aberto, quando ele esta vencido, o que e "criado pelo sistema",
// como ordenar. Fica num lugar so para a tela Hoje, a lista de Prazos e o detalhe mostrarem sempre a MESMA coisa.
// Modulo puro (sem DOM, sem rede). As regras espelham as do computador (app/api/consultas.py).
//
// Regra do escritorio que o aplicativo nunca esquece: prazo e area de risco. So vale como seguro o prazo com `conferido = 1`.
// O aplicativo mostra "PRAZO NAO CONFERIDO" em todo prazo aberto sem conferencia e nunca conferiu nada sozinho.

import { dataValida, diferencaDias } from './datas.js';

// ---------------------------------------------------------------- prazo

export const STATUS_ABERTOS = ['aberto', 'em_producao'];
export const STATUS_ENCERRADOS = ['protocolado', 'cumprido', 'perdido', 'cancelado'];
/** Os estados que o celular pode pedir (comando prazo_status). "perdido" e o "Não cumprido" da tela. */
export const STATUS_DO_COMANDO = ['aberto', 'em_producao', 'protocolado', 'cumprido', 'perdido'];
export const ROTULO_STATUS = {
  aberto: 'Em aberto',
  em_producao: 'Em produção',
  protocolado: 'Protocolado',
  cumprido: 'Cumprido',
  perdido: 'Não cumprido',
  cancelado: 'Cancelado',
};

/** Quantos dias para frente contam como "próximo" (de 1 a 7 dias depois de hoje). */
export const DIAS_PROXIMOS = 7;

export const ROTULO_SITUACAO = {
  vencido: 'Vencido',
  hoje: 'Vence hoje',
  proximo: 'Próximos 7 dias',
  futuro: 'Mais adiante',
  encerrado: 'Encerrado',
};

export function prazoAberto(prazo) {
  return STATUS_ABERTOS.includes(prazo.status);
}

/**
 * { chave, dias } de um prazo. `dias` = data fatal - hoje (negativo = ja passou).
 * chave: 'vencido' | 'hoje' | 'proximo' (1 a 7 dias) | 'futuro' | 'encerrado' (protocolado, cumprido, nao cumprido ou cancelado).
 * `hoje` e a data de Cuiaba (datas.hojeEmCuiaba()).
 * NUNCA lanca erro: um prazo cuja data fatal nao existe no calendario (o computador nao deixa gravar assim, mas a nuvem e dado de fora) nao pode
 * derrubar Hoje, a barra de baixo nem as listas. Prazo aberto assim conta como VENCIDO (prazo faltando e risco; silencio nunca), com `dias` = NaN
 * e `dataInvalida` verdadeiro, para a linha dele avisar que a data nao e entendida.
 */
export function situacaoDoPrazo(prazo, hoje) {
  if (!dataValida(prazo.data_fatal)) return { chave: prazoAberto(prazo) ? 'vencido' : 'encerrado', dias: NaN, dataInvalida: true };
  const dias = diferencaDias(hoje, prazo.data_fatal);
  if (!prazoAberto(prazo)) return { chave: 'encerrado', dias };
  if (dias < 0) return { chave: 'vencido', dias };
  if (dias === 0) return { chave: 'hoje', dias };
  if (dias <= DIAS_PROXIMOS) return { chave: 'proximo', dias };
  return { chave: 'futuro', dias };
}

/** Prazo aberto cuja data fatal ninguem conferiu: nunca e seguro. */
export function prazoNaoConferido(prazo) {
  return prazoAberto(prazo) && Number(prazo.conferido) !== 1;
}

// ---------------------------------------------------------------- origem do prazo

/**
 * Origens que significam "o sistema criou, ninguem digitou". O valor "djen_automatico" e o que a nuvem usa para isso; os outros
 * sao nomes que o computador ja usa na auditoria. Se o computador passar a gravar outro valor, e SO aqui que se muda.
 */
export const ORIGENS_AUTOMATICAS = ['djen_automatico', 'agente', 'sistema', 'ia'];

export const ROTULO_ORIGEM = {
  manual: 'Cadastro manual',
  importacao: 'Importado da planilha',
  djen: 'A partir de uma publicação do DJEN',
  djen_automatico: 'Criado pelo sistema a partir do DJEN',
  calculadora: 'Calculadora de prazos',
  agente: 'Criado pelo sistema',
  sistema: 'Criado pelo sistema',
  ia: 'Criado pelo sistema',
};

export function criadoAutomaticamente(prazo) {
  // O computador marca o prazo criado sozinho na coluna criado_automaticamente (migracao 0016, D87); a origem segue sendo a do DJEN.
  return Number(prazo.criado_automaticamente) === 1 || ORIGENS_AUTOMATICAS.includes(prazo.origem);
}

export function rotuloDaOrigem(origem) {
  return ROTULO_ORIGEM[origem] || 'Origem não informada';
}

/** Mais urgente primeiro: data fatal, depois o nao conferido, depois o ato e o id (ordem sempre igual). Devolve uma lista nova. */
export function ordenarPorDataFatal(prazos) {
  return [...prazos].sort((a, b) => (
    (a.data_fatal < b.data_fatal ? -1 : a.data_fatal > b.data_fatal ? 1 : 0)
    || (Number(a.conferido) - Number(b.conferido))
    || String(a.ato || '').localeCompare(String(b.ato || ''), 'pt-BR')
    || String(a.id).localeCompare(String(b.id))
  ));
}

/** A memoria de calculo do prazo ja lida (objeto), ou null se nao houver ou estiver quebrada. Formato: docs/CELULAR-APP.md. */
export function memoriaDoPrazo(prazo) {
  if (!prazo || !prazo.calculo_memoria) return null;
  try {
    const memoria = JSON.parse(prazo.calculo_memoria);
    return memoria && typeof memoria === 'object' && !Array.isArray(memoria) ? memoria : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- agenda

export const ROTULO_EVENTO = {
  audiencia: 'Audiência',
  reuniao: 'Reunião',
  pericia: 'Perícia',
  compromisso: 'Compromisso',
  lembrete: 'Lembrete',
  prazo_interno: 'Prazo interno',
};

/** Eventos que contam como "ainda vai acontecer" (nao cancelados nem realizados). */
export function eventoPendente(evento) {
  return evento.situacao === 'agendado';
}

// ---------------------------------------------------------------- publicacao (comunicacao do DJEN)

export const ROTULO_PUBLICACAO = {
  nova: 'Nova',
  em_revisao: 'Em revisão',
  confirmada: 'Confirmada',
  sem_prazo: 'Sem prazo',
  descartada: 'Descartada',
};

/** Publicacao que ainda espera a leitura do advogado. */
export function publicacaoNova(comunicacao) {
  return comunicacao.situacao === 'nova' || comunicacao.situacao === 'em_revisao';
}

// ---------------------------------------------------------------- comandos do celular

export const ROTULO_COMANDO = {
  prazo_status: 'Mudar a situação do prazo',
  prazo_conferir: 'Conferir a data fatal',
};

/** Frase curta do que um comando pede, para a tela dizer "Enviado: ..." */
export function frasePedido(comando) {
  const d = comando.dados || {};
  if (comando.tipo === 'prazo_status') return `Marcar como "${ROTULO_STATUS[d.status] || d.status}"`;
  if (comando.tipo === 'prazo_conferir') return 'Registrar que a data fatal foi conferida';
  return ROTULO_COMANDO[comando.tipo] || 'Pedido ao computador';
}
