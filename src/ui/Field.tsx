import { useId, type InputHTMLAttributes } from "react";
import { Icon } from "./Icon";

/** A labelled text field with optional help or error text below. */
export function Field({
  label,
  help,
  error,
  ...input
}: {
  label: string;
  help?: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const note = error ? `${id}-err` : help ? `${id}-help` : undefined;
  const box = (
    <input
      id={id}
      className="f-in"
      aria-invalid={error ? true : undefined}
      aria-describedby={note}
      // A modal opens after React's autofocus: the Dialog focuses this mark.
      data-autofocus={input.autoFocus ? "" : undefined}
      {...input}
    />
  );
  return (
    <div className="f-field">
      <label className="f-lbl" htmlFor={id}>
        {label}
      </label>
      {input.type === "search" ? (
        // a search reads as one at a glance: the magnifier inside the box (#1436)
        <span className="f-in-search">
          <Icon name="u-search" />
          {box}
        </span>
      ) : (
        box
      )}
      {error ? (
        <div id={note} className="f-err">
          {error}
        </div>
      ) : help ? (
        <div id={note} className="f-help">
          {help}
        </div>
      ) : null}
    </div>
  );
}
