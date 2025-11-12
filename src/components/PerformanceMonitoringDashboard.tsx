import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { Activity, TrendingUp, Database, Clock, RefreshCw } from 'lucide-react';

interface PerformanceMetrics {
  timestamp: number;
  action: 'cache_hit' | 'cache_miss' | 'api_call' | 'cache_invalidated';
  reason?: string;
}

export const PerformanceMonitoringDashboard = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadMetrics();
  }, [refreshKey]);

  const loadMetrics = () => {
    try {
      const stored = localStorage.getItem('performance_metrics');
      if (stored) {
        setMetrics(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading metrics:', error);
    }
  };

  const clearMetrics = () => {
    localStorage.removeItem('performance_metrics');
    setMetrics([]);
  };

  // Calculate statistics
  const stats = {
    totalEvents: metrics.length,
    cacheHits: metrics.filter(m => m.action === 'cache_hit').length,
    cacheMisses: metrics.filter(m => m.action === 'cache_miss').length,
    apiCalls: metrics.filter(m => m.action === 'api_call').length,
    cacheInvalidations: metrics.filter(m => m.action === 'cache_invalidated').length,
  };

  const cacheHitRate = stats.totalEvents > 0 
    ? ((stats.cacheHits / (stats.cacheHits + stats.cacheMisses)) * 100).toFixed(1)
    : '0.0';

  // Prepare chart data
  const actionDistribution = [
    { name: 'Cache Hits', value: stats.cacheHits, color: 'hsl(var(--chart-1))' },
    { name: 'Cache Misses', value: stats.cacheMisses, color: 'hsl(var(--chart-2))' },
    { name: 'API Calls', value: stats.apiCalls, color: 'hsl(var(--chart-3))' },
    { name: 'Invalidations', value: stats.cacheInvalidations, color: 'hsl(var(--destructive))' },
  ].filter(item => item.value > 0);

  // Timeline data (last 20 events)
  const recentMetrics = metrics.slice(-20).map((m, idx) => ({
    index: idx + 1,
    timestamp: new Date(m.timestamp).toLocaleTimeString(),
    cacheHit: m.action === 'cache_hit' ? 1 : 0,
    apiCall: m.action === 'api_call' ? 1 : 0,
    invalidated: m.action === 'cache_invalidated' ? 1 : 0,
  }));

  // Recent events with reasons
  const recentEvents = metrics.slice(-10).reverse();

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'cache_hit':
        return <Badge variant="default" className="bg-green-500">Cache Hit</Badge>;
      case 'cache_miss':
        return <Badge variant="secondary">Cache Miss</Badge>;
      case 'api_call':
        return <Badge variant="outline">API Call</Badge>;
      case 'cache_invalidated':
        return <Badge variant="destructive">Invalidated</Badge>;
      default:
        return <Badge>{action}</Badge>;
    }
  };

  const getDataFreshness = () => {
    const cacheData = localStorage.getItem('ai_recommendations_cache');
    if (!cacheData) return null;
    
    try {
      const { timestamp } = JSON.parse(cacheData);
      const ageInMinutes = Math.floor((Date.now() - timestamp) / 60000);
      return ageInMinutes;
    } catch {
      return null;
    }
  };

  const dataFreshness = getDataFreshness();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">Performance Monitoring</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setRefreshKey(k => k + 1)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="destructive" size="sm" onClick={clearMetrics}>
            Clear History
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Cache Hit Rate</p>
              <p className="text-2xl font-bold">{cacheHitRate}%</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Database className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Cache Hits</p>
              <p className="text-2xl font-bold">{stats.cacheHits}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Activity className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">API Calls</p>
              <p className="text-2xl font-bold">{stats.apiCalls}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <Clock className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Data Freshness</p>
              <p className="text-2xl font-bold">
                {dataFreshness !== null ? `${dataFreshness}m` : 'N/A'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Action Distribution */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Action Distribution</h3>
          {actionDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={actionDistribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {actionDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              No data available
            </div>
          )}
        </Card>

        {/* Activity Timeline */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          {recentMetrics.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={recentMetrics}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="index" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="cacheHit" name="Cache Hits" fill="hsl(var(--chart-1))" stackId="a" />
                <Bar dataKey="apiCall" name="API Calls" fill="hsl(var(--chart-3))" stackId="a" />
                <Bar dataKey="invalidated" name="Invalidated" fill="hsl(var(--destructive))" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              No activity recorded yet
            </div>
          )}
        </Card>
      </div>

      {/* Event Log */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Events</h3>
        {recentEvents.length > 0 ? (
          <div className="space-y-2">
            {recentEvents.map((event, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors">
                <div className="flex items-center gap-3">
                  {getActionBadge(event.action)}
                  {event.reason && (
                    <span className="text-sm text-muted-foreground">{event.reason}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(event.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No events recorded yet. Start using the app to see performance metrics.
          </div>
        )}
      </Card>

      {/* Statistics Summary */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Statistics Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 border border-border rounded-lg">
            <p className="text-2xl font-bold text-green-500">{stats.cacheHits}</p>
            <p className="text-sm text-muted-foreground">Cache Hits</p>
          </div>
          <div className="text-center p-4 border border-border rounded-lg">
            <p className="text-2xl font-bold text-yellow-500">{stats.cacheMisses}</p>
            <p className="text-sm text-muted-foreground">Cache Misses</p>
          </div>
          <div className="text-center p-4 border border-border rounded-lg">
            <p className="text-2xl font-bold text-blue-500">{stats.apiCalls}</p>
            <p className="text-sm text-muted-foreground">API Calls</p>
          </div>
          <div className="text-center p-4 border border-border rounded-lg">
            <p className="text-2xl font-bold text-red-500">{stats.cacheInvalidations}</p>
            <p className="text-sm text-muted-foreground">Cache Invalidations</p>
          </div>
        </div>
      </Card>
    </div>
  );
};
