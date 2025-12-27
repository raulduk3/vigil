"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type Status = "checking" | "ok" | "down";

// Shared state across component instances to prevent flashing on remount
let cachedStatus: Status | null = null;

/**
 * Connection indicator with early MacOS styling
 * Glowing dot + text, meant for header placement
 */
export function ConnectionIndicator() {
  const [status, setStatus] = useState<Status>(cachedStatus || "checking");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const updateStatus = (newStatus: Status) => {
      if (!mounted) return;
      cachedStatus = newStatus;
      setStatus(newStatus);
    };

    const check = async () => {
      try {
        const res = await api.getHealth();
        if (!mounted) return;
        if (res && (res as Record<string, unknown>).status) {
          updateStatus("ok");
        } else {
          updateStatus("down");
        }
      } catch {
        if (!mounted) return;
        updateStatus("down");
      }
    };

    // Only check immediately if we don't have a cached status
    if (!cachedStatus) {
      check();
    }
    
    const id = window.setInterval(check, 15000);
    timerRef.current = id;

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        updateStatus("checking");
        check();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mounted = false;
      if (timerRef.current) window.clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const isConnected = status === "ok";
  const isChecking = status === "checking";

  return (
    <div 
      className="flex items-center gap-2 h-8"
      role="status"
      aria-label={`Backend ${isConnected ? "connected" : isChecking ? "checking" : "disconnected"}`}
    >
      {/* Early MacOS style glowing indicator with inset highlight */}
      <div
        className={`
          w-2 h-2 rounded-full
          ${isConnected 
            ? "bg-gradient-to-b from-green-400 to-green-600 glow-soft" 
            : isChecking
              ? "bg-gradient-to-b from-amber-400 to-amber-500 glow-soft-amber"
              : "bg-gradient-to-b from-red-400 to-red-600 glow-soft-red"
          }
        `}
      />
      <span className={`text-sm leading-none font-medium ${isConnected ? "text-gray-600" : isChecking ? "text-amber-600" : "text-red-600"}`}>
        {isConnected ? "Connected" : isChecking ? "Checking" : "Disconnected"}
      </span>
    </div>
  );
}
