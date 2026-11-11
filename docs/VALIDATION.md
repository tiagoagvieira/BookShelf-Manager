# Validação e limites

## Critérios desta primeira versão

- Coleção persistente de livros e objetos com criar, consultar, editar e eliminar.
- Estante gráfica com quatro prateleiras, lombadas geradas e objetos decorativos.
- Pesquisa na coleção e utilização em ecrãs pequenos.
- Pesquisa externa por ISBN ou texto, com alternativa de introdução manual.
- Leitura de códigos pela câmara quando o browser e HTTPS o permitem.
- Capas disponíveis guardadas no servidor para reutilização.
- Demonstração explícita e repetível sem apagar a coleção pessoal.
- Servidor local, com caminho documentado para acesso na LAN.

## Testes

Os testes de servidor verificam as operações de dados e a validação dos pedidos. Os testes de interface exercitam a demonstração, criação de livros/objetos, pesquisa, edição, eliminação e uma dimensão móvel. Os testes não devem depender de um catálogo externo para passar: respostas de pesquisa externas são simuladas nos testes de interface quando necessário.

A compilação valida a integração do frontend. Os testes de câmara podem verificar mensagens e alternativas, mas a leitura ótica deve ser confirmada com um código de barras real, uma câmara física e um certificado fiável no dispositivo.

## Limites conhecidos

- A disponibilidade e qualidade dos metadados do Open Library variam, especialmente entre edições e línguas.
- Capas reais podem não existir para um ISBN. A lombada apresentada é gerada e não replica necessariamente a edição física.
- A câmara descodifica códigos de barras; não reconhece texto ISBN por OCR. O ISBN impresso pode ser introduzido manualmente.
- A primeira versão não inclui sincronização entre servidores, contas, permissões individuais ou acesso público.
- O aspeto da estante inspira-se na referência BILLY; uma fotografia da estante pessoal poderá orientar uma versão seguinte.
- Recomendações avançadas, preços de mercado, OLX, Vinted e MCP ainda não estão integrados.

## Acesso ao catálogo no ambiente cloud

Na configuração cloud usada para desenvolvimento, os pedidos a `openlibrary.org` e `covers.openlibrary.org` receberam uma recusa de acesso (HTTP 403). Para verificar a pesquisa e a transferência de capas reais neste ambiente, é necessário permitir esses dois domínios nas definições de rede. A alteração dessa configuração não ficou confirmada. Os testes com respostas simuladas não comprovam a disponibilidade do catálogo real.

Numa instalação doméstica normal, esta operação precisa apenas de uma ligação à Internet que permita esses destinos. A coleção local e a demonstração não dependem deles.

## Resultado da execução de 10 de novembro de 2026

- Compilação de produção: aprovada.
- Testes do servidor: 14 aprovados, 0 falhas.
- Testes Playwright/Chromium: 10 aprovados, 0 falhas. Incluem CRUD, persistência, demonstração repetível, vista móvel, idioma desconhecido, aviso de falha de capa, recusa de câmara e descodificação real de EAN-13 num vídeo sintético com libertação da stream.
- Demonstração local: 11 livros e 5 adereços, com capas ilustrativas.
- Catálogo externo real, câmara física e instalação na LAN doméstica: não validados neste ambiente.
- A gravação das instruções na configuração cloud não foi confirmada pela ferramenta. Os comandos reproduzíveis estão no README e no package.json.
