import React from "react";
import { X, Trash2 } from "lucide-react";

interface DeleteModalProps {
  fileName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteModal: React.FC<DeleteModalProps> = ({
  fileName,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-[#2b2b2b] rounded-xl p-6 w-[340px] text-gray-200 relative shadow-lg transition-transform scale-100">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 text-gray-400 hover:text-white"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Trash2 size={24} className="text-red-500" />
          <h2 className="text-lg font-semibold">Delete File</h2>
        </div>

        {/* Message */}
        <p className="text-sm text-gray-300 mb-6">
          Are you sure you want to permanently delete{" "}
          <span className="text-red-400 font-medium">{fileName}</span>? <br />
          This action <span className="text-red-500 font-medium">cannot</span> be undone.
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-md transition"
          >
            Delete
          </button>
          <button
            onClick={onCancel}
            className="flex-1 border border-gray-500 hover:border-gray-300 text-gray-300 hover:text-white py-2 rounded-md transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
