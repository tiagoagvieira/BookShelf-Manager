# Entre Livros · BookShelf Manager

Uma biblioteca pessoal para livros e memórias, com uma estante inspirada na IKEA BILLY com portas de vidro. Interface em português, base de dados SQLite local e capas guardadas no servidor.

## Começar no computador

Requisitos: **Node.js 24.5 ou superior (linha 24)** e npm. A base de dados usa o SQLite incluído no Node; não precisa de instalar um serviço de base de dados.

```sh
npm ci
npm run dev
```

Abra `http://localhost:5173` no próprio computador. O frontend de desenvolvimento comunica com o servidor através do proxy do Vite.

Para a versão compilada:

```sh
npm run build
npm start
```

Abra `http://localhost:3001`. Nesta modalidade, o mesmo servidor disponibiliza a interface, a API e as imagens.

## Experimentar

Carregue os **dados de demonstração** na interface para ver livros e adereços. Os exemplos servem para experimentar a aplicação; não representam uma pesquisa atual de catálogo ou valores de mercado. A demonstração é uma ação explícita e não deve substituir a sua coleção.

Pode adicionar livros manualmente, procurar pelo ISBN ou pelo título e autor, e preencher os dados em falta. Confirme sempre a edição e a língua antes de guardar. Também pode adicionar objetos decorativos, escolher a prateleira, editar e eliminar entradas, e procurar na coleção.

O ISBN identifica uma edição, não apenas uma obra. As pesquisas usam o Open Library e podem não encontrar edições portuguesas. A ausência de resultados não impede a introdução manual. Os metadados externos podem estar incompletos ou incorretos.

As capas disponíveis são guardadas localmente para reutilização. **As lombadas são representações gráficas geradas**, não fotografias das lombadas reais. A língua não é inferida com garantia a partir da imagem; confirme os metadados da edição. Os exemplos de demonstração podem usar capas ilustrativas locais.

## Câmara do telemóvel

A câmara lê códigos de barras que contêm um ISBN; esta versão não faz OCR de números ISBN impressos sem código de barras. A leitura de códigos de barras depende de uma câmara compatível, da permissão do utilizador e de um contexto seguro. `localhost` funciona no próprio dispositivo; abrir um endereço HTTP da LAN no telemóvel normalmente **não permite usar a câmara**.

Para ler códigos pelo telemóvel na rede de casa, configure HTTPS com um certificado em que o telemóvel confie. A introdução manual continua disponível. Veja [Instalação na LAN](docs/LAN.md).

## Dados e cópias de segurança

Os dados são persistidos no diretório `data/`, fora do controlo de versões. As imagens também são dados importantes: copie o diretório completo, não apenas o ficheiro da base de dados.

Para uma cópia simples e consistente, pare a aplicação, copie `data/` para um local seguro e volte a iniciar. Para restaurar, pare a aplicação e recupere o diretório completo. Preserve os ficheiros SQLite auxiliares caso existam. Não coloque a base de dados numa pasta partilhada de rede; execute um único servidor e aceda por HTTP/HTTPS.

## Verificação

```sh
npm test
npm run build
npm run test:e2e
```

Os testes browser necessitam do Chromium do Playwright. Se ainda não estiver instalado:

```sh
npx playwright install chromium
```

Consulte [Validação e limites desta versão](docs/VALIDATION.md) para o âmbito dos testes e funcionalidades futuras.

## Próximas versões

Recomendações personalizadas, estimativas de revenda e integrações OLX/Vinted/MCP ficam para uma fase seguinte. Exigem fontes de dados adequadas e validação das permissões e APIs disponíveis. Esta versão não publica anúncios nem apresenta preços inventados como valores de mercado.
