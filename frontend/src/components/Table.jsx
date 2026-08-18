import './Table.css'

export default function Table({ columns, data, loading, emptyMessage = 'No results found.', onRowClick, getRowKey }) {
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
          <tr
            key={getRowKey ? getRowKey(row) : row._id || row.id || rowIndex}
            onClick={() => onRowClick?.(row)}
            onKeyDown={onRowClick ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onRowClick(row)
              }
            } : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            className={onRowClick ? 'table__interactive-row' : undefined}
          >
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
