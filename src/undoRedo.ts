import { createContext, useMemo, useState } from "react";

export type UndoCallback = () => Promise<void>;

export type DoCallback = () => Promise<UndoCallback>;

export function useUndoRedo(): [
  (dc: DoCallback, preserveRedo?: boolean) => Promise<void>,
  () => Promise<void>,
  () => Promise<void>,
  boolean,
  boolean,
  () => void
] {
  const [locked, setLocked] = useState<boolean>(false);
  const [undoStack, setUndoStack] = useState<Array<[DoCallback, UndoCallback]>>(
    []
  );
  const [redoStack, setRedoStack] = useState<Array<DoCallback>>([]);

  const canUndo = useMemo(
    () => !locked && undoStack.length > 0,
    [locked, undoStack]
  );
  const canRedo = useMemo(
    () => !locked && redoStack.length > 0,
    [locked, redoStack]
  );

  const doIt = async (doCb: DoCallback, preserveRedo?: boolean) => {
    setLocked(true);
    try {
      // 只有操作真正成功才入撤销栈，避免失败操作污染历史
      const undo = await doCb();
      setUndoStack((prev) => [[doCb, undo], ...prev]);
      if (!preserveRedo) {
        setRedoStack([]);
      }
    } catch (e) {
      console.error("Failed to apply edit; not added to undo history", e);
    } finally {
      setLocked(false);
    }
  };

  const undo = async () => {
    if (locked) {
      console.error("undo invoked when existing operation in progress");
      return;
    }

    if (undoStack.length === 0) {
      return;
    }

    setLocked(true);
    const [doCb, undoCb] = undoStack[0];
    try {
      // 先执行撤销，成功后才出栈并进入 redo 栈；
      // 失败则保留原撤销项，用户可重试
      await undoCb();
      setUndoStack((prev) => prev.slice(1));
      setRedoStack((prev) => [doCb, ...prev]);
    } catch (e) {
      console.error("Failed to undo", e);
    } finally {
      setLocked(false);
    }
  };

  const redo = async () => {
    if (locked) {
      console.error("redo invoked when existing operation in progress");
      return;
    }

    if (redoStack.length === 0) {
      return;
    }

    setLocked(true);
    const doCb = redoStack[0];
    try {
      const undo = await doCb();
      setRedoStack((prev) => prev.slice(1));
      setUndoStack((prev) => [[doCb, undo], ...prev]);
    } catch (e) {
      console.error("Failed to redo", e);
    } finally {
      setLocked(false);
    }
  };

  const reset = () => {
    setRedoStack([]);
    setUndoStack([]);
  };

  return [doIt, undo, redo, canUndo, canRedo, reset];
}

export const UndoRedoContext = createContext<
  ((dc: DoCallback, preserveRedo?: boolean) => Promise<void>) | null
>(null);
