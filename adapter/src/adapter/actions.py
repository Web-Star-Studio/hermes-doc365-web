"""Structured prompt templates for the six quick actions (PRD §17.3).

The adapter rewrites the user message when `action_origin != "chat"` so Hermes
receives a consistent, clearly-framed instruction even when triggered from a
button click.
"""

from __future__ import annotations

from .envelope import ActionType

# Keep templates short, pt-BR, and aligned with PRD §18 risk classification.
ACTION_TEMPLATES: dict[ActionType, str] = {
    "chat": "",
    "analyze_files": (
        "Analise os arquivos anexados a esta conversa. "
        "Identifique os tipos de documento mais prováveis, resuma o conteúdo de cada um "
        "e explique em português claro e operacional. "
        "Destaque metadados relevantes (operadora, tipo de guia, número, datas) e aponte ambiguidades."
    ),
    "check_pending": (
        "Revise os materiais anexados e identifique informações faltantes, documentos de apoio ausentes, "
        "pendências prováveis e qualquer motivo pelo qual o pacote de faturamento pode não estar pronto. "
        "Apresente o resultado como uma checklist prática."
    ),
    "validate_submission": (
        "Revise os materiais anexados para risco de rejeição. "
        "Aponte problemas estruturais, documentais e operacionais. "
        "Separe: fatos verificados, riscos prováveis e itens que precisam de confirmação humana. "
        "Classifique a prontidão para envio."
    ),
    "draft_recurso": (
        "Com base nos materiais de glosa/negativa anexados, explique o que aconteceu "
        "e rascunhe um recurso prático em português. "
        "Separe claramente informação confirmada de suposições."
    ),
    "prepare_orizon": (
        "Prepare um resumo do pacote de envio para a Orizon: operadora, tipo de guia, documentos incluídos, "
        "pendências remanescentes e próximos passos. "
        "NÃO execute envio — apenas prepare."
    ),
    "submit_orizon": (
        "Execute o envio do pacote para a Orizon. "
        "A aprovação humana já foi registrada e consta no envelope. "
        "Resuma objetivamente o resultado (sucesso, erros retornados, número de protocolo se aplicável)."
    ),
}


# Which actions require explicit human approval before execution (PRD §18.3).
SIDE_EFFECT_ACTIONS: frozenset[ActionType] = frozenset({"submit_orizon"})


def render_action_prompt(action: ActionType, user_message: str) -> str:
    """Return the prompt Hermes should see. When an action is triggered, the
    template takes precedence; any free-text the user typed is appended as
    additional context.
    """
    tmpl = ACTION_TEMPLATES.get(action, "")
    if not tmpl:
        return user_message
    if user_message.strip():
        return f"{tmpl}\n\nContexto adicional do usuário: {user_message.strip()}"
    return tmpl
