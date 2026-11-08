// Regras de negocio que mais de uma tela usa: o que e prazo aberto, quando ele esta vencido, o que e "criado pelo sistema",
// como ordenar. Fica num lugar so para a tela Hoje, a lista de Prazos e o detalhe mostrarem sempre a MESMA coisa.
// Modulo puro (sem DOM, sem rede). As regras espelham as do computador (app/api/consultas.py).
//
// Regra do escritorio que o aplicativo nunca esquece: prazo e area de risco. So vale como seguro o prazo com `conferido = 1`.
// O aplicativo mostra "PRAZO NAO CONFERIDO" em todo prazo aberto sem conferencia e nunca conferiu nada sozinho.

import { dataBR, dataComDia, dataValida, diferencaDias, partesDaData } from './datas.js';

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
  prazo_editar: 'Alterar os dados do prazo',
  prazo_excluir: 'Excluir o prazo',
};

/** Os tipos de pedido que o celular sabe fazer (os mesmos de COMANDOS em app/nuvem/esquema.py). */
export const TIPOS_DE_COMANDO = Object.keys(ROTULO_COMANDO);

/** Frase curta do que um comando pede, para a tela dizer "Enviado: ..." */
export function frasePedido(comando) {
  const d = comando.dados || {};
  if (comando.tipo === 'prazo_status') return `Marcar como "${ROTULO_STATUS[d.status] || d.status}"`;
  if (comando.tipo === 'prazo_conferir') return 'Registrar que a data fatal foi conferida';
  if (comando.tipo === 'prazo_editar') return 'Alterar os dados do prazo';
  if (comando.tipo === 'prazo_excluir') return 'Excluir o prazo';
  return ROTULO_COMANDO[comando.tipo] || 'Pedido ao computador';
}

/**
 * Linhas curtas do que um pedido de edicao quer mudar, para a tela mostrar enquanto o computador nao respondeu ("Data fatal: sex, 13/11/2026").
 * Vazio para os outros pedidos. A observacao nao e repetida inteira: so se diz que tem texto novo ou que sera tirada.
 */
export function detalhesDoPedido(comando) {
  if (!comando || comando.tipo !== 'prazo_editar') return [];
  const d = comando.dados || {};
  const tem = (campo) => Object.prototype.hasOwnProperty.call(d, campo);
  const linhas = [];
  if (tem('ato')) linhas.push(`Ato: ${d.ato}`);
  if (tem('data_fatal')) linhas.push(`Data fatal: ${dataComDia(d.data_fatal) || d.data_fatal}`);
  if (tem('data_interna')) linhas.push(d.data_interna ? `Data interna: ${dataComDia(d.data_interna) || d.data_interna}` : 'Data interna: tirar');
  if (tem('observacao')) linhas.push(d.observacao ? 'Observação: texto novo' : 'Observação: tirar');
  return linhas;
}

// ---------------------------------------------------------------- editar o prazo (comando prazo_editar) e excluir (prazo_excluir)
//
// O celular PEDE a mudanca; o computador aplica. Aqui ficam as regras de tamanho e de formato, as MESMAS do computador (app/nuvem/comandos.py):
// a tela de edicao e a camada de dados (dados.js) usam estas funcoes, para o pedido mal feito nunca sair do aparelho e para a frase de erro
// ser a mesma nos dois lugares. Modulo puro (sem DOM, sem rede).

export const CAMPOS_EDITAVEIS = ['ato', 'data_fatal', 'data_interna', 'observacao'];
export const LIMITE_DO_ATO = 300;
export const LIMITE_DA_OBSERVACAO = 1000;
/** A rota do computador aceita nota de ate 500 letras e poe "Pelo celular: " (14) na frente: sobram 486 para a pessoa. */
export const LIMITE_DA_NOTA_DE_EDICAO = 486;
export const LIMITE_DA_NOTA_DE_EXCLUSAO = 500;
export const ANO_MINIMO_DA_DATA = 1900;
export const ANO_MAXIMO_DA_DATA = 2200;
/** O teto de tamanho dos dados de um pedido (bytes de texto): a nuvem recusa 4000; aqui sobra folga para o formato dela. */
export const LIMITE_DE_BYTES_DO_PEDIDO = 3600;

export const FRASE_NAO_EXCLUI_NAO_CUMPRIDO = 'Um prazo marcado como “Não cumprido” não pode ser excluído: o registro fica para controle. '
  + 'Se foi engano, reabra o prazo com uma nota explicando o motivo e peça de novo.';

/** Data AAAA-MM-DD que existe no calendario e esta entre os anos que o computador aceita (1900 a 2200). */
export function dataDoPrazoValida(texto) {
  const p = partesDaData(texto);
  return p !== null && p[0] >= ANO_MINIMO_DA_DATA && p[0] <= ANO_MAXIMO_DA_DATA;
}

/** Texto sem espacos nas pontas e com a quebra de linha sempre igual (CR LF e CR viram LF: a caixa de texto do aparelho sempre usa LF, e so a quebra nao e mudanca). */
const textoLimpo = (v) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : '');

