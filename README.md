# Machado Controle Fiscal

Aplicação local em React, TypeScript, Vite, Node.js, Express e Prisma. Os dados de trabalho são armazenados no `localStorage`; a API ainda não está conectada a uma base remota. Neon e migrations permanecem desabilitados nesta etapa.

## Executar localmente

Requer Node.js 20 ou superior.

```bash
npm install
npm run dev
```

A interface abre em `http://localhost:5173`; a API fica em `http://localhost:3333/api/health`. O login é demonstrativo: use qualquer e-mail e uma senha com pelo menos quatro caracteres.

## Identidade visual

A paleta Machado usa marrom escuro `#39200F`, marrom `#4A2B16`, dourado `#E5B43B`, taupe `#918477`, branco e fundo claro `#F7F5F1`. A logo oficial original está em `assets/branding/machado-contabilidade-original.png`; a aplicação a usa em uma moldura branca nas áreas de fundo escuro para manter o arquivo e as cores originais.

## Dados locais

Planilhas originais, cadastros de empresas, certificados, snapshots fiscais, prévias e relatórios de importação ficam fora do Git. As regras do `.gitignore` excluem esses arquivos e os arquivos de ambiente locais. O repositório não contém a carteira de clientes.

Para carregar uma base em uma cópia local, gere os arquivos a partir da planilha autorizada:

```bash
npm run import:source -- "C:/caminho/Acompanhamento entregas Tarefas.xlsx" "C:/caminho/logo.png"
```

## Módulos

Visão geral, empresas e fichas, Simples Nacional, Lucro Real, Lucro Presumido, certificados, integrações, pendências, grupos, histórico, usuários, configurações e importar/exportar. Busca de empresas também consulta as linhas de origem associadas por CNPJ.

O painel resume a distribuição por regime, situação da carteira, certificados explicitamente listados na RCD, pendências cadastradas e status explícitos de integração. Sem uma base local importada, a interface inicia vazia e não presume tarefas.

## Persistência e limites

Cadastros, preferências, pendências e demais alterações permanecem neste navegador e não são compartilhados com outros usuários. Exporte cópias para backup. Autenticação demonstrativa, filtros e autorização ainda não constituem controles de produção. Nenhuma credencial foi alterada, nenhuma conexão com Neon foi criada e nenhuma migration foi executada.
