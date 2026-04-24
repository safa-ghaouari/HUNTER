import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ─── Toast ────────────────────────────────────────────────────────────────────
const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={add}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() { return useContext(ToastCtx); }

// ─── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ title, subtitle, onClose, size = "md", children }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className={`modal modal--${size}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{title}</h2>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────
export function Drawer({ title, onClose, children }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return createPortal(
    <div className="drawer-overlay" onMouseDown={onClose}>
      <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h2 className="drawer-title">{title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────
export function ConfirmDialog({ title, message, onConfirm, onCancel, danger }) {
  return (
    <Modal title={title} onClose={onCancel} size="sm">
      <p className="confirm-message">{message}</p>
      <div className="modal-footer">
        <button className="portal-button portal-button--secondary" onClick={onCancel}>Cancel</button>
        <button
          className={`portal-button ${danger ? "portal-button--danger" : "portal-button--primary"}`}
          onClick={onConfirm}
        >Confirm</button>
      </div>
    </Modal>
  );
}

// ─── Form helpers ─────────────────────────────────────────────────────────────
export function FormField({ label, required, error, hint, children }) {
  return (
    <div className="form-field">
      {label && (
        <label className="form-label">
          {label}{required && <span className="form-required"> *</span>}
        </label>
      )}
      {children}
      {hint && <div className="form-hint">{hint}</div>}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

export function FormInput({ value, onChange, placeholder, type = "text", disabled }) {
  return (
    <input
      className="form-input"
      type={type}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

export function FormSelect({ value, onChange, options, placeholder }) {
  return (
    <select className="form-select" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function FormTextarea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea
      className="form-textarea"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
    />
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────
export function Pagination({ total, page, perPage, onChange }) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;

  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      if (pages.length && pages[pages.length - 1] !== "…" && i > pages[pages.length - 1] + 1) pages.push("…");
      pages.push(i);
    }
  }

  return (
    <div className="pagination">
      <button className="pagination__btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>←</button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="pagination__ellipsis">…</span>
        ) : (
          <button
            key={p}
            className={`pagination__btn${p === page ? " pagination__btn--active" : ""}`}
            onClick={() => onChange(p)}
          >{p}</button>
        )
      )}
      <button className="pagination__btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>→</button>
      <span className="pagination__info">{total} total</span>
    </div>
  );
}

// ─── Search / filter bar ──────────────────────────────────────────────────────
export function SearchBar({ value, onChange, placeholder = "Search…" }) {
  return (
    <div className="search-wrap">
      <span className="search-icon">⌕</span>
      <input
        className="search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button className="search-clear" onClick={() => onChange("")}>✕</button>
      )}
    </div>
  );
}

// ─── Action menu (row-level dropdown) ────────────────────────────────────────
export function ActionMenu({ actions }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div className="action-menu" ref={ref}>
      <button className="action-menu__trigger" onClick={() => setOpen((p) => !p)}>⋯</button>
      {open && (
        <div className="action-menu__dropdown">
          {actions.map((a, i) =>
            a === "divider" ? (
              <div key={i} className="action-menu__divider" />
            ) : (
              <button
                key={i}
                className={`action-menu__item${a.danger ? " action-menu__item--danger" : ""}`}
                onClick={() => { setOpen(false); a.onClick(); }}
                disabled={a.disabled}
              >{a.label}</button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── Detail row helper ────────────────────────────────────────────────────────
export function DetailRow({ label, value, mono }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className={`detail-value${mono ? " detail-value--mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

// ─── Filter select ────────────────────────────────────────────────────────────
export function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <select className="filter-select" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ─── Existing components ─────────────────────────────────────────────────────
export function PortalPageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="portal-page-header">
      <div>
        {eyebrow && <div className="portal-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="portal-page-actions">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, tone = "teal", detail }) {
  return (
    <div className={`stat-card stat-card--${tone}`}>
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
      {detail && <div className="stat-card__detail">{detail}</div>}
    </div>
  );
}

export function Panel({ title, subtitle, actions, children, flush }) {
  return (
    <section className="panel">
      {(title || subtitle || actions) && (
        <div className="panel__header">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </div>
      )}
      <div className={flush ? "panel__body--flush" : "panel__body"}>{children}</div>
    </section>
  );
}

export function StatusPill({ children, tone = "neutral" }) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}

export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="empty-state">
      <div className="empty-state__spinner" />
      <div>{label}</div>
    </div>
  );
}

export function ErrorState({ label, detail, onRetry }) {
  return (
    <div className="empty-state empty-state--error">
      <div className="empty-state__icon">!</div>
      <div>{label}</div>
      {detail && <div className="empty-state__detail">{detail}</div>}
      {onRetry && (
        <button className="portal-button portal-button--secondary" onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}

export function EmptyState({ label, detail }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">∅</div>
      <div>{label}</div>
      {detail && <div className="empty-state__detail">{detail}</div>}
    </div>
  );
}

export function DataTable({ columns, rows, rowKey, onRowClick }) {
  return (
    <div className="data-table-wrap">
      <table className={`data-table${onRowClick ? " data-table--clickable" : ""}`}>
        <thead>
          <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={typeof rowKey === "function" ? rowKey(row) : row[rowKey] ?? idx}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key}>{c.render ? c.render(row[c.key], row) : row[c.key] ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────
function getInitials(v) {
  if (!v) return "HU";
  const [local] = v.split("@");
  const parts = local.split(/[._-]+/).filter(Boolean);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : local.slice(0, 2).toUpperCase();
}

function getDisplayName(user) {
  if (!user?.email) return "HUNTER User";
  const [local] = user.email.split("@");
  return local.split(/[._-]+/).filter(Boolean)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(" ");
}

export default function PortalShell({ title, subtitle, role, user, items, activeKey, onNavigate, onLogout, children }) {
  const [theme, setTheme] = useState(() => window.localStorage.getItem("hunter-theme") || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("hunter-theme", theme);
  }, [theme]);

  const userName = useMemo(() => getDisplayName(user), [user]);
  const initials = useMemo(() => getInitials(user?.email), [user]);

  return (
    <ToastProvider>
      <div className="portal-shell">
        <aside className="portal-sidebar">
          <div className="portal-brand">
            <div className="portal-brand__mark">H</div>
            <div>
              <div className="portal-brand__title">HUNTER</div>
              <div className="portal-brand__subtitle">Threat Intelligence</div>
            </div>
          </div>

          <div className="portal-role-badge">{role === "admin_soc" ? "SOC Admin" : "Client Portal"}</div>

          <nav className="portal-nav">
            {items.map((item) => (
              <button
                key={item.key}
                className={`portal-nav__item${item.key === activeKey ? " is-active" : ""}`}
                onClick={() => onNavigate(item.key)}
              >
                {item.icon && <span className="portal-nav__icon">{item.icon}</span>}
                <span className="portal-nav__label">{item.label}</span>
                {item.badge != null && (
                  <span className={`portal-nav__badge tone-${item.badgeTone || "neutral"}`}>{item.badge}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="portal-sidebar__footer">
            <button
              className="portal-theme-toggle"
              onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            >
              <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
              <span className={`portal-theme-toggle__knob${theme === "dark" ? " is-dark" : ""}`} />
            </button>

            <div className="portal-user-card">
              <div className="portal-user-card__avatar">{initials}</div>
              <div className="portal-user-card__content">
                <div className="portal-user-card__name">{userName}</div>
                <div className="portal-user-card__meta">{user?.email}</div>
              </div>
              <button className="portal-logout" onClick={onLogout} title="Sign out">↩</button>
            </div>
          </div>
        </aside>

        <main className="portal-main">
          <header className="portal-topbar">
            <div>
              <div className="portal-eyebrow">{title}</div>
              <div className="portal-topbar__subtitle">{subtitle}</div>
            </div>
            <div className="portal-health">
              <span className="portal-health__item"><i className="ok" /> API</span>
              <span className="portal-health__item"><i className="ok" /> Auth</span>
              <span className="portal-health__item"><i className="ok" /> Scheduler</span>
            </div>
          </header>
          <div className="portal-content">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
