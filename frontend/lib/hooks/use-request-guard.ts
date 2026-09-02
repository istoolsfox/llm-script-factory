"use client";

import { useEffect, useRef } from "react";

/**
 * Returns a guard for async loads keyed to a dependency (e.g. activeProject).
 * Each call increments a sequence number; when a slow response for an older
 * sequence resolves, `isStale(seq)` is true and the caller must discard it.
 * This prevents an outdated response from overwriting the state of the newly selected project.
 */
export function useLatestRequest(): {
    isStale: (seq: number) => boolean;
    next: () => number;
} {
    const seqRef = useRef(0);

    return {
        next: () => ++seqRef.current,
        isStale: (seq: number) => seq !== seqRef.current,
    };
}

/**
 * Warns the user before leaving/reloading the page while a long-running
 * (and billed) generation is in flight. The confirm dialog is native.
 */
export function useUnloadGuard(active: boolean, message = "Generation is still in progress; leaving the page will not cancel the backend task. Are you sure you want to leave?") {
    useEffect(() => {
        if (!active) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = message;
            return message;
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [active, message]);
}
