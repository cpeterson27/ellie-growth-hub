import { FiArrowRight } from 'react-icons/fi'
import DashboardCard from '../components/DashboardCard.jsx'
import Table from '../components/Table.jsx'
import Button from '../components/Button.jsx'

const campaigns = [
  { name: 'Bootcamp Launch', manager: 'Alyssa M.', status: 'Live', tickets: 32, revenue: '$15,904' },
  { name: 'Partner Sprint', manager: 'Noah L.', status: 'Planning', tickets: 16, revenue: '$8,200' },
  { name: 'Email Push', manager: 'Maya R.', status: 'Review', tickets: 10, revenue: '$4,600' },
]

const columns = [
  { header: 'Campaign', accessor: 'name' },
  { header: 'Owner', accessor: 'manager' },
  { header: 'Status', accessor: 'status' },
  { header: 'Tickets Sold', accessor: 'tickets' },
  { header: 'Revenue', accessor: 'revenue' },
  {
    header: '',
    accessor: 'action',
    render: (item) => (
      <Button variant="outline" size="sm">
        View <FiArrowRight />
      </Button>
    ),
  },
]

export default function Campaigns() {
  return (
    <div className="page-dashboard">
      <div className="page-header" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p className="page-subtitle">Track every campaign from brief to launch.</p>
        </div>
        <Button variant="primary">Create Campaign</Button>
      </div>

      <DashboardCard title="Active Campaigns">
        <Table columns={columns} data={campaigns} emptyMessage="No campaigns are active yet." />
      </DashboardCard>
    </div>
  )
}
