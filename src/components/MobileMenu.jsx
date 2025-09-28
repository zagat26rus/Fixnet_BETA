import { useEffect } from "react";
import "./mobile-menu.css";

export default function MobileMenu({ open, onClose }) {
  // Закрытие по Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Лочим скролл body
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => (document.body.style.overflow = prev);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="mobile-menu-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="mobile-menu-panel"
        onClick={(e) => e.stopPropagation()}
        aria-label="Меню"
      >
        <button className="mobile-menu-close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>

        <nav className="mobile-menu-nav">
          {/* замени ссылки на свои маршруты/Link из react-router */}
          <a href="/#repair" onClick={onClose}>Ремонт</a>
          <a href="/tracking" onClick={onClose}>Отслеживание</a>
          <a href="/support" onClick={onClose}>Поддержка</a>
          <a href="/contacts" onClick={onClose}>Контакты</a>
        </nav>

        <div className="mobile-menu-footer">© 2025 FixNet</div>
      </div>
    </div>
  );
}
