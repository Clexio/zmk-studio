import { useCallback, useEffect, useState } from "react";
import { GenericModal } from "../GenericModal";
import { useModalRef } from "../misc/useModalRef";
import { useI18n } from "../i18n";
import { X } from "lucide-react";

interface DailyPayload {
  daily?: number;
}

interface HistoryPayload {
  [date: string]: number;
}

const WEEKDAYS_ZH = ["日", "一", "二", "三", "四", "五", "六"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTokens(n: number): string {
  if (n >= 10000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return n.toLocaleString();
}

export const DailyTokenUsage = () => {
  const { t, lang } = useI18n();
  const [daily, setDaily] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const modalRef = useModalRef(open, false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("http://127.0.0.1:9753/daily", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("bad status");
        }
        const data = (await res.json()) as DailyPayload;
        if (!cancelled && typeof data.daily === "number") {
          setDaily(data.daily);
        }
      } catch {
        if (!cancelled) {
          setDaily(null);
        }
      }
    };
    void tick();
    const timer = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("http://127.0.0.1:9753/history", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("bad status");
        }
        const data = (await res.json()) as HistoryPayload;
        if (!cancelled) {
          setHistory(data);
        }
      } catch {
        if (!cancelled) {
          setHistory(null);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = new Date(year, month, 1).getDay();
  const cells: Array<number | null> = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const weekday = lang === "zh" ? WEEKDAYS_ZH : WEEKDAYS_EN;

  return (
    <>
      <button
        type="button"
        className="flex flex-col text-left rounded p-1 hover:bg-base-300"
        onClick={() => setOpen(true)}
      >
        <span className="text-sm">{t("dailyTokens")}</span>
        <span className="ml-2 text-sm">{daily === null ? "-" : daily.toLocaleString()}</span>
      </button>
      <GenericModal ref={modalRef} onClose={close} className="w-[36rem] max-w-[92vw]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{t("dailyTokensTitle")}</h2>
            <span className="text-sm">
              {year}
              {lang === "zh" ? "年" : "-"}
              {month + 1}
              {lang === "zh" ? "月" : ""}
            </span>
            <button
              type="button"
              className="text-sm hover:bg-base-300 rounded px-1"
              onClick={close}
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {weekday.map((d) => (
              <span key={d} className="text-base-content/70">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              const dateKey =
                day === null
                  ? ""
                  : `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const value = day !== null && history ? history[dateKey] : undefined;
              return (
                <div
                  key={idx}
                  className="flex flex-col items-center justify-center border border-base-300 rounded p-1 min-h-[3.5rem]"
                >
                  <span className="text-sm">{day ?? ""}</span>
                  <span className="text-[10px] leading-tight">
                    {day !== null ? (value ? formatTokens(value) : "-") : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </GenericModal>
    </>
  );
};
