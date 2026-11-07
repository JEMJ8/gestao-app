// Armazenamento local do aparelho (IndexedDB), em volta de uma interface pequena e de promessas.
// Guarda: uma "loja" por tabela do espelho, a loja `comandos` (pedidos ao computador ainda sem resposta) e a loja `meta` (pequenos avisos,
// como a hora da ultima atualizacao). So dados que a nuvem ja entregou a este usuario; nada de senha nem de chave.
//
// Se o navegador nao deixar usar o IndexedDB (janela privada de alguns navegadores, dados bloqueados), `disponivel()` fica falso e
// o aplicativo funciona so com a memoria: perde apenas a copia para ver sem internet. Nenhuma funcao daqui lanca por causa disso.

const NOME_DO_BANCO = 'gestao-jemj';
const VERSAO_DO_BANCO = 1;
// Alguns navegadores (iPhone, modo privado, dados bloqueados) deixam o pedido de abrir o banco pendurado: nem sucesso, nem erro. Sem este limite o
// aplicativo ficaria numa tela em branco; com ele segue sem a copia guardada (so perde o uso sem internet).
const TEMPO_PARA_ABRIR_MS = 6000;

export const TABELAS_DO_ESPELHO = ['pessoa', 'contato', 'processo', 'parte', 'prazo', 'evento', 'comunicacao', 'contrato', 'parcela'];
export const LOJA_COMANDOS = 'comandos';
export const LOJA_META = 'meta';

let promessa = null;
let funcionando = true;

export function disponivel() {
  return funcionando && typeof indexedDB !== 'undefined';
}

function abrir() {
  if (!disponivel()) return Promise.reject(new Error('IndexedDB indisponivel'));
  if (promessa) return promessa;
  promessa = new Promise((resolve, reject) => {
    let pedido;
    let esgotou = false;
    const relogio = window.setTimeout(() => {
      esgotou = true;
      funcionando = false;
      promessa = null;
      reject(new Error('IndexedDB nao respondeu'));
    }, TEMPO_PARA_ABRIR_MS);
    try {
      pedido = indexedDB.open(NOME_DO_BANCO, VERSAO_DO_BANCO);
    } catch (erro) {
      window.clearTimeout(relogio);
      funcionando = false;
      reject(erro);
      return;
    }
    pedido.onupgradeneeded = () => {
      const banco = pedido.result;
      for (const loja of [...TABELAS_DO_ESPELHO, LOJA_COMANDOS]) {
        if (!banco.objectStoreNames.contains(loja)) banco.createObjectStore(loja, { keyPath: 'id' });
      }
      if (!banco.objectStoreNames.contains(LOJA_META)) banco.createObjectStore(LOJA_META, { keyPath: 'chave' });
    };
    pedido.onsuccess = () => {
      const banco = pedido.result;
      window.clearTimeout(relogio);
      if (esgotou) { banco.close(); return; }   // respondeu tarde demais: o aplicativo ja seguiu sem a copia guardada
      banco.onversionchange = () => { banco.close(); promessa = null; };
      resolve(banco);
    };
    pedido.onerror = () => { window.clearTimeout(relogio); funcionando = false; promessa = null; reject(pedido.error); };
    pedido.onblocked = () => reject(new Error('IndexedDB bloqueado'));
  });
  return promessa;
}

function transacao(lojas, modo, trabalho) {
  return abrir().then((banco) => new Promise((resolve, reject) => {
    const tx = banco.transaction(lojas, modo);
    let resultado;
    tx.oncomplete = () => resolve(resultado);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transacao cancelada'));
    resultado = trabalho(tx);
  }));
}

function pedidoParaPromessa(pedido) {
  return new Promise((resolve, reject) => {
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

/** Todas as linhas de uma loja (lista vazia se algo falhar). */
export async function lerTudo(loja) {
  try {
    const banco = await abrir();
    return await pedidoParaPromessa(banco.transaction(loja, 'readonly').objectStore(loja).getAll());
  } catch {
    return [];
  }
}

/** Troca TODO o conteudo de uma loja por `linhas`, numa transacao so (ou tudo, ou nada). */
export async function substituirLoja(loja, linhas) {
  try {
    await transacao([loja], 'readwrite', (tx) => {
      const lojaTx = tx.objectStore(loja);
      lojaTx.clear();
      for (const linha of linhas) lojaTx.put(linha);
    });
    return true;
  } catch {
    return false;
  }
}

export async function gravar(loja, valor) {
  try {
    await transacao([loja], 'readwrite', (tx) => { tx.objectStore(loja).put(valor); });
    return true;
  } catch {
    return false;
  }
}

export async function apagar(loja, chave) {
  try {
    await transacao([loja], 'readwrite', (tx) => { tx.objectStore(loja).delete(chave); });
    return true;
  } catch {
    return false;
  }
}

export async function lerMeta(chave) {
  try {
    const banco = await abrir();
    const linha = await pedidoParaPromessa(banco.transaction(LOJA_META, 'readonly').objectStore(LOJA_META).get(chave));
    return linha ? linha.valor : null;
  } catch {
    return null;
  }
}

export async function gravarMeta(chave, valor) {
  return gravar(LOJA_META, { chave, valor });
}

/** Apaga o banco inteiro (usado ao sair). Devolve true se nao sobrou nada. */
export async function apagarTudo() {
  try {
    if (promessa) {
      const banco = await promessa.catch(() => null);
      if (banco) banco.close();
      promessa = null;
    }
    if (typeof indexedDB === 'undefined') return true;
    return await new Promise((resolve) => {
      const pedido = indexedDB.deleteDatabase(NOME_DO_BANCO);
      pedido.onsuccess = () => resolve(true);
      pedido.onerror = () => resolve(false);
      pedido.onblocked = () => resolve(false);
    });
  } catch {
    return false;
  }
}
