import React, { memo, useMemo } from "react";
import {
  Settings,
  Search,
  HomeIcon,
  Inbox,
  Briefcase,
  ShoppingCart,
  MessageCircle,
  Plus,
  Trash2,
} from "lucide-react";

interface SidebarItemProps {
  icon: React.ReactNode;
  text: string;
  active?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = memo(
  ({ icon, text, active, onClick, onDelete }) => (
    <div
      className={`flex justify-between items-center px-3 py-2 rounded-md cursor-pointer select-none transition-colors ${
        active ? "bg-[#2b2b2b] text-white" : "hover:bg-[#2b2b2b]"
      }`}
    >
      <div onClick={onClick} className="flex items-center gap-2 flex-1">
        {icon}
        <span className="text-sm truncate">{text}</span>
      </div>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-gray-500 hover:text-red-500 transition ml-2"
          title="Delete file"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
);

SidebarItem.displayName = "SidebarItem";

interface SidebarProps {
  dataFiles: Array<{ name: string; file: string; data: any }>;
  activeIndex: number;
  activeView: "data" | "chat" | "inbox";
  onFileSelect: (index: number) => void;
  onViewChange: (view: "data" | "chat" | "inbox") => void;
  onCreateNew: () => void;
  onDeleteFile: (file: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = memo(
  ({
    dataFiles,
    activeIndex,
    activeView,
    onFileSelect,
    onViewChange,
    onCreateNew,
    onDeleteFile,
  }) => {
    const privateItems = useMemo(
      () =>
        dataFiles.map((f, idx) => (
          <SidebarItem
            key={f.file}
            icon={<Briefcase size={18} />}
            text={f.name}
            active={idx === activeIndex && activeView === "data"}
            onClick={() => onFileSelect(idx)}
            onDelete={() => onDeleteFile(f.file)}
          />
        )),
      [dataFiles, activeIndex, activeView, onFileSelect, onDeleteFile]
    );

    return (
      <aside className="w-60 bg-[#1f1f1f] border-r border-gray-700 flex flex-col justify-between">
        {/* --- Top section --- */}
        <div>
          <div className="p-4 text-lg font-semibold truncate">
            Risheekesh K G&apos;s Space
          </div>

          <nav className="flex flex-col gap-1 px-3 overflow-y-auto">
            <SidebarItem icon={<Search size={18} />} text="Search" />
            <SidebarItem icon={<HomeIcon size={18} />} text="Home" />

            <SidebarItem
              icon={<MessageCircle size={18} />}
              text="AI Chat"
              active={activeView === "chat"}
              onClick={() => onViewChange("chat")}
            />

            {/* ✅ Inbox button now functional */}
            <SidebarItem
              icon={<Inbox size={18} />}
              text="Inbox"
              active={activeView === "inbox"}
              onClick={() => onViewChange("inbox")}
            />

            <div className="pt-3 text-xs text-gray-400 uppercase flex items-center justify-between">
              <span>Private</span>
              <button
                onClick={onCreateNew}
                className="text-gray-400 hover:text-white transition"
                title="Create new file"
              >
                <Plus size={14} />
              </button>
            </div>

            {privateItems}

            <div className="pt-3 text-xs text-gray-400 uppercase">Shared</div>
            <SidebarItem
              icon={<ShoppingCart size={18} />}
              text="Shared Resources"
            />
          </nav>
        </div>

        {/* --- Bottom settings --- */}
        <div className="p-3 border-t border-gray-700">
          <SidebarItem icon={<Settings size={18} />} text="Settings" />
        </div>
      </aside>
    );
  }
);

Sidebar.displayName = "Sidebar";
