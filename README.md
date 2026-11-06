# Publicação online — Sistema Vendas Light

Esta pasta contém a vitrine pública, a API de clientes e pedidos, o banco de dados SQL e o painel online para acompanhar pedidos. Envie **o conteúdo desta pasta** para a raiz do repositório GitHub conectado ao Netlify. Não envie a pasta `dados` do aplicativo de computador.

## O que está incluído

- Cadastro e login de clientes na vitrine.
- Cadastro e acompanhamento dos próprios pedidos pelo botão **Pedido**.
- Recalculo de preço usando o catálogo publicado, para o navegador não escolher o preço do pedido.
- Painel privado em `/admin-pedidos.html` para consultar pedidos e atualizar o andamento.
- Armazenamento no Supabase, com instrução para criar o projeto na região **South America (São Paulo)**.
- API executada no Netlify Functions.

O painel de pedidos online é separado do arquivo local de pedidos do EXE. Para pedidos feitos no endereço público, use `https://SEU-SITE.netlify.app/admin-pedidos.html`.

## 1. Criar o banco de dados

1. Crie um projeto Supabase e escolha a região **South America (São Paulo)**.
2. Abra **SQL Editor** no Supabase.
3. Copie e execute o conteúdo de `database/schema.sql`.
4. Em **Project Settings > API Keys**, copie o **Project URL** e a chave de serviço `service_role`. Ela dá acesso administrativo ao banco e deve ficar somente no Netlify.

## 2. Colocar os arquivos no GitHub

1. Crie um repositório para a vitrine ou abra o repositório já conectado ao seu site no Netlify.
2. Envie para a **raiz** do repositório os itens desta pasta: `public`, `netlify`, `database`, `scripts`, `package.json`, `netlify.toml`, `_headers`, `.gitignore` e este `README.md`.
3. Não envie chaves do Supabase, senhas, arquivos `.env` ou a pasta `dados` do aplicativo.

Quando atualizar produtos no aplicativo de computador, copie o novo `svl/catalogo.js` para `public/catalogo.js` antes de enviar a alteração ao GitHub. O comando de publicação gera a lista de preços usada pela API a partir desse catálogo.

## 3. Configurar a publicação no Netlify

1. No Netlify, abra o projeto da vitrine e conecte o repositório GitHub. Se o site ainda não estiver ligado a esse repositório, escolha **Add new project > Import an existing project**.
2. Deixe a pasta base como raiz do repositório. O arquivo `netlify.toml` define o comando de preparação, a pasta pública e a pasta da API.
3. Em **Project configuration > Environment variables**, crie estas variáveis e habilite o uso por **Functions** em todas:

   - `SUPABASE_URL` — URL do projeto Supabase.
   - `SUPABASE_SERVICE_ROLE_KEY` — chave `service_role` do Supabase. Não use a chave `anon` aqui.
   - `SVL_SESSION_SECRET` — sequência aleatória longa, com pelo menos 32 caracteres.
   - `SVL_ADMIN_KEY` — outra sequência aleatória longa, diferente da anterior, com pelo menos 32 caracteres.

   Guarde as duas sequências em local seguro. Não as coloque no GitHub nem as envie por conversa.

4. Salve as variáveis e inicie uma nova publicação. O Netlify precisa publicar novamente para as funções receberem os valores.

O Netlify disponibiliza variáveis de ambiente para as funções quando configuradas no painel; os segredos não devem ser colocados no `netlify.toml` ou no navegador. Consulte [variáveis para Netlify Functions](https://docs.netlify.com/build/functions/environment-variables/).

## 4. Conferir depois da publicação

1. Abra a vitrine publicada, crie uma conta de teste e entre nela.
2. Faça um pedido de teste. A tela do cliente deve mostrar o pedido e atualizar o andamento automaticamente.
3. Abra `/admin-pedidos.html`, informe a `SVL_ADMIN_KEY` e atualize o status do pedido. O cliente deverá ver a mudança em alguns segundos.
4. Confirme no Supabase que a conta e o pedido foram gravados nas tabelas `svl_customers` e `svl_orders`.

## Dados e limites desta versão

- O banco principal fica na região escolhida ao criar o projeto Supabase; este pacote recomenda São Paulo. A escolha da região ajuda a localizar o banco, mas não substitui a revisão das obrigações de privacidade da loja.
- A vitrine registra pedidos para contato e confirmação da loja. Ela não processa pagamentos nem calcula frete.
- Revise `public/privacidade.html` e informe um canal de contato real da loja antes de publicar.
- Cadastros e pedidos online ficam no Supabase. Os arquivos de clientes e pedidos do EXE continuam locais e não são sincronizados automaticamente com o painel online.

## Referências oficiais

- [Regiões disponíveis no Supabase](https://supabase.com/docs/guides/platform/regions)
- [Proteção de chaves e dados no Supabase](https://supabase.com/docs/guides/database/secure-data)
- [Netlify Functions](https://docs.netlify.com/build/functions/get-started/)
