// A professora de IA: persona, regras pedagógicas, contexto da memória acadêmica e ferramentas.
import { getDb, J } from '../db.js';
import { curriculumJSON, getDiscipline, getTopic, isValidTopic } from '../content/curriculum.js';
import { snapshotForPrompt, addNote } from '../services/memory.js';
import { search as ragSearch } from '../services/rag.js';
import { listFacts } from '../services/universities.js';
import { getQuestion, pickAdaptive, answerQuestion, revealedQuestion } from '../services/questions.js';
import { getMastery } from '../services/mastery.js';
import { createCards } from '../services/flashcards.js';
import { addPlanItem } from '../services/planner.js';

export const RESPONSE_MODES = {
  auto: 'Automático (a professora identifica do que você precisa)',
  direta: 'Explicação direta',
  aula: 'Aula completa',
  resolucao: 'Resolução comentada',
  exemplos: 'Exemplos práticos',
  exercicios: 'Exercícios para praticar',
  revisao: 'Revisão do assunto',
  objetiva: 'Resposta objetiva',
};

const PERSONA = `Você é a "Professora Aurora", professora particular da plataforma Aprova Federal AI. Sua missão: preparar UMA estudante para ser aprovada em MEDICINA nas federais do Tocantins e do Maranhão (UFT–Palmas, UFNT–Araguaína, UFMA–São Luís/Pinheiro/Imperatriz), via ENEM/SISU e também via EXATO (Exame de Acesso ao Ensino Superior do Tocantins, da Copese/UFT, usado nos processos "PS Exato" da UFT e da UFNT).

PERSONALIDADE: professora experiente de cursinho de Medicina — exigente, paciente, calorosa e didática. Fala português do Brasil, trata a estudante pelo nome, é direta e honesta. Nunca bajula. Elogia esforço concreto e corrige com clareza.

PRINCÍPIOS PEDAGÓGICOS (obrigatórios):
1. Priorize o APRENDIZADO, não a entrega de respostas. Antes de resolver um exercício enviado, pergunte (ou verifique) o que ela já tentou, a menos que ela peça explicitamente a resposta objetiva ou o modo de resposta seja "objetiva"/"resolução comentada".
2. Diagnostique a necessidade: explicação direta, aula completa, resolução comentada, exemplos, exercícios ou revisão. Diga brevemente qual abordagem você escolheu quando não for óbvio.
3. Explique de forma progressiva: intuição → fundamentação teórica → conceitos essenciais → exemplo resolvido → aplicação em questão de vestibular → armadilhas comuns. Use analogias quando ajudarem, mas não simplifique além do correto: Medicina exige profundidade.
4. Verifique compreensão com perguntas curtas ao final de explicações importantes. Se ela errar ou disser que não entendeu, REFORMULE de outro jeito (outra analogia, outro exemplo, outra representação), não repita a mesma explicação.
5. Não avance para assuntos mais difíceis se os fundamentos ainda não estão dominados segundo a memória acadêmica; retome a base primeiro.
6. DOMÍNIO só é medido por exercícios e avaliações. Conversar sobre um assunto ou assistir a uma aula NÃO significa domínio. Quando quiser medir, use a ferramenta buscar_questao_do_banco e, quando ela responder, registrar_resposta.
7. Quando ela errar: identifique o conteúdo, investigue o provável motivo do erro (conceito, cálculo, interpretação, atenção), reexplique o conceito, dê outro exemplo, proponha questão semelhante e verifique — registre na memória.
8. Use a memória acadêmica abaixo para personalizar: retome erros recorrentes, recomende reforço quando houver padrão de erro, conecte com conteúdos já estudados.

HONESTIDADE E FONTES (obrigatório):
- Nunca invente dados de editais, notas de corte, vagas, pesos ou datas. Para qualquer informação de processo seletivo, CONSULTE as ferramentas (buscar_documentos_oficiais, consultar_central_medicina; e a busca web restrita a domínios oficiais quando disponível). Cite a fonte (nome + link) e a data/edição de referência. Se não encontrou, diga claramente que não verificou e onde a estudante pode confirmar.
- Informações que mudam (datas, vagas, pesos, notas de corte) devem sempre vir com o período de referência; notas de corte são dados históricos de uma edição, nunca previsão.
- Diferencie sempre: questão OFICIAL (com prova/ano), ADAPTADA, ou INÉDITA criada por IA. Nunca diga que uma questão sua é oficial.
- Não prometa aprovação nem dê probabilidades de aprovação. Fale em evolução, lacunas e metas.
- Em dúvidas de saúde pessoal, oriente procurar profissional; seu papel é educacional.

FORMATAÇÃO: Markdown leve (títulos curtos, listas, **negrito** em conceitos-chave). Fórmulas em texto claro (ex.: v = Δs/Δt, H2O, CO2). Respostas na medida certa: completas quando for aula, curtas quando for pergunta objetiva. Em modo de voz, evite tabelas e símbolos, prefira frases faladas.`;

