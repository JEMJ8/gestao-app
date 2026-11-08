// Service worker: guarda SO a casca do aplicativo (HTML, CSS, JS, icones) para ele abrir sem internet.
// Nao guarda nem intercepta nada que nao seja da casca: dados, login e qualquer pedido para outro dominio passam direto,
// sem este arquivo ver o conteudo. Os dados do escritorio ficam no IndexedDB (js/idb.js), nunca aqui.
//
// A cada publicacao: mude VERSAO aqui E em js/versao.js (um teste confere que sao iguais) e confira a lista ARQUIVOS
// (um teste confere que ela tem todos os arquivos da pasta).

const VERSAO = '1.1.1';
const PREFIXO = 'gestao-jemj-casca-';
const CACHE = `${PREFIXO}${VERSAO}`;

// Caminhos relativos a esta pasta (o aplicativo funciona em qualquer subcaminho).
const ARQUIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'config.js',
  'css/tokens.css',
  'css/base.css',
  'css/componentes.css',
  'css/telas.css',
  'css/tela-entrada.css',
  'css/tela-prazos.css',
  'css/tela-publicacoes.css',
  'css/tela-mais.css',
  'css/tela-clientes.css',
  'css/tela-financeiro.css',
  'css/tela-agenda.css',
  'css/tela-processos.css',
  'img/apple-touch-icon.png',
  'img/favicon-32.png',
  'img/icone-192.png',
  'img/icone-512.png',
  'img/icone-maskable-192.png',
  'img/icone-maskable-512.png',
  'js/inicio.js',
  'js/app.js',
  'js/api.js',
  'js/auth.js',
  'js/casca.js',
  'js/dados.js',
  'js/datas.js',
  'js/dominio.js',
  'js/formato.js',
  'js/icones.js',
  'js/idb.js',
  'js/marca.js',
  'js/rotas.js',
  'js/tema.js',
  'js/ui.js',
  'js/versao.js',
  'js/componentes/carregando.js',
  'js/componentes/cartao.js',
  'js/componentes/busca-geral.js',
  'js/componentes/carga.js',
  'js/componentes/comando.js',
  'js/componentes/contato.js',
  'js/componentes/confirmacao.js',
  'js/componentes/consultas-lista.js',
  'js/componentes/filtros-de-lista.js',
  'js/componentes/memoria-calculo.js',
  'js/componentes/texto-da-publicacao.js',
  'js/componentes/texto-leitura.js',
  'js/componentes/erro.js',
  'js/componentes/evento-detalhe.js',
  'js/componentes/faixa.js',
  'js/componentes/filtros.js',
  'js/componentes/folha.js',
  'js/componentes/fotografia-dos-dados.js',
  'js/componentes/linha.js',
  'js/componentes/parcela.js',
  'js/componentes/pessoa.js',
  'js/componentes/selo.js',
  'js/componentes/vazio.js',
  'js/telas/agenda.js',
  'js/telas/ajustes.js',
  'js/telas/clientes.js',
  'js/telas/entrada.js',
  'js/telas/financeiro.js',
  'js/telas/hoje.js',
  'js/telas/mais.js',
  'js/telas/prazos.js',
  'js/telas/processos.js',
  'js/telas/publicacoes.js',
];

const BASE = new URL(self.registration.scope);

function emUrl(relativo) {
  return new URL(relativo, BASE).href;
}

const URLS_DA_CASCA = new Set(ARQUIVOS.map(emUrl));
URLS_DA_CASCA.add(emUrl('index.html'));

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ARQUIVOS.map((a) => new Request(emUrl(a), { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c.startsWith(PREFIXO) && c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;        // outro dominio: nunca toca
  url.hash = '';
  url.search = '';
  if (!URLS_DA_CASCA.has(url.href)) return;                 // so a casca; qualquer outra coisa passa direto
  evento.respondWith(
    caches.open(CACHE)
      .then((cache) => cache.match(url.href))
      .then((guardado) => guardado || fetch(pedido)),
  );
});
