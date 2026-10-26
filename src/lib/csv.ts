// UTF-8 BOM + quoted RFC4180 cells. Prefix spreadsheet formula/control characters.
export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[\s\uFEFF]*[=+@\-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
export function encodeCsv(rows: unknown[][]) { return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n"; }
export function downloadCsv(filename: string, rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob([encodeCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
