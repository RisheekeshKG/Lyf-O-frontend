import React, { useState } from 'react';
import { Plus, Trash2, ListTodo, Check } from 'lucide-react';

interface TodoItemProps {
  task: string;
  done: boolean;
  onToggle: () => void;
  onEdit: (newText: string) => void;
  onDelete: () => void;
}

const TodoItem: React.FC<TodoItemProps> = ({ task, done, onToggle, onEdit, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(task);

  return (
    <div className="flex justify-between items-center bg-[#1f1f1f] p-3 rounded-lg border border-gray-700">
      <div className="flex items-center gap-3 w-full">
        <button
          onClick={onToggle}
          className={`w-6 h-6 rounded-md border flex items-center justify-center ${
            done ? "bg-green-600 border-green-600" : "border-gray-600"
          }`}
        >
          {done && <Check size={14} />}
        </button>

        {editing ? (
          <input
            type="text"
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            onBlur={() => {
              onEdit(tempValue);
              setEditing(false);
            }}
            className="bg-[#1f1f1f] text-gray-200 border border-gray-600 rounded px-2 py-1 text-sm w-full"
            autoFocus
          />
        ) : (
          <span
            onClick={() => setEditing(true)}
            className="cursor-text hover:underline w-full block"
          >
            {task || "—"}
          </span>
        )}
      </div>

      <button onClick={onDelete} className="text-red-500 hover:text-red-400">
        <Trash2 size={16} />
      </button>
    </div>
  );
};

interface TodoListViewProps {
  data: {
    name: string;
    items: Array<{ task: string; done: boolean }>;
  };
  onAddTodo: () => void;
  onDeleteTodo: (index: number) => void;
  onToggleTodo: (index: number) => void;
  onEditTodo: (index: number, newText: string) => void;
}

export const TodoListView: React.FC<TodoListViewProps> = ({
  data,
  onAddTodo,
  onDeleteTodo,
  onToggleTodo,
  onEditTodo,
}) => {
  return (
    <>
      <header className="border-b border-gray-700 p-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ListTodo size={20} /> {data.name}
        </h1>
        <button
          onClick={onAddTodo}
          className="flex items-center gap-2 bg-blue-600 px-3 py-1.5 rounded-md text-sm hover:bg-blue-700"
        >
          <Plus size={16} /> Add Task
        </button>
      </header>

      <div className="p-6 space-y-3 overflow-auto flex-1">
        {data.items.map((item, index) => (
          <TodoItem
            key={index}
            task={item.task}
            done={item.done}
            onToggle={() => onToggleTodo(index)}
            onEdit={(newText) => onEditTodo(index, newText)}
            onDelete={() => onDeleteTodo(index)}
          />
        ))}
      </div>
    </>
  );
};