export function buildSystem(userId, { mode = 'auto', discipline = null, voice = false, extra = '' } = {}) {
  const memory = snapshotForPrompt(userId);
  const disc = discipline ? getDiscipline(discipline) : null;
  return [
    PERSONA,
    `\n# MEMÓRIA ACADÊMICA DA ESTUDANTE (dados reais da plataforma)\n${memory}`,
    `\n# CONTEXTO DESTA CONVERSA\nModo de resposta pedido: ${RESPONSE_MODES[mode] || RESPONSE_MODES.auto}.${disc ? ` Disciplina da conversa: ${disc.name}.` : ''}${voice ? ' A resposta será LIDA EM VOZ ALTA: use frases naturais, sem tabelas, sem markdown pesado, até ~180 palavras, e termine com uma pergunta de verificação.' : ''}`,
    `Data de hoje: ${new Date().toISOString().slice(0, 10)}.`,
    extra,
  ].filter(Boolean).join('\n');
}

const DISC_IDS = curriculumJSON().map((d) => d.id);

/** Ferramentas que a professora pode usar (todas com dados reais do banco). */
export function tutorTools(userId, { conversationId } = {}) {
  return [
    {
      name: 'buscar_documentos_oficiais',
      description: 'Busca trechos em documentos oficiais indexados (editais, conteúdos programáticos, fichas oficiais de UFT, UFNT, UFMA, IFMA, INEP/ENEM, SISU, EXATO). Use antes de afirmar qualquer regra, data, peso, vaga ou nota. Retorna trechos com título, URL, tipo de fonte e data de coleta.',
      input_schema: { type: 'object', properties: {
        consulta: { type: 'string', description: 'termos de busca (palavras-chave em português)' },
        instituicao: { type: 'string', enum: ['ENEM', 'SISU', 'UFT', 'UFNT', 'UFMA', 'IFMA', 'EXATO'], description: 'opcional' },
      }, required: ['consulta'] },
      run: async ({ consulta, instituicao }) => {
        const res = ragSearch(consulta, { institution: instituicao || null, limit: 6 });
        if (!res.length) return 'Nenhum documento indexado corresponde. Diga à estudante que essa informação não foi verificada nas fontes da plataforma.';
        return {
          resultados: res.map((r) => ({ titulo: r.title, url: r.url, instituicao: r.institution, tipo_fonte: r.source_type, coletado_em: r.fetched_at, periodo: r.reference_period, trecho: r.text })),
          __citations: res.filter((r) => r.url).map((r) => ({ url: r.url, title: r.title, origin: 'documento', source_type: r.source_type, fetched_at: r.fetched_at })),
        };
      },
    },
    {
      name: 'consultar_central_medicina',
      description: 'Lista os fatos cadastrados na Central de Medicina Federal (processos, vagas, pesos, notas mínimas, notas de corte históricas, modalidades) com fonte, tipo de fonte, se foi verificado e data de coleta.',
      input_schema: { type: 'object', properties: { instituicao: { type: 'string', enum: ['ENEM', 'SISU', 'UFT', 'UFNT', 'UFMA', 'IFMA', 'EXATO'] } }, required: [] },
      run: async ({ instituicao }) => {
        const facts = listFacts({ institution: instituicao || undefined });
        return {
          fatos: facts.map((f) => ({ titulo: f.title, instituicao: f.institution, topico: f.topic, valor: f.value, detalhe: f.detail, periodo: f.reference_period, fonte: f.source_url, tipo_fonte: f.source_type, verificado: f.verified, coletado_em: f.collected_at })),
          __citations: facts.filter((f) => f.source_url).slice(0, 8).map((f) => ({ url: f.source_url, title: f.title, origin: 'central', source_type: f.source_type, fetched_at: f.collected_at })),
        };
      },
    },
    {
      name: 'consultar_desempenho',
      description: 'Retorna o domínio medido da estudante por tópico (θ, tentativas, nível, revisão). Use para decidir o nível da explicação e se pode avançar.',
      input_schema: { type: 'object', properties: { disciplina: { type: 'string', enum: DISC_IDS } }, required: [] },
      run: async ({ disciplina }) => getMastery(userId).filter((m) => !disciplina || m.discipline === disciplina)
        .map((m) => ({ disciplina: m.discipline, topico: m.topic, nome: m.topic_name, nivel: m.level, tentativas: m.attempts, acertos: m.correct, aulas: m.lessons_done })),
    },
    {
      name: 'buscar_questao_do_banco',
      description: 'Busca uma questão do banco da plataforma (com gabarito, para você corrigir) adequada ao nível da estudante. Apresente o enunciado e as alternativas SEM revelar o gabarito, informe a origem (oficial/adaptada/inédita por IA) e peça a resposta e o grau de confiança (certeza, dúvida ou chute).',
      input_schema: { type: 'object', properties: {
        disciplina: { type: 'string', enum: DISC_IDS },
        topico: { type: 'string', description: 'id do tópico (ver currículo)' },
        dificuldade: { type: 'integer', description: '1 a 4; omita para usar a recomendada pelo domínio atual' },
      }, required: ['disciplina'] },
      run: async ({ disciplina, topico, dificuldade }) => {
        if (topico && !isValidTopic(disciplina, topico)) topico = undefined;
        const q = pickAdaptive(userId, { discipline: disciplina, topic: topico, difficulty: dificuldade });
        if (!q) return 'Não há questão disponível com esses filtros. Crie um exercício próprio e deixe claro que é inédito, criado por você (não será registrado como medição).';
        return { ...revealedQuestion(q), instrucao: 'NÃO revele answer/explanation antes da resposta da estudante. Depois que ela responder, chame registrar_resposta.' };
      },
    },
    {
      name: 'registrar_resposta',
      description: 'Registra na memória acadêmica a resposta da estudante a uma questão DO BANCO (por id). Atualiza domínio, caderno de erros e revisões. Só use com questões vindas de buscar_questao_do_banco.',
      input_schema: { type: 'object', properties: {
        questao_id: { type: 'string' },
        alternativa: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'] },
        confianca: { type: 'string', enum: ['certeza', 'duvida', 'chute'] },
      }, required: ['questao_id', 'alternativa', 'confianca'] },
      run: async ({ questao_id: qid, alternativa, confianca }) => {
        if (!getQuestion(qid)) throw new Error('questão inexistente');
        const r = answerQuestion(userId, { questionId: qid, chosen: alternativa, confidence: confianca, context: 'chat', contextId: conversationId });
        const q = getQuestion(qid);
        return { correta: r.correct, gabarito: q.answer, nota_do_distrator_escolhido: q.wrong_notes?.[alternativa] || null, resolucao: q.explanation, novo_nivel_do_topico: r.mastery.level };
      },
    },
    {
      name: 'registrar_observacao',
      description: 'Salva uma observação QUALITATIVA na memória acadêmica (ex.: "confunde mitose e meiose", "prefere analogias visuais", "ansiedade com tempo de prova"). Não use para afirmar domínio.',
      input_schema: { type: 'object', properties: {
        tipo: { type: 'string', enum: ['dificuldade', 'ponto_forte', 'preferencia', 'observacao'] },
        disciplina: { type: 'string', enum: DISC_IDS },
        texto: { type: 'string' },
      }, required: ['tipo', 'texto'] },
      run: async ({ tipo, disciplina, texto }) => ({ salvo: !!addNote(userId, { kind: tipo, discipline: disciplina || null, text: texto, source: 'professora' }) }),
    },
    {
      name: 'criar_flashcards',
      description: 'Cria flashcards de revisão espaçada para a estudante (perguntas objetivas + respostas curtas e corretas).',
      input_schema: { type: 'object', properties: {
        disciplina: { type: 'string', enum: DISC_IDS },
        topico: { type: 'string' },
        cartoes: { type: 'array', items: { type: 'object', properties: { frente: { type: 'string' }, verso: { type: 'string' } }, required: ['frente', 'verso'] } },
      }, required: ['disciplina', 'cartoes'] },
      run: async ({ disciplina, topico, cartoes }) => {
        const t = topico && getTopic(disciplina, topico) ? topico : null;
        const ids = createCards(userId, { discipline: disciplina, topic: t, cards: (cartoes || []).map((c) => ({ front: c.frente, back: c.verso })), source: 'professora' });
        return { criados: ids.length };
      },
    },
    {
      name: 'adicionar_ao_plano',
      description: 'Adiciona uma atividade ao plano de estudos da estudante (ex.: aula de reforço, lista de exercícios, revisão).',
      input_schema: { type: 'object', properties: {
        data: { type: 'string', description: 'AAAA-MM-DD' },
        disciplina: { type: 'string', enum: DISC_IDS },
        topico: { type: 'string' },
        tipo: { type: 'string', enum: ['aula', 'exercicios', 'revisao', 'redacao', 'simulado', 'flashcards'] },
        minutos: { type: 'integer' },
        motivo: { type: 'string' },
      }, required: ['data', 'tipo', 'minutos', 'motivo'] },
      run: async ({ data, disciplina, topico, tipo, minutos, motivo }) => {
        const item = addPlanItem(userId, { date: data, discipline: disciplina, topic: topico && disciplina && isValidTopic(disciplina, topico) ? topico : null, kind: tipo, minutes: minutos, reason: motivo, createdBy: 'professora' });
        return { adicionado: true, id: item.id };
      },
    },
  ];
}

/** Monta o histórico (somente texto + imagens recentes) a partir do banco. */
export function historyForModel(conversationId, { maxMessages = 40, imageLoader } = {}) {
  const rows = getDb().prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT ?').all(conversationId, maxMessages).reverse();
  const withImgs = rows.filter((r) => r.role === 'user' && r.images).slice(-2).map((r) => r.id);
  const msgs = [];
  for (const r of rows) {
    const images = J.parse(r.images, []);
    if (r.role === 'user' && images.length && withImgs.includes(r.id) && imageLoader) {
      const blocks = images.map((im) => imageLoader(im)).filter(Boolean);
      msgs.push({ role: 'user', content: [...blocks, { type: 'text', text: r.content || 'Veja a imagem.' }] });
    } else {
      const txt = r.content + (images.length ? `\n[A estudante enviou ${images.length} imagem(ns) nesta mensagem.]` : '');
      msgs.push({ role: r.role, content: txt || '(vazio)' });
    }
  }
  // A API exige começar com "user".
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}
