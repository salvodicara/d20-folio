import { useId, type InputHTMLAttributes } from "react";

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
  return (
    <div className="f-field">
      <label className="f-lbl" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="f-in"
        aria-invalid={error ? true : undefined}
        aria-describedby={note}
        {...input}
      />
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
