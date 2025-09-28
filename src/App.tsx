import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getCenters,
  createRequest,
  fetchRequestById,
  createSupportMessage,
  getBrands,
  getDeviceModels,
  getIssues,
  getModelPrices,
} from "./api";

/* ========= ErrorBoundary ========= */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  componentDidCatch(error: any, info: any) {
    console.error("App crash:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "#fff", background: "#0b0e14" }}>
          <h2 style={{ color: "#FFCC00", marginBottom: 8 }}>Ошибка приложения</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <p style={{ opacity: 0.7, marginTop: 8 }}>
            Откройте Console (F12) для деталей.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ===== Утилиты ===== */
function classNames(...arr: Array<string | false | undefined>) {
  return arr.filter(Boolean).join(" ");
}
function currencyRUB(n: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371,
    dLat = ((lat2 - lat1) * Math.PI) / 180,
    dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function useMouseLight() {
  const [pos, setPos] = useState({ x: 50, y: 50 });
  useEffect(() => {
    const onMove = (e: MouseEvent) =>
      setPos({
        x: (e.clientX / innerWidth) * 100,
        y: (e.clientY / innerHeight) * 100,
      });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
  return pos;
}

/* ===== UI ===== */
const Chip: React.FC<{
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={classNames(
      "px-3 py-1 rounded-full text-sm border transition",
      active
        ? "bg-yellow-400 text-black border-yellow-400"
        : "border-zinc-700 hover:border-zinc-500 text-zinc-200"
    )}
  >
    {children}
  </button>
);
const SectionCard: React.FC<{
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, actions, children }) => (
  <div className="bg-zinc-900/60 backdrop-blur border border-zinc-800 rounded-2xl p-5 w-full">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
      <div className="flex gap-2">{actions}</div>
    </div>
    {children}
  </div>
);
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <label className="block">
    <div className="text-sm text-zinc-400 mb-1">{label}</div>
    {children}
  </label>
);
const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (
  props
) => (
  <input
    {...props}
    className={classNames(
      "w-full bg-zinc-950 text-zinc-100 border border-zinc-800 rounded-xl px-3 py-2",
      "outline-none focus:ring-2 focus:ring-yellow-400/60",
      props.className
    )}
  />
);
const Slider: React.FC<{
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}> = ({ value, min, max, step, onChange }) => (
  <input
    type="range"
    min={min}
    max={max}
    step={step ?? 1}
    value={value}
    onChange={(e) => onChange(Number(e.target.value))}
    className="w-full accent-yellow-400"
  />
);

/* ===== Leaflet (CDN) ===== */
function ensureLeafletCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById("leaflet-css")) return;
  const link = document.createElement("link");
  link.id = "leaflet-css";
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);
}
async function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return null as any;
  if ((window as any).L) return (window as any).L;
  ensureLeafletCss();
  return new Promise((resolve) => {
    const id = "leaflet-js";
    let s = document.getElementById(id) as HTMLScriptElement | null;
    const done = () => resolve((window as any).L);
    if (!s) {
      s = document.createElement("script");
      s.id = id;
      s.async = true;
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = done;
      document.body.appendChild(s);
    } else if ((window as any).L) done();
    else s.addEventListener("load", done, { once: true });
  });
}

