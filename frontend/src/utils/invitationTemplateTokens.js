export function insertPersonalization(value, label, start, end = start) {
  const token = `[${label}]`;
  return { value: `${value.slice(0, start)}${token}${value.slice(end)}`, cursor: start + token.length };
}
