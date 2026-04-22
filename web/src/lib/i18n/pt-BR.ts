/**
 * Single-source pt-BR string dictionary.
 * All user-facing strings live here. Keys are namespaced to the feature area.
 *
 * When adding a new string: add it here first, then reference `t.area.key` in
 * the component. Do NOT inline Portuguese strings in components.
 */

export const t = {
  app: {
    name: "Doc365 Hermes",
    tagline: "Assistente de faturamento médico",
    footer: "Doc365 Hermes — Assistente operacional de faturamento",
  },

  auth: {
    loginTitle: "Entrar no Doc365",
    loginSubtitle: "Acesse seu espaço de trabalho para começar",
    email: "E-mail",
    emailPlaceholder: "seu.email@clinica.com",
    password: "Senha",
    passwordPlaceholder: "••••••••",
    submit: "Entrar",
    submitting: "Entrando…",
    logout: "Sair",
    invalidCredentials: "E-mail ou senha incorretos.",
    genericError: "Não foi possível entrar agora. Tente novamente em instantes.",
    sessionExpired: "Sua sessão expirou. Entre novamente para continuar.",
  },

  nav: {
    conversations: "Conversas",
    newConversation: "Nova conversa",
    admin: "Administração",
    account: "Minha conta",
  },

  conversations: {
    emptyTitle: "Nenhuma conversa ainda",
    emptyBody:
      "Crie uma nova conversa para começar a enviar arquivos e conversar com o Hermes.",
    createButton: "Iniciar nova conversa",
    untitled: "Conversa sem título",
    updatedAt: "Atualizada",
    youSaid: "Você",
    hermesSaid: "Hermes",
  },

  composer: {
    placeholder: "Pergunte ao Hermes em português…",
    send: "Enviar",
    sending: "Enviando…",
    attach: "Anexar arquivos",
    waiting: "O Hermes está pensando…",
  },

  files: {
    panelTitle: "Arquivos nesta conversa",
    empty: "Nenhum arquivo anexado ainda.",
    dragDrop: "Arraste arquivos aqui ou clique para selecionar",
    supported: "Tipos aceitos: XML, PDF, imagem (JPG/PNG), ZIP",
    maxSize: "Tamanho máximo por arquivo: 50 MB",
    uploading: "Enviando…",
    uploadError: "Falha ao enviar o arquivo. Tente novamente.",
    tooLarge: "Arquivo acima do limite de 50 MB.",
    unsupported: "Tipo de arquivo não suportado nesta fase.",
  },

  actions: {
    panelTitle: "Ações rápidas",
    analyze: "Analisar arquivos",
    checkPending: "Verificar pendências",
    validate: "Validar envio",
    draftRecurso: "Rascunhar recurso",
    prepareOrizon: "Preparar envio Orizon",
    submitOrizon: "Enviar para Orizon",
    submitOrizonDisabled:
      "Envio real para a Orizon está desabilitado neste ambiente. Acione um operador para habilitar.",
    requiresApproval: "Requer aprovação",
  },

  approval: {
    title: "Confirmar ação externa",
    body: "Você está prestes a executar uma ação que pode afetar o faturamento externamente. Confirme para prosseguir.",
    scopedFiles: "Arquivos incluídos nesta ação:",
    warningsTitle: "Avisos",
    confirm: "Confirmar e executar",
    cancel: "Cancelar",
    confirming: "Executando…",
  },

  admin: {
    title: "Painel do operador",
    conversations: "Conversas",
    actionHistory: "Histórico de ações",
    files: "Arquivos",
    audit: "Auditoria",
  },

  status: {
    adapterDown:
      "O serviço do Hermes está indisponível no momento. Sua mensagem foi salva — tente reenviar em instantes.",
    retry: "Tentar novamente",
    loading: "Carregando…",
    saved: "Salvo",
  },

  errors: {
    generic: "Algo deu errado. Tente novamente.",
    notFound: "Recurso não encontrado.",
    unauthorized: "Você precisa entrar para acessar esta página.",
    forbidden: "Você não tem permissão para esta ação.",
  },
} as const;

export type Dictionary = typeof t;
