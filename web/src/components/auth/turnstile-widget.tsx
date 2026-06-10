"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: TurnstileRenderOptions) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  theme?: "light" | "dark" | "auto";
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onError?: () => void;
}

/**
 * Renders a Cloudflare Turnstile challenge widget.
 *
 * Dynamically loads the Turnstile script so it is only fetched when
 * an auth form mounts. Cleans up the widget and script on unmount
 * to avoid duplicate renders across navigations.
 */
export function TurnstileWidget({ onVerify, onError }: TurnstileWidgetProps) {
  const widgetIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey) {
      console.error("NEXT_PUBLIC_TURNSTILE_SITE_KEY is not configured");
      return;
    }

    // Turnstile script is idempotent — safe to load if already present
    const renderWidget = () => {
      if (!containerRef.current || !window.turnstile) return;

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onVerify,
        "error-callback": onError,
        "expired-callback": () => onVerify(""),
        theme: "dark",
      });
    };

    // Load script if not already present
    if (!window.turnstile) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.onload = renderWidget;
      document.head.appendChild(script);
    } else {
      renderWidget();
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [onVerify, onError]);

  return <div ref={containerRef} className="flex justify-center" />;
}
