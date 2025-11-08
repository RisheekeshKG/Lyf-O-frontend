import React, { useEffect, useState } from 'react';
import { Sidebar } from "./components/Sidebar";
import { TableView } from "./components/TableView";
import { TodoListView } from "./components/TodoListView";
import { ChatView } from "./components/ChatView";

interface ChatMessage {
  sender: 'user' | 'ai';
  text: string;
}

const HomePage: React.FC = () => {
  const [dataFiles, setDataFiles] = useState<{ name: string; file: string; data: any }[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeView, setActiveView] = useState<"data" | "chat">("data");

  // Save chat to JSON file
  const saveChat = async (messages: ChatMessage[]) => {
    try {
      const chatData = { messages };
      await window.electron.ipcRenderer.invoke('writeFile', 'chat.json', JSON.stringify(chatData, null, 2));
      console.log("💾 Chat saved");
    } catch (error) {
      console.error("Error saving chat:", error);
    }
  };

  // Load chat history when component mounts
  useEffect(() => {
    const loadChat = async () => {
      try {
        const modules = import.meta.glob("@/data/*.json", { eager: true });
        const chatFile = modules['@/data/chat.json'] as { messages: ChatMessage[] };
        if (chatFile && chatFile.messages) {
          setChatMessages(chatFile.messages);
        }
      } catch (error) {
        console.error("Error loading chat:", error);
      }
    };
    loadChat();
  }, []);

  // Handle sending chat messages
  const handleSendMessage = async (message: string) => {
    try {
      // Add user message to UI
      const userMessage: ChatMessage = { sender: "user", text: message };
      setChatMessages((prev: ChatMessage[]) => {
        const newMessages: ChatMessage[] = [...prev, userMessage];
        saveChat(newMessages);
        return newMessages;
      });

      // Send message to backend
      let response;
      try {
        response = await fetch('http://localhost:8000/chat/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            content: message,
            role: 'user'
          })
        });
      } catch (e) {
        throw new Error('Unable to connect to the backend server. Please make sure the server is running on http://localhost:8000');
      }

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();
      
      // Add AI response to chat
      const aiResponse: ChatMessage = { sender: "ai", text: data.generated_text };
      setChatMessages((prev: ChatMessage[]) => {
        const newMessages: ChatMessage[] = [...prev, aiResponse];
        saveChat(newMessages);
        return newMessages;
      });
    } catch (error: any) {
      console.error('Error sending message:', error);
      setChatMessages((prev: ChatMessage[]) => {
        const newMessages: ChatMessage[] = [...prev, {
          sender: "ai",
          text: `Error: ${error.message || 'Something went wrong. Please try again.'}`
        }];
        saveChat(newMessages);
        return newMessages;
      });
    }
  };

  // Load all JSON files from data folder except chat.json
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await window.electron.ipcRenderer.invoke('readDir', 'data');
        const files = response.filter(file => file !== 'chat.json' && file.endsWith('.json'));
        
        const loadedFiles = [];
        for (const file of files) {
          const data = await window.electron.ipcRenderer.invoke('readFile', file);
          if (data && data.type) { // Only add if it has a type property
            loadedFiles.push({
              name: data.name || file.replace('.json', ''),
              file: file,
              data: data
            });
          }
        }
        setDataFiles(loadedFiles);
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };
    loadData();
  }, []);

  // Save data when changes have stabilized
  useEffect(() => {
    if (!dataFiles[activeIndex]) return;

    let previousData = JSON.stringify(dataFiles[activeIndex].data);
    let hasChanges = false;

    const saveData = async () => {
      try {
        const currentData = JSON.stringify(dataFiles[activeIndex].data);
        // Only save if data has actually changed
        if (currentData !== previousData && hasChanges) {
          await saveToFile(dataFiles[activeIndex].file, dataFiles[activeIndex].data);
          previousData = currentData;
          hasChanges = false;
        }
      } catch (error) {
        console.error('Error auto-saving data:', error);
      }
    };

    // Mark that changes occurred
    hasChanges = true;

    // Use a longer debounce (3 seconds) to wait for changes to stabilize
    const timeoutId = setTimeout(saveData, 3000);
    return () => clearTimeout(timeoutId);
  }, [dataFiles, activeIndex]);

  const activeData = dataFiles[activeIndex]?.data;

  // Table actions
  const saveToFile = async (fileName: string, data: any) => {
    if (!fileName || !data) {
      console.error('Invalid file name or data:', { fileName, data });
      return;
    }

    try {
      const result = await window.electron.ipcRenderer.invoke('writeFile', fileName, JSON.stringify(data, null, 2));
      if (!result) {
        throw new Error('File save operation failed');
      }
      console.log(`💾 Successfully saved to ${fileName}`);
    } catch (error) {
      console.error(`Error saving to ${fileName}:`, error);
      // TODO: Add user notification of save failure
      throw error; // Propagate error to handler
    }
  };

  const handleValueChange = (rowIndex: number, colIndex: number, newValue: string) => {
    if (!activeData || !dataFiles[activeIndex]) return;
    
    const updated = { ...activeData };
    updated.values[rowIndex][colIndex] = newValue;
    const newFiles = [...dataFiles];
    newFiles[activeIndex].data = updated;
    setDataFiles(newFiles);
  };

  const handleAddRow = () => {
    if (!activeData || !dataFiles[activeIndex]) return;

    const updated = { ...activeData };
    const newRow = updated.columns.map(() => "");
    updated.values.push(newRow);
    const newFiles = [...dataFiles];
    newFiles[activeIndex].data = updated;
    setDataFiles(newFiles);
  };

  const handleDeleteRow = (rowIndex: number) => {
    if (!activeData || !dataFiles[activeIndex]) return;

    const updated = { ...activeData };
    updated.values.splice(rowIndex, 1);
    const newFiles = [...dataFiles];
    newFiles[activeIndex].data = updated;
    setDataFiles(newFiles);
  };

  // TodoList actions
  const handleToggleTodo = (index: number) => {
    if (!activeData || !dataFiles[activeIndex]) return;

    const updated = { ...activeData };
    updated.items[index].done = !updated.items[index].done;
    const newFiles = [...dataFiles];
    newFiles[activeIndex].data = updated;
    setDataFiles(newFiles);
  };

  const handleEditTodo = (index: number, newText: string) => {
    if (!activeData || !dataFiles[activeIndex]) return;

    const updated = { ...activeData };
    updated.items[index].task = newText;
    const newFiles = [...dataFiles];
    newFiles[activeIndex].data = updated;
    setDataFiles(newFiles);
  };

  const handleAddTodo = () => {
    if (!activeData || !dataFiles[activeIndex]) return;

    const updated = { ...activeData };
    updated.items.push({ task: "", done: false });
    const newFiles = [...dataFiles];
    newFiles[activeIndex].data = updated;
    setDataFiles(newFiles);
  };

  const handleDeleteTodo = (index: number) => {
    if (!activeData || !dataFiles[activeIndex]) return;

    const updated = { ...activeData };
    updated.items.splice(index, 1);
    const newFiles = [...dataFiles];
    newFiles[activeIndex].data = updated;
    setDataFiles(newFiles);
  };

  return (
    <div className="flex h-screen bg-[#191919] text-gray-200 font-sans">
      <Sidebar
        dataFiles={dataFiles}
        activeIndex={activeIndex}
        activeView={activeView}
        onFileSelect={(index) => {
          setActiveIndex(index);
          setActiveView('data'); // Switch back to data view when selecting a file
        }}
        onViewChange={setActiveView}
      />

      <main className="flex-1 flex flex-col">
        {activeView === "chat" ? (
          <ChatView
            messages={chatMessages}
            onSendMessage={handleSendMessage}
          />
        ) : activeData ? (
          activeData.type === "table" ? (
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
              Unsupported file type: <span className="ml-2 font-semibold">{activeData.type}</span>
            </div>
          )
        ) : (
          <div className="flex items-center justify-center flex-1 text-gray-500">
            Loading data...
          </div>
        )}
      </main>
    </div>
  );
};

export default HomePage;
