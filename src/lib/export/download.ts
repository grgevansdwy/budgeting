// Browser only: hands a finished workbook to the user as a file download.

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** "budget-2026-10.xlsx" for month "2026-10". */
export function exportFileName(month: string): string {
  return `budget-${month}.xlsx`;
}

export function downloadBuffer(buffer: ArrayBuffer, fileName: string): void {
  const url = URL.createObjectURL(new Blob([buffer], { type: XLSX_MIME }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on a later task so the browser has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
