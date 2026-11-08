// Script comum (nao e modulo) que roda ANTES de tudo, ainda no <head>:
//  1. aplica o tema escolhido (claro ou escuro) antes da primeira pintura, para a tela nao piscar;
//  2. se o aplicativo for aberto dentro de outra pagina (moldura), esconde tudo: a hospedagem nao deixa mandar cabecalho
//     anti-moldura, entao esta e a defesa possivel (melhor esforco).
// Nao tem estilo nem script inline: este arquivo e carregado por <script src>.
(function () {
  try {
    var tema = window.localStorage.getItem('gestao.tema');
    if (tema === 'claro' || tema === 'escuro') document.documentElement.setAttribute('data-tema', tema);
  } catch (erro) {
    /* sem armazenamento: vale o tema do aparelho */
  }
  if (window.top !== window.self) document.documentElement.style.setProperty('display', 'none');
  // 3. se o aplicativo nao chegar a iniciar (um arquivo falhou na primeira visita, sinal fraco), a tela ficaria em branco sem explicacao
  window.setTimeout(function () {
    if (window.__gestaoIniciou) return;
    var aviso = document.createElement('div');
    aviso.className = 'aviso-visual';
    aviso.setAttribute('role', 'alert');
    var texto = document.createElement('p');
    texto.textContent = 'O aplicativo não carregou direito (sinal fraco ou bloqueio do navegador). Toque em Recarregar para tentar de novo.';
    var botao = document.createElement('button');
    botao.type = 'button';
    botao.textContent = 'Recarregar';
    botao.addEventListener('click', function () { window.location.reload(); });
    aviso.appendChild(texto);
    aviso.appendChild(botao);
    document.body.insertBefore(aviso, document.body.firstChild);
  }, 8000);
})();
