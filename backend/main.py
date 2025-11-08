from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain, ConversationChain
from langchain.memory import ConversationBufferMemory
from dotenv import load_dotenv
import os, json, uvicorn

# === Load environment ===
load_dotenv()
DATA_DIR = "./frontend/data"
os.makedirs(DATA_DIR, exist_ok=True)

# === FastAPI App ===
app = FastAPI(title="MCP-like FastAPI Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Gemini Model ===
llm = ChatGoogleGenerativeAI(
    model=os.getenv("MODEL_NAME", "gemini-1.5-pro"),
    google_api_key=os.getenv("GOOGLE_API_KEY"),
    temperature=0.6,
)

# === Memory for normal chat ===
memory = ConversationBufferMemory(return_messages=True)
chat_chain = ConversationChain(llm=llm, memory=memory)

# ==========================================================
# 🧩 Define Tool Handlers
# ==========================================================

def tool_create_file(args: Dict[str, Any]):
    """Create a new Notion-like JSON file."""
    name = args.get("name", "Untitled")
    file_type = args.get("type", "todolist")
    filename = f"{name.lower().replace(' ', '_')}.json"
    filepath = os.path.join(DATA_DIR, filename)

    if file_type == "table":
        content = {
            "name": name,
            "type": "table",
            "columns": [
                {"name": "Task", "type": "text"},
                {"name": "Status", "type": "options", "options": ["In Progress", "Completed"]},
                {"name": "Priority", "type": "options", "options": ["High", "Medium", "Low"]},
                {"name": "Due Date", "type": "date"}
            ],
            "values": []
        }
    else:
        content = {
            "name": name,
            "type": "todolist",
            "items": [
                {"task": "New Task 1", "done": False},
                {"task": "New Task 2", "done": False},
            ],
        }

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(content, f, indent=2)

    return {"status": "created", "path": filepath, "content": content}


def tool_list_files(_args=None):
    """List all JSON files in data directory."""
    files = [f for f in os.listdir(DATA_DIR) if f.endswith(".json")]
    return {"files": files}


def tool_update_file(args: Dict[str, Any]):
    """Update an existing JSON file."""
    name = args.get("name")
    if not name:
        return {"error": "Missing file name."}

    filename = f"{name.lower().replace(' ', '_')}.json"
    filepath = os.path.join(DATA_DIR, filename)
    if not os.path.exists(filepath):
        return {"error": f"{filename} not found."}

    data = json.load(open(filepath, "r", encoding="utf-8"))
    patch = args.get("update", {})

    for key, value in patch.items():
        data[key] = value

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    return {"status": "updated", "path": filepath, "content": data}


TOOLS = {
    "create_file": {"description": "Create a new Notion-style JSON file.", "handler": tool_create_file},
    "list_files": {"description": "List all JSON files in data directory.", "handler": tool_list_files},
    "update_file": {"description": "Update an existing JSON file.", "handler": tool_update_file},
}

# ==========================================================
# 🧠 Prompt for LLM "tool reasoning"
# ==========================================================

tool_prompt = PromptTemplate.from_template("""
You are a helpful assistant that can both chat and use tools.

Available tools:
{tool_descriptions}

When a user asks for a normal question, chat naturally.

When the user explicitly asks to create, list, modify, or manage a Notion-like JSON file (table or todo list),
respond in this format ONLY:

{{
  "type": "tool_call",
  "name": TOOL_NAME,
  "arguments": {{ ARGUMENTS_OBJECT }}
}}

Example:
User: "Make a todo list for my daily habits"
Assistant:
{{
  "type": "tool_call",
  "name": "create_file",
  "arguments": {{ "name": "Daily Habits", "type": "todolist" }}
}}

User: "List my existing files"
Assistant:
{{
  "type": "tool_call",
  "name": "list_files",
  "arguments": {{}}
}}

If it's not a tool request, respond normally.
User message:
{user_input}
""")

tool_descriptions = json.dumps(
    {name: {"description": t["description"]} for name, t in TOOLS.items()}, indent=2
)
tool_chain = LLMChain(llm=llm, prompt=tool_prompt)

# ==========================================================
# 🔌 API Models
# ==========================================================
class Msg(BaseModel):
    content: str
    role: Optional[str] = "user"

# ==========================================================
# 🚀 Chat/Tool Endpoint
# ==========================================================
@app.post("/chat/chat")
async def chat(m: Msg):
    """
    Auto-detect tool calls vs normal chat.
    If the model outputs {"type": "tool_call"...}, execute the tool.
    Otherwise, return chat text.
    """
    try:
        print(f"\n🧠 User: {m.content}")

        # Run through reasoning chain
        llm_output = tool_chain.run(user_input=m.content, tool_descriptions=tool_descriptions)
        print("🔍 Raw model output:", llm_output)

        # Try to detect tool call
        if '"type"' in llm_output and "tool_call" in llm_output:
            start = llm_output.find("{")
            end = llm_output.rfind("}") + 1
            json_str = llm_output[start:end]

            try:
                tool_call = json.loads(json_str)
            except json.JSONDecodeError:
                print("⚠️ Could not parse model output as JSON.")
                return {"mode": "chat", "generated_text": llm_output}

            tool_name = tool_call.get("name")
            args = tool_call.get("arguments", {})
            print(f"🧩 Tool call detected: {tool_name}({args})")

            if tool_name in TOOLS:
                result = TOOLS[tool_name]["handler"](args)
                print("✅ Tool result:", result)
                return {"mode": "tool", "tool": tool_name, "result": result}
            else:
                print("⚠️ Unknown tool name:", tool_name)
                return {"mode": "error", "error": f"Unknown tool: {tool_name}"}

        else:
            # Normal chat
            print("💬 Chat mode detected.")
            reply = chat_chain.predict(input=m.content)
            return {"mode": "chat", "generated_text": reply}

    except Exception as e:
        print("❌ Exception:", e)
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================================
# 🖥️ Run
# ==========================================================
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
