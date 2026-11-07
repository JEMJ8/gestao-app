// O texto de uma publicacao do DJEN, buscado so quando alguem pede para ler (ele NAO fica guardado no aparelho: so na memoria da visita).
// Mostra "Buscando o texto…", o texto pronto para ler (texto-leitura.js), ou o erro em frase simples com "Tentar de novo".
// Quando o advogado editou o texto no computador, mostra o editado e deixa ver o original.
//
//   const texto = textoDaPublicacao({ id, recolhido: true, sinal: ctx.sinal });
//   cartao.append(texto.elemento);
//   texto.carregar();            // ao abrir a tela de leitura, ou quando a pessoa tocar em "Ler o texto"

import * as dados from '../dados.js';
import { h, preencher } from '../ui.js';
import { icone } from '../icones.js';
import { carregando } from './carregando.js';
import { textoDeLeitura } from './texto-leitura.js';

/** Frase simples para o erro de buscar o texto. Nunca repete o texto tecnico do servidor. */
export function fraseDeErroDoTexto(erro) {
  if (erro && erro.rede) return 'Sem conexão: o texto da publicação só abre com internet, porque ele não fica guardado neste aparelho.';
  if (erro && erro.status === 401) return 'Sua sessão terminou. Entre de novo para ler o texto.';
  if (erro && erro.status === 403) return 'Este acesso não tem permissão para ler o texto.';
  return 'Não foi possível buscar o texto agora. Tente de novo.';
}

export function textoDaPublicacao({ id, recolhido = false, rotulo = 'Texto da publicação', sinal = null }) {
  const elemento = h('div', { class: 'texto-publicacao' });
  let versao = 'editado';
  let resposta = null;
  let buscando = false;

  function mostrar() {
    const original = resposta.original;
    const editado = resposta.editado;
    const temEditado = Boolean(editado) && editado !== original;
    const escolhido = temEditado ? (versao === 'editado' ? editado : original) : resposta.texto;
    const seletor = temEditado
      ? h('div', { class: 'alternador-simples', role: 'group', 'aria-label': 'Qual texto mostrar' },
        ...[['editado', 'Texto editado no computador'], ['original', 'Texto original do Diário']].map(([valor, nome]) => h('button', {
          class: ['chip', valor === versao && 'chip--ativo'], type: 'button', 'aria-pressed': valor === versao ? 'true' : 'false',
          onclick: () => { versao = valor; mostrar(); },
        }, valor === versao ? icone('ok', { tamanho: 16 }) : null, h('span', { class: 'chip-rotulo' }, nome))))
      : null;
    preencher(elemento, seletor, escolhido
      ? textoDeLeitura({ texto: escolhido, recolhido, rotulo }).elemento
      : h('p', { class: 'texto-2' }, 'Esta publicação não tem texto guardado.'));
  }

  async function carregar() {
    if (buscando) return;
    if (resposta) { mostrar(); return; }
    buscando = true;
    preencher(elemento, carregando('Buscando o texto…'));
    try {
      resposta = await dados.carregarTextoPublicacao(id);
      if (sinal && sinal.aborted) return;
      mostrar();
    } catch (erro) {
      if (sinal && sinal.aborted) return;
      preencher(elemento, h('div', { class: 'texto-erro', role: 'alert' },
        icone('semRede', { tamanho: 22 }),
        h('p', null, fraseDeErroDoTexto(erro)),
        h('button', { class: 'botao', type: 'button', onclick: () => carregar() }, icone('atualizar'), 'Tentar de novo')));
    } finally {
      buscando = false;
    }
  }

  return { elemento, carregar };
}
