# Continuação local — Entre Livros / BookShelf-Manager

## Pedido do utilizador

Continuar no Codex instalado no computador pessoal. O agente deve instalar dependências, compilar, executar testes e iniciar a aplicação por iniciativa própria, sem devolver ao utilizador uma lista de comandos para executar. Verificar primeiro o sistema operativo, Node disponível, portas e ficheiros existentes. Preservar dados e alterações locais. Não assumir que o localhost da sessão cloud é o computador pessoal.

O utilizador autorizou colaboração entre agentes e validações intermédias. Não é necessário pedir novamente aprovação para configuração reversível e arranque local dentro deste âmbito. Não expor a aplicação à Internet.

## Estado entregue

Aplicação React/Vite, servidor Node HTTP com SQLite integrado; Node >=24.5.0. Código preparado para entrega na branch codex/entre-livros do repositório tiagoagvieira/BookShelf-Manager. Abrir essa branch no Codex local; a main original só continha README. A branch contém o código atual, lockfile, imagens e documentação, sem dependências instaladas nem dados pessoais.

Comandos definidos em package.json: npm ci, npm run build, npm start; desenvolvimento npm run dev. Servidor127.0.0.1:3001; Vite5173. Dados persistem em data/bookshelf.sqlite e data/media; DATA_DIR permite outra localização. Demonstração por POST /api/demo ou botão no interface; não a carregar sobre dados pessoais sem necessidade. Ela adiciona exemplos sem substituir entradas.

Última validação: build aprovado, 14 testes de servidor e 11 Playwright aprovados. Testes browser usam DATA_DIR temporário próprio, nunca a coleção real. Chromium do sistema é usado quando disponível; senão instalar navegador Playwright. Executar novamente após alterações.

Funciona: CRUD de livros/adereços, pesquisa/filtros/lista, lookup ISBN/título e autor, ISBN por leitura de códigos de barras (sem OCR), cache local de capas, confirmação de idioma e capa, scanner com fallback e stream cleanup, 11 livros e5 objetos demo.

Limites: Open Library bloqueado pelo proxy da cloud, testes de catálogo com mocks; validar pesquisa real na máquina local. A câmara física e a LAN doméstica não foram testadas. Recomendações, preços e integrações OLX/Vinted/MCP permanecem futuras. Sem contas: todos os utilizadores da LAN autorizada podem editar. Ferramentas de desktop/pré-visualização e transferência de sessão indisponíveis na cloud.

## Requisitos novos — implementar a seguir

1. Disposição persistente individual por armário, prateleira e ordem. Arrastar e largar livros/adereços entre posições, também com toque no telemóvel, e alternativa acessível sem arrastar. Persistir após reinício. Migrar os registos atuais sem perda de dados.
2. Organização automática selecionável: autor, título alfabético (ordenação portuguesa), e aleatória. A aleatoriedade deve ser uma ação explícita e a ordem resultante deve persistir, sem mudar em cada renderização/pesquisa. Permitir ajustes manuais depois da ordenação e, idealmente, desfazer a última reorganização.
3. Relatórios de géneros e autores mais lidos. Não confundir livros possuídos com livros lidos: acrescentar estado de leitura e histórico/data de conclusão, incluindo releituras se suportadas. Definir claramente a contagem e o período. Exportar relatórios (pelo menos CSV, com acentos preservados). Não fabricar leituras para os dados reais.
4. Acesso pelo telemóvel em HTTPS na LAN, incluindo scanner. Preparar servidor/proxy e certificado local, preservar segredo da chave privada; não abrir portas públicas. O telefone terá de confiar na autoridade local; essa instalação/confirmação pode exigir ação no dispositivo. Consultar docs/LAN.md. Testar de verdade quando o dispositivo e rede estiverem acessíveis.
5. Vista geral da composição inteira, incluindo parte inferior, rodapé e portas opacas. Zoom +/−, ajustar ao ecrã, reposição e navegação/pan, idealmente gesto de pinça no móvel. Permitir ampliar cada nicho e interagir com os itens ampliados. Portas inferiores devem abrir para revelar itens se forem guardados atrás delas.
6. Corrigir escala: o utilizador considera os livros demasiado grandes e desproporcionais. Usar proporções coerentes entre armários altos, espessura/altura dos livros e adereços; não limitar a vista à parte superior. O zoom muda a vista, não o tamanho relativo dos objetos.

## Referência visual

Fotografias pessoais da conversa mostram dois pares de módulos BILLY brancos laterais, portas superiores de vidro e painéis inferiores opacos, separados por módulo central estreito aberto. Livros em pé e empilhados, recordações à frente, peluche de elfo, miniaturas, medalhas e molduras. As fotos originais não estão incluídas neste pacote: só estiveram disponíveis como imagens na conversa. docs/DESIGN.md regista a referência. Não inventariar automaticamente pessoas, livros ou dados privados das fotos.

O desenho atual tem cinco colunas mas só quatro posições lógicas shelf0..3. Distribuição entre colunas é derivada visualmente, ainda não editável/persistente por armário. public/assets/objects.png é um atlas de imagens geradas (3colunas x2linhas): planta/peluche/medalha; caixa/castelo/suportes. Não são fotografias dos objetos reais. Lombadas e capas demo são ilustrativas. A vista ainda precisa das correções de escala/zoom pedidas acima.

## Critérios de conclusão

Aplicação instalada e iniciada na máquina local, verificações HTTP e navegador executadas, fluxo CRUD preservado, novos fluxos testados, dados mantidos após restart. Informar o endereço realmente acessível ao utilizador e os limites restantes. Não afirmar que HTTPS no telefone funciona antes de validar confiança no certificado e acesso no dispositivo.
