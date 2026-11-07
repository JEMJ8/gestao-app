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
})();