/**
 * Confere um campo do pedido de edicao e devolve `{ valor, erro }`. `valor` ja e o que vai no pedido: ato e observacao sem espacos nas
 * pontas, data como AAAA-MM-DD. Data interna e observacao vazias valem como TIRAR (`valor` nulo). `erro` e uma frase simples ou null.
 */
export function normalizarCampoDoPrazo(campo, bruto) {
  if (campo === 'ato') {
    if (bruto !== null && bruto !== undefined && typeof bruto !== 'string') return { valor: null, erro: 'O ato precisa ser um texto.' };
    const ato = textoLimpo(bruto);
    if (!ato) return { valor: null, erro: 'Escreva o ato do prazo.' };
    if (ato.length > LIMITE_DO_ATO) return { valor: null, erro: `O ato pode ter até ${LIMITE_DO_ATO} letras (tem ${ato.length}).` };
    return { valor: ato, erro: null };
  }
  if (campo === 'data_fatal' || campo === 'data_interna') {
    if (bruto !== null && bruto !== undefined && typeof bruto !== 'string') return { valor: null, erro: 'A data precisa ser escrita como AAAA-MM-DD.' };
    const data = textoLimpo(bruto);
    if (!data) return campo === 'data_fatal' ? { valor: null, erro: 'Escolha a data fatal.' } : { valor: null, erro: null };
    if (!dataValida(data)) return { valor: null, erro: 'Essa data não existe. Escolha uma data real.' };
    if (!dataDoPrazoValida(data)) return { valor: null, erro: `Escolha uma data entre os anos ${ANO_MINIMO_DA_DATA} e ${ANO_MAXIMO_DA_DATA}.` };
    return { valor: data, erro: null };
  }
  if (campo === 'observacao') {
    if (bruto !== null && bruto !== undefined && typeof bruto !== 'string') return { valor: null, erro: 'A observação precisa ser um texto.' };
    const texto = textoLimpo(bruto);
    if (texto.length > LIMITE_DA_OBSERVACAO) return { valor: null, erro: `A observação pode ter até ${LIMITE_DA_OBSERVACAO} letras (tem ${texto.length}).` };
    return { valor: texto || null, erro: null };
  }
  return { valor: null, erro: 'Esse dado do prazo não pode ser mudado pelo celular.' };
}

/** O valor que o prazo tem hoje, na mesma forma que `normalizarCampoDoPrazo` devolve (para comparar). */
export function valorAtualDoCampo(prazo, campo) {
  const bruto = prazo ? prazo[campo] : null;
  if (campo === 'ato') return textoLimpo(bruto);
  return textoLimpo(bruto) || null;       // observacao e datas: vazio e o mesmo que nao ter
}

/** Frase de erro se a data interna passar da data fatal (as duas AAAA-MM-DD ja conferidas), senao null. */
export function erroDaDataInterna(interna, fatal) {
  if (interna && fatal && interna > fatal) return `A data interna (${dataBR(interna)}) não pode ser depois da data fatal (${dataBR(fatal)}).`;
  return null;
}

/**
 * Analisa o que a pessoa quer mudar no prazo. `campos` tem, para cada coisa a conferir, o texto como esta no formulario (ou no pedido):
 * `{ ato, data_fatal, data_interna, observacao }` (so as chaves que existem sao conferidas). `atual` e a linha do prazo (pode ser null).
 * Devolve `{ erros, mudancas, tudo }`:
 *   erros     { campo: frase } para cada campo com problema (so entram campos que a pessoa mudou, ou todos se `conferirTodos`);
 *   mudancas  { campo: valor } so do que e diferente do prazo de hoje (valor nulo = tirar);
 *   tudo      { campo: valor } de todo campo conferido sem erro, mudado ou nao.
 * A data interna nunca pode passar da data fatal, olhando o par que ficaria gravado (o que a pessoa mudou mais o que o prazo ja tem).
 */
export function analisarEdicaoDoPrazo(campos, atual = null, { conferirTodos = false } = {}) {
  const erros = {};
  const mudancas = {};
  const tudo = {};
  for (const campo of CAMPOS_EDITAVEIS) {
    if (!Object.prototype.hasOwnProperty.call(campos, campo)) continue;
    const { valor, erro } = normalizarCampoDoPrazo(campo, campos[campo]);
    const atualDoCampo = atual ? valorAtualDoCampo(atual, campo) : undefined;
    const igual = !erro && atual && valor === atualDoCampo;
    if (erro) {
      // um campo que a pessoa nao tocou nunca trava o pedido (o computador aceita observacao antiga maior que a do celular)
      const intacto = atual && textoLimpo(campos[campo]) === (textoLimpo(atual[campo]) || '');
      if (conferirTodos || !intacto) erros[campo] = erro;
      continue;
    }
    tudo[campo] = valor;
    if (!igual) mudancas[campo] = valor;
  }
  if (!erros.data_interna && !erros.data_fatal && ('data_fatal' in mudancas || 'data_interna' in mudancas)) {
    const fatal = 'data_fatal' in tudo ? tudo.data_fatal : textoLimpo(atual && atual.data_fatal);
    const interna = 'data_interna' in tudo ? tudo.data_interna : textoLimpo(atual && atual.data_interna);
    const erro = erroDaDataInterna(interna, fatal);
    if (erro) erros.data_interna = erro;
  }
  return { erros, mudancas, tudo };
}
