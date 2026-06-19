"use client";

import { useState } from "react";
import { CATEGORIES, type Category } from "@/lib/rank";
import { createItem } from "./actions";

// "+ New" lives in the topbar. Opens a modal that reuses the edit-form styling
// and the same levers as the edit panel: title, category, referee, deadline, and
// repeats. Type and importance aren't here on purpose — type is derived from
// deadline+repeats, importance defaults to true server-side.
export function AddItem() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="add-btn"
        onClick={() => setOpen(true)}
        title="New item"
        aria-label="New item"
      >
        +
      </button>
      {open ? <AddPanel onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function AddPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">New item</div>
        <form className="edit-form" action={createItem} onSubmit={onClose}>
          <label className="ef-field ef-wide">
            <span>Title</span>
            <input name="title" placeholder="What did you commit to?" required autoFocus />
          </label>

          <div className="ef-grid">
            <label className="ef-field">
              <span>Category</span>
              <select name="category" defaultValue="">
                <option value="">—</option>
                {(Object.keys(CATEGORIES) as Category[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIES[c].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="ef-field">
              <span>Referee</span>
              <select name="referee" defaultValue="">
                <option value="">none</option>
                <option value="wife">wife</option>
                <option value="sister">sister</option>
                <option value="colleague">colleague</option>
              </select>
            </label>
            <label className="ef-field">
              <span>Deadline</span>
              <input type="date" name="deadline" />
            </label>
            <label className="ef-field">
              <span>Repeats</span>
              <select name="cadence" defaultValue="">
                <option value="">no (one-off)</option>
                <option value="daily">daily</option>
                <option value="weekly">weekly</option>
                <option value="monthly">monthly</option>
              </select>
            </label>
          </div>

          <p className="ef-hint">
            A date makes it a task. Set it to repeat and it becomes a commitment. Neither and it parks.
          </p>

          <div className="ef-actions">
            <div className="ef-actions-right">
              <button type="button" className="ef-cancel" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="ef-save">
                Add
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
