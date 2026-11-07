// Memoria de calculo do prazo, em frases curtas em portugues. NUNCA mostra JSON cru.
//
// O computador guarda no prazo (campo calculo_memoria) um JSON de "versao 1" (app/agente_djen/memoria.py, docs/CONTAGEM.md): a entrada
// (dias, tipo de dias, disponibilizacao), os passos (publicacao, primeiro dia contado, data fatal), a lista dia a dia (contado ou nao contado,
// com o motivo), os avisos, as regras e, nas memorias novas, os dias pulados antes da publicacao, a prorrogacao e a abrangencia dos feriados.
// Aqui esse JSON vira uma lista de frases ("Prazo de 15 dias úteis.", "Pulou seg, 02/11/2026. Feriado nacional: Finados.",
// "O prazo venceria em ..., mas ... Por isso passou para ...").
//
// Regras deste modulo:
//   - memoria ausente, quebrada ou de formato inesperado nao quebra a tela: devolve `lida: false` e a tela diz isso em palavras;
//   - tudo que vem do JSON e texto de terceiros: so entra na tela como texto (h() com filhos de texto), cortado em tamanho razoavel;
//   - o aviso critico NUNCA fica escondido; os avisos aparecem sempre, do mais grave para o menos grave;
//   - o aviso "este calculo NAO dobrou o prazo" fica fora (decisao do advogado de 08/10/2026, igual ao computador); o fato "contado em dobro" aparece;
//   - nao confere nem decide nada: so conta o que o computador gravou.

import { h } from '../ui.js';
import { icone } from '../icones.js';
import { dataBR, dataComDia, dataValida, momentoEmCuiaba, somarDias } from '../datas.js';
import { memoriaDoPrazo } from '../dominio.js';
import { cartao } from './cartao.js';

const MAX_DIAS = 400;
const MAX_TEXTO = 400;
const MAX_AVISOS = 30;
const MAX_REGRAS = 20;

const ROTULO_DO_MOTIVO = {
  fim_de_semana: 'Fim de semana',
  feriado: 'Feriado',
  recesso: 'Recesso',
  suspensao: 'Suspensão dos prazos',
  ponto_facultativo: 'Ponto facultativo',
  indisponibilidade_sistema: 'Sistema do tribunal indisponível',
};
const ROTULO_DO_FERIADO = {
  nacional: 'Feriado nacional',
  tribunal: 'Feriado forense do tribunal',
  comarca: 'Feriado local',
  municipio: 'Feriado municipal',
};
const NIVEIS = ['critico', 'aviso', 'info'];
const ROTULO_DO_NIVEL = { critico: 'Crítico', aviso: 'Atenção', info: 'Informação' };
const AVISO_DE_DOBRO_QUE_NAO_FOI_USADO = /N[ÃA]O dobrou o prazo/i;

// ---------------------------------------------------------------- leitura defensiva

const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const lista = (v) => (Array.isArray(v) ? v : []);
const data = (v) => (typeof v === 'string' && dataValida(v) ? v : '');
const inteiroPositivo = (v) => (Number.isInteger(v) && v > 0 ? v : null);

