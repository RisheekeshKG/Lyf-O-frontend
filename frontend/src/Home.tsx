import React, { useEffect, useState, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { FileModal } from "./components/FileModal";
import { DeleteModal } from "./components/DeleteModal";
import { TableView } from "./components/TableView";
import { TodoListView } from "./components/TodoListView";
import { ChatView } from "./components/ChatView";
import { GmailInbox } from "./components/GmailInbox"; // ✅ Inbox view

interface ChatMessage {
  sender: "user" | "ai";
  text: string;
}

interface DataFile {
  name: string;
  file: string;
  data: any;
}

const HomePage: React.FC = () => {
  const [dataFiles, setDataFiles] = useState<DataFile[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<"data" | "chat" | "inbox">("data");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeData, setActiveData] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  // ✅ Load JSON files from /data
  const loadDataFiles = useCallback(async () => {
    try {
      for (let i = 0; i < 20 && !window.electronAPI; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }

      if (!window.electronAPI) {
        console.warn("⚠️ electronAPI not found — preload not loaded");
        setLoading(false);
        return;
      }

      const files: string[] = await window.electronAPI.invoke("readDir");
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      const loaded: DataFile[] = [];
      for (const file of jsonFiles) {
        const data = await window.electronAPI.invoke("readFile", file);
        if (data) {
          loaded.push({
            name: data.name || file.replace(".json", ""),
            file,
            data,
          });
        }
      }

      setDataFiles(loaded);

      if (loaded.length > 0) {
        setActiveIndex(0);
        setActiveData(loaded[0].data);
      } else {
        setActiveIndex(null);
        setActiveData(null);
      }
    } catch (err) {
      console.error("❌ Error loading JSON files:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDataFiles();
  }, [loadDataFiles]);

  // ✅ Save file
  const saveFile = useCallback(async (file: string, data: any) => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.invoke("writeFile", file, JSON.stringify(data, null, 2));
      console.log("💾 Saved:", file);
    } catch (e) {
      console.error("❌ Save failed:", e);
    }
  }, []);

  // ✅ File selection (for table/todo)
  const handleFileSelect = (index: number) => {
    setActiveIndex(index);
    setActiveData(dataFiles[index].data);
    setActiveView("data");
  };

  // ✅ Handle sidebar view change
  const handleViewChange = (view: "data" | "chat" | "inbox") => {
    setActiveView(view);

    // Clear file selection when moving to non-data views
    if (view !== "data") {
      setActiveIndex(null);
      setActiveData(null);
    }
  };

  // ✅ Request delete modal
  const requestFileDelete = (file: string) => {
    setFileToDelete(file);
    setShowDeleteModal(true);
  };

  // ✅ Confirm file deletion
  const confirmDeleteFile = async () => {
    if (!fileToDelete) return;
    try {
      const result = await window.electronAPI.invoke("deleteFile", fileToDelete);

      if (result?.success) {
        const updatedFiles = dataFiles.filter((f) => f.file !== fileToDelete);
        setDataFiles(updatedFiles);

        if (dataFiles[activeIndex!]?.file === fileToDelete) {
          if (updatedFiles.length > 0) {
            setActiveIndex(0);
            setActiveData(updatedFiles[0].data);
          } else {
            setActiveIndex(null);
            setActiveData(null);
          }
        }
      } else {
        alert("❌ Failed to delete file: " + (result?.error || "Unknown error"));
      }
    } catch (err) {
      console.error("❌ Delete failed:", err);
    } finally {
      setShowDeleteModal(false);
      setFileToDelete(null);
    }
  };

  // ✅ Update file data
  const updateActiveData = (newData: any) => {
    if (activeIndex === null) return;
    setActiveData(newData);
    const updated = [...dataFiles];
    updated[activeIndex] = { ...updated[activeIndex], data: newData };
    setDataFiles(updated);
    saveFile(updated[activeIndex].file, newData);
  };

  // ✅ Chat handler (AI + tool mode)
  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;
    setChatMessages((prev) => [...prev, { sender: "user", text: message }]);

    try {
      const res = await fetch("http://localhost:8000/chat/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message, role: "user" }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
      const data = await res.json();
      console.log("🤖 AI Response:", data);

      if (data.mode === "tool" && data.result?.content) {
        const jsonData = data.result.content;
        const fileName = `${jsonData.name.toLowerCase().replace(/\s+/g, "_")}.json`;

        await window.electronAPI.invoke("writeFile", fileName, JSON.stringify(jsonData, null, 2));
        setChatMessages((prev) => [
          ...prev,
          { sender: "ai", text: `✅ Created new file "${jsonData.name}" (${jsonData.type})` },
        ]);

        await loadDataFiles();
        setActiveView("data");
        return;
      }

      const aiMessage = data.generated_text || data.result || "⚙️ No response received.";
      setChatMessages((prev) => [...prev, { sender: "ai", text: aiMessage }]);
    } catch (err: any) {
      console.error("❌ Chat error:", err);
      setChatMessages((prev) => [...prev, { sender: "ai", text: `❌ Error: ${err.message}` }]);
    }
  };

  // === Table + Todo actions ===
  const handleValueChange = (row: number, col: number, val: string) => {
    const newValues = activeData.values.map((r: any[], i: number) =>
      i === row ? r.map((c, j) => (j === col ? val : c)) : r
    );
    updateActiveData({ ...activeData, values: newValues });
  };

  const handleAddRow = () => {
    const newRow = activeData.columns.map(() => "");
    updateActiveData({ ...activeData, values: [...activeData.values, newRow] });
  };

  const handleDeleteRow = (row: number) => {
    const newValues = activeData.values.filter((_: any, i: number) => i !== row);
    updateActiveData({ ...activeData, values: newValues });
  };

  const handleToggleTodo = (i: number) => {
    const newItems = activeData.items.map((t: any, idx: number) =>
      idx === i ? { ...t, done: !t.done } : t
    );
    updateActiveData({ ...activeData, items: newItems });
  };

  const handleEditTodo = (i: number, text: string) => {
    const newItems = activeData.items.map((t: any, idx: number) =>
      idx === i ? { ...t, task: text } : t
    );
    updateActiveData({ ...activeData, items: newItems });
  };

  const handleAddTodo = () => {
    const newItems = [...activeData.items, { task: "", done: false }];
    updateActiveData({ ...activeData, items: newItems });
  };

  const handleDeleteTodo = (i: number) => {
    const newItems = activeData.items.filter((_: any, idx: number) => idx !== i);
    updateActiveData({ ...activeData, items: newItems });
  };

  // === Render ===
  if (loading)
    return (
      <div className="flex items-center justify-center h-screen bg-[#191919] text-gray-400">
        Loading JSON files...
      </div>
    );

  return (
    <div className="flex h-screen bg-[#191919] text-gray-200 font-sans overflow-hidden">
      <Sidebar
        dataFiles={dataFiles}
        activeIndex={activeIndex ?? -1}
        activeView={activeView}
        onFileSelect={handleFileSelect}
        onViewChange={handleViewChange} // ✅ Updated
        onCreateNew={() => setShowModal(true)}
        onDeleteFile={requestFileDelete}
      />

      <main className="flex-1 flex flex-col overflow-y-auto scroll-smooth">
        {activeView === "chat" ? (
          <ChatView
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            onResetChat={() => setChatMessages([])}
          />
        ) : activeView === "inbox" ? (
          <GmailInbox />
        ) : !activeData ? (
          <div className="flex items-center justify-center flex-1 text-gray-400">
            No JSON file found in /data
          </div>
        ) : activeData.type === "table" ? (
          <TableView
            data={activeData}
            onValueChange={handleValueChange}
            onAddRow={handleAddRow}
            onDeleteRow={handleDeleteRow}
          />
        ) : activeData.type === "todolist" ? (
          <TodoListView
            data={activeData}
            onToggleTodo={handleToggleTodo}
            onEditTodo={handleEditTodo}
            onAddTodo={handleAddTodo}
            onDeleteTodo={handleDeleteTodo}
          />
        ) : (
          <div className="flex items-center justify-center flex-1 text-gray-400">
            Unsupported file type: {activeData?.type ?? "unknown"}
          </div>
        )}
      </main>

      {/* ✅ File Creation Modal */}
      {showModal && (
        <FileModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            loadDataFiles();
          }}
        />
      )}

      {/* ✅ Delete Confirmation Modal */}
      {showDeleteModal && fileToDelete && (
        <DeleteModal
          fileName={fileToDelete}
          onConfirm={confirmDeleteFile}
          onCancel={() => {
            setShowDeleteModal(false);
            setFileToDelete(null);
          }}
        />
      )}
    </div>
  );
};

export default HomePage;
