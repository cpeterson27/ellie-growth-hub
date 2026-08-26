import "./PersonIdentityFields.css";

export default function PersonIdentityFields({ value, onChange, readOnly = false, emailReadOnly = false }) {
  const field = (key, label, type, autoComplete, maxLength) => <label>{label}<input
    required={key !== "phone"} type={type} autoComplete={autoComplete} maxLength={maxLength}
    readOnly={readOnly || (key === "email" && emailReadOnly)} value={value[key] || ""}
    onChange={event => onChange({ ...value, [key]: event.target.value })}
  /></label>;
  return <div className="person-identity-fields">
    {field("firstName", "First name", "text", "given-name", 80)}
    {field("lastName", "Last name", "text", "family-name", 80)}
    {field("email", "Email", "email", "email", 254)}
    {field("phone", "Phone number (optional)", "tel", "tel", 50)}
  </div>;
}
