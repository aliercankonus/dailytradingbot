import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Brain, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';

interface AIAnalysis {
  id: string;
  symbol: string;
  signal_type: string;
  strategy_name: string | null;
  recommendation: string;
  confidence_adjustment: number;
  position_size_multiplier: number;
  risk_level: string;
  key_factors: string[];
  trend_data: any;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  created_at: string;
}

export const AIAnalysisDashboard = () => {
  const { user } = useAuth();

  const { data: analyses, isLoading } = useQuery({
    queryKey: ['ai-signal-analysis', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_signal_analysis')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as AIAnalysis[];
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const getRecommendationBadge = (recommendation: string) => {
    switch (recommendation) {
      case 'strong_entry':
        return (
          <Badge className="bg-success/10 text-success border-success/20 gap-1">
            <CheckCircle className="h-3 w-3" />
            Strong Entry
          </Badge>
        );
      case 'normal_entry':
        return (
          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1">
            <Info className="h-3 w-3" />
            Normal Entry
          </Badge>
        );
      case 'caution':
        return (
          <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 gap-1">
            <AlertTriangle className="h-3 w-3" />
            Caution
          </Badge>
        );
      case 'avoid':
        return (
          <Badge className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
            <XCircle className="h-3 w-3" />
            Avoid
          </Badge>
        );
      default:
        return <Badge variant="secondary">{recommendation}</Badge>;
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'low':
        return <Badge variant="outline" className="bg-success/5 text-success border-success/20">Low Risk</Badge>;
      case 'medium':
        return <Badge variant="outline" className="bg-yellow-500/5 text-yellow-600 border-yellow-500/20">Medium Risk</Badge>;
      case 'high':
        return <Badge variant="outline" className="bg-destructive/5 text-destructive border-destructive/20">High Risk</Badge>;
      default:
        return <Badge variant="secondary">{risk}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!analyses || analyses.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            AI Signal Analysis
          </CardTitle>
          <CardDescription>AI-powered trade signal evaluation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No AI analyses yet</p>
            <p className="text-sm mt-2">AI analysis runs when signals pass filters and reach execution</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Summary stats
  const recommendations = analyses.reduce((acc, a) => {
    acc[a.recommendation] = (acc[a.recommendation] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            AI Signal Analysis
          </CardTitle>
          <CardDescription>AI-powered trade signal evaluation and recommendations</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 border rounded-lg bg-success/5">
              <div className="text-2xl font-bold text-success">{recommendations['strong_entry'] || 0}</div>
              <div className="text-xs text-muted-foreground">Strong Entry</div>
            </div>
            <div className="text-center p-3 border rounded-lg bg-blue-500/5">
              <div className="text-2xl font-bold text-blue-500">{recommendations['normal_entry'] || 0}</div>
              <div className="text-xs text-muted-foreground">Normal Entry</div>
            </div>
            <div className="text-center p-3 border rounded-lg bg-yellow-500/5">
              <div className="text-2xl font-bold text-yellow-600">{recommendations['caution'] || 0}</div>
              <div className="text-xs text-muted-foreground">Caution</div>
            </div>
            <div className="text-center p-3 border rounded-lg bg-destructive/5">
              <div className="text-2xl font-bold text-destructive">{recommendations['avoid'] || 0}</div>
              <div className="text-xs text-muted-foreground">Avoid</div>
            </div>
          </div>

          {/* Recent Analyses */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Recent Analyses</h4>
            {analyses.slice(0, 10).map((analysis) => (
              <div key={analysis.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant={analysis.signal_type === 'long' ? 'default' : 'secondary'}>
                      {analysis.signal_type === 'long' ? (
                        <TrendingUp className="h-3 w-3 mr-1" />
                      ) : (
                        <TrendingDown className="h-3 w-3 mr-1" />
                      )}
                      {analysis.symbol}
                    </Badge>
                    {getRecommendationBadge(analysis.recommendation)}
                    {getRiskBadge(analysis.risk_level)}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(analysis.created_at), { addSuffix: true })}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Strategy:</span>
                    <span className="ml-2 font-medium">{analysis.strategy_name || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Confidence Adj:</span>
                    <span className={`ml-2 font-medium ${analysis.confidence_adjustment > 0 ? 'text-success' : analysis.confidence_adjustment < 0 ? 'text-destructive' : ''}`}>
                      {analysis.confidence_adjustment > 0 ? '+' : ''}{analysis.confidence_adjustment}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Size Multiplier:</span>
                    <span className="ml-2 font-medium">{analysis.position_size_multiplier}x</span>
                  </div>
                </div>

                {analysis.key_factors && analysis.key_factors.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {analysis.key_factors.map((factor, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {factor}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground border-t pt-2">
                  <div>Entry: ${analysis.entry_price?.toFixed(4)}</div>
                  <div>SL: ${analysis.stop_loss?.toFixed(4)}</div>
                  <div>TP: ${analysis.take_profit?.toFixed(4)}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};