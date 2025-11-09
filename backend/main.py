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

# ==========================================================
# 🌱 Environment Setup
# ==========================================================
load_dotenv()
DATA_DIR = "./frontend/data"
MEMORY_FILE = "./frontend/data/user_memory.json"
os.makedirs(DATA_DIR, exist_ok=True)

# ==========================================================
# ⚡ FastAPI App Setup
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
# 🤖 Gemini LLM
# ==========================================================
llm = ChatGoogleGenerativeAI(
    model=os.getenv("MODEL_NAME", "gemini-1.5-pro"),
    google_api_key=os.getenv("GOOGLE_API_KEY"),
    temperature=0.6,
)

# ==========================================================
# 🧠 Memory + Normal Chat Chain
# ==========================================================
memory = ConversationBufferMemory(return_messages=True)
chat_chain = ConversationChain(llm=llm, memory=memory)

# ==========================================================
# 💾 User Memory System
# ==========================================================
def load_user_memory():
    """Load user memory from JSON file."""
    default_memory = {
        "profile": {},
        "preferences": {},
        "context": []
    }
    
    if os.path.exists(MEMORY_FILE):
        try:
            with open(MEMORY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                # Ensure all required keys exist
                for key in default_memory:
                    if key not in data:
                        data[key] = default_memory[key]
                return data
        except (json.JSONDecodeError, IOError) as e:
            print(f"⚠️ Error loading memory file: {e}")
            return default_memory
    
    return default_memory

def save_user_memory(memory_data):
    """Save user memory to JSON file."""
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(memory_data, f, indent=2)

def get_memory_context():
    """Format memory as context string for prompts."""
    mem = load_user_memory()
    context_parts = []
    
    if mem["profile"]:
        context_parts.append(f"User Profile: {json.dumps(mem['profile'], indent=2)}")
    
    if mem["preferences"]:
        context_parts.append(f"User Preferences: {json.dumps(mem['preferences'], indent=2)}")
    
    if mem["context"]:
        recent_context = mem["context"][-5:]  # Last 5 contextual facts
        context_parts.append(f"Recent Context: {', '.join(recent_context)}")
    
    return "\n".join(context_parts) if context_parts else "No user information stored yet."

# Memory extraction prompt
memory_extraction_prompt = PromptTemplate.from_template("""
You are a memory extraction system. Analyze the user's message and extract any personal information, preferences, or context.

Current user memory:
{current_memory}

User message: {user_input}

Extract information and return ONLY valid JSON with this structure (include ALL three keys even if empty):
{{
  "profile": {{}},
  "preferences": {{}},
  "context": []
}}

Guidelines for extraction:
- profile: Add role (student/professional/job seeker), interests, skills, goals
- preferences: Add preferred times, learning styles, work preferences, priorities  
- context: Add current situation facts (e.g., "preparing for Cisco interview", "studying networking")

Rules:
- ALWAYS include all three keys: profile, preferences, context
- Only populate fields if you find NEW information
- For "context", add new facts about their current situation
- Be specific and concise
- If no new information found, return: {{"profile": {{}}, "preferences": {{}}, "context": []}}
- Do NOT repeat information already in current memory
- Return ONLY the JSON, no explanation or markdown

Return the JSON now:
""")

memory_extraction_chain = LLMChain(llm=llm, prompt=memory_extraction_prompt)

def update_user_memory(user_input: str):
    """Extract and update user memory from conversation."""
    try:
        current_mem = load_user_memory()
        
        # Ensure current_mem has all required keys
        if "profile" not in current_mem:
            current_mem["profile"] = {}
        if "preferences" not in current_mem:
            current_mem["preferences"] = {}
        if "context" not in current_mem:
            current_mem["context"] = []
        
        # Extract new information
        extraction = memory_extraction_chain.invoke({
            "user_input": user_input,
            "current_memory": json.dumps(current_mem, indent=2)
        })
        extraction_text = extraction["text"] if isinstance(extraction, dict) else extraction
        
        # Clean and parse
        clean_json = extraction_text.strip()
        if clean_json.startswith("```"):
            clean_json = clean_json.strip("`").replace("json", "", 1).strip()
        
        # Handle empty response
        if not clean_json or clean_json == "{}":
            print("💭 No new memory information extracted")
            return
        
        new_info = json.loads(clean_json)
        
        # Safely merge new information
        if isinstance(new_info, dict):
            if "profile" in new_info and isinstance(new_info["profile"], dict) and new_info["profile"]:
                current_mem["profile"].update(new_info["profile"])
            
            if "preferences" in new_info and isinstance(new_info["preferences"], dict) and new_info["preferences"]:
                current_mem["preferences"].update(new_info["preferences"])
            
            if "context" in new_info and isinstance(new_info["context"], list) and new_info["context"]:
                current_mem["context"].extend(new_info["context"])
                # Keep only last 10 context items
                current_mem["context"] = current_mem["context"][-10:]
            
            save_user_memory(current_mem)
            print("💾 Memory updated:", json.dumps(new_info, indent=2))
        else:
            print("⚠️ Unexpected memory format:", type(new_info))
        
    except json.JSONDecodeError as e:
        print(f"⚠️ Memory extraction JSON parse error: {e}")
        print(f"Raw output: {extraction_text if 'extraction_text' in locals() else 'N/A'}")
    except Exception as e:
        print(f"⚠️ Memory extraction failed: {e}")
        import traceback
        traceback.print_exc()

# ==========================================================
# 🧠 Prompt for LLM Tool Reasoning (with memory)
# ==========================================================
tool_prompt = PromptTemplate.from_template("""
You are a helpful assistant that can both chat and use tools.

{memory_context}

Available tools:
{tool_descriptions}

When a user asks for a normal question, chat naturally and use the memory context to personalize your response.

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

User: "Create a timetable for my exam preparation"
Assistant:
{{
  "type": "tool_call",
  "name": "create_file",
  "arguments": {{ "name": "Exam Preparation Timetable", "type": "table" }}
}}

IMPORTANT: 
- For timetables/schedules use "type": "table"
- For simple task lists use "type": "todolist"
- Use the memory context to make responses and generated content more personalized and relevant to the user

If it's not a tool request, respond normally.
User message:
{user_input}
""")

# ==========================================================
# 🧠 Content Generation Helper (with memory)
# ==========================================================
fill_prompt = PromptTemplate.from_template("""
You are a structured JSON generator that fills a table or todo list.

{memory_context}

User request: {user_request}
File type: {file_type}

IMPORTANT: Use the memory context above to personalize the content you generate. Tailor it to the user's role, interests, and current context.

If the file type is "table":
You are given a table schema describing the columns, their types, and valid options if applicable.

Table Schema:
{schema}

Generate 8-10 realistic rows that strictly follow the schema and are PERSONALIZED to the user based on their memory context.
Return ONLY valid JSON with this format:
{{
  "values": [
    ["<value for column 1>", "<value for column 2>", "<value for column 3>", "<value for column 4>"],
    ["<value for column 1>", "<value for column 2>", "<value for column 3>", "<value for column 4>"]
  ]
}}

Rules for filling:
- For "text": write short descriptive text relevant to the user's context
- For "options": always use one of the listed options exactly
- For "date": generate valid FUTURE dates in ISO format (YYYY-MM-DD) - start from today's date onwards
- Keep the order of values matching the order of columns EXACTLY
- Make content SPECIFIC to the user's situation (e.g., if preparing for Cisco interview, include networking topics)
- Generate at least 8-10 rows
- Do NOT include markdown, extra keys, or comments — only pure JSON

If the file type is "todolist":
Return ONLY:
{{
  "items": [
    {{"task": "Task description personalized to user", "done": false}},
    {{"task": "Another task relevant to their goals", "done": false}}
  ]
}}
""")

fill_chain = LLMChain(llm=llm, prompt=fill_prompt)

# ==========================================================
# 🧩 Tool Handlers
# ==========================================================
def tool_create_file(args: Dict[str, Any]):
    """Create a new Notion-like JSON file with auto-filled content."""
    name = args.get("name", "Untitled")
    file_type = args.get("type", "todolist")
    user_request = args.get("user_request", "")
    
    # Normalize type aliases
    if file_type in ["timetable", "schedule", "calendar"]:
        file_type = "table"
    
    filename = f"{name.lower().replace(' ', '_')}.json"
    filepath = os.path.join(DATA_DIR, filename)

    # === Step 1: Base structure ===
    if file_type == "table":
        base_content = {
            "name": name,
            "type": "table",
            "columns": [
                {"name": "Date", "type": "date"},
                {"name": "Topic", "type": "text"},
                {"name": "Description", "type": "text"},
                {"name": "Duration", "type": "text"}
            ],
            "values": []
        }
    else:
        base_content = {
            "name": name,
            "type": "todolist",
            "items": []
        }

    # === Step 2: Generate realistic content with memory ===
    try:
        schema_description = ""
        if file_type == "table":
            cols = base_content["columns"]
            schema_description = json.dumps(cols, indent=2)

        memory_ctx = get_memory_context()
        
        gen_json = fill_chain.invoke({
            "user_request": user_request or name,
            "file_type": file_type,
            "memory_context": memory_ctx,
            "schema": schema_description
        })
        gen_json = gen_json["text"] if isinstance(gen_json, dict) else gen_json
        print("🧠 Generated JSON:", gen_json)

        # 🩹 Clean model output
        clean_json = gen_json.strip()
        if clean_json.startswith("```"):
            clean_json = clean_json.strip("`").replace("json", "", 1).strip()
        
        generated_data = json.loads(clean_json)
        print("✅ Parsed data:", generated_data)

    except Exception as e:
        print("⚠️ Failed to generate filled data:", e)
        import traceback
        traceback.print_exc()
        generated_data = {}

    # === Step 3: Merge base + generated ===
    if file_type == "table":
        if isinstance(generated_data, dict) and "values" in generated_data:
            # Ensure values is a list of lists
            values = generated_data["values"]
            if isinstance(values, list) and len(values) > 0:
                base_content["values"] = values
                print(f"✅ Added {len(values)} rows to table")
            else:
                print("⚠️ Generated values is empty or invalid")
        elif isinstance(generated_data, list):
            # If model returned a plain list of rows
            rows = []
            for row in generated_data:
                if isinstance(row, dict):
                    rows.append(list(row.values()))
                elif isinstance(row, list):
                    rows.append(row)
            if rows:
                base_content["values"] = rows
                print(f"✅ Added {len(rows)} rows to table")

    elif file_type == "todolist":
        # Handle possible key name variations like "tasks" or "items"
        if "items" in generated_data:
            base_content["items"] = generated_data["items"]
        elif "tasks" in generated_data:
            # Convert "tasks" → "items"
            base_content["items"] = [
                {"task": t.get("description", t.get("task", "")), "done": t.get("completed", t.get("done", False))}
                for t in generated_data["tasks"]
            ]

    # === Step 4: Save ===
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(base_content, f, indent=2)

    entry_count = len(base_content.get('values', base_content.get('items', [])))
    print(f"💾 Saved file: {filepath} with {entry_count} entries")
    return {"status": "created", "path": filepath, "content": base_content}


def tool_list_files(_args=None):
    """List all JSON files in data directory."""
    files = [f for f in os.listdir(DATA_DIR) if f.endswith(".json") and f != "user_memory.json"]
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


def tool_view_memory(_args=None):
    """View current user memory."""
    return load_user_memory()


def tool_clear_memory(_args=None):
    """Clear user memory."""
    save_user_memory({"profile": {}, "preferences": {}, "context": []})
    return {"status": "Memory cleared"}


# ==========================================================
# 🧰 Tool Registry
# ==========================================================
TOOLS = {
    "create_file": {"description": "Create a new Notion-style JSON file.", "handler": tool_create_file},
    "list_files": {"description": "List all JSON files in data directory.", "handler": tool_list_files},
    "update_file": {"description": "Update an existing JSON file.", "handler": tool_update_file},
    "view_memory": {"description": "View stored user information and preferences.", "handler": tool_view_memory},
    "clear_memory": {"description": "Clear all stored user memory.", "handler": tool_clear_memory},
}

tool_descriptions = json.dumps(
    {name: {"description": t["description"]} for name, t in TOOLS.items()}, indent=2
)

tool_chain = LLMChain(llm=llm, prompt=tool_prompt)

# ==========================================================
# 🧾 API Models
# ==========================================================
class Msg(BaseModel):
    content: str
    role: Optional[str] = "user"

# ==========================================================
# 🚀 Main Chat Endpoint
# ==========================================================
@app.post("/chat/chat")
async def chat(m: Msg):
    """
    Auto-detect tool calls vs normal chat.
    Extracts and stores user information from every message.
    """
    try:
        if m.content.strip() == "CLEAR":
            save_user_memory({"profile": {}, "preferences": {}, "context": []})
            
            return {"mode": "chat", "generated_text": "YO JUST CLEARED YOUR MEMORY NO WORRIES"}
            

        print(f"\n🧠 User: {m.content}")
        
        # Update user memory from this message
        update_user_memory(m.content)
        
        # Get memory context for personalization
        memory_ctx = get_memory_context()

        # Use invoke instead of deprecated .run
        llm_output = tool_chain.invoke({
            "user_input": m.content, 
            "tool_descriptions": tool_descriptions,
            "memory_context": memory_ctx
        })
        llm_output = llm_output["text"] if isinstance(llm_output, dict) and "text" in llm_output else llm_output
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
                args["user_request"] = m.content
                result = TOOLS[tool_name]["handler"](args)
                print("✅ Tool result:", result)
                return {"mode": "tool", "tool": tool_name, "result": result}
            else:
                print("⚠️ Unknown tool name:", tool_name)
                return {"mode": "error", "error": f"Unknown tool: {tool_name}"}

        else:
            # Normal chat with memory context
            print("💬 Chat mode detected.")
            # Add memory context to the conversation
            contextualized_input = f"{memory_ctx}\n\nUser: {m.content}" if memory_ctx != "No user information stored yet." else m.content
            reply = chat_chain.predict(input=contextualized_input)
            return {"mode": "chat", "generated_text": reply}

    except Exception as e:
        print("❌ Exception:", e)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================================
# 📊 Memory Management Endpoints
# ==========================================================
@app.get("/memory")
async def get_memory():
    """Get current user memory."""
    return load_user_memory()


@app.delete("/memory")
async def clear_memory():
    """Clear user memory."""
    save_user_memory({"profile": {}, "preferences": {}, "context": []})
    return {"status": "Memory cleared successfully"}


# ==========================================================
# 🖥️ Run Server
# ==========================================================
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)