function texto(v, max = MAX_TEXTO) {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return '';
  const limpo = v.replace(/\s+/g, ' ').trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1).trimEnd()}…` : limpo;
}

function proprio(o, chave) {
  return Object.prototype.hasOwnProperty.call(o, chave);
}

function rotuloDoMotivo(dia, abrangencias) {
  const motivo = texto(dia.motivo, 60);
  if (motivo === 'feriado') {
    const abrangencia = proprio(abrangencias, dia.data) ? abrangencias[dia.data] : '';
    return proprio(ROTULO_DO_FERIADO, abrangencia) ? ROTULO_DO_FERIADO[abrangencia] : 'Feriado';
  }
  return proprio(ROTULO_DO_MOTIVO, motivo) ? ROTULO_DO_MOTIVO[motivo] : (texto(dia.descricao, 80) || 'Dia que não conta');
}

/** "Feriado nacional: Finados." (motivo, dois pontos, descricao do calendario; so o motivo se a descricao repetir o mesmo). */
function razaoDoDia(dia, abrangencias) {
  const rotulo = rotuloDoMotivo(dia, abrangencias);
  if (dia.motivo === 'fim_de_semana') return rotulo;      // a descricao do calendario so repete o nome do dia
  const descricao = texto(dia.descricao, 200);
  return descricao && descricao.toLowerCase() !== rotulo.toLowerCase() ? `${rotulo}: ${descricao}` : rotulo;
}

function baseDoDia(dia) {
  const nomes = [];
  for (const f of lista(dia.fundamentos)) {
    const nome = texto(objeto(f) && f.identificacao, 120);
    if (nome && !nomes.includes(nome)) nomes.push(nome);
  }
  return nomes.slice(0, 2);
}

/** Garante o ponto final sem dobrar o que o calendario ja trouxe ("... (CPC art. 220)" ganha ponto; "... Finados." fica como esta). */
function fecharFrase(t) {
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** Dois dias nao contados seguidos se juntam numa frase so quando entre eles so ha fim de semana. */
function saoSeguidos(a, b, fimsDeSemana) {
  for (let x = somarDias(a, 1), n = 0; x < b; x = somarDias(x, 1), n += 1) {
    if (n > 7 || !fimsDeSemana.has(x)) return false;
  }
  return true;
}

function agruparPulados(pulados, fimsDeSemana) {
  const grupos = [];
  for (const d of pulados) {
    const ultimo = grupos[grupos.length - 1];
    const igual = ultimo && ultimo.motivo === d.motivo && ultimo.descricao === d.descricao && d.data > ultimo.fim && saoSeguidos(ultimo.fim, d.data, fimsDeSemana);
    if (igual) {
      ultimo.fim = d.data;
      ultimo.dias.push(d);
    } else {
      grupos.push({ motivo: d.motivo, descricao: d.descricao, de: d.data, fim: d.data, dias: [d] });
    }
  }
  return grupos;
}

// ---------------------------------------------------------------- a interpretacao

/**
 * Transforma a memoria (objeto ja lido do JSON) em:
 *   { lida, passos: [{ texto, tipo }], avisos: [{ nivel, texto, codigo }], regras: [{ nome, texto }], diaADia: [{ data, contado, texto }],
 *     contados, pulados, geradoEm }
 * `lida` e falso quando nao ha nada reconhecivel (a tela entao explica que o formato nao e entendido). `tipo` do passo: 'passo' ou 'pulo'.
 */
export function interpretarMemoria(bruta) {
  const saida = { lida: false, passos: [], avisos: [], regras: [], diaADia: [], contados: 0, pulados: 0, geradoEm: '' };
  const memoria = objeto(bruta);
  if (!memoria) return saida;
  const entrada = objeto(memoria.entrada) || {};
  const passos = objeto(memoria.passos) || {};
  const abrangencias = objeto(memoria.abrangencias) || {};
  const dias = lista(memoria.dias).slice(0, MAX_DIAS).map(objeto)
    .filter((d) => d && data(d.data) && (d.situacao === 'contado' || d.situacao === 'nao_contado'))
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const naoContados = dias.filter((d) => d.situacao === 'nao_contado');
  const contados = dias.filter((d) => d.situacao === 'contado');
  const fimsDeSemana = new Set(naoContados.filter((d) => d.motivo === 'fim_de_semana').map((d) => d.data));
  const frase = (t, tipo = 'passo') => saida.passos.push({ texto: t, tipo });

  // 1. o prazo
  const quantos = inteiroPositivo(entrada.dias);
  const tipoDias = entrada.tipo_dias === 'corridos' ? 'corridos' : entrada.tipo_dias === 'uteis' ? 'uteis' : '';
  if (quantos && tipoDias) {
    const unidade = tipoDias === 'uteis' ? (quantos === 1 ? 'dia útil' : 'dias úteis') : (quantos === 1 ? 'dia corrido' : 'dias corridos');
    let t = `Prazo de ${quantos} ${unidade}`;
    const efetivos = inteiroPositivo(passos.dias_efetivos);
    if (entrada.dobro === true) t += efetivos && efetivos !== quantos ? `, contado em dobro (${efetivos} dias)` : ', contado em dobro';
    if (entrada.regime === 'juizados') t += ', pela regra dos Juizados Especiais';
    t += '.';
    const comarca = texto(entrada.comarca, 80);
    if (comarca) t += ` Comarca considerada: ${comarca}.`;
    frase(t);
  }

  // 2. disponibilizacao e publicacao
  const disponibilizacao = data(entrada.data_disponibilizacao);
  if (disponibilizacao) frase(`Disponibilizada no Diário em ${dataComDia(disponibilizacao)}.`);
  const antes = lista(memoria.dias_antes_da_publicacao).map(objeto).filter((d) => d && data(d.data));
  if (antes.length) {
    frase(`A publicação vale no primeiro dia útil depois da disponibilização. Por isso não valeram: ${antes.map((d) => `${dataComDia(d.data)} (${razaoDoDia(d, abrangencias)})`).join('; ')}.`, 'pulo');
  }
  const publicacao = data(passos.data_publicacao);
  const informada = data(entrada.data_publicacao_informada);
  if (informada) frase(`A data da publicação foi informada à mão: ${dataComDia(informada)}.`);
  else if (publicacao) frase(`Publicação considerada em ${dataComDia(publicacao)}.`);

  // 3. a contagem
  const primeiro = data(passos.primeiro_dia_contado);
  if (primeiro) frase(`A contagem começou em ${dataComDia(primeiro)}. O dia da publicação não conta.`);

  const pulados = naoContados.filter((d) => d.motivo !== 'fim_de_semana');
  for (const g of agruparPulados(pulados, fimsDeSemana)) {
    const quando = g.de === g.fim ? `Pulou ${dataComDia(g.de)}.` : `Pulou de ${dataComDia(g.de)} a ${dataComDia(g.fim)}.`;
    const base = baseDoDia(g.dias[0]);
    const semDocumento = g.dias.some((d) => d.sem_documento === true);
    frase(`${quando} ${fecharFrase(razaoDoDia(g.dias[0], abrangencias))}${base.length ? ` Base: ${base.join('; ')}.` : ''}${semDocumento ? ' Este dia ainda não tem documento oficial cadastrado.' : ''}`, 'pulo');
  }
  if (fimsDeSemana.size) {
    frase(`Não contou ${fimsDeSemana.size === 1 ? '1 dia' : `${fimsDeSemana.size} dias`} de fim de semana.`, 'pulo');
  }

  // 4. vencimento adiado
  const nominal = data(passos.vencimento_nominal);
  const fatal = data(passos.data_fatal);
  if (nominal && fatal && nominal !== fatal) {
    const prorrogacao = objeto(memoria.prorrogacao);
    let causa = 'esse dia não conta';
    if (prorrogacao && prorrogacao.tipo_prorrogacao === 'indisponibilidade_sistema') causa = 'nesse dia o sistema do tribunal esteve indisponível';
    else if (prorrogacao && data(prorrogacao.data)) causa = `esse dia não é dia útil (${razaoDoDia(prorrogacao, abrangencias)})`;
    else if (fimsDeSemana.has(nominal)) causa = 'esse dia é fim de semana';
    frase(`O prazo venceria em ${dataComDia(nominal)}, mas ${causa}. Por isso passou para ${dataComDia(fatal)}.`, 'pulo');
  }

  // 5. o resultado
  if (fatal) frase(`A data fatal calculada é ${dataComDia(fatal)}.`);
  const interna = data(passos.data_interna);
  if (interna) frase(`O sistema sugeriu a data interna ${dataComDia(interna)}, para você ter folga.`);

  // dia a dia
  for (const d of dias) {
    if (d.situacao === 'contado') {
      const n = inteiroPositivo(d.n);
      saida.diaADia.push({ data: d.data, contado: true, texto: `${n ? `Dia ${n}` : 'Contou'}: ${dataComDia(d.data)}` });
    } else {
      saida.diaADia.push({ data: d.data, contado: false, texto: `Não contou: ${dataComDia(d.data)} (${razaoDoDia(d, abrangencias)})` });
    }
  }
  saida.contados = contados.length;
  saida.pulados = naoContados.length;

  // avisos
  const avisos = [];
  for (const bruto of lista(memoria.avisos).slice(0, MAX_AVISOS)) {
    const a = typeof bruto === 'string' ? { texto: bruto } : objeto(bruto);
    const t = a && texto(a.texto, 600);
    if (!t) continue;
    if (a.codigo === 'dobro_possivel' && AVISO_DE_DOBRO_QUE_NAO_FOI_USADO.test(t)) continue;
    avisos.push({ nivel: NIVEIS.includes(a.nivel) ? a.nivel : 'aviso', texto: t, codigo: texto(a.codigo, 60) });
  }
  saida.avisos = avisos.map((a, i) => ({ a, i })).sort((x, y) => NIVEIS.indexOf(x.a.nivel) - NIVEIS.indexOf(y.a.nivel) || x.i - y.i).map(({ a }) => a);

  // regras
  const textos = objeto(memoria.regras_texto) || {};
  for (const bruta of lista(memoria.regras_aplicadas).slice(0, MAX_REGRAS)) {
    const nome = texto(bruta, 120);
    if (nome) saida.regras.push({ nome, texto: proprio(textos, nome) ? texto(textos[nome], 400) : '' });
  }

  if (typeof memoria.gerado_em === 'string') {
    const m = momentoEmCuiaba(memoria.gerado_em);
    if (m) saida.geradoEm = `${dataBR(m.data)} às ${m.hora}`;
  }
  saida.lida = saida.passos.length > 0 || saida.avisos.length > 0 || saida.diaADia.length > 0;
  return saida;
}

// ---------------------------------------------------------------- a tela

function blocoDeAviso(a) {
  const nome = a.nivel === 'info' ? 'info' : 'alerta';
  return h('li', { class: ['aviso', `aviso--${a.nivel}`] }, icone(nome, { tamanho: 20 }),
    h('p', { class: 'aviso-texto' }, h('strong', null, `${ROTULO_DO_NIVEL[a.nivel]}: `), a.texto));
}

function recolhivel(titulo, conteudo) {
  return h('details', { class: 'recolher' },
    h('summary', null, icone('seta', { tamanho: 18, classe: 'recolher-seta' }), h('span', null, titulo)),
    h('div', { class: 'recolher-corpo' }, conteudo));
}

/** O cartao "Como o prazo foi contado" do detalhe. Sempre devolve um cartao: sem memoria, ele diz isso em palavras. */
export function memoriaDeCalculo(prazo) {
  const corpo = [];
  const diferente = prazo.data_fatal_calculada && prazo.data_fatal && prazo.data_fatal_calculada !== prazo.data_fatal;
  if (diferente) {
    corpo.push(h('ul', { class: 'avisos' }, h('li', { class: 'aviso aviso--aviso' }, icone('alerta', { tamanho: 20 }),
      h('p', { class: 'aviso-texto' }, h('strong', null, 'Atenção: '),
        `a data fatal que vale hoje (${dataComDia(prazo.data_fatal)}) é diferente da calculada pelo sistema (${dataComDia(prazo.data_fatal_calculada)}). A data foi alterada depois do cálculo.`))));
  }
  const bruta = memoriaDoPrazo(prazo);
  const lida = bruta ? interpretarMemoria(bruta) : null;

  if (lida && lida.lida) {
    if (lida.avisos.length) corpo.push(h('ul', { class: 'avisos' }, lida.avisos.map(blocoDeAviso)));
    if (lida.passos.length) {
      corpo.push(h('ol', { class: 'memoria-passos' }, lida.passos.map((p) => h('li', { class: ['memoria-passo', p.tipo === 'pulo' && 'memoria-passo--pulo'] }, p.texto))));
    }
    if (lida.diaADia.length) {
      corpo.push(recolhivel(`Ver dia a dia (${lida.contados} contados, ${lida.pulados} que não contaram)`,
        h('ul', { class: 'memoria-dias' }, lida.diaADia.map((d) => h('li', { class: ['memoria-dia', !d.contado && 'memoria-dia--pulo'] }, d.texto)))));
    }
    if (lida.regras.length) {
      corpo.push(recolhivel('Regras usadas', h('ul', { class: 'memoria-regras' },
        lida.regras.map((r) => h('li', null, h('strong', null, r.nome), r.texto ? `: ${r.texto}` : '')))));
    }
    if (lida.geradoEm) corpo.push(h('p', { class: 'texto-2 texto-pequeno' }, `Contagem feita pelo computador em ${lida.geradoEm}.`));
  } else if (prazo.calculo_memoria) {
    corpo.push(h('p', null, 'A memória de cálculo deste prazo está em um formato que o celular não entende. Veja a contagem no computador.'));
  } else {
    corpo.push(h('p', null, 'Este prazo não tem memória de cálculo guardada. Isso é normal quando a data foi digitada à mão ou veio da planilha: a data fatal vale, mas não há a conta dia a dia para conferir aqui.'));
  }

  if (!(lida && lida.passos.length)) {
    // sem a memoria, o que o proprio prazo sabe sobre a contagem
    const quantos = inteiroPositivo(prazo.dias);
    const tipo = prazo.tipo_dias === 'corridos' ? 'corridos' : prazo.tipo_dias === 'uteis' ? 'úteis' : '';
    const partes = [];
    if (quantos && tipo) partes.push(`Prazo registrado: ${quantos} ${tipo === 'úteis' ? (quantos === 1 ? 'dia útil' : 'dias úteis') : (quantos === 1 ? 'dia corrido' : 'dias corridos')}.`);
    if (texto(prazo.regra_ref, 120)) partes.push(`Regra: ${texto(prazo.regra_ref, 120)}.`);
    if (partes.length) corpo.push(h('p', null, partes.join(' ')));
  }
  return cartao({ titulo: 'Como o prazo foi contado', icone: 'relogio', classe: 'cartao--memoria' }, corpo);
}
