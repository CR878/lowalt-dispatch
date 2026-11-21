import { useState } from "react";
import { Download } from "lucide-react";

export type Cell = string | number | null;

export function downloadRows(title: string, columns: string[], rows: Cell[][]) {
  const quote = (value: Cell) => {
    let text = value === null ? "" : String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text))
      text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const csv = [columns, ...rows]
    .map((row) => row.map(quote).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/[^\w\u3400-\u9fff-]/g, "_") || "agent-data"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function DataTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: Cell[][];
}) {
  const [sort, setSort] = useState<{
    column: number;
    ascending: boolean;
  } | null>(null);
  const sorted = sort
    ? [...rows].sort((a, b) => {
        const left = a[sort.column],
          right = b[sort.column];
        if (left === null) return right === null ? 0 : 1;
        if (right === null) return -1;
        const order =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left).localeCompare(String(right), "zh-CN", {
                numeric: true,
              });
        return sort.ascending ? order : -order;
      })
    : rows;
  return (
    <div className="assistant-data-table">
      <table aria-label={title}>
        <thead>
          <tr>
            {columns.map((column, i) => (
              <th
                key={i}
                scope="col"
                aria-sort={
                  sort?.column === i
                    ? sort.ascending
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <button
                  onClick={() =>
                    setSort({
                      column: i,
                      ascending: sort?.column === i ? !sort.ascending : true,
                    })
                  }
                >
                  {column}
                  <span aria-hidden="true">
                    {sort?.column === i
                      ? sort.ascending
                        ? " ↑"
                        : " ↓"
                      : " ↕"}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} data-numeric={typeof cell === "number"}>
                  {cell === null ? "—" : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="assistant-data-empty">暂无数据</p>}
    </div>
  );
}

export function DataExport({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: Cell[][];
}) {
  return (
    <button
      className="assistant-data-export"
      aria-label={`导出${title}数据`}
      onClick={() => downloadRows(title, columns, rows)}
    >
      <Download size={12} aria-hidden="true" /> CSV
    </button>
  );
}
