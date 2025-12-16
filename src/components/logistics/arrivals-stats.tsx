import { Card } from '@/components/ui/card'
import { PackageCheck, TrendingUp, Clock, AlertTriangle, CheckCircle } from 'lucide-react'
import type { ArrivalsStats as ArrivalsStatsType } from '@/lib/queries/logistics'

interface ArrivalsStatsProps {
  stats: ArrivalsStatsType
}

export function ArrivalsStats({ stats }: ArrivalsStatsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {/* Total Arrivals */}
      <Card className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <PackageCheck className="h-8 w-8 text-blue-600" />
          </div>
          <div className="ml-4 flex-1">
            <p className="text-sm font-medium text-gray-600">已到仓单</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total_arrived}</p>
          </div>
        </div>
      </Card>

      {/* Total Quantity */}
      <Card className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <TrendingUp className="h-8 w-8 text-green-600" />
          </div>
          <div className="ml-4 flex-1">
            <p className="text-sm font-medium text-gray-600">总到仓数量</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total_qty.toLocaleString()}</p>
          </div>
        </div>
      </Card>

      {/* On-time Count */}
      <Card className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <div className="ml-4 flex-1">
            <p className="text-sm font-medium text-gray-600">准时/提前</p>
            <p className="text-2xl font-bold text-gray-900">
              {stats.on_time_count + stats.early_count}
            </p>
          </div>
        </div>
      </Card>

      {/* Late Count */}
      <Card className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <AlertTriangle className="h-8 w-8 text-yellow-600" />
          </div>
          <div className="ml-4 flex-1">
            <p className="text-sm font-medium text-gray-600">迟到</p>
            <p className="text-2xl font-bold text-gray-900">{stats.late_count}</p>
          </div>
        </div>
      </Card>

      {/* Avg Variance Days */}
      <Card className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <Clock className="h-8 w-8 text-purple-600" />
          </div>
          <div className="ml-4 flex-1">
            <p className="text-sm font-medium text-gray-600">平均时效差</p>
            <p className="text-2xl font-bold text-gray-900">
              {stats.avg_variance_days !== null ? `${stats.avg_variance_days} 天` : '-'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
