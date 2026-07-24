import './Table.css'

export default function Table({ columns, data, loading, emptyMessage = 'No results found.', onRowClick }) {
  if (loading) {
    return <div className="table-state">Loading data…</div>
  }

  if (!data || data.length === 0) {
    return <div className="table-state table-state--empty">{emptyMessage}</div>
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.header}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
          <tr key={rowIndex} onClick={() => onRowClick?.(row)} style={onRowClick ? { cursor: 'pointer' } : undefined}>
              {columns.map((column) => (
                <td key={column.header} data-label={column.header}>
                  {column.render ? column.render(row) : row[column.accessor]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
