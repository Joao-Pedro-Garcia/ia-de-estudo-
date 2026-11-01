# Aprova Federal AI — Medicina

Plataforma de preparação para **Medicina** nas federais do **Tocantins e do Maranhão** — UFT (Palmas), UFNT (Araguaína) e UFMA (São Luís, Pinheiro e Imperatriz) — via **ENEM/SISU** e **EXATO**. O centro da plataforma é uma professora particular de IA, a **Professora Aurora**.

Ela não é um chatbot genérico. Ela trabalha sobre um sistema pedagógico com:

- diagnóstico adaptativo;
- memória acadêmica que mede o domínio de cada assunto;
- banco de questões;
- simulados;
- correção de redação;
- plano de estudos com repetição espaçada;
- uma central de dados oficiais em que cada informação tem fonte e data.

> **Status:** funcional e testado (25 testes automatizados mais um teste de ponta a ponta no navegador, no celular e no computador). Os recursos de IA precisam de uma chave de API. Veja [Ativando a IA](#ativando-a-ia).

---

## Como rodar

Requisitos: **Node.js 22.5 ou mais recente**, porque o projeto usa o SQLite nativo `node:sqlite` e não precisa compilar nada.

```bash
npm run install:all        # instala server/ e web/
cp server/.env.example server/.env   # e preencha ANTHROPIC_API_KEY
npm run build              # compila o frontend (web/dist)
npm start                  # http://localhost:3001
```

Desenvolvimento com recarga automática: rode `npm run dev:server` em um terminal e `npm run dev:web` em outro (Vite em `http://localhost:5173`, com proxy para a API).

**A primeira conta criada vira administradora.** Ela pode cadastrar documentos oficiais e fatos na Central. Depois de criar a conta da estudante, você pode definir `ALLOW_REGISTRATION=false`.

### No celular (Android e iPhone)

A interface é responsiva e funciona como **PWA**:

- **Android (Chrome):** menu → "Instalar app".
- **iPhone (Safari):** Compartilhar → "Adicionar à Tela de Início".

Para usar fora da sua rede, hospede o servidor com HTTPS (Render, Railway, Fly.io ou uma VPS com Caddy/Nginx) e defina `NODE_ENV=production` e `COOKIE_SECURE=true`. O microfone (professora por voz) exige HTTPS.

## Ativando a IA

Sem chave, a plataforma **não finge** que a IA funciona. Tudo o que depende dela devolve uma mensagem clara: "falta configurar ANTHROPIC_API_KEY".

| Funciona sem chave | Precisa da chave |
|---|---|
| Cadastro, onboarding e diagnóstico (questões objetivas) | Conversa com a professora (texto, voz e foto) |
| Banco de questões, prática adaptativa e cronometrada | Aulas geradas e aulas sob demanda |
| Caderno de erros com recuperação usando o banco | Diagnóstico do erro pela IA, reexplicação e novo exemplo |
| Simulados com correção e relatório | Análise escrita do simulado pela professora |
| Plano de estudos, flashcards, concentração | Geração de questões inéditas e de flashcards |
| Central, calendário e simulador de notas | Correção de redação e transcrição de foto |
| Laboratório virtual e painel | Questão discursiva do diagnóstico e comentário do mapa |

Para ativar:

1. Crie uma chave em <https://console.anthropic.com/> → *API Keys*.
2. Coloque `ANTHROPIC_API_KEY=...` em `server/.env` (ou nas variáveis de ambiente da hospedagem).
3. Reinicie o servidor. O log mostra `"ai":true`.

A chave fica **somente no servidor** e nunca é enviada ao navegador. O modelo padrão é `claude-opus-5-5`. Ele pode ser trocado em `AI_MODEL`, e o esforço de raciocínio é configurado em `AI_EFFORT`. O consumo por recurso aparece em `GET /api/ai/usage`.

---

## O que existe na plataforma

### Fundação

- **Onboarding inteligente** com 14 perguntas, uma por vez, cada uma explicando por que é feita. Tem barra de progresso, perguntas opcionais que podem ser puladas e salvamento automático, para continuar depois. **O sistema não pergunta o nível da estudante.**
- **Diagnóstico adaptativo obrigatório antes do painel**, com cerca de 45 questões de 11 disciplinas.
  - Funciona em escada: acerto seguro sobe a dificuldade, erro desce e chute mantém.
  - A estudante marca se respondeu com *certeza*, com *dúvida* ou se *chutou*. **Acerto por chute não conta como domínio.**
  - O gabarito não é mostrado durante o teste.
  - Tem uma questão discursiva curta, corrigida pela IA quando ela está ativa.
- **SEU MAPA DE APROVAÇÃO — MEDICINA**, que mostra:
  - o nível por disciplina e os assuntos dominados, parciais e a aprender desde a base;
  - as dificuldades recorrentes e as habilidades a desenvolver;
  - o plano inicial;
  - o aviso explícito de que é uma estimativa inicial, sem previsão de aprovação.
- **Memória acadêmica.** O domínio é medido por tópico com um modelo de habilidade (logístico, tipo Rasch/Elo) contra a dificuldade das questões.
  - "Dominado" exige pelo menos 5 tentativas, habilidade alta e pelo menos 80% de acertos *seguros* recentes.
  - Concluir uma aula **não** aumenta o domínio.
  - Observações qualitativas (por exemplo, "confunde mitose e meiose") ficam separadas das medições.
- **Professora Aurora**, com persona de professora de cursinho de Medicina, exigente e paciente.
  - Tem 8 modos de resposta: automático, explicação direta, aula completa, resolução comentada, exemplos, exercícios, revisão e resposta objetiva.
  - Usa a memória da estudante em toda resposta.
  - Tem ferramentas reais: busca em documentos oficiais, Central de Medicina, consulta de desempenho, questões do banco com registro da resposta na memória, anotações, criação de flashcards e itens no plano. Também faz busca web restrita a domínios oficiais.
  - Cita as fontes e a data da coleta.
- **Conversas** com histórico persistente, separadas por matéria, envio de **fotos de exercícios** e respostas em streaming. Se a IA falhar, o texto volta para a caixa de mensagem e nada se perde.
- **Aulas** em trilhas por disciplina, ordenadas pela prioridade para Medicina. Cada aula tem 8 seções:
  1. introdução;
  2. explicação;
  3. exemplos resolvidos;
  4. o que cai no vestibular;
  5. erros comuns;
  6. exercícios de fixação;
  7. teste de compreensão (com questões do banco, que **mede** o domínio de verdade);
  8. resumo.
  
  A aula é gerada no nível medido da estudante. A trilha avisa quando os fundamentos ainda não estão dominados. O botão "Perguntar sobre a aula" abre uma conversa que já conhece o conteúdo. Também é possível pedir uma **aula sob demanda** para uma dificuldade específica.

### Preparação

- **Banco de questões** com 260 questões iniciais em 13 disciplinas e 4 níveis.
  - Cada questão tem resolução comentada e uma explicação do erro conceitual por trás de cada alternativa errada.
  - Filtros: disciplina, assunto, dificuldade, origem, salvas e erradas.
  - Modos: explorar, prática adaptativa, cronometrada e refazer erradas.
  - O gabarito só aparece depois de responder ou se a estudante pedir explicitamente. Nesse caso a resposta fica bloqueada e não conta como domínio.
- **Origem sempre identificada:** *oficial*, *adaptada* ou *inédita criada por IA*. Hoje o acervo inicial é todo *inédito, criado por IA*. Nenhuma questão é apresentada como oficial. Questões oficiais podem ser importadas com fonte (`source.exam`, `year` e `url` são obrigatórios).
- **Geração de questões inéditas** com controle de qualidade: a IA resolve cada questão gerada de novo, às cegas, e descarta a questão se a resposta divergir do gabarito ou se houver ambiguidade.
- **Caderno inteligente de erros** com o processo em 7 passos:
  1. identificar o conteúdo;
  2. descobrir o provável motivo, a partir do relato da estudante, da alternativa escolhida e da IA;
  3. explicar o conceito de novo;
  4. dar outro exemplo;
  5. propor uma questão semelhante;
  6. verificar a compreensão;
  7. registrar na memória.
  
  O erro só é marcado como "resolvido" com um acerto *não chutado* na questão semelhante.
- **Simulados** nos formatos ENEM, EXATO, UFT, UFNT, UFMA, IFMA e personalizado.
  - Têm cronômetro, navegação, marcação de questões, salvamento automático a cada poucos segundos e opção de continuar depois.
  - A correção é exata. O relatório traz desempenho por disciplina e por área, assuntos dominados e a reforçar, comparação com o simulado anterior e aproveitamento ponderado pelos **pesos oficiais verificados**.
  - Ao terminar, aulas de recuperação vão para o plano e os erros vão para o caderno.
  - A dificuldade dos próximos simulados se adapta ao desempenho.
- **Academia de redação**:
  - propostas inéditas de tema;
  - transcrição de foto manuscrita, que a estudante revisa antes da correção;
  - correção pelas **5 competências do ENEM** (0–200 em níveis de 40), com **faixa de incerteza** e trechos exatos do texto;
  - exemplo de reescrita e evolução entre redações;
  - repertórios salvos como flashcards;
  - aviso de que a nota oficial depende da banca.
- **Plano de estudos**:
  - **repetição espaçada** por tópico: o intervalo encurta após erros e aumenta com o domínio;
  - **recuperação ativa** e **revisão cumulativa**;
  - **intercalação** de disciplinas e **progressão**: só avança depois que o tópico anterior estiver ao menos parcial;
  - prioridade calculada por *peso oficial da área nos processos-alvo × prioridade para Medicina × lacuna medida*;
  - respeita os dias e o tempo informados, com pausas, e entra em **reta final** perto da data da prova;
  - é editável (horário, duração, tipo, pular ou remover). Ao recalcular, os itens feitos e os criados pela estudante são mantidos.
- **Flashcards** com repetição espaçada (SM-2). Podem ser gerados pela IA a partir dos erros, criados pela professora no chat ou feitos à mão.

### Inteligência avançada

- **Professora por voz** usando a Web Speech API: a estudante fala, a professora responde em voz (pt-BR) e termina com uma pergunta de verificação. Funciona no Chrome/Edge (computador e Android) e no Safari (iOS 14.5+).
- **Laboratório virtual** com cálculos reais: cruzamentos genéticos (Punnett, até 3 genes), Hardy-Weinberg, diluição e pH, lentes e correção de miopia, e pressão hidrostática no corpo. Cada simulação tem desafio com questões do banco e atalho para discutir com a professora, e o tempo de uso é registrado.
- **Modo concentração**:
  - sessões de 10 a 90 minutos, com pausa sugerida;
  - aviso acima de 8 horas por dia, para não incentivar jornadas prejudiciais;
  - o tempo vem do servidor e não pode ser inflado;
  - histórico de produtividade.
- **Central de Medicina Federal** com perfis **independentes** de Medicina para UFT–Palmas, UFNT–Araguaína e UFMA (São Luís, Pinheiro e Imperatriz), além de ENEM, SISU, EXATO e IFMA. Todo fato mostra fonte, tipo (oficial ou secundária), se foi verificado e a data da coleta.
- **Simulador de notas**: calcula a média ponderada SISU com pesos oficiais verificados, verifica as notas mínimas e compara com a nota de corte histórica, marcada como referência de fonte secundária. **Não calcula probabilidade de aprovação.**
- **Calendário** com datas oficiais (com fonte) e datas pessoais. Datas que ainda não foram publicadas não aparecem.
- **Painel** com:
  - horas estudadas, dias seguidos, questões e taxa de acerto;
  - nível por disciplina e evolução dos simulados e das redações;
  - plano do dia, metas semanais editáveis;
  - revisões vencidas, padrões de erro e conteúdos pendentes.

---

## Dados oficiais coletados (2026-11-01)

O arquivo `server/data/official/official_data.json` reúne 36 fatos e 12 eventos, cada um com URL, tipo de fonte e flag de verificação. Destaques:

- **ENEM 2026** (Edital Inep 64/2026):
  - provas em **08/11 e 15/11/2026**;
  - 45 questões por área, nota calculada por TRI;
  - redação com 5 competências, de 0 a 200 cada.
- **SISU 2026:**
  - edição única no ano;
  - a partir de 2027 vale a melhor média das 3 últimas edições do ENEM (Portaria MEC 704/2025);
  - **o cronograma de 2027 ainda não foi publicado**.
- **Medicina UFT (Palmas)** e **UFNT (Araguaína)**, SISU 2026:
  - pesos: Redação 3, Linguagens 3, Humanas 2, Natureza 4 e Matemática 2;
  - redação mínima de 300.
- **UFNT PS Exato 2026/2:** 30 vagas de Medicina.
- **Medicina UFMA** (São Luís, Pinheiro e Imperatriz): pesos todos iguais a 1.
- **EXATO:** é o *Exame de Acesso ao Ensino Superior do Tocantins* (Copese/UFT), com 80 questões objetivas (20 por área) e redação. Na edição 2026/2, a prova foi em 18/10/2026 e o resultado sai em 16/11/2026.
- **IFMA:** os cursos superiores usam o SISU. Não há curso de Medicina.
- **Notas de corte de Medicina (SISU 2026):** vêm de **fonte secundária** e estão marcadas como não verificadas.
- **Não verificados:** o formato do seletivo técnico do IFMA, as vagas da UFT no PS Exato e a data do resultado do ENEM 2026.

Para atualizar os dados, o administrador pode:

- cadastrar novos fatos em `POST /api/central/facts` (a fonte é obrigatória);
- indexar editais e páginas oficiais em `POST /api/documents` com `{url}`, que aceita apenas domínios oficiais por padrão e lê HTML e PDF.

A professora consulta esses documentos (RAG) e cita a fonte.

---

## Arquitetura

```
server/                 Node.js 22 + Express + SQLite (node:sqlite, WAL)
  src/config.js         configuração (chaves só no servidor)
  src/db.js             migrações versionadas, transações
  src/auth.js           scrypt + sessão opaca em cookie httpOnly; limite de tentativas
  src/ai/provider.js    SDK oficial Anthropic: streaming, laço de ferramentas, saída JSON
                        validada por esquema, fallback em recusa, registro de uso e erros tipados
  src/ai/tutor.js       persona, regras pedagógicas, ferramentas e histórico (append-only, só texto)
  src/services/         mastery (memória), onboarding (diagnóstico), questions, errors,
                        lessons, exams, essays, flashcards, planner, focus, rag,
                        universities (central/calendário/simulador), memory, dashboard, chat
  src/routes/api.js     API REST + SSE (streaming do chat)
  data/questions/       acervo de questões (JSON validado por scripts/validate-questions.js)
  data/official/        dados oficiais coletados (com fonte)
  test/                 25 testes (node:test): fluxo completo, IA com cliente de teste, unidades
web/                    React 18 + Vite, PWA, tema claro/escuro, mobile-first
```

**Segurança:**

- senhas com scrypt;
- cookies httpOnly + SameSite;
- verificação de origem em produção;
- cabeçalhos de segurança;
- markdown da IA sanitizado com DOMPurify;
- uploads validados (tipo e tamanho);
- cada estudante só acessa os próprios dados;
- questões geradas para uma estudante ficam visíveis só para ela.

**Logs:** JSON por linha (requisições, erros, uso de IA). Senhas e tokens nunca são registrados.

**RAG:** os documentos são divididos em trechos e indexados com SQLite FTS5 (BM25, ignorando acentos). A camada semântica vem do próprio agente, que reformula a pergunta em termos de busca. Uma busca por *embeddings* pode ser acrescentada em `services/rag.js` com um provedor de embeddings. Hoje ela não existe, e isso está dito aqui de propósito.

## Testes

```bash
npm test                    # 25 testes de backend (fluxo completo + IA + unidades)
npm run validate:questions  # valida o esquema e a distribuição do banco de questões
```

Os testes de IA usam um cliente de teste **injetado só nos testes**. Eles verificam a orquestração real: ferramentas, citações, persistência, descarte de questões com gabarito divergente e erros tratados sem conteúdo falso. Em produção não existe nenhuma resposta simulada.

## Limitações conhecidas e próximos passos

- **Questões oficiais:** o acervo inicial é inédito (criado por IA e revisado). A importação de provas oficiais (ENEM/INEP, EXATO/Copese) deve ser feita com as fontes e respeitando os termos de uso de cada instituição.
- **Volume do banco:** 260 questões não bastam para simulados completos no formato oficial (180 questões no ENEM). O sistema avisa quando faltam questões, e a geração verificada por IA amplia o banco.
- **Nota TRI:** não é reproduzida. Os simulados mostram aproveitamento e médias ponderadas, sem fingir que calculam a nota oficial.
- **Fontes que precisam ser reconferidas:** dados marcados como secundários ou não verificados devem ser conferidos nos editais oficiais quando forem publicados (SISU 2027, PS Exato, IFMA).
- **Voz:** depende do navegador. O Firefox não tem reconhecimento de fala.