/* ===== Карта ===== */
const MapView: React.FC<{
  points: Array<{
    id: number | string;
    lat: number;
    lng: number;
    name?: string;
    address?: string;
  }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  userPos?: { lat: number; lng: number } | null;
}> = ({ points, selectedId, onSelect, userPos }) => {
  const ref = useRef<HTMLDivElement | null>(null),
    mapRef = useRef<any>(null),
    markersRef = useRef<Map<string, any>>(new Map()),
    userMarkerRef = useRef<any>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const L = await loadLeaflet().catch((e) => {
        console.error("Leaflet load failed", e);
        return null;
      });
      if (!alive || !ref.current || !L) return;
      L.Icon.Default.mergeOptions({
        iconUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      const map = L.map(ref.current).setView([45.043, 41.97], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);
      mapRef.current = map;
    })();
    return () => {
      try {
        mapRef.current?.remove();
      } catch {}
      mapRef.current = null;
      markersRef.current.clear();
      userMarkerRef.current = null;
    };
  }, []);
  useEffect(() => {
    const L = (window as any).L,
      map = mapRef.current;
    if (!L || !map) return;
    const existing = markersRef.current,
      incomingIds = new Set(points.map((p) => String(p.id)));
    for (const [id, m] of existing) {
      if (!incomingIds.has(id)) {
        try {
          map.removeLayer(m);
        } catch {}
        existing.delete(id);
      }
    }
    points.forEach((p) => {
      const id = String(p.id);
      if (!existing.has(id)) {
        const m = L.marker([p.lat, p.lng])
          .addTo(map)
          .bindPopup(
            `<div style="font-size:12px"><div style="font-weight:600">${
              p.name ?? ""
            }</div><div>${p.address ?? ""}</div></div>`
          );
        m.on("click", () => onSelect(id));
        existing.set(id, m);
      }
    });
    if (points.length) {
      const bounds = (window as any).L.latLngBounds(
        points.map((p) => [p.lat, p.lng] as [number, number])
      );
      map.fitBounds(bounds.pad(0.25));
    }
  }, [JSON.stringify(points)]);
  useEffect(() => {
    const map = mapRef.current,
      L = (window as any).L;
    if (!map || !L) return;
    if (selectedId && markersRef.current.has(selectedId)) {
      const m = markersRef.current.get(selectedId);
      m.openPopup();
      map.panTo(m.getLatLng(), { animate: true });
    }
  }, [selectedId]);
  useEffect(() => {
    const map = mapRef.current,
      L = (window as any).L;
    if (!map || !L) return;
    if (
      userPos &&
      Number.isFinite(userPos.lat) &&
      Number.isFinite(userPos.lng)
    ) {
      if (!userMarkerRef.current) {
        userMarkerRef.current = L.circleMarker([userPos.lat, userPos.lng], {
          color: "#FFCC00",
          radius: 8,
        }).addTo(map);
      } else {
        userMarkerRef.current.setLatLng([userPos.lat, userPos.lng]);
      }
    }
  }, [userPos?.lat, userPos?.lng]);
  return (
    <div
      ref={ref}
      style={{ height: 360 }}
      className="relative z-0 w-full rounded-2xl overflow-hidden border border-zinc-800"
    />
  );
};

/* ===== Моб. хелперы и модалки ===== */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setIsMobile(mq.matches);
    on();
    (mq as any).addEventListener
      ? mq.addEventListener("change", on)
      : (mq as any).addListener(on);
    return () => {
      (mq as any).removeEventListener
        ? mq.removeEventListener("change", on)
        : (mq as any).removeListener(on);
    };
  }, []);
  return isMobile;
}

/* ===== Новое полноэкранное меню ===== */
const FullScreenMenu: React.FC<{
  open: boolean;
  onClose: () => void;
  items: Array<{ label: string; onClick: () => void }>;
  currentTab: string;
}> = ({ open, onClose, items, currentTab }) => {
  if (!open) return null;

  return (
    <div className="fx-overlayPane fixed inset-0 z-[2000]">
      {/* Затемненный фон */}
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-sm" 
        onClick={onClose} 
      />
      
      {/* Контент меню */}
      <div className="absolute inset-0 flex flex-col">
        {/* Хедер меню */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-400 grid place-items-center text-black font-black text-lg">
              F
            </div>
            <div className="text-left">
              <div className="text-xl font-bold text-white">FixNet</div>
              <div className="text-sm text-zinc-400">Когда важно, чтобы работало</div>
            </div>
          </div>
          
          {/* Кнопка закрытия */}
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl border border-zinc-700 flex items-center justify-center hover:border-zinc-500 transition-colors"
            aria-label="Закрыть меню"
          >
            <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Навигация */}
        <nav className="flex-1 p-6 space-y-3">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                item.onClick();
                onClose();
              }}
              className={classNames(
                "w-full text-left px-4 py-4 rounded-2xl border-2 transition-all duration-200 text-lg font-medium",
                currentTab === item.label
                  ? "bg-yellow-400 text-black border-yellow-400 shadow-lg"
                  : "border-zinc-800 bg-zinc-900/80 text-white hover:border-zinc-600 hover:bg-zinc-800/50"
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Футер меню */}
        <div className="p-6 border-t border-zinc-800">
          <div className="flex items-center gap-3 text-zinc-400">
            <div className="px-3 py-2 rounded-xl border border-zinc-700 text-sm">
              ₽ RUB
            </div>
            <div className="text-sm">© 2025 FixNet</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const BottomSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, children }) =>
  !open ? null : (
    <div className="fixed inset-0 z-[2000]">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-zinc-950 border-t border-zinc-800 p-4 max-h-[75vh] overflow-auto shadow-2xl">
        <div className="mx-auto h-1.5 w-12 rounded-full bg-zinc-700 mb-3" />
        {title && <div className="text-sm font-medium mb-2">{title}</div>}
        {children}
        <div className="mt-3">
          <button
            onClick={onClose}
            className="w-full px-3 py-2 rounded-xl border border-zinc-700 hover:border-zinc-500"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );

