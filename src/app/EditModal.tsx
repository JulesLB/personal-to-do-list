"use client";

import { useState } from "react";
import { CATEGORIES, type Category } from "@/lib/rank";
import { updateItem } from "./actions";

// Narrowed, fully-serializable view of an item for the client. deadline is the
// HKT YYYY-MM-DD the date input expects, computed on the server with isoHKT.
export type EditableItem = {
  id: number;
  title: string;
  type: string;
  category: string | null;
  important: boolean;
  urgent: boolean;
  deadline: string | null;
  referee: string | null;
  cadence: string | null;
};

export function EditModal({ item }: { item: EditableItem }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="edit-btn" aria-label="edit" onClick={() => setOpen(true)}>
        ✎
      </button>
      {open ? (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">Edit item</div>
            <form
              className="edit-form"
              action={updateItem.bind(null, item.id)}
              onSubmit={() => setOpen(false)}
            >
              <label className="ef-field ef-wide">
                <span>Title</span>
                <input name="title" defaultValue={item.title} required autoFocus />
              </label>

              <div className="ef-grid">
                <label className="ef-field">
                  <span>Type</span>
                  <select name="type" defaultValue={item.type}>
                    <option value="task">task</option>
                    <option value="commitment">commitment</option>
                    <option value="parking">parking</option>
                  </select>
                </label>
                <label className="ef-field">
                  <span>Category</span>
                  <select name="category" defaultValue={item.category ?? ""}>
                    <option value="">—</option>
                    {(Object.keys(CATEGORIES) as Category[]).map((c) => (
                      <option key={c} value={c}>
                        {CATEGORIES[c].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ef-field">
                  <span>Deadline</span>
                  <input type="date" name="deadline" defaultValue={item.deadline ?? ""} />
                </label>
                <label className="ef-field">
                  <span>Referee</span>
                  <select name="referee" defaultValue={item.referee ?? ""}>
                    <option value="">none</option>
                    <option value="wife">wife</option>
                    <option value="sister">sister</option>
                    <option value="colleague">colleague</option>
                  </select>
                </label>
                <label className="ef-field">
                  <span>Cadence</span>
                  <select name="cadence" defaultValue={item.cadence ?? ""}>
                    <option value="">none</option>
                    <option value="daily">daily</option>
                    <option value="weekly">weekly</option>
                    <option value="monthly">monthly</option>
                  </select>
                </label>
              </div>

              <div className="ef-flags">
                <label className="ef-check">
                  <input type="checkbox" name="important" defaultChecked={item.important} /> important
                </label>
                <label className="ef-check">
                  <input type="checkbox" name="urgent" defaultChecked={item.urgent} /> urgent
                </label>
              </div>

              <div className="ef-actions">
                <button type="button" className="ef-cancel" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="ef-save">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
