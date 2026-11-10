# Modelo de dados e limites atuais

O schema descreve a persistência futura em PostgreSQL. A aplicação continua usando `LocalStorageRepository`; esta migration não conecta a aplicação ao banco e não carrega dados.

## Origem e preservação

- `Company.cnpj` guarda o CNPJ canônico (somente dígitos) e é único apenas na carteira operacional atual. `DigitalCertificate.sourceCnpj` e `ImportSourceRecord.sourceKey` não são únicos: certificados repetidos e registros históricos de outras abas podem continuar existindo sem vínculo com uma empresa atual.
- `ImportSourceRecord` conserva aba, linha, seção, valores brutos, valores normalizados e fórmulas em JSON. A referência à empresa ou ao grupo é opcional; apagar uma entidade relacionada não apaga a evidência de origem.
- Status normalizados admitem `UNKNOWN`/`NO_STATUS`. Célula vazia, `-`, `N/A` ou `OK` só recebem significado quando o mapeador explícito documentar essa conversão; não são tratados genericamente como conclusão.
- Certificados guardam metadados e validade. O modelo não possui campo para arquivo do certificado, chave privada, senha ou segredo equivalente.
- `CompanyGroupMembership` permite relações de grupo com vigência e referência à linha importada. Dados do Questor, IE, matriz/filial, analista/unidade, automação e status textuais de integração também têm campos no cadastro; a linha de origem retém os valores integrais.
- Competência usa o primeiro dia do mês em `TaxFiling.competence` (`DATE`). A combinação empresa + obrigação + competência é única. `Obligation.dayOfMonth` é uma regra recorrente opcional; `TaxFiling.dueDate` é o vencimento efetivo e pode divergir da regra.

## Segurança ainda necessária no backend

O schema de usuários, funções e permissões não autentica ninguém por si só. Antes de disponibilizar escrita ou dados sensíveis, o backend precisa validar identidade em cada requisição, verificar permissões no servidor por ação e escopo, proteger credenciais/sessões, validar entradas e registrar auditoria confiável. Os endpoints atuais ainda respondem `501` para escrita e a interface mantém login demonstrativo; esconder módulos na interface não é autorização.

## Histórico de migrations

`20261109000000_init` é mantida intacta. A nova migration é aditiva em relação a ela; não altera o histórico remoto nem executa operações de banco. Como este trabalho não consulta o Neon, o estado remoto precisa ser verificado antes de escolher o procedimento de aplicação. Se o banco estiver vazio, o deploy sequencial aplicará as migrations locais; se já houver schema criado fora desse histórico, é necessária reconciliação explícita antes de aplicar.
