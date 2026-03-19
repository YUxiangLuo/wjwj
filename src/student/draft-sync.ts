import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * 简化的草稿同步 Hook - 仅用于 Stage 4 报告草稿
 * 
 * 核心原则：
 * - 服务端 experiment snapshot 是唯一真相来源
 * - 只保留 reportContent 的最小本地草稿能力
 * - 不做复杂冲突合并，只做最简单的本地恢复
 * - 上游变化导致 reportContent 失效时，同步清理本地草稿
 * - 提交成功后，清理本地草稿
 */

interface UseSimpleDraftOptions {
  draftKey: string | null;
  serverValue: string;
  onRestore: (value: string) => void;
}

interface UseSimpleDraftResult {
  /** 是否有本地草稿可恢复 */
  hasDraft: boolean;
  /** 恢复本地草稿到编辑器 */
  restoreDraft: () => void;
  /** 放弃本地草稿 */
  discardDraft: () => void;
  /** 保存草稿到本地（在组件卸载或提交前调用） */
  saveDraft: (value: string) => void;
  /** 清理本地草稿（提交成功后调用） */
  clearDraft: () => void;
}

/**
 * 简化的草稿 Hook - 仅用于 Stage 4 报告
 * 
 * 功能：
 * 1. 页面加载时检测是否有本地草稿
 * 2. 如果本地草稿与服务端不同，提供恢复选项
 * 3. 保存草稿到 localStorage（可选，在页面关闭前）
 * 4. 提交成功后清理草稿
 */
export function useSimpleDraft({
  draftKey,
  serverValue,
  onRestore,
}: UseSimpleDraftOptions): UseSimpleDraftResult {
  const [hasDraft, setHasDraft] = useState(false);
  const draftValueRef = useRef<string | null>(null);

  // 检测是否有本地草稿
  useEffect(() => {
    if (!draftKey) {
      setHasDraft(false);
      draftValueRef.current = null;
      return;
    }

    try {
      const rawDraft = localStorage.getItem(draftKey);
      if (!rawDraft) {
        setHasDraft(false);
        return;
      }

      // 如果本地草稿与服务端值相同，不需要恢复
      if (rawDraft === serverValue) {
        setHasDraft(false);
        return;
      }

      // 检查草稿是否有意义（非空）
      const plainLength = rawDraft.replace(/<[^>]*>/g, "").trim().length;
      if (plainLength === 0) {
        localStorage.removeItem(draftKey);
        setHasDraft(false);
        return;
      }

      draftValueRef.current = rawDraft;
      setHasDraft(true);
    } catch {
      setHasDraft(false);
    }
  }, [draftKey, serverValue]);

  const restoreDraft = useCallback(() => {
    if (draftValueRef.current !== null) {
      onRestore(draftValueRef.current);
    }
    setHasDraft(false);
  }, [onRestore]);

  const discardDraft = useCallback(() => {
    if (draftKey) {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // ignore
      }
    }
    draftValueRef.current = null;
    setHasDraft(false);
  }, [draftKey]);

  const saveDraft = useCallback((value: string) => {
    if (!draftKey) return;
    
    // 只保存有意义的草稿（非空且与服务端不同）
    const plainLength = value.replace(/<[^>]*>/g, "").trim().length;
    if (plainLength === 0) return;
    if (value === serverValue) return;

    try {
      localStorage.setItem(draftKey, value);
    } catch {
      // ignore write errors
    }
  }, [draftKey, serverValue]);

  const clearDraft = useCallback(() => {
    if (draftKey) {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // ignore
      }
    }
    draftValueRef.current = null;
    setHasDraft(false);
  }, [draftKey]);

  return {
    hasDraft,
    restoreDraft,
    discardDraft,
    saveDraft,
    clearDraft,
  };
}

/**
 * 辅助函数：检查是否有未保存的变更
 * 用于 beforeunload 提示
 */
export function hasUnsavedChanges(currentValue: string, serverValue: string): boolean {
  return currentValue !== serverValue;
}

/**
 * 辅助函数：防抖保存
 */
export function useDebouncedSave(
  saveFn: () => void,
  deps: unknown[],
  delayMs = 3000
) {
  const saveFnRef = useRef(saveFn);
  
  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  useEffect(() => {
    const timer = setTimeout(() => {
      saveFnRef.current();
    }, delayMs);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
