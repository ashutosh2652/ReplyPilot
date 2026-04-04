from langchain_ollama import OllamaLLM
from langchain.prompts import PromptTemplate
from langchain.schema import StrOutputParser
from app.services.classify_service import classify_comment
from app.schemas.comment import CommentIn
import uuid

llm = OllamaLLM(model="llama2")

reply_prompt = PromptTemplate(
    input_variables=["comment", "tone", "persona"],
    template="""
You are a YouTube assistant.
Tone: {tone}
Persona: {persona}
Comment: "{comment}"
Generate a short, authentic reply.
"""
)

reply_chain = reply_prompt | llm | StrOutputParser()

def generate_reply(comment: str, tone="friendly", persona="default"):
    # Create an ephemeral CommentIn object to utilize our new classification schema
    temp_comment = CommentIn(comment_id=str(uuid.uuid4()), text=comment)
    classification = classify_comment(temp_comment)

    if classification["is_spam"] or classification["routing"] == "discard":
        return {
            "intent": classification["intent"],
            "reply": None,
            "moderation": True
        }

    reply_text = reply_chain.invoke({
        "comment": comment,
        "tone": tone,
        "persona": persona
    })

    return {
        "intent": classification["intent"],
        "reply": reply_text,
        "moderation": False
    }