/* ===== Toast ===== */
const Toast: React.FC<{ text: string; onClose: () => void; ms?: number }> = ({
  text,
  onClose,
  ms = 2500,
}) => {
  useEffect(() => {
    const t = setTimeout(onClose, ms);
    return () => clearTimeout(t);
  }, [onClose, ms]);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[4000]">
      <div className="px-4 py-2 rounded-xl border border-zinc-700 bg-zinc-900/90 text-zinc-100 shadow-2xl">
        {text}
      </div>
    </div>
  );
};

const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[3000]">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-zinc-950 border border-zinc-800 p-5 shadow-2xl">
          {title && <div className="text-base font-semibold mb-3">{title}</div>}
          {children}
          <div className="mt-4">
            <button
              onClick={onClose}
              className="w-full px-3 py-2 rounded-xl border border-zinc-700 hover:border-zinc-500"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ===== MapPicker ===== */
/* ===== MapPicker ===== */
function MapPicker({
  centers,
  selectedId,
  onSelect,
  userPos,
}: {
  centers: Array<{
    id: number;
    name: string;
    address: string;
    lat: number;
    lng: number;
  }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  userPos?: { lat: number; lng: number } | null;
}) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  
  const centersSorted = useMemo(() => {
    if (!userPos) return centers;
    return [...centers].sort((a, b) => {
      const da = haversine(userPos.lat, userPos.lng, a.lat, a.lng);
      const db = haversine(userPos.lat, userPos.lng, b.lat, b.lng);
      return da - db;
    });
  }, [userPos, centers]);

  // Управляем z-index карты когда открыта шторка
  useEffect(() => {
    if (!mapContainerRef.current) return;
    
    if (sheetOpen) {
      mapContainerRef.current.classList.add('map-disabled');
    } else {
      mapContainerRef.current.classList.remove('map-disabled');
    }
  }, [sheetOpen]);

  const renderList = () => (
    <div className="space-y-2">
      {centersSorted.map((s) => {
        const dist = userPos
          ? haversine(userPos.lat, userPos.lng, s.lat, s.lng)
          : null;
        return (
          <button
            key={s.id}
            onClick={() => {
              onSelect(String(s.id));
              setSheetOpen(false);
            }}
            className={classNames(
              "w-full text-left p-3 rounded-xl border transition",
              selectedId === String(s.id)
                ? "bg-yellow-400 text-black border-yellow-400"
                : "border-zinc-800 hover:border-zinc-600"
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{s.name}</div>
                <div className="text-xs opacity-80">{s.address}</div>
              </div>
              {dist !== null && (
                <div className="text-xs opacity-80 ml-2">
                  {dist.toFixed(1)} км
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-2" ref={mapContainerRef}>
        <MapView
          points={centers}
          selectedId={selectedId}
          onSelect={(id) => onSelect(String(id))}
          userPos={userPos ?? undefined}
        />
      </div>
      
      {!isMobile ? (
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3">
          <div className="text-sm font-medium mb-2">Сервисы поблизости</div>
          {renderList()}
        </div>
      ) : (
        <div className="md:hidden">
          <button
            onClick={() => setSheetOpen(true)}
            className="w-full px-4 py-3 rounded-xl border border-zinc-700 hover:border-zinc-500 bg-zinc-900/80 backdrop-blur"
          >
            Сервисы поблизости
          </button>
          
          {/* Обновленная BottomSheet с правильным z-index */}
          {sheetOpen && (
            <div className="fixed inset-0 z-[2000]">
              <div 
                className="absolute inset-0 bg-black/80" 
                onClick={() => setSheetOpen(false)} 
              />
              <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-zinc-950 border-t border-zinc-800 p-4 max-h-[75vh] overflow-auto shadow-2xl">
                <div className="mx-auto h-1.5 w-12 rounded-full bg-zinc-700 mb-3" />
                <div className="text-sm font-medium mb-2">Сервисы поблизости</div>
                {renderList()}
                <div className="mt-3">
                  <button
                    onClick={() => setSheetOpen(false)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-700 hover:border-zinc-500"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ===== App ===== */
export default function App() {
  const [tab, setTab] = useState<"Ремонт"|"Отслеживание"|"Поддержка">("Ремонт");
  const [mobileOpen, setMobileOpen] = useState(false);
  const mouse = useMouseLight();

  const goHome = () => {
    setTab("Ремонт");
    setMobileOpen(false);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
  };

  // Esc закрывает меню
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  // Блокируем скролл body
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  const Nav = (
    <>
      {["Ремонт", "Отслеживание", "Поддержка"].map((t) => (
        <button
          key={t}
          onClick={() => { setTab(t as any); setMobileOpen(false); }}
          className={
            "px-3 py-2 rounded-xl text-sm border transition whitespace-nowrap " +
            (tab === t ? "bg-yellow-400 text-black border-yellow-400" : "border-zinc-800 hover:border-zinc-600")
          }
        >
          {t}
        </button>
      ))}
    </>
  );

  const menuItems = [
    { label: "Ремонт", onClick: () => setTab("Ремонт") },
    { label: "Отслеживание", onClick: () => setTab("Отслеживание") },
    { label: "Поддержка", onClick: () => setTab("Поддержка") },
  ];

  return (
    <ErrorBoundary>
      <div
        className="min-h-screen w-full text-zinc-100"
        style={{
          background: `radial-gradient(600px circle at ${mouse.x}% ${mouse.y}%, rgba(250, 204, 21, 0.08), transparent 35%), #0b0e14`,
        }}
      >
        <header className="sticky top-0 z-40 backdrop-blur bg-black/30 border-b border-zinc-800">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
            <button onClick={goHome} className="flex items-center gap-2 select-none group" aria-label="На главную">
              <div className="w-8 h-8 rounded-xl bg-yellow-400 grid place-items-center text-black font-black group-active:scale-95 transition">F</div>
              <div className="text-left">
                <div className="text-lg font-semibold">FixNet</div>
                <div className="text-sm text-zinc-400">Когда важно, чтобы работало</div>
              </div>
            </button>

            <nav className="ml-6 gap-2 overflow-x-auto hidden md:flex">{Nav}</nav>

            <div className="ml-auto hidden md:flex items-center gap-2">
              <div className="px-3 py-2 rounded-xl border border-zinc-700 text-sm">₽ RUB</div>
            </div>

            {/* Новый бургер */}
            <button
              className="ml-auto md:hidden p-2 rounded-xl border border-zinc-700 hover:border-zinc-500 transition-colors"
              onClick={() => setMobileOpen(true)}
              aria-label="Открыть меню"
            >
              <div className="w-6 h-0.5 bg-white mb-1.5 transition-transform"></div>
              <div className="w-6 h-0.5 bg-white mb-1.5 transition-transform"></div>
              <div className="w-6 h-0.5 bg-white transition-transform"></div>
            </button>
          </div>
        </header>

        {/* Новое полноэкранное меню */}
        <FullScreenMenu
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          items={menuItems}
          currentTab={tab}
        />

        <main className="max-w-6xl mx-auto p-4 grid md:grid-cols-3 gap-4">
          {tab === "Ремонт" && (<Repair onOrder={(id) => alert(`Заявка #${id} создана`)} />)}
          {tab === "Отслеживание" && <Tracking />}
          {tab === "Поддержка" && <Support />}
        </main>

        <footer className="max-w-6xl mx-auto px-4 py-6 text-zinc-400">
          <div className="text-sm">© 2025 FixNet</div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}

/* ===== Раздел "Ремонт" ===== */
function Repair({ onOrder }: { onOrder: (id: string) => void }) {
  const [brands, setBrands] = useState<Array<{ id: number; name: string }>>([]);
  const [models, setModels] = useState<
    Array<{ id: number; name: string; brand: { id: number; name: string } }>
  >([]);

  const [brandId, setBrandId] = useState<number | null>(null);
  const [modelId, setModelId] = useState<number | null>(null);
  const [modelSearch, setModelSearch] = useState("");

  const ISSUES_PRESET = [
    { code: "screen", name: "Экран/дисплей" },
    { code: "battery", name: "Батарея" },
    { code: "back", name: "Корпус/задняя крышка" },
    { code: "camera", name: "Камера" },
    { code: "charging", name: "Разъём зарядки" },
    { code: "water", name: "После воды" },
    { code: "speaker", name: "Микрофон/динамик" },
  ];
  const [issues, setIssues] = useState(ISSUES_PRESET);
  const [issueCode, setIssueCode] = useState<string>("screen");

  const [priceMap, setPriceMap] = useState<
    Record<string, { min: number; max: number; hours: number }>
  >({});

  const FALLBACK_PRICES: Record<
    string,
    { min: number; max: number; hours: number }
  > = {
    screen: { min: 7000, max: 12000, hours: 2 },
    battery: { min: 3000, max: 6000, hours: 1 },
    back: { min: 4000, max: 9000, hours: 2 },
    camera: { min: 3500, max: 8000, hours: 1.5 },
    charging: { min: 2500, max: 6000, hours: 1 },
    water: { min: 5000, max: 9000, hours: 3 },
    speaker: { min: 2000, max: 5000, hours: 1 },
  };

  const [urgency, setUrgency] = useState(2);
  const [desc, setDesc] = useState("");

  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [centers, setCenters] = useState<
    Array<{ id: number; name: string; address: string; lat: number; lng: number }>
  >([]);

  const [showDialog, setShowDialog] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agree, setAgree] = useState(false);
  const phoneOk = phone.replace(/\D/g, "").length >= 7;
  const nameOk = name.trim().length >= 2;

  useEffect(() => {
    getBrands()
      .then((data: any) => {
        const arr = Array.isArray(data) ? data : data?.results || [];
        setBrands(arr);
        if (arr.length && brandId == null) setBrandId(arr[0].id);
      })
      .catch(() => setBrands([]));
  }, []);

  useEffect(() => {
    if (!brandId) {
      setModels([]);
      setModelId(null);
      return;
    }
    getDeviceModels({ brand: brandId, q: modelSearch })
      .then((data: any) => {
        const arr = Array.isArray(data) ? data : data?.results || [];
        setModels(arr);
        if (arr.length) setModelId(arr[0].id);
        else setModelId(null);
      })
      .catch(() => {
        setModels([]);
        setModelId(null);
      });
  }, [brandId, modelSearch]);

  useEffect(() => {
    getIssues()
      .then((d: any) => {
        const arr = Array.isArray(d) ? d : d?.results || [];
        if (arr.length) {
          setIssues(arr.map((i: any) => ({ code: i.code, name: i.name })));
          if (!arr.find((i: any) => i.code === issueCode)) setIssueCode("screen");
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!modelId) {
      setPriceMap({});
      return;
    }
    getModelPrices(modelId)
      .then((rows) => {
        const m: Record<string, { min: number; max: number; hours: number }> =
          {};
        for (const r of rows) {
          const code = r?.issue?.code;
          if (!code) continue;
          const min = Number(r.price_min);
          const max = Number(r.price_max);
          const hours = Number(r.hours);
          if (Number.isFinite(min) && Number.isFinite(max)) {
            m[code] = {
              min,
              max,
              hours: Number.isFinite(hours) ? hours : 1,
            };
          }
        }
        setPriceMap(m);
      })
      .catch(() => setPriceMap({}));
  }, [modelId]);

  useEffect(() => {
    getCenters()
      .then((data: any) => {
        const arr =
          (Array.isArray(data) && data) ||
          (data && (data.results || data.data)) ||
          [];
        setCenters(arr);
      })
      .catch(() => setCenters([]));
  }, []);
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setUserPos(null),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  const selectedBrandName = useMemo(
    () => brands.find((b) => b.id === brandId)?.name || "",
    [brands, brandId]
  );
  const selectedModelName = useMemo(
    () => models.find((m) => m.id === modelId)?.name || "",
    [models, modelId]
  );

  const currentBase = priceMap[issueCode] || FALLBACK_PRICES[issueCode] || {
    min: 9000,
    max: 12000,
    hours: 1,
  };
  const estimate = useMemo(() => {
    const coefUrgency = urgency === 3 ? 1.25 : urgency === 2 ? 1.1 : 1;
    const priceMid = ((currentBase.min + currentBase.max) / 2) * coefUrgency;
    const time = Math.max(
      1,
      Math.round(
        currentBase.hours * (urgency === 3 ? 0.8 : urgency === 2 ? 1.0 : 1.2)
      )
    );
    return { priceMid, time };
  }, [currentBase.min, currentBase.max, currentBase.hours, urgency]);

  const submit = async () => {
    if (
      !selectedCenterId ||
      !agree ||
      !nameOk ||
      !phoneOk ||
      !brandId ||
      !modelId
    )
      return;
    const payload = {
      brand: selectedBrandName,
      model: selectedModelName,
      issue: issueCode,
      urgency,
      description: desc,
      center: Number(selectedCenterId),
      customer_name: name.trim(),
      customer_phone: phone.trim(),
      agree_to_offer: true,
    };
    try {
      const created = await createRequest(payload);
      setShowDialog(false);
      setName("");
      setPhone("");
      setAgree(false);
      setDesc("");
      onOrder(String(created.id));
    } catch (e: any) {
      alert("Не удалось создать заявку: " + (e?.message || e));
    }
  };

  const canOpenDialog = Boolean(selectedCenterId && brandId && modelId);

  const selectedCenterName = useMemo(
    () =>
      centers.find((c) => String(c.id) === String(selectedCenterId))?.name ||
      "",
    [selectedCenterId, centers]
  );

  return (
    <div className="md:col-span-3 grid gap-4">
      <SectionCard title="Создать заявку на ремонт">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Бренд">
            <select
              value={brandId ?? ""}
              onChange={(e) => setBrandId(Number(e.target.value))}
              className="w-full bg-zinc-950 text-zinc-100 border border-zinc-800 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-yellow-400/60"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id} className="bg-zinc-900">
                  {b.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Модель">
            <div className="grid gap-2">
              <input
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="Начните вводить модель..."
                className="w-full bg-zinc-950 text-zinc-100 border border-zinc-800 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-yellow-400/60"
              />
              <select
                value={modelId ?? ""}
                onChange={(e) => setModelId(Number(e.target.value))}
                className="w-full bg-zinc-950 text-zinc-100 border border-zinc-800 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-yellow-400/60"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id} className="bg-zinc-900">
                    {m.name}
                  </option>
                ))}
                {(!models || models.length === 0) && (
                  <option value="">— нет совпадений —</option>
                )}
              </select>
            </div>
          </Field>

          <Field label="Неисправность">
            <div className="flex gap-2 flex-wrap">
              {issues.map((it) => (
                <Chip
                  key={it.code}
                  active={issueCode === it.code}
                  onClick={() => setIssueCode(it.code)}
                >
                  {it.name}
                </Chip>
              ))}
            </div>
          </Field>

          <Field
            label={`Срочность: ${
              urgency === 1 ? "стандарт" : urgency === 2 ? "быстрее" : "срочно"
            }`}
          >
            <Slider
              value={urgency}
              min={1}
              max={3}
              step={1}
              onChange={(v) => setUrgency(v)}
            />
          </Field>

          <Field label="Опишите проблему">
            <Input
              placeholder="Напр.: не заряжается, треснул экран…"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </Field>

          <div className="grid content-end">
            <div className="text-2xl font-semibold">
              {currencyRUB(estimate.priceMid)}
            </div>
            <div className="text-sm text-zinc-400">Срок: ~ {estimate.time} ч</div>
          </div>
        </div>

        <div className="mt-4">
          <button
            disabled={!canOpenDialog}
            onClick={() => setShowDialog(true)}
            className={classNames(
              "w-full md:w-auto px-4 py-3 rounded-xl font-medium",
              !canOpenDialog
                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                : "bg-yellow-400 text-black hover:brightness-95"
            )}
          >
            Оформить заявку
          </button>
          <div className="text-xs text-zinc-500 mt-2">
            * Оператор подтвердит ориентир цены/срока и детали
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Выбор сервисного центра">
        <MapPicker
          centers={centers}
          selectedId={selectedCenterId}
          onSelect={(id) => setSelectedCenterId(id)}
          userPos={userPos}
        />
        <div className="mt-3 text-sm text-zinc-400">
          {selectedCenterId ? (
            <span>
              Вы выбрали:{" "}
              <span className="text-zinc-100 font-medium">
                {selectedCenterName}
              </span>
            </span>
          ) : (
            <span>Выберите сервис на карте или из списка</span>
          )}
        </div>
      </SectionCard>

      <Modal
        open={showDialog}
        onClose={() => setShowDialog(false)}
        title="Контакты для оформления заявки"
      >
        <div className="grid gap-3">
          <Field label="Ваше имя">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Иван"
            />
          </Field>
          <Field label="Телефон">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 9.."
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            <span>
              Я ознакомлен с{" "}
              <a href="/offer" target="_blank" className="underline">
                офертой
              </a>
            </span>
          </label>

          <button
            onClick={submit}
            disabled={!nameOk || !phoneOk || !agree}
            className={classNames(
              "w-full px-4 py-2 rounded-xl font-medium",
              !nameOk || !phoneOk || !agree
                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                : "bg-yellow-400 text-black hover:brightness-95"
            )}
          >
            Подтвердить и отправить
          </button>

          {!nameOk && (
            <div className="text-xs text-red-400">
              Укажите имя (минимум 2 символа)
            </div>
          )}
          {!phoneOk && (
            <div className="text-xs text-red-400">
              Укажите корректный номер телефона
            </div>
          )}
          {!agree && (
            <div className="text-xs text-red-400">
              Необходимо согласиться с офертой
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

/* ===== Другие вкладки ===== */
function Tracking() {
  const [id, setId] = useState("");
  const [data, setData] = useState<any>(null);
  const load = async () => {
    if (!id) return;
    try {
      setData(await fetchRequestById(id));
    } catch (e: any) {
      alert("Не найдено: " + (e?.message || e));
    }
  };
  return (
    <SectionCard title="Отслеживание заявки">
      <div className="grid md:grid-cols-[1fr_auto] gap-2">
        <Input
          placeholder="Номер заявки…"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <button
          onClick={load}
          className="px-4 py-2 rounded-xl bg-yellow-400 text-black font-medium"
        >
          Проверить
        </button>
      </div>
      {data && (
        <div className="mt-4 text-sm text-zinc-200">
          <div>Заявка #{data.id}</div>
          <div>
            {data.brand} {data.model}
          </div>
          <div>Статус: {data.status}</div>
          <div>Сервис: {data.center}</div>
        </div>
      )}
    </SectionCard>
  );
}

function Support() {
  const [rid, setRid] = useState("");
  const [text, setText] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const idNum = Number(rid);
    if (!idNum || !text.trim()) {
      setToast("Укажите номер заявки и текст сообщения");
      return;
    }
    try {
      setBusy(true);
      await createSupportMessage({ repair_request: idNum, text: text.trim() });
      setText("");
      setToast("Сообщение отправлено ✅");
    } catch (e: any) {
      const msg =
        typeof e?.message === "string"
          ? e.message.replace(/^"|"$/g, "")
          : "Ошибка отправки";
      setToast(`Ошибка: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionCard title="Поддержка">
        <div className="grid gap-2">
          <Input
            placeholder="Номер заявки"
            value={rid}
            onChange={(e) => setRid(e.target.value)}
            inputMode="numeric"
          />
          <Input
            placeholder="Ваше сообщение…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div>
            <button
              onClick={send}
              disabled={busy}
              className={classNames(
                "px-4 py-2 rounded-xl font-medium",
                busy
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-yellow-400 text-black hover:brightness-95"
              )}
            >
              {busy ? "Отправка…" : "Отправить"}
            </button>
          </div>
        </div>
      </SectionCard>

      {toast && <Toast text={toast} onClose={() => setToast(null)} />}
    </>
  );
}