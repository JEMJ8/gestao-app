// Contato de um cadastro (celular, telefone, e-mail, WhatsApp) com as acoes diretas: ligar, mandar e-mail e abrir o WhatsApp.
//
//   blocoDoContato(contato)    -> <li> pronto: tipo, valor, observacao e os botoes
//   acoesDoContato(contato)    -> [{ id, rotulo, href, externo }] (so a logica, sem tela)
//   numeroParaLigar, numeroParaWhatsapp, enderecoDeEmail           (normalizacao, uma por uma)
//
// Regras:
//   - Telefone abre tel:, e-mail abre mailto:. WhatsApp abre https://wa.me/55NUMERO SOMENTE para contato do tipo celular ou whatsapp,
//     nunca para telefone fixo nem para e-mail. O numero e sempre normalizado (so digitos, com 55). O link nunca leva texto de mensagem:
//     o aplicativo nao envia nada, so abre a conversa para a pessoa escrever.
//   - Valor que nao parece telefone ou e-mail de verdade nao vira link (a tela mostra o texto e avisa que o numero esta fora do padrao).
//   - O texto do cadastro e nao confiavel: entra sempre como texto. O endereco do WhatsApp passa por linkExterno (so https, rel noopener).

import { h, linkExterno } from '../ui.js';
import { icone } from '../icones.js';
import { somenteDigitos, telefone } from '../formato.js';
import { selo } from './selo.js';

export const ROTULO_CONTATO = { celular: 'Celular', telefone: 'Telefone', email: 'E-mail', whatsapp: 'WhatsApp' };
const ICONE_DO_CONTATO = { celular: 'telefone', telefone: 'telefone', email: 'email', whatsapp: 'mensagem' };
const TIPOS_DE_TELEFONE = ['celular', 'telefone', 'whatsapp'];
const TIPOS_COM_WHATSAPP = ['celular', 'whatsapp'];
const EMAIL = /^[A-Za-z0-9._%+\x27-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

// ---------------------------------------------------------------- normalizacao

/** Numero do Brasil com DDD, so digitos (10 ou 11), ou null se nao for um numero brasileiro de verdade. Aceita +55, 0055 e o zero antes do DDD. */
export function numeroNacional(valor) {
  const bruto = String(valor ?? '').trim();
  if (!bruto || /[A-Za-z]/.test(bruto)) return null;       // ramal, observacao e outras letras: nao e so um numero
  let d = somenteDigitos(bruto);
  if (bruto.startsWith('+') || bruto.startsWith('00')) {
    if (bruto.startsWith('00')) d = d.slice(2);
    if (!d.startsWith('55')) return null;                   // numero de outro pais
    d = d.slice(2);
  } else {
    d = d.replace(/^0+/, '');                               // zero antes do DDD
    if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  }
  if (d.length === 11) return /^[1-9][1-9]9/.test(d) ? d : null;       // celular: DDD e o 9 na frente
  if (d.length === 10) return /^[1-9][1-9][2-9]/.test(d) ? d : null;   // fixo (ou celular antigo) com DDD
  return null;
}

function numeroDeOutroPais(valor) {
  const bruto = String(valor ?? '').trim();
  if (!bruto.startsWith('+') || /[A-Za-z]/.test(bruto)) return null;
  const d = somenteDigitos(bruto);
  return !d.startsWith('55') && d.length >= 8 && d.length <= 15 ? d : null;
}

/** Texto para o tel: ("+5565999990001"), ou null. Numero local sem DDD (7 a 9 digitos) vai como esta, para a ligacao local. */
export function numeroParaLigar(valor) {
  const nacional = numeroNacional(valor);
  if (nacional) return `+55${nacional}`;
  const fora = numeroDeOutroPais(valor);
  if (fora) return `+${fora}`;
  const bruto = String(valor ?? '').trim();
  if (bruto && !/[A-Za-z+]/.test(bruto)) {
    const d = somenteDigitos(bruto);
    if (d.length >= 7 && d.length <= 9) return d;
  }
  return null;
}

/** Numero para o wa.me: so digitos, com o codigo do pais ("5565999990001"), ou null. */
export function numeroParaWhatsapp(valor) {
  const nacional = numeroNacional(valor);
  if (nacional) return `55${nacional}`;
  return numeroDeOutroPais(valor);
}

/** O endereco de e-mail se tiver cara de e-mail de verdade (sem espaco, aspas nem sinais de tag); senao null. */
export function enderecoDeEmail(valor) {
  const texto = String(valor ?? '').trim();
  return texto.length <= 254 && EMAIL.test(texto) ? texto : null;
}

// ---------------------------------------------------------------- acoes

/** As acoes que o contato oferece: [{ id: 'ligar'|'whatsapp'|'email', rotulo, href, externo }]. Vazio quando o valor nao serve para nada. */
export function acoesDoContato(contato) {
  const tipo = String((contato && contato.tipo) || '');
  const valor = String((contato && contato.valor) ?? '');
  const acoes = [];
  if (TIPOS_DE_TELEFONE.includes(tipo)) {
    const numero = numeroParaLigar(valor);
    if (numero) acoes.push({ id: 'ligar', rotulo: 'Ligar', href: `tel:${numero}`, externo: false });
    if (TIPOS_COM_WHATSAPP.includes(tipo)) {
      const whats = numeroParaWhatsapp(valor);
      if (whats) acoes.push({ id: 'whatsapp', rotulo: 'WhatsApp', href: `https://wa.me/${whats}`, externo: true });
    }
  } else if (tipo === 'email') {
    const endereco = enderecoDeEmail(valor);
    if (endereco) acoes.push({ id: 'email', rotulo: 'Enviar e-mail', href: `mailto:${endereco}`, externo: false });
  }
  return acoes;
}

/** O valor como aparece na tela: telefone formatado quando e um numero do Brasil; o resto como esta. */
export function valorParaMostrar(contato) {
  const valor = String((contato && contato.valor) ?? '').trim();
  if (numeroDeOutroPais(valor)) return valor;           // de outro pais: como foi cadastrado (formatar como DDD brasileiro enganaria)
  return TIPOS_DE_TELEFONE.includes(contato && contato.tipo) ? telefone(valor) : valor;
}

const ICONE_DA_ACAO = { ligar: 'telefone', whatsapp: 'mensagem', email: 'email' };

function botaoDaAcao(acao, exibicao) {
  const conteudo = [icone(ICONE_DA_ACAO[acao.id], { tamanho: 20 }), acao.rotulo];
  const rotuloAcessivel = acao.id === 'ligar' ? `Ligar para ${exibicao}`
    : acao.id === 'whatsapp' ? `Abrir o WhatsApp de ${exibicao}`
      : `Enviar e-mail para ${exibicao}`;
  if (acao.externo) {
    const link = linkExterno(acao.href, conteudo);
    if (link.tagName !== 'A') return null;                  // endereco recusado: sem botao, nunca um link quebrado
    link.classList.add('botao', 'contato-botao');
    link.setAttribute('aria-label', rotuloAcessivel);
    return link;
  }
  return h('a', { class: 'botao contato-botao', href: acao.href, 'aria-label': rotuloAcessivel }, conteudo);
}

/** Linha do contato: tipo (com "Principal"), valor, observacao e os botoes de acao. Devolve <li class="contato">. */
export function blocoDoContato(contato) {
  const tipo = String(contato.tipo || '');
  const exibicao = valorParaMostrar(contato) || 'sem valor';
  const acoes = acoesDoContato(contato).map((a) => botaoDaAcao(a, exibicao)).filter(Boolean);
  const semAcao = !acoes.length && exibicao !== 'sem valor' && (TIPOS_DE_TELEFONE.includes(tipo) || tipo === 'email');
  return h('li', { class: 'contato' },
    h('div', { class: 'contato-dados' },
      h('span', { class: 'contato-tipo' },
        icone(ICONE_DO_CONTATO[tipo] || 'info', { tamanho: 18 }),
        ROTULO_CONTATO[tipo] || 'Contato',
        Number(contato.principal) === 1 ? selo('info', 'Principal') : null),
      h('span', { class: 'contato-valor' }, exibicao),
      contato.observacao ? h('span', { class: 'contato-obs' }, String(contato.observacao)) : null,
      semAcao ? h('span', { class: 'contato-aviso' }, tipo === 'email' ? 'E-mail fora do padrão: confira o cadastro no computador.' : 'Número fora do padrão: confira o cadastro no computador.') : null),
    acoes.length ? h('div', { class: 'contato-acoes' }, acoes) : null);
}
