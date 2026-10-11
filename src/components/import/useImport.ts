"use client";

// The import batch as a hook: which files were added, how far each one is, and what was parsed.
// Files are read one at a time, entirely in the browser. Nothing here touches the saved working set.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ExtractionError,
  extractFile,
  isSupportedFile,
  terminateOcr,
  type ExtractedFile,
} from "@/lib/extract";
import {
  detectMonths,
  type MonthSummary,
  type ParsedFile,
} from "@/lib/ledger/months";
import { parseStatement, type ParseResult } from "@/lib/parse/lineParser";
import { useBudgetStore } from "@/lib/store/store";
import type { DateOrder } from "@/lib/types";

export type ImportStatus = "queued" | "reading" | "done" | "error";

export interface ImportItem {
  key: string;
  name: string;
  kind: "pdf" | "image";
  status: ImportStatus;
  progress: number; // 0..1 while reading
  stage: string;
  /** Plain-words problem. On a "done" item it sits beside the overrides, which may fix it. */
  error: string | null;
  /** Kept so the overrides can re-parse without reading the file again. */
  extracted: ExtractedFile | null;
  result: ParseResult | null;
  fallbackDate: string; // ISO YYYY-MM-DD
  flipKinds: boolean;
  dateOrder: DateOrder;
}

export interface ImportState {
  items: ImportItem[];
  parsedFiles: ParsedFile[];
  months: MonthSummary[];
  /** True while any file is waiting or being read. */
  busy: boolean;
  /** Names of files skipped because the same file is already in the batch. */
  skippedDuplicates: string[];
  addFiles: (files: File[]) => void;
  removeFile: (key: string) => void;
  setFlipKinds: (key: string, flipKinds: boolean) => void;
  setDateOrder: (key: string, dateOrder: DateOrder) => void;
  /** Drops the whole batch. Results of a file still being read are ignored when they arrive. */
  reset: () => void;
}

export const NO_ROWS_MESSAGE = "No transactions found in this file";

const EXTRACTION_MESSAGES: Record<ExtractionError["code"], string> = {
  "password-protected":
    "This PDF is password protected. Remove the password and try again.",
  unreadable:
    "This file could not be read. Try a clearer screenshot or a fresh download of the statement.",
  "unsupported-type": "Not a PDF, PNG, JPEG or WebP file. Skipped.",
};

const PARSE_FAILED_MESSAGE =
  "This file was read, but its contents could not be understood.";

