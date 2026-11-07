// Tela Hoje: o que exige atencao agora.
// Ordem (pensada para o celular): saudacao, semaforo (vencidos, hoje, proximos 7 dias), o aviso PRAZO NAO CONFERIDO (sempre visivel),
// os prazos que pedem acao, as audiencias de hoje e amanha, as publicacoes novas e os proximos prazos.
//
// Esta e a tela-modelo do aplicativo: mostra como ler dados de js/dados.js, usar os componentes e reagir a mudancas.

import { registrar, href } from '../rotas.js';
import * as dados from '../dados.js';
import { h, preencher } from '../ui.js';
import { icone } from '../icones.js';
import { agoraEmCuiaba, dataExtenso, somarDias } from '../datas.js';
import { plural } from '../formato.js';
import { criadoAutomaticamente } from '../dominio.js';
import { cartao } from '../componentes/cartao.js';
import { lista, linhaDePrazo, linhaDeEvento, linhaDePublicacao } from '../componentes/linha.js';
import { vazio } from '../componentes/vazio.js';
import { carregando } from '../componentes/carregando.js';
import { erroDeTela } from '../componentes/erro.js';

const LINHAS_DE_ATENCAO = 8;
const LINHAS_DOS_PROXIMOS = 5;
const LINHAS_DE_PUBLICACOES = 3;

