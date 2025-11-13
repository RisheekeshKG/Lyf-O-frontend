from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain, ConversationChain
from langchain.memory import ConversationBufferMemory
from dotenv import load_dotenv
from pathlib import Path
from difflib import get_close_matches
from kmodes.kprototypes import KPrototypes

import os, json, uvicorn, re
import pandas as pd
import joblib
import numpy as np

# ==========================================================
# 🌱 ENV + PATHS
# ==========================================================
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "frontend" / "data"
ML_DIR = BASE_DIR / "backend"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# ==========================================================
# ⚡ FASTAPI APP
# ==========================================================
app = FastAPI(title="MCP-like FastAPI Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================================
# 🤖 LLM SETUP
# ==========================================================
llm = ChatGoogleGenerativeAI(
    model=os.getenv("MODEL_NAME", "gemini-1.5-pro"),
    google_api_key=os.getenv("GOOGLE_API_KEY"),
    temperature=0.6,
)

memory = ConversationBufferMemory(return_messages=True)
chat_chain = ConversationChain(llm=llm, memory=memory)

# ==========================================================
# 📁 LOAD DATASET + MODEL
# ==========================================================
df_users = pd.read_csv(ML_DIR / "clustered.csv")

def parse_template(x):
    """Parse JSON list stored as string in CSV."""
    try:
        return json.loads(x.replace("''", '"'))
    except:
        try:
            return json.loads(x)
        except:
            return []
        
df_users["template"] = df_users["template"].apply(parse_template)

# Load trained KPrototypes
kproto: KPrototypes = joblib.load(ML_DIR / "kproto_model.pkl")

FEATURE_COLUMNS = [
    "age", "gender", "occupation", "education_level", "device_type", "daily_usage_hours"
]

CATEGORICAL_IDX = [1, 2, 3, 4]  # positions of categorical features


def to_kproto_vector(user_dict):
    """Convert user dict → model vector."""
    return [
        user_dict["age"],
        user_dict["gender"],
        user_dict["occupation"],
        user_dict["education_level"],
        user_dict["device_type"],
        user_dict["daily_usage_hours"],
    ]

# ==========================================================
# 🔧 Storage Utilities
# ==========================================================
def safe_filename(name: str) -> str:
    name = name.strip().lower()
    name = re.sub(r"[^\w\s-]", "", name)
    name = re.sub(r"[-\s]+", "_", name)
    return f"{name}.json" if name else "untitled.json"

def find_best_matching_file(query: str, data_dir: Path):
    try:
        files = [f for f in os.listdir(data_dir) if f.endswith(".json")]
        cleaned = {f.lower().replace("_", " ").replace(".json", ""): f for f in files}
        match = get_close_matches(query.lower(), cleaned.keys(), n=1, cutoff=0.4)
        return cleaned[match[0]] if match else None
    except:
        return None

# ==========================================================
# 🔧 File Creation Helpers
# ==========================================================
def generate_table_schema(user_request: str):
    req = user_request.lower()
    if any(k in req for k in ["project", "schedule", "task", "class", "work"]):
        return (
            [
                {"name": "Task", "type": "text"},
                {"name": "Status", "type": "options", "options": ["In Progress", "Completed"]},
                {"name": "Priority", "type": "options", "options": ["High", "Medium", "Low"]},
                {"name": "Due Date", "type": "date"},
            ],
            [["Hello", "In Progress", "Medium", "2025-11-11"]],
        )

    return (
        [
            {"name": "Topic", "type": "text"},
            {"name": "Status", "type": "options", "options": ["Ongoing", "Done"]},
            {"name": "Deadline", "type": "date"},
        ],
        [["Default topic", "Ongoing", "2025-11-12"]],
    )

# ==========================================================
# 🛠 TOOL HANDLERS
# ==========================================================
def tool_create_file(args):
    name = args.get("name", "Untitled")
    file_type = args.get("type", "todolist")
    user_request = args.get("user_request", "")

    filename = safe_filename(name)
    filepath = DATA_DIR / filename

    if file_type == "table":
        cols, vals = generate_table_schema(user_request)
        content = {"name": name, "type": "table", "columns": cols, "values": vals}
    else:
        content = {
            "name": name,
            "type": "todolist",
            "items": [{"task": "New Task 1", "done": False}],
        }

    json.dump(content, open(filepath, "w"), indent=2)
    return {"status": "created", "content": content}

def tool_list_files(_args=None):
    return {"files": [f for f in os.listdir(DATA_DIR) if f.endswith(".json")]}

def tool_update_file(args):
    name = args.get("name") or args.get("user_request")
    filename = find_best_matching_file(name, DATA_DIR)
    if not filename:
        return {"error": "File not found."}

    filepath = DATA_DIR / filename
    data = json.load(open(filepath))

    if data["type"] == "table":
        data["values"].append(["Hello", "In Progress", "Medium", "2025-11-11"])
    else:
        data["items"].append({"task": "New Example Task", "done": False})

    json.dump(data, open(filepath, "w"), indent=2)
    return {"status": "updated", "content": data}

TOOLS = {
    "create_file": {"handler": tool_create_file},
    "list_files": {"handler": tool_list_files},
    "update_file": {"handler": tool_update_file},
}

# ==========================================================
# LLM Tool Prompt
# ==========================================================
tool_prompt = PromptTemplate(
    input_variables=["tool_descriptions", "user_input"],
    template=(
        "You use tools.\n\n"
        "Tools:\n{tool_descriptions}\n\n"
        "If user asks to create/edit a JSON file, output ONLY:\n"
        "{\"type\": \"tool_call\", \"name\": TOOL_NAME, \"arguments\": {...}}\n\n"
        "User:\n{user_input}"
    ),
)

tool_descriptions = json.dumps({k: {"description": ""} for k in TOOLS}, indent=2)
tool_chain = LLMChain(llm=llm, prompt=tool_prompt)

# ==========================================================
# CHAT ENDPOINT
# ==========================================================
class Msg(BaseModel):
    content: str

@app.post("/chat/chat")
async def chat(m: Msg):
    try:
        result = tool_chain.invoke({"user_input": m.content, "tool_descriptions": tool_descriptions})
        txt = result.get("text", "")

        if '"type": "tool_call"' in txt:
            tool_call = json.loads(txt[txt.find("{"): txt.rfind("}") + 1])
            name = tool_call["name"]
            args = tool_call["arguments"]
            args.setdefault("user_request", m.content)
            return {"mode": "tool", "result": TOOLS[name]["handler"](args)}

        return {"mode": "chat", "generated_text": chat_chain.predict(input=m.content)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================================
# 🚀  RECOMMENDER (RANDOM USER)
# ==========================================================
@app.get("/recommend")
async def recommend_random():

    u = df_users.sample(1).iloc[0]
    user_vec = to_kproto_vector(u[FEATURE_COLUMNS].to_dict())

    # FIX: convert to numpy array
    user_np = np.array([user_vec], dtype=object)

    cluster = int(kproto.predict(user_np, categorical=CATEGORICAL_IDX)[0])

    cluster_users = df_users[df_users["cluster"] == cluster]

    templates = []

    for row in cluster_users["template"]:
        if row is None:
            continue

        if isinstance(row, str):
            row = json.loads(row)

        if isinstance(row, dict):
            row = [row]

        if isinstance(row, list):
            for item in row:
                if isinstance(item, dict):
                    templates.append(item)

    seen = set()
    unique = []
    for t in templates:
        nm = t.get("name", "").lower().strip()
        if nm and nm not in seen:
            seen.add(nm)
            unique.append(t)

    return {
        "mode": "random",
        "cluster": cluster,
        "user_used": u[FEATURE_COLUMNS].to_dict(),
        "recommendations": unique[:3],
    }


# ==========================================================
# 🚀  RECOMMENDER (USER INPUT)
# ==========================================================
class UserProfile(BaseModel):
    age: int
    gender: str
    occupation: str
    education_level: str
    device_type: str
    daily_usage_hours: float

@app.post("/recommend")
async def recommend_user(p: UserProfile):

    user_clean = {
        "age": float(p.age),
        "gender": str(p.gender),
        "occupation": str(p.occupation),
        "education_level": str(p.education_level),
        "device_type": str(p.device_type),
        "daily_usage_hours": float(p.daily_usage_hours),
    }

    user_vec = to_kproto_vector(user_clean)

    # FIX: convert to numpy array
    user_np = np.array([user_vec], dtype=object)

    cluster = int(kproto.predict(user_np, categorical=CATEGORICAL_IDX)[0])

    cluster_users = df_users[df_users["cluster"] == cluster]

    if cluster_users.empty:
        return {
            "mode": "input_user",
            "cluster": cluster,
            "user": p.dict(),
            "recommendations": [],
            "reason": "No users found in this cluster",
        }

    templates = []

    for row in cluster_users["template"]:
        if row is None:
            continue

        if isinstance(row, str):
            row = json.loads(row)

        if isinstance(row, dict):
            row = [row]

        if isinstance(row, list):
            for item in row:
                if isinstance(item, dict):
                    templates.append(item)

    if not templates:
        return {
            "mode": "input_user",
            "cluster": cluster,
            "user": p.dict(),
            "recommendations": [],
            "reason": "Cluster has no templates",
        }

    seen = set()
    unique = []
    for t in templates:
        nm = t.get("name", "").strip().lower()
        if nm and nm not in seen:
            seen.add(nm)
            unique.append(t)

    return {
        "mode": "input_user",
        "cluster": cluster,
        "user": p.dict(),
        "recommendations": unique[:3],
    }



# ==========================================================
# RUN
# ==========================================================
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
