"use client";

import { useState, type ReactNode } from "react";
import { CATEGORIES, type Category } from "@/lib/rank";
import { updateItem, remove, retire } from "./actions";

// Narrowed, fully-serializable view of an item for the client. deadline is the
// HKT YYYY-MM-DD the date input expects, computed on the server with isoHKT.
// What you can edit. Type and importance aren't here on purpose: type is derived
// from deadline+repeats, and importance is judged by the classifier, not clicked.
export type EditableItem = {
  id: number;
  title: string;
  category: string | null;
  deadline: string | null;
  // M8: HH:MM (HKT) of the precise reminder time, for the <input type="time">.
  dueTime: string | null;
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
              <span>Referee</span>
              <select name="referee" defaultValue={item.referee ?? ""}>
                <option value="">none</option>
                <option value="wife">wife</option>
                <option value="sister">sister</option>
                <option value="colleague">colleague</option>
              </select>
            </label>
            <label className="ef-field">
              <span>Deadline</span>
              <input type="date" name="deadline" defaultValue={item.deadline ?? ""} />
            </label>
            <label className="ef-field">
              <span>Time</span>
              <input type="time" name="dueTime" defaultValue={item.dueTime ?? ""} />
            </label>
            <label className="ef-field">
              <span>Repeats</span>
              <select name="cadence" defaultValue={item.cadence ?? ""}>
                <option value="">no (one-off)</option>
                <option value="daily">daily</option>
                <option value="weekly">weekly</option>
                <option value="monthly">monthly</option>
              </select>
            </label>
          </div>

          <p className="ef-hint">
            A date makes it a task. Set it to repeat and it becomes a commitment. Neither and it
            parks. Add a time and Ember pings you at that moment.
          </p>

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
  // A repeating item is a commitment, so end it with "retire"; the rest delete.
  const isCommitment = !!item.cadence;
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
