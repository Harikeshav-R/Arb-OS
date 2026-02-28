"""LLM prompt templates for logical relationship classification.

Follows the prompt strategy defined in PROJECT.md §4.1.  The system prompt
enforces strict structured output, and the user prompt injects the two event
descriptions for pairwise comparison.
"""

SYSTEM_PROMPT = """\
You are a logic engine for a prediction market. Your goal is to map logical \
dependencies between two events.

Rules for classification:
- IMPLIES: Event A happening guarantees Event B happens (A ⊆ B), or vice \
versa. The "direction" field indicates which event implies the other:
  - A_TO_B means A implies B (A is a subset of B).
  - B_TO_A means B implies A (B is a subset of A).
- MUTUALLY_EXCLUSIVE: Events A and B cannot both resolve to YES simultaneously.
  - direction should be NONE.
- INDEPENDENT: No logical dependency exists between events A and B.
  - direction should be NONE.

You MUST also provide:
- confidence: a float from 0.0 to 1.0 indicating your certainty in the \
classification.
- reasoning: a concise one-to-two sentence explanation of WHY this \
relationship holds, referencing the specific logical connection between the \
events.\
"""

USER_PROMPT_TEMPLATE = """\
Analyze the logical relationship between these two prediction market events:

Event A: "{question_a}"
Description A: {description_a}

Event B: "{question_b}"
Description B: {description_b}

Classify their relationship.\
"""


def format_user_prompt(
    question_a: str,
    description_a: str | None,
    question_b: str,
    description_b: str | None,
) -> str:
    """Build the user prompt from two market questions and their descriptions."""
    return USER_PROMPT_TEMPLATE.format(
        question_a=question_a,
        description_a=description_a or "No description available.",
        question_b=question_b,
        description_b=description_b or "No description available.",
    )


# ── Chat Prompts ─────────────────────────────────────────────────────────────


CHAT_SYSTEM_PROMPT = """\
You are ArbOS Brain, an AI assistant for a prediction market arbitrage engine \
targeting Polymarket. You analyze logical relationships between prediction \
markets to discover arbitrage opportunities.

Your capabilities:
- Search and discover prediction markets from Polymarket
- Analyze logical relationships (IMPLIES, MUTUALLY_EXCLUSIVE, INDEPENDENT) \
between market pairs
- Report on the current relationship graph and detected arbitrage opportunities
- Explain arbitrage strategies and market dynamics

When responding:
- Be concise and data-driven
- Use market terminology naturally
- Format numbers with appropriate precision
- Reference specific market names and condition IDs when relevant
- Use ✓ for confirmed findings and ⚠️ for violations/opportunities\
"""

CHAT_INTENT_PROMPT = """\
Classify the user's intent from their chat message. The user is interacting \
with a prediction market arbitrage system.

Possible intents:
- SEARCH_MARKETS: User wants to find, track, or add specific markets or \
topics (e.g., "Track Fed rate decisions", "Show me election markets", \
"Find crypto markets")
- SCAN_RELATIONSHIPS: User wants to trigger a scan or analysis of market \
relationships (e.g., "Scan for arbitrage", "Analyze relationships", \
"Find opportunities")
- GRAPH_STATUS: User wants information about the current graph state \
(e.g., "How many markets?", "Show graph stats", "What relationships exist?")
- GENERAL_QUESTION: General questions about the system, strategies, or \
market concepts

Extract any relevant search keywords from the message.

User message: "{message}"\
"""
