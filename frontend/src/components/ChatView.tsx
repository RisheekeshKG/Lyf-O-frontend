import React, { useState, useEffect } from "react";
import { Send, RotateCcw } from "lucide-react";

interface ChatMessage {
  sender: "user" | "ai";
  text: string;
}

interface ChatViewProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onResetChat?: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  onSendMessage,
  onResetChat,
}) => {
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false); // ✅ typing animation flag

  const handleSend = () => {
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput("");
      setIsTyping(true); // start showing typing dots after user sends
    }
  };

  // ✅ stop typing animation once AI sends response
  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].sender === "ai") {
      setIsTyping(false);
    }
  }, [messages]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSend();
  };

  return (
    <div className="flex flex-col h-full bg-[#1f1f1f]">
      {/* === Header === */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100">AI Chat</h2>
        <button
          onClick={onResetChat}
          className="flex items-center gap-2 px-2 py-1 text-sm text-gray-300 hover:text-white hover:bg-[#2b2b2b] rounded-md transition"
          title="Start a new chat"
        >
          <RotateCcw size={16} />
          <span>New Chat</span>
        </button>
      </div>

      {/* === Messages === */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-10">
            💬 Start a conversation...
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${
                  msg.sender === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[75%] p-3 rounded-xl text-sm ${
                    msg.sender === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-[#2b2b2b] text-gray-200"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {/* ✅ Animated AI typing dots */}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-[#2b2b2b] text-gray-200 rounded-xl px-3 py-2 flex items-center space-x-1">
                  <div className="dot bg-gray-400 w-2 h-2 rounded-full animate-bounce"></div>
                  <div className="dot bg-gray-400 w-2 h-2 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <div className="dot bg-gray-400 w-2 h-2 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* === Input Bar === */}
      <div className="p-3 border-t border-gray-700 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message..."
          className="flex-1 bg-[#2b2b2b] text-gray-100 p-2 rounded-md border border-gray-600 focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={handleSend}
          className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-md transition"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};
