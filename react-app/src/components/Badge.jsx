export function Badge({ status, children }) {
  const text = children || status?.replace(/_/g, ' ');
  return <span className={`badge badge-${status}`}>{text}</span>;
}
