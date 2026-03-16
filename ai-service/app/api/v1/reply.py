from fastapi import FastAPI
from pydantic import BaseModel
from typing import List

app = FastAPI()

class CommentList(BaseModel):
    comments: List[str]
    tone: str = "friendly"

@app.post("/generate-replies")
def generate_replies(data: CommentList):
    replies = [
        {"comment": c, "reply" : f"[{data.tone.capitalize()} tone] Thanks for your comment: {c}"}
        for c in data.comments
    ]
    return replies