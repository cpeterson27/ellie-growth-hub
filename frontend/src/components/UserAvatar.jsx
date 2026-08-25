import "./UserAvatar.css";
const initials = (name = "") => String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "GO";
export default function UserAvatar({ user, name, size = "md", className = "" }) {
  const label = name || user?.name || user?.displayName || "Growth Operator user";
  return <span className={`user-avatar user-avatar--${size} ${className}`.trim()} aria-label={`${label} profile photo`}>{user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span aria-hidden="true">{initials(label)}</span>}</span>;
}
