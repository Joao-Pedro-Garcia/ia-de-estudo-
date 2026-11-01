// Currículo-base da plataforma: disciplinas -> tópicos -> subtópicos.
// Os IDs aqui são a "espinha dorsal" do sistema: questões, aulas, memória acadêmica,
// flashcards, plano de estudos e diagnóstico referenciam estes IDs.
//
// `medPriority` (1–5) é uma prioridade PEDAGÓGICA para quem quer Medicina, não um peso oficial.
// Pesos oficiais vêm dos perfis de universidade (Central de Medicina Federal), sempre com fonte.
// `enemArea`: LC (Linguagens), CH (Humanas), CN (Natureza), MT (Matemática), RED (Redação).

export const DISCIPLINES = [
  {
    id: 'biologia', name: 'Biologia', enemArea: 'CN', medPriority: 5, color: '#16a34a',
    topics: [
      ['citologia', 'Citologia', ['membrana plasmática e transportes', 'organelas citoplasmáticas', 'núcleo e cromossomos', 'divisão celular: mitose', 'divisão celular: meiose', 'metabolismo energético: respiração e fermentação', 'fotossíntese']],
      ['bioquimica', 'Bioquímica', ['água e sais minerais', 'carboidratos', 'lipídios', 'proteínas e enzimas', 'vitaminas', 'ácidos nucleicos', 'síntese proteica']],
      ['genetica', 'Genética', ['1ª lei de Mendel', '2ª lei de Mendel', 'heredogramas', 'polialelia e grupos sanguíneos', 'herança ligada ao sexo', 'interação gênica e epistasia', 'linkage e mapas genéticos', 'mutações e aberrações cromossômicas', 'genética de populações (Hardy-Weinberg)']],
      ['evolucao', 'Evolução', ['teorias evolutivas (Lamarck, Darwin)', 'teoria sintética', 'especiação', 'evidências da evolução', 'origem da vida']],
      ['ecologia', 'Ecologia', ['cadeias e teias alimentares', 'fluxo de energia e pirâmides', 'ciclos biogeoquímicos', 'relações ecológicas', 'sucessão ecológica', 'biomas brasileiros (Cerrado, Amazônia)', 'dinâmica de populações', 'impactos ambientais']],
      ['fisiologia', 'Fisiologia humana', ['sistema digestório', 'sistema respiratório', 'sistema cardiovascular', 'sistema excretor', 'sistema nervoso', 'sistema endócrino', 'sistema imunológico', 'sistema reprodutor', 'homeostase']],
      ['botanica', 'Botânica', ['classificação das plantas', 'histologia vegetal', 'fisiologia vegetal', 'hormônios vegetais', 'reprodução das angiospermas']],
      ['zoologia', 'Zoologia', ['poríferos e cnidários', 'platelmintos e nematelmintos', 'moluscos e anelídeos', 'artrópodes', 'equinodermos', 'cordados e vertebrados']],
      ['microbiologia', 'Microbiologia', ['vírus', 'bactérias', 'fungos', 'protozoários', 'antibióticos e resistência']],
      ['parasitologia', 'Parasitologia', ['doenças causadas por protozoários', 'verminoses', 'vetores e profilaxia', 'arboviroses (dengue, zika, chikungunya)', 'doenças negligenciadas (Chagas, leishmaniose)']],
      ['biotecnologia', 'Biotecnologia', ['DNA recombinante', 'PCR e eletroforese', 'clonagem', 'transgênicos', 'células-tronco', 'vacinas e soros', 'CRISPR']],
      ['embriologia', 'Embriologia', ['gametogênese', 'fecundação', 'segmentação e gastrulação', 'folhetos embrionários e anexos']],
      ['histologia', 'Histologia', ['tecido epitelial', 'tecido conjuntivo', 'tecido muscular', 'tecido nervoso', 'sangue']],
    ],
  },
  {
    id: 'quimica', name: 'Química', enemArea: 'CN', medPriority: 5, color: '#0891b2',
    topics: [
      ['estrutura_atomica', 'Estrutura atômica', ['modelos atômicos', 'partículas e números atômicos', 'distribuição eletrônica', 'isótopos, isóbaros, isótonos', 'radioatividade']],
      ['tabela_periodica', 'Tabela periódica', ['organização da tabela', 'propriedades periódicas']],
      ['ligacoes', 'Ligações químicas', ['ligação iônica', 'ligação covalente', 'ligação metálica', 'geometria molecular', 'polaridade', 'forças intermoleculares']],
      ['funcoes_inorganicas', 'Funções inorgânicas', ['ácidos', 'bases', 'sais', 'óxidos']],
      ['reacoes', 'Reações químicas', ['tipos de reações', 'balanceamento', 'reações de oxirredução']],
      ['estequiometria', 'Estequiometria', ['mol e massa molar', 'cálculo estequiométrico', 'reagente limitante e em excesso', 'rendimento e pureza', 'gases']],
      ['solucoes', 'Soluções', ['concentração comum e molaridade', 'diluição e mistura', 'titulação', 'propriedades coligativas']],
      ['termoquimica', 'Termoquímica', ['entalpia', 'lei de Hess', 'energia de ligação']],
      ['cinetica', 'Cinética química', ['velocidade de reação', 'fatores que alteram a velocidade', 'catalisadores', 'lei da velocidade']],
      ['equilibrio', 'Equilíbrio químico', ['constante de equilíbrio', 'princípio de Le Chatelier', 'pH e pOH', 'hidrólise salina', 'solução-tampão', 'produto de solubilidade']],
      ['eletroquimica', 'Eletroquímica', ['pilhas', 'potencial de redução', 'eletrólise', 'corrosão']],
      ['organica', 'Química orgânica', ['cadeias carbônicas', 'hidrocarbonetos', 'nomenclatura', 'petróleo e combustíveis', 'polímeros', 'bioquímica orgânica']],
      ['funcoes_organicas', 'Funções orgânicas', ['álcoois e fenóis', 'aldeídos e cetonas', 'ácidos carboxílicos e ésteres', 'aminas e amidas', 'reconhecimento de funções em fármacos']],
      ['isomeria', 'Isomeria', ['isomeria plana', 'isomeria geométrica', 'isomeria óptica']],
      ['reacoes_organicas', 'Reações orgânicas', ['substituição', 'adição', 'eliminação', 'oxidação', 'esterificação e saponificação']],
    ],
  },
  {
    id: 'fisica', name: 'Física', enemArea: 'CN', medPriority: 4, color: '#7c3aed',
    topics: [
      ['cinematica', 'Cinemática', ['MRU', 'MRUV', 'queda livre e lançamentos', 'movimento circular', 'interpretação de gráficos']],
      ['dinamica', 'Dinâmica', ['leis de Newton', 'atrito', 'plano inclinado', 'força centrípeta', 'gravitação']],
      ['energia', 'Trabalho e energia', ['trabalho e potência', 'energia cinética e potencial', 'conservação de energia', 'impulso e quantidade de movimento']],
      ['estatica_hidro', 'Estática e hidrostática', ['equilíbrio e torque', 'pressão', 'teorema de Stevin', 'empuxo', 'princípio de Pascal']],
      ['termologia', 'Termologia', ['temperatura e escalas', 'calorimetria', 'mudanças de estado', 'dilatação', 'gases e termodinâmica']],
      ['optica', 'Óptica', ['reflexão e espelhos', 'refração', 'lentes', 'óptica da visão']],
      ['ondulatoria', 'Ondulatória', ['ondas e propriedades', 'som', 'efeito Doppler', 'espectro eletromagnético']],
      ['eletricidade', 'Eletricidade', ['carga e campo elétrico', 'corrente e resistência', 'circuitos', 'potência e consumo de energia']],
      ['magnetismo', 'Magnetismo', ['campo magnético', 'indução eletromagnética', 'geração de energia']],
      ['fisica_moderna', 'Física moderna', ['efeito fotoelétrico', 'radiações e aplicações médicas']],
    ],
  },
  {
    id: 'matematica', name: 'Matemática', enemArea: 'MT', medPriority: 4, color: '#ea580c',
    topics: [
      ['basica', 'Matemática básica', ['operações e frações', 'razão e proporção', 'regra de três', 'porcentagem', 'potenciação e radiciação', 'unidades de medida e escalas']],
      ['algebra', 'Álgebra e equações', ['expressões algébricas', 'equações do 1º grau', 'equações do 2º grau', 'sistemas', 'inequações']],
      ['funcoes', 'Funções', ['conceito e gráficos', 'função afim', 'função quadrática', 'função exponencial', 'função logarítmica', 'leitura de gráficos']],
      ['logaritmos', 'Logaritmos', ['definição e propriedades', 'equações logarítmicas', 'aplicações (pH, crescimento)']],
      ['progressoes', 'Progressões', ['PA', 'PG']],
      ['geometria_plana', 'Geometria plana', ['ângulos e triângulos', 'semelhança', 'teorema de Pitágoras', 'áreas', 'circunferência']],
      ['geometria_espacial', 'Geometria espacial', ['prismas', 'cilindros', 'cones e pirâmides', 'esferas', 'volumes e capacidade']],
      ['trigonometria', 'Trigonometria', ['razões trigonométricas', 'ciclo trigonométrico', 'leis dos senos e cossenos']],
      ['estatistica', 'Estatística', ['média, moda e mediana', 'dispersão e desvio padrão', 'gráficos e tabelas']],
      ['probabilidade', 'Probabilidade', ['probabilidade simples', 'probabilidade condicional', 'eventos independentes']],
      ['combinatoria', 'Análise combinatória', ['princípio fundamental da contagem', 'permutações', 'arranjos e combinações']],
      ['financeira', 'Matemática financeira', ['juros simples', 'juros compostos', 'descontos e acréscimos']],
    ],
  },
  {
    id: 'portugues', name: 'Português (gramática)', enemArea: 'LC', medPriority: 3, color: '#db2777',
    topics: [
      ['ortografia', 'Ortografia e acentuação', ['acentuação gráfica', 'uso do hífen', 'grafias com dificuldade']],
      ['morfologia', 'Morfologia', ['classes de palavras', 'formação de palavras', 'verbos: tempos e modos']],
      ['sintaxe', 'Sintaxe', ['termos da oração', 'período composto', 'concordância', 'regência e crase', 'colocação pronominal', 'pontuação']],
      ['semantica', 'Semântica e coesão', ['conectivos e relações lógicas', 'coesão referencial', 'sinonímia e polissemia']],
      ['variacao', 'Variação linguística', ['tipos de variação', 'norma-padrão e preconceito linguístico']],
      ['figuras', 'Figuras de linguagem', ['metáfora e metonímia', 'ironia e antítese', 'outras figuras']],
      ['funcoes_linguagem', 'Funções da linguagem', ['funções da linguagem']],
    ],
  },
  {
    id: 'interpretacao', name: 'Interpretação de texto', enemArea: 'LC', medPriority: 4, color: '#be185d',
    topics: [
      ['compreensao', 'Compreensão textual', ['tema e ideia central', 'inferência', 'pressupostos e subentendidos', 'intencionalidade']],
      ['generos', 'Gêneros textuais', ['gêneros jornalísticos', 'gêneros publicitários', 'textos científicos e de divulgação', 'charges e tirinhas']],
      ['tipologia', 'Tipologia textual', ['dissertação', 'narração e descrição', 'injunção']],
      ['intertextualidade', 'Intertextualidade', ['paródia e paráfrase', 'citação e alusão']],
    ],
  },
  {
    id: 'literatura', name: 'Literatura', enemArea: 'LC', medPriority: 2, color: '#9333ea',
    topics: [
      ['escolas_coloniais', 'Literatura colonial', ['Quinhentismo', 'Barroco', 'Arcadismo']],
      ['romantismo', 'Romantismo', ['poesia romântica', 'prosa romântica']],
      ['realismo', 'Realismo e Naturalismo', ['Machado de Assis', 'Naturalismo', 'Parnasianismo e Simbolismo']],
      ['modernismo', 'Modernismo', ['Pré-Modernismo', 'Semana de 22 e 1ª fase', 'Geração de 30', 'Geração de 45 e contemporâneos']],
      ['portuguesa', 'Literatura portuguesa', ['Trovadorismo e Humanismo', 'Classicismo: Camões', 'Fernando Pessoa e heterônimos']],
      ['regional', 'Literatura e cultura regional', ['autores do Maranhão', 'literatura e cultura do Tocantins']],
    ],
  },
  {
    id: 'ingles', name: 'Inglês', enemArea: 'LC', medPriority: 2, color: '#2563eb',
    topics: [['leitura_en', 'Leitura em inglês', ['estratégias de leitura', 'vocabulário em contexto', 'falsos cognatos']]],
  },
  {
    id: 'espanhol', name: 'Espanhol', enemArea: 'LC', medPriority: 2, color: '#dc2626',
    topics: [['leitura_es', 'Leitura em espanhol', ['estratégias de leitura', 'heterosemânticos', 'gramática em contexto']]],
  },
  {
    id: 'historia', name: 'História', enemArea: 'CH', medPriority: 2, color: '#a16207',
    topics: [
      ['antiguidade', 'Antiguidade e Idade Média', ['Grécia e Roma', 'feudalismo']],
      ['moderna', 'Idade Moderna', ['Renascimento e Reformas', 'Absolutismo e Mercantilismo', 'Iluminismo', 'Revolução Francesa e Industrial']],
      ['contemporanea', 'Idade Contemporânea', ['Imperialismo', 'Guerras Mundiais', 'Guerra Fria', 'descolonização']],
      ['brasil_colonia', 'Brasil Colônia', ['colonização e economia açucareira', 'escravidão e resistência', 'mineração', 'revoltas coloniais']],
      ['brasil_imperio', 'Brasil Império', ['independência', 'Primeiro Reinado e Regências', 'Segundo Reinado e abolição', 'Balaiada (Maranhão)']],
      ['brasil_republica', 'Brasil República', ['República Velha', 'Era Vargas', 'ditadura militar', 'redemocratização e Constituição de 1988', 'criação do Tocantins (1988)']],
    ],
  },
  {
    id: 'geografia', name: 'Geografia', enemArea: 'CH', medPriority: 2, color: '#15803d',
    topics: [
      ['cartografia', 'Cartografia', ['escalas', 'coordenadas e fusos', 'projeções']],
      ['geografia_fisica', 'Geografia física', ['clima', 'relevo e solos', 'hidrografia', 'vegetação e biomas']],
      ['populacao', 'População e urbanização', ['demografia', 'migrações', 'urbanização']],
      ['economia', 'Geografia econômica', ['agropecuária e MATOPIBA', 'indústria e energia', 'globalização']],
      ['ambiental', 'Questões ambientais', ['desmatamento', 'recursos hídricos', 'mudanças climáticas']],
      ['regional_br', 'Geografia do Brasil e regional', ['regionalização do Brasil', 'Tocantins', 'Maranhão']],
    ],
  },
  {
    id: 'filosofia', name: 'Filosofia', enemArea: 'CH', medPriority: 2, color: '#64748b',
    topics: [
      ['antiga', 'Filosofia antiga', ['pré-socráticos', 'Sócrates e Platão', 'Aristóteles', 'helenismo']],
      ['medieval_moderna', 'Filosofia medieval e moderna', ['Agostinho e Tomás', 'racionalismo e empirismo', 'Kant', 'contratualistas']],
      ['contemporanea_fil', 'Filosofia contemporânea', ['Nietzsche', 'existencialismo', 'Escola de Frankfurt']],
      ['etica', 'Ética e bioética', ['ética e moral', 'bioética']],
    ],
  },
  {
    id: 'sociologia', name: 'Sociologia', enemArea: 'CH', medPriority: 2, color: '#475569',
    topics: [
      ['classicos', 'Clássicos da sociologia', ['Durkheim', 'Weber', 'Marx']],
      ['cultura', 'Cultura e sociedade', ['cultura e identidade', 'etnocentrismo e relativismo', 'indústria cultural']],
      ['estado', 'Estado, poder e cidadania', ['democracia e cidadania', 'movimentos sociais', 'direitos humanos']],
      ['desigualdade', 'Trabalho e desigualdade', ['trabalho', 'desigualdade social', 'questão racial e de gênero']],
    ],
  },
  {
    id: 'redacao', name: 'Redação', enemArea: 'RED', medPriority: 5, color: '#0f766e',
    topics: [
      ['estrutura', 'Estrutura dissertativo-argumentativa', ['introdução e tese', 'desenvolvimento', 'conclusão']],
      ['argumentacao', 'Argumentação e repertório', ['tipos de argumento', 'repertório sociocultural legitimado', 'aprofundamento']],
      ['coesao_red', 'Coesão e coerência', ['conectivos', 'progressão textual']],
      ['intervencao', 'Proposta de intervenção', ['os 5 elementos da proposta', 'detalhamento']],
      ['competencias', 'Competências do ENEM', ['C1 a C5']],
    ],
  },
];

