from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Comment(BaseModel):
    text: str

@app.post("/generate-replies")
def generate_reply(comment: Comment):

    reply = f"Thanks for your comment: {comment.text}"

    return {"reply": reply}