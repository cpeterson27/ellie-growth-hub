import DashboardCard from '../components/DashboardCard.jsx'
import Table from '../components/Table.jsx'

const partners = [
  { name: 'Kari Summers', company: 'Summit Events', status: 'Active', referrals: 12, revenue: '$6,200' },
  { name: 'Theo Burns', company: 'Partner Labs', status: 'Engaged', referrals: 8, revenue: '$4,320' },
  { name: 'Lina Cho', company: 'Launch Hub', status: 'Active', referrals: 10, revenue: '$5,500' },
]

const columns = [
  { header: 'Name', accessor: 'name' },
  { header: 'Company', accessor: 'company' },
  { header: 'Status', accessor: 'status' },
  { header: 'Tickets Referred', accessor: 'referrals' },
  { header: 'Revenue', accessor: 'revenue' },
]

export default function Partners() {
  return (
    <div className="page-dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Partners</h1>
          <p className="page-subtitle">Manage affiliate partners and referral performance.</p>
        </div>
      </div>

      <DashboardCard title="Partner Network">
        <Table columns={columns} data={partners} emptyMessage="No partners are connected yet." />
      </DashboardCard>
    </div>
  )
}
