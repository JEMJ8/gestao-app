// Configuracao PUBLICA do aplicativo do celular. E o unico arquivo que sabe onde fica a nuvem.
//
// A chave abaixo e a chave "publishable" do Supabase: ela foi feita para ficar dentro do aplicativo e, sozinha,
// nao abre nenhum dado. Quem protege os dados e o login (e-mail, senha e segundo fator) mais a seguranca por linha
// do banco. Nenhuma outra chave existe neste aplicativo, e a chave de servico NUNCA pode aparecer aqui.
// Detalhes e o motivo desta decisao: docs/CELULAR-APP.md, secao "Seguranca".
//
// Se o endereco mudar, mude tambem o connect-src da politica de seguranca (meta Content-Security-Policy) em index.html:
// um teste confere que os dois dizem a mesma coisa.
export const SUPABASE_URL = "https://dktrdniohqngpnkjamgp.supabase.co";
export const SUPABASE_CHAVE_PUBLICA = "sb_publishable_Teyu8Ec_B4MJBaipNxMMQg_jwAiAJjt";
