# Executar na rede de casa

## Servidor local

Escolha um computador que permaneça ligado. Reserve um endereço IP para esse computador no router para que o endereço não mude.

```sh
npm ci
npm run build
HOST=0.0.0.0 PORT=3001 npm start
```

Nos outros dispositivos da mesma rede, abra `http://IP-DO-SERVIDOR:3001`. Substitua `IP-DO-SERVIDOR` pelo endereço privado real, por exemplo `192.168.1.50`. Não use `localhost` no telemóvel: esse nome aponta para o próprio telemóvel.

Permita a porta apenas a dispositivos da sua sub-rede na firewall do sistema. Não configure encaminhamento de portas no router nem exponha o serviço à Internet. Estar no mesmo Wi-Fi pode ser insuficiente se o router tiver isolamento de clientes ou se o dispositivo estiver na rede de convidados.

Esta primeira versão é uma coleção partilhada e não tem contas nem permissões individuais. Qualquer pessoa com acesso ao serviço pode consultar e modificar os dados. Use apenas uma LAN de confiança. O servidor por si só não garante que uma porta fique exclusivamente acessível na LAN; a firewall e o router fazem parte dessa configuração.

## HTTPS para a câmara

Uma solução local é colocar o [Caddy](https://caddyserver.com/docs/) à frente da aplicação. Instale o Caddy pelas instruções oficiais para o sistema do servidor. A aplicação pode continuar ligada apenas a loopback:

```sh
HOST=127.0.0.1 PORT=3001 npm start
```

Exemplo de `Caddyfile`, substituindo o IP pelo endereço reservado do servidor:

```caddyfile
https://192.168.1.50 {
    tls internal
    reverse_proxy 127.0.0.1:3001
}
```

Inicie o Caddy usando esse ficheiro. A porta HTTPS deve ser acessível apenas pela LAN. O certificado emitido pela autoridade local do Caddy precisa de ser instalado e explicitamente considerado fiável em **cada telemóvel/computador**. Consulte a documentação do Caddy e do sistema do dispositivo para importar o certificado raiz. Guarde a chave privada da autoridade apenas no servidor; distribua apenas o certificado público.

Depois, abra `https://192.168.1.50`, confirme que o browser não apresenta erros de certificado e autorize a câmara. Ignorar um aviso de certificado não substitui instalar a confiança corretamente. No iOS, poderá ser necessário ativar a confiança total no certificado nas definições. Teste num telemóvel real: uma simulação de browser não comprova o funcionamento da câmara física.

### Configuração incluída para Windows

O `Caddyfile` na raiz usa a porta 8443, escuta apenas no IP indicado e aceita pedidos apenas da sub-rede indicada. Com o servidor da aplicação em `127.0.0.1:3001`, execute no PowerShell a partir da raiz do projeto, substituindo os endereços pelos da sua rede:

```powershell
$env:BOOKSHELF_LAN_IP = '192.168.1.50'
$env:BOOKSHELF_LAN_SUBNET = '192.168.1.0/24'
$env:XDG_DATA_HOME = Join-Path $PWD 'data/tls'
$env:XDG_CONFIG_HOME = Join-Path $PWD 'data/tls'
caddy run --config Caddyfile --adapter caddyfile
```

Distribua apenas `data/tls/caddy/pki/authorities/local/root.crt`. Instale-o como autoridade de confiança no telemóvel e abra `https://192.168.1.50:8443`, usando o IP configurado. A chave da autoridade e os restantes ficheiros em `data/tls` devem permanecer no servidor. Se a firewall impedir a ligação, a regra de entrada deve limitar-se à porta 8443 e à sub-rede doméstica no perfil privado.

## Sem Internet

A coleção já guardada e as capas locais continuam disponíveis. Procurar novos metadados/capas no Open Library exige acesso à Internet; pode introduzir os livros manualmente quando estiver offline. A aplicação não precisa de um serviço de base de dados externo.
