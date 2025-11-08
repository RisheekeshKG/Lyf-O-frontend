import React, { useState } from 'react';
import { Plus, Trash2, Briefcase } from 'lucide-react';

interface EditableTextCellProps {
  value: string;
  onChange: (v: string) => void;
}

const EditableTextCell: React.FC<EditableTextCellProps> = ({ value, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  return editing ? (
    <input
      type="text"
      value={tempValue}
      onChange={(e) => setTempValue(e.target.value)}
      onBlur={() => {
        onChange(tempValue);
        setEditing(false);
      }}
      className="bg-[#1f1f1f] text-gray-200 border border-gray-600 rounded px-2 py-1 text-sm w-full"
      autoFocus
    />
  ) : (
    <span onClick={() => setEditing(true)} className="cursor-text hover:underline w-full block">
      {value || "—"}
    </span>
  );
};

interface EditableDateCellProps {
  value: string;
  onChange: (v: string) => void;
}

const EditableDateCell: React.FC<EditableDateCellProps> = ({ value, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const formatted = value
    ? new Date(value).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

  return editing ? (
    <input
      type="date"
      value={tempValue || ""}
      onChange={(e) => {
        setTempValue(e.target.value);
        onChange(e.target.value);
      }}
      onBlur={() => setEditing(false)}
      className="bg-[#1f1f1f] text-gray-100 border border-gray-600 rounded px-2 py-1 text-sm w-[150px]"
      autoFocus
    />
  ) : (
    <span onClick={() => setEditing(true)} className="cursor-pointer hover:underline">
      {formatted}
    </span>
  );
};

interface EditableOptionCellProps {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}

const EditableOptionCell: React.FC<EditableOptionCellProps> = ({ value, options, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  return editing ? (
    <select
      value={tempValue}
      onChange={(e) => {
        setTempValue(e.target.value);
        onChange(e.target.value);
        setEditing(false);
      }}
      onBlur={() => setEditing(false)}
      className="bg-[#1f1f1f] text-gray-200 border border-gray-600 rounded px-2 py-1 text-sm"
      autoFocus
    >
      {options.map((opt) => (
        <option key={opt}>{opt}</option>
      ))}
    </select>
  ) : (
    <span onClick={() => setEditing(true)} className="cursor-pointer hover:underline">
      {value || "—"}
    </span>
  );
};

interface TableViewProps {
  data: any;
  onAddRow: () => void;
  onDeleteRow: (index: number) => void;
  onValueChange: (rowIndex: number, colIndex: number, value: string) => void;
}

export const TableView: React.FC<TableViewProps> = ({ data, onAddRow, onDeleteRow, onValueChange }) => {
  return (
    <>
      <header className="border-b border-gray-700 p-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Briefcase size={20} /> {data.name}
        </h1>
        <button
          onClick={onAddRow}
          className="flex items-center gap-2 bg-blue-600 px-3 py-1.5 rounded-md text-sm hover:bg-blue-700"
        >
          <Plus size={16} /> Add Row
        </button>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <table className="w-full text-left border-collapse">
          <thead className="border-b border-gray-700 text-gray-400 text-sm">
            <tr>
              {data.columns.map((col: any, idx: number) => (
                <th key={idx} className="pb-3">
                  {col.name}
                </th>
              ))}
              <th className="pb-3 text-center">Actions</th>
            </tr>
          </thead>

          <tbody className="text-sm">
            {data.values.map((row: any[], rowIndex: number) => (
              <tr key={rowIndex} className="border-b border-gray-800 hover:bg-[#222] transition">
                {row.map((value, colIndex) => {
                  const col = data.columns[colIndex];
                  switch (col.type) {
                    case "options":
                      return (
                        <td key={colIndex} className="py-3">
                          <EditableOptionCell
                            value={value}
                            options={col.options || []}
                            onChange={(v) => onValueChange(rowIndex, colIndex, v)}
                          />
                        </td>
                      );
                    case "date":
                      return (
                        <td key={colIndex} className="py-3">
                          <EditableDateCell
                            value={value}
                            onChange={(v) => onValueChange(rowIndex, colIndex, v)}
                          />
                        </td>
                      );
                    default:
                      return (
                        <td key={colIndex} className="py-3">
                          <EditableTextCell
                            value={value}
                            onChange={(v) => onValueChange(rowIndex, colIndex, v)}
                          />
                        </td>
                      );
                  }
                })}
                <td className="text-center">
                  <button
                    onClick={() => onDeleteRow(rowIndex)}
                    className="text-red-500 hover:text-red-400"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};