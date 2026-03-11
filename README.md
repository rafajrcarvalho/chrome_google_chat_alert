# Google Chat Alert

Extensão Chrome (Manifest V3) que adiciona alertas visuais ao [Google Chat](https://chat.google.com) quando existem mensagens não lidas.

## Funcionalidades

- **Alerta visual** — muda a cor de fundo da área "Início" quando há mensagens não lidas
- **Cor customizável** — color picker com preview em tempo real e input hex
- **Modo piscar** — animação pulsante opcional para chamar mais atenção
- **Cores por tema** — cores padrão diferentes para dark mode (`#750000`) e light mode (`#FF5C5C`), com customização independente por tema
- **Regras de filtragem**:
  - **Excluir** — mensagens de pessoas específicas não ativam o alerta
  - **VIP** — somente mensagens de pessoas específicas ativam o alerta
- **Esconde o empty state** — remove a ilustração "Nada de novo por aqui" ao filtrar por não lidas

## Instalação

1. Clone o repositório:
   ```bash
   git clone https://github.com/seu-usuario/google-chat-alert.git
   ```

2. Abra `chrome://extensions` no Chrome

3. Ative o **Modo do desenvolvedor** (canto superior direito)

4. Clique em **Carregar sem compactação** e selecione a pasta `extension/`

5. Abra o [Google Chat](https://chat.google.com) — a extensão será ativada automaticamente

## Uso

Clique no ícone da extensão na barra do Chrome para abrir o popup de configurações:

### Aba Geral

| Configuração | Descrição |
|---|---|
| Toggle on/off | Ativa ou desativa a extensão |
| Cor de alerta | Escolha a cor de fundo via color picker ou input hex |
| Piscar | Ativa animação pulsante ao receber mensagem |
| Salvar | Confirma a cor escolhida |
| Resetar | Volta para a cor padrão do tema ativo |

A cor é aplicada em tempo real ao selecionar no color picker. Se fechar o popup sem salvar, a cor volta ao valor anterior.

### Aba Regras

| Regra | Comportamento |
|---|---|
| **Excluir** | Mensagens dessas pessoas **não** ativam o alerta |
| **VIP** | **Somente** mensagens dessas pessoas ativam o alerta |

As regras são mutuamente exclusivas — ativar uma desativa a outra. A comparação de nomes é case-insensitive e parcial (substring).

## Estrutura

```
extension/
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── background.js       # Service worker — relay de preview popup → content
├── content.css         # Esconde empty state
├── content.js          # Detecção de não lidas, alerta visual, regras, tema
├── manifest.json       # Manifest V3
├── popup.html          # Interface do popup (abas Geral/Regras)
└── popup.js            # Lógica do popup, preview de cor, regras
```

## Detalhes Técnicos

- **Detecção de não lidas**: combina `aria-label` com contagem (ex: "1 mensagem não lida") e título da página (ex: "Chat (1)")
- **Detecção de tema**: analisa a luminosidade do background subindo a árvore DOM até encontrar cor sólida
- **Preview em tempo real**: usa `chrome.runtime.connect` (porta) via service worker para evitar rate limit do `chrome.storage.sync`
- **Debounce**: evita flickering causado por alternância rápida do título da página
- **Throttle**: `requestAnimationFrame` agrupa chamadas do MutationObserver
- **Armazenamento**: `chrome.storage.sync` para configurações persistentes, `chrome.storage.local` para tema detectado

## Permissões

| Permissão | Motivo |
|---|---|
| `storage` | Salvar configurações do usuário |

A extensão não requer permissões de `tabs`, `activeTab`, `host_permissions` ou acesso a dados de navegação.

## Requisitos

- Google Chrome 88+ (Manifest V3)
- Acesso ao [Google Chat](https://chat.google.com)

## Licença

MIT
