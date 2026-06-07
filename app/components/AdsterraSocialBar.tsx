"use client";

import { useEffect } from "react";

export default function AdsterraSocialBar() {
  useEffect(() => {
    const scriptSrc = "https://pl29659950.effectivecpmnetwork.com/e9/16/46/e916466463c1eee5ed21157b54c2e071.js";

    // 1. Create and configure script tag
    const script = document.createElement("script");
    script.src = scriptSrc;
    script.async = true;

    // 2. Append directly to document.body (this naturally places it above </body>)
    document.body.appendChild(script);

    // Cleanup: remove the script tag when unmounted
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  return null;
}
