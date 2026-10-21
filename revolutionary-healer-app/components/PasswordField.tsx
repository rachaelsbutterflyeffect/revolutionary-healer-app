"use client";

import { useId, useState } from "react";

const FIELD_BG = "#141210";
const TEXT = "#F6F2E9";

type PasswordFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  borderColor: string;
  autoComplete: string;
  name: string;
};

export default function PasswordField({
  value,
  onChange,
  placeholder,
  borderColor,
  autoComplete,
  name,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();
  const label = visible ? "Hide password" : "Show password";

  return (
    <div style={{ position: "relative" }}>
      <input
        id={inputId}
        className="rh-password-field"
        name={name}
        type={visible ? "text" : "password"}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        style={{
          display: "block",
          width: "100%",
          background: FIELD_BG,
          border: `1px solid ${borderColor}`,
          borderRadius: 10,
          padding: "12px 44px 12px 14px",
          color: TEXT,
          fontSize: 14,
        }}
      />
      <button
        type="button"
        className="rh-password-toggle"
        aria-label={label}
        aria-pressed={visible}
        aria-controls={inputId}
        onMouseDown={(event) => {
          // Keep the caret in the field. type="button" already blocks submit.
          event.preventDefault();
        }}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.084 14.158a3 3 0 0 1-4.242-4.242"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m2 2 20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