interface QueueEntry {
  key: string;
  file: File;
  generation: number;
  dateOrder: DateOrder;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** The earlier of the file's last-modified time and now, as a local calendar date. */
function fallbackDateFor(file: File): string {
  const now = Date.now();
  const modified =
    Number.isFinite(file.lastModified) && file.lastModified > 0
      ? file.lastModified
      : now;
  const d = new Date(Math.min(modified, now));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function guessKind(file: File): "pdf" | "image" {
  return file.type.toLowerCase() === "application/pdf" ||
    /\.pdf$/i.test(file.name)
    ? "pdf"
    : "image";
}

function signatureOf(file: File): string {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
}

function messageForExtraction(error: unknown): string {
  if (error instanceof ExtractionError) {
    return EXTRACTION_MESSAGES[error.code] ?? EXTRACTION_MESSAGES.unreadable;
  }
  return EXTRACTION_MESSAGES.unreadable;
}

function parseKept(
  extracted: ExtractedFile,
  fallbackDate: string,
  dateOrder: DateOrder,
  flipKinds: boolean,
): Pick<ImportItem, "result" | "error"> {
  try {
    const result = parseStatement(extracted.lines, {
      dateOrder,
      fallbackDate,
      flipKinds,
    });
    return {
      result,
      error: result.rows.length === 0 ? NO_ROWS_MESSAGE : null,
    };
  } catch {
    return { result: null, error: PARSE_FAILED_MESSAGE };
  }
}

export function useImport(): ImportState {
  const [items, setItems] = useState<ImportItem[]>([]);
  const [skippedDuplicates, setSkippedDuplicates] = useState<string[]>([]);

  // Mutable bookkeeping for the read queue. Only touched from event handlers and the async loop.
  const queueRef = useRef<QueueEntry[]>([]);
  const runningRef = useRef(false);
  const generationRef = useRef(0);
  const removedRef = useRef(new Set<string>());
  const signaturesRef = useRef(new Map<string, string>());

  const patchItem = useCallback((key: string, patch: Partial<ImportItem>) => {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }, []);

  const drain = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      for (;;) {
        const entry = queueRef.current.shift();
        if (!entry) break;
        const isStale = () =>
          entry.generation !== generationRef.current ||
          removedRef.current.has(entry.key);
        if (isStale()) continue;

        patchItem(entry.key, {
          status: "reading",
          progress: 0,
          stage: "Starting",
        });
        const fallbackDate = fallbackDateFor(entry.file);
        try {
          const extracted = await extractFile(entry.file, (fraction, stage) => {
            if (isStale()) return;
            patchItem(entry.key, { progress: fraction, stage });
          });
          if (isStale()) continue;
          patchItem(entry.key, {
            status: "done",
            progress: 1,
            stage: "Done",
            kind: extracted.kind,
            extracted,
            fallbackDate,
            ...parseKept(extracted, fallbackDate, entry.dateOrder, false),
          });
        } catch (error) {
          if (isStale()) continue;
          patchItem(entry.key, {
            status: "error",
            error: messageForExtraction(error),
          });
        }
      }
    } finally {
      runningRef.current = false;
      // The whole batch has been read: stop the OCR worker. The next import restarts it.
      void terminateOcr();
    }
  }, [patchItem]);

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const defaultDateOrder = useBudgetStore.getState().settings.dateOrder;
      const added: ImportItem[] = [];
      const duplicates: string[] = [];
      const known = new Set(signaturesRef.current.values());

      for (const file of files) {
        const key = crypto.randomUUID();
        const base: ImportItem = {
          key,
          name: file.name,
          kind: guessKind(file),
          status: "queued",
          progress: 0,
          stage: "Waiting",
          error: null,
          extracted: null,
          result: null,
          fallbackDate: fallbackDateFor(file),
          flipKinds: false,
          dateOrder: defaultDateOrder,
        };
        if (!isSupportedFile(file)) {
          added.push({
            ...base,
            status: "error",
            error: EXTRACTION_MESSAGES["unsupported-type"],
          });
          continue;
        }
        // The same file twice would double every row, so it is skipped rather than read again.
        const signature = signatureOf(file);
        if (known.has(signature)) {
          duplicates.push(file.name);
          continue;
        }
        known.add(signature);
        signaturesRef.current.set(key, signature);
        queueRef.current.push({
          key,
          file,
          generation: generationRef.current,
          dateOrder: defaultDateOrder,
        });
        added.push(base);
      }

      setSkippedDuplicates(duplicates);
      if (added.length > 0) setItems((current) => [...current, ...added]);
      void drain();
    },
    [drain],
  );

  const removeFile = useCallback((key: string) => {
    removedRef.current.add(key);
    signaturesRef.current.delete(key);
    queueRef.current = queueRef.current.filter((entry) => entry.key !== key);
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const reparse = useCallback(
    (key: string, change: { flipKinds?: boolean; dateOrder?: DateOrder }) => {
      setItems((current) =>
        current.map((item) => {
          if (item.key !== key) return item;
          const next = { ...item, ...change };
          if (!item.extracted) return next;
          return {
            ...next,
            ...parseKept(
              item.extracted,
              item.fallbackDate,
              next.dateOrder,
              next.flipKinds,
            ),
          };
        }),
      );
    },
    [],
  );

  const setFlipKinds = useCallback(
    (key: string, flipKinds: boolean) => reparse(key, { flipKinds }),
    [reparse],
  );

  const setDateOrder = useCallback(
    (key: string, dateOrder: DateOrder) => reparse(key, { dateOrder }),
    [reparse],
  );

  const reset = useCallback(() => {
    generationRef.current += 1;
    queueRef.current = [];
    removedRef.current.clear();
    signaturesRef.current.clear();
    setItems([]);
    setSkippedDuplicates([]);
  }, []);

  // Leaving the page: ignore whatever is still being read and stop the OCR worker.
  useEffect(() => {
    const generation = generationRef;
    const queue = queueRef;
    return () => {
      generation.current += 1;
      queue.current = [];
      void terminateOcr();
    };
  }, []);

  const parsedFiles = useMemo<ParsedFile[]>(() => {
    const files: ParsedFile[] = [];
    for (const item of items) {
      if (!item.extracted || !item.result || item.result.rows.length === 0)
        continue;
      files.push({
        file: {
          id: item.extracted.id,
          name: item.extracted.name,
          kind: item.extracted.kind,
        },
        rows: item.result.rows,
      });
    }
    return files;
  }, [items]);

  const months = useMemo(() => detectMonths(parsedFiles), [parsedFiles]);

  const busy = items.some(
    (item) => item.status === "queued" || item.status === "reading",
  );

  return {
    items,
    parsedFiles,
    months,
    busy,
    skippedDuplicates,
    addFiles,
    removeFile,
    setFlipKinds,
    setDateOrder,
    reset,
  };
}