// Disciplinas avaliadas no diagnóstico de nivelamento (ordem de apresentação).
export const DIAGNOSTIC_DISCIPLINES = [
  'matematica', 'biologia', 'quimica', 'fisica', 'portugues', 'interpretacao',
  'literatura', 'historia', 'geografia', 'filosofia', 'sociologia',
];

export const LEVELS = { 1: 'Básica', 2: 'Intermediária', 3: 'Avançada', 4: 'Muito avançada' };

const byId = new Map(DISCIPLINES.map((d) => [d.id, d]));

export function getDiscipline(id) {
  return byId.get(id) || null;
}

export function getTopic(disciplineId, topicId) {
  const d = byId.get(disciplineId);
  if (!d) return null;
  const t = d.topics.find(([tid]) => tid === topicId);
  return t ? { id: t[0], name: t[1], subtopics: t[2] } : null;
}

export function topicName(disciplineId, topicId) {
  return getTopic(disciplineId, topicId)?.name || topicId;
}

export function isValidTopic(disciplineId, topicId) {
  return !!getTopic(disciplineId, topicId);
}

/** Versão serializável para a API/frontend. */
export function curriculumJSON() {
  return DISCIPLINES.map((d) => ({
    id: d.id, name: d.name, enemArea: d.enemArea, medPriority: d.medPriority, color: d.color,
    topics: d.topics.map(([id, name, subtopics]) => ({ id, name, subtopics })),
  }));
}
