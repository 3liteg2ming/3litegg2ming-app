import type { ReactNode } from 'react';

type PagerProps = {
  page: number;
  pages: number;
  onPage: (page: number) => void;
  totalLabel: string;
};

export function AdminCard(props: { title: string; subtitle?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="eg-admin-card">
      <header className="eg-admin-card-header">
        <div>
          <h3>{props.title}</h3>
          {props.subtitle ? <p>{props.subtitle}</p> : null}
        </div>
        {props.actions ? <div className="eg-admin-card-actions">{props.actions}</div> : null}
      </header>
      {props.children}
    </section>
  );
}

export function Pager({ page, pages, onPage, totalLabel }: PagerProps) {
  return (
    <div className="eg-admin-pager">
      <span>{totalLabel}</span>
      <div>
        <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}>
          Prev
        </button>
        <span>
          Page {page} / {pages}
        </span>
        <button type="button" onClick={() => onPage(Math.min(pages, page + 1))} disabled={page >= pages}>
          Next
        </button>
      </div>
    </div>
  );
}

export function EmptyState(props: { title: string; description: string }) {
  return (
    <div className="eg-admin-empty">
      <h4>{props.title}</h4>
      <p>{props.description}</p>
    </div>
  );
}
