import axios from "axios";

export async function generateRepliesBatch(comments) {
    const response = await axios.post(
        "http://127.0.0.1:8000/generate-replies",
        { comments }
    );
    return response.data;
}