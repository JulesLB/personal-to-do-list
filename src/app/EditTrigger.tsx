"use client";

import { useState, type ReactNode } from "react";
import { CATEGORIES, type Category } from "@/lib/rank";
import { updateItem, remove, retire } from "./actions";

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

// Wraps a task body. Clicking (or Enter/Space on) the body opens the edit panel,
// so rows no longer need a dedicated edit button. Action buttons live as siblings
// outside this wrapper, so they never trigger an edit.
export function EditTrigger({
  item,
  className,
  children,
}: {
  item: EditableItem;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        className={className}
        role="button"
        tabIndex={0}
        title="Edit"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children}
      </div>
      {open ? <EditPanel item={item} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function EditPanel({ item, onClose }: { item: EditableItem; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">Edit item</div>
        <form className="edit-form" action={updateItem.bind(null, item.id)} onSubmit={onClose}>
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
            <DangerAction item={item} />
            <div className="ef-actions-right">
              <button type="button" className="ef-cancel" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="ef-save">
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Destructive action, rendered inside the edit form via formAction (no nested
// form). Tasks/parking delete; commitments retire. One tap arms it, the second
// confirms, so a stray tap can't wipe an item. The server action revalidates and
// the row unmounts, closing the panel. formNoValidate so a blanked title can't
// block the delete.
function DangerAction({ item }: { item: EditableItem }) {
  const [armed, setArmed] = useState(false);
  const isCommitment = item.type === "commitment";
  const action = isCommitment ? retire : remove;
  const label = isCommitment ? "Retire" : "Delete";
  return armed ? (
    <button
      type="submit"
      formNoValidate
      formAction={action.bind(null, item.id)}
      className="ef-danger armed"
    >
      Tap to confirm
    </button>
  ) : (
    <button type="button" className="ef-danger" onClick={() => setArmed(true)}>
      {label}
    </button>
  );
}
