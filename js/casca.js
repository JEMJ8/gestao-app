// A casca do aplicativo: topo (voltar, titulo, atualizar), faixas de sincronizacao e barra de baixo (Hoje, Prazos, Agenda, Publicações, Mais).
// As telas nao mexem aqui: usam ctx.titulo() e o registro de rota (aba, pai). A casca entrega ao roteador os ganchos de que ele precisa.

import { h, preencher, anunciar } from './ui.js';
import { icone } from './icones.js';
import * as dados from './dados.js';
import * as rotas from './rotas.js';
import { faixasDeSincronia } from './componentes/faixa.js';
import { hojeEmCuiaba } from './datas.js';
import { situacaoDoPrazo, prazoAberto, publicacaoNova } from './dominio.js';

export const ABAS = [
  { id: 'hoje', rotulo: 'Hoje', icone: 'sol', caminho: '/hoje' },
  { id: 'prazos', rotulo: 'Prazos', icone: 'relogio', caminho: '/prazos' },
  { id: 'agenda', rotulo: 'Agenda', icone: 'calendario', caminho: '/agenda' },
  { id: 'publicacoes', rotulo: 'Publicações', icone: 'jornal', caminho: '/publicacoes' },
  { id: 'mais', rotulo: 'Mais', icone: 'mais', caminho: '/mais' },
];

const TITULO_PADRAO = 'Gestão JEMJ';

/** Prazos abertos vencidos ou que vencem hoje: o numero vermelho na aba Prazos. */
function contarPrazosUrgentes() {
  const hoje = hojeEmCuiaba();
  return dados.obter('prazo').filter((p) => prazoAberto(p) && ['vencido', 'hoje'].includes(situacaoDoPrazo(p, hoje).chave)).length;
}

export function montarCasca() {
  const topo = document.getElementById('topo');
  const faixas = document.getElementById('faixas');
  const barra = document.getElementById('barra');
  const conteudo = document.getElementById('conteudo');
  const titulo = document.getElementById('titulo');
  const botaoVoltar = document.getElementById('voltar');
  const botaoAtualizar = document.getElementById('atualizar');

  preencher(botaoVoltar, icone('voltar', { tamanho: 24 }));
  preencher(botaoAtualizar, icone('atualizar', { tamanho: 22 }));
  botaoVoltar.addEventListener('click', () => rotas.voltar());
  botaoAtualizar.addEventListener('click', () => { dados.atualizar(); });

  const itens = new Map();
  for (const aba of ABAS) {
    const contador = h('span', { class: 'barra-contador', hidden: true });
    const item = h('a', { class: 'barra-item', href: `#${aba.caminho}` },
      icone(aba.icone, { tamanho: 24 }),
      h('span', { class: 'barra-rotulo' }, aba.rotulo),
      contador);
    itens.set(aba.id, { item, contador, aba });
  }
  preencher(barra, [...itens.values()].map((x) => x.item));

  topo.hidden = false;
  barra.hidden = false;
  conteudo.classList.remove('sem-barra');

  function desenharFaixas() {
    const estado = dados.estado();
    const lista = faixasDeSincronia(estado, dados.agoraCorrigido());
    preencher(faixas, lista);
    faixas.hidden = lista.length === 0;
    botaoAtualizar.classList.toggle('girando', estado.atualizando);
    botaoAtualizar.disabled = estado.atualizando;
    botaoAtualizar.setAttribute('aria-label', estado.atualizando ? 'Atualizando…' : 'Atualizar agora');
  }

  function definirContador(id, numero, rotuloAcessivel, variante = null) {
    const { contador, item, aba } = itens.get(id);
    contador.hidden = numero === 0;
    contador.textContent = numero > 99 ? '99+' : String(numero);
    contador.classList.toggle('barra-contador--info', variante === 'info');
    item.setAttribute('aria-label', numero ? `${aba.rotulo}, ${rotuloAcessivel}` : aba.rotulo);
  }

  function desenharContadores() {
    const urgentes = contarPrazosUrgentes();
    definirContador('prazos', urgentes, `${urgentes} ${urgentes === 1 ? 'prazo vencido ou para hoje' : 'prazos vencidos ou para hoje'}`);
    const novas = dados.obter('comunicacao').filter(publicacaoNova).length;
    definirContador('publicacoes', novas, `${novas} ${novas === 1 ? 'nova' : 'novas'}`, 'info');
  }

  let anunciouAtualizacao = false;
  const desligar = dados.aoMudar(() => {
    const estado = dados.estado();
    desenharFaixas();
    desenharContadores();
    if (estado.atualizando) anunciouAtualizacao = true;
    else if (anunciouAtualizacao) {
      anunciouAtualizacao = false;
      anunciar(estado.offline ? 'Sem conexão. Mostrando os últimos dados guardados.' : estado.erro ? 'Não foi possível atualizar.' : 'Dados atualizados.');
    }
  });
  const relogio = window.setInterval(desenharFaixas, 30000);   // o "ha 12 min" anda sozinho
  desenharFaixas();
  desenharContadores();

  return {
    parar() { desligar(); window.clearInterval(relogio); },
    ganchos: {
      definirTitulo(texto) {
        titulo.textContent = texto || TITULO_PADRAO;
        document.title = texto ? `${texto} · Gestão JEMJ` : TITULO_PADRAO;
      },
      marcarAba(id) {
        for (const [chave, { item }] of itens) {
          if (chave === id) item.setAttribute('aria-current', 'page');
          else item.removeAttribute('aria-current');
        }
      },
      mostrarVoltar(sim) {
        botaoVoltar.hidden = !sim;
      },
      aoTrocar() {
        desenharContadores();
      },
    },
  };
}
