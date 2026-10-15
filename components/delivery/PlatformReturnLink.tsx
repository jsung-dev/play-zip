"use client";

import { ArrowLeft } from "lucide-react";
import { PLATFORM_HOME_URL } from "@/data/platform-navigation";
import styles from "./DeliveryGame.module.css";

export function PlatformReturnLink({ confirmLeave = false }: { confirmLeave?: boolean }) {
  return (
    <a
      className={styles.platformReturn}
      href={PLATFORM_HOME_URL}
      data-platform-return
      onClick={(event) => {
        // A modified click opens a separate tab and does not discard this game.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (confirmLeave && !window.confirm("플랫폼으로 돌아갈까요?\n현재 배달 진행 상황은 저장되지 않아요.")) {
          event.preventDefault();
        }
      }}
    >
      <ArrowLeft aria-hidden="true" />
      플랫폼으로
    </a>
  );
}