function saudacao(minutos) {
  const hora = Math.floor(minutos / 60);
  if (hora < 5) return 'Boa noite';
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

function cartaoDoSemaforo({ variante, nomeIcone, rotulo, numero, destino }) {
  return h('a', {
    class: ['semaforo', `semaforo--${variante}`, numero === 0 && 'semaforo--zero'],
    href: destino,
    'aria-label': `${rotulo}: ${numero}. Abrir a lista.`,
  },
  h('span', { class: 'semaforo-topo' }, icone(nomeIcone, { tamanho: 20 }), h('span', { class: 'semaforo-numero' }, String(numero))),
  h('span', { class: 'semaforo-rotulo' }, rotulo));
}

function cartaoNaoConferido(naoConferidos) {
  const n = naoConferidos.length;
  if (n === 0) {
    return cartao({ variante: 'ok', titulo: 'Todos os prazos abertos estão conferidos', icone: 'ok' });
  }
  const automaticos = naoConferidos.filter(criadoAutomaticamente).length;
  return cartao(
    {
      variante: 'atencao',
      titulo: `PRAZO NÃO CONFERIDO: ${n}`,
      icone: 'alerta',
      classe: 'cartao--nao-conferido',
    },
    h('p', null, n === 1
      ? 'A data fatal de 1 prazo aberto ainda não foi conferida por uma pessoa. Não confie nela até conferir.'
      : `As datas fatais de ${n} prazos abertos ainda não foram conferidas por uma pessoa. Não confie nelas até conferir.`),
    automaticos
      ? h('p', { class: 'texto-pequeno' }, `${plural(automaticos, 'foi criado', 'foram criados')} pelo sistema a partir de publicações.`)
      : null,
    h('p', { class: 'cartao-acao' }, h('a', { class: 'botao botao--cheio', href: href('/prazos', {}, { nao_conferidos: '1' }) }, 'Ver os prazos não conferidos')),
  );
}

function secao(titulo, linkTexto, destino) {
  return h('h2', { class: 'secao-titulo' }, titulo, linkTexto ? h('a', { class: 'secao-link', href: destino }, linkTexto) : null);
}

function desenhar(raiz, hoje) {
  const estado = dados.estado();
  if (!estado.carregado) {
    preencher(raiz, estado.erro && !estado.atualizando
      ? erroDeTela(estado.erro, { aoTentar: () => dados.atualizar() })
      : estado.offline && !estado.atualizando
        ? erroDeTela('Sem conexão e nenhum dado guardado neste aparelho. Conecte-se à internet para baixar os dados.', { titulo: 'Sem dados ainda', aoTentar: () => dados.atualizar() })
        : carregando(estado.progresso ? `Baixando os dados… ${estado.progresso.feitas} de ${estado.progresso.total}` : 'Baixando os dados…'));
    return;
  }

  const agora = agoraEmCuiaba();
  const grupos = dados.prazosPorSituacao(hoje);
  const atencao = [...grupos.vencidos, ...grupos.hoje];
  const amanha = somarDias(hoje, 1);
  const audiencias = dados.eventosEntre(hoje, amanha).filter((e) => e.tipo === 'audiencia' || e.tipo === 'pericia');
  const novas = dados.publicacoesNovas();

  preencher(
    raiz,
    h('header', { class: 'hoje-cabeca' },
      h('p', { class: 'hoje-saudacao' }, saudacao(agora.minutos)),
      h('p', { class: 'texto-2' }, dataExtenso(hoje))),

    h('div', { class: 'semaforos' },
      cartaoDoSemaforo({ variante: 'perigo', nomeIcone: 'alerta', rotulo: 'Vencidos', numero: grupos.vencidos.length, destino: href('/prazos', {}, { situacao: 'vencido' }) }),
      cartaoDoSemaforo({ variante: 'atencao', nomeIcone: 'relogio', rotulo: 'Vencem hoje', numero: grupos.hoje.length, destino: href('/prazos', {}, { situacao: 'hoje' }) }),
      cartaoDoSemaforo({ variante: 'info', nomeIcone: 'calendario', rotulo: 'Próximos 7 dias', numero: grupos.proximos.length, destino: href('/prazos', {}, { situacao: 'proximo' }) })),

    cartaoNaoConferido(grupos.naoConferidos),

    secao('Prazos que pedem atenção', atencao.length > LINHAS_DE_ATENCAO ? `Ver todos (${atencao.length})` : null, href('/prazos', {}, { situacao: 'atencao' })),
    atencao.length
      ? cartao({ corpo: 'lista', rotulo: 'Prazos vencidos e que vencem hoje' }, lista(atencao.slice(0, LINHAS_DE_ATENCAO).map((p) => linhaDePrazo(p, { hoje }))))
      : cartao({ corpo: 'lista', rotulo: 'Nenhum prazo pede atenção' }, vazio({ icone: 'ok', variante: 'ok', titulo: 'Nada vencido nem para hoje', texto: 'Nenhum prazo aberto está vencido ou vence hoje.' })),

    secao('Audiências de hoje e amanhã', 'Agenda', href('/agenda')),
    audiencias.length
      ? cartao({ corpo: 'lista', rotulo: 'Audiências de hoje e amanhã' }, lista(audiencias.map((e) => linhaDeEvento(e, { hoje }))))
      : h('p', { class: 'texto-2 hoje-nada' }, 'Nenhuma audiência hoje nem amanhã.'),

    secao('Publicações novas', 'Ver todas', href('/publicacoes')),
    novas.length
      ? cartao({ corpo: 'lista', rotulo: 'Publicações novas' },
        h('p', { class: 'hoje-contagem' }, icone('jornal', { tamanho: 18 }), plural(novas.length, 'publicação nova esperando leitura', 'publicações novas esperando leitura')),
        lista(novas.slice(0, LINHAS_DE_PUBLICACOES).map((c) => linhaDePublicacao(c))))
      : h('p', { class: 'texto-2 hoje-nada' }, 'Nenhuma publicação nova.'),

    grupos.proximos.length
      ? [
        secao('Próximos 7 dias', grupos.proximos.length > LINHAS_DOS_PROXIMOS ? `Ver todos (${grupos.proximos.length})` : null, href('/prazos', {}, { situacao: 'proximo' })),
        cartao({ corpo: 'lista', rotulo: 'Prazos dos próximos 7 dias' }, lista(grupos.proximos.slice(0, LINHAS_DOS_PROXIMOS).map((p) => linhaDePrazo(p, { hoje })))),
      ]
      : null,
  );
}

registrar('/hoje', async (ctx) => {
  ctx.titulo('Hoje');
  let diaDesenhado = null;
  const redesenhar = () => {
    diaDesenhado = agoraEmCuiaba().data;
    desenhar(ctx.raiz, diaDesenhado);
  };
  redesenhar();
  ctx.aoMudarDados(redesenhar);
  ctx.aoVirarODia(redesenhar);
}, { aba: 'hoje' });
