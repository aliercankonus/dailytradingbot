import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, BarChart3, Zap } from 'lucide-react';
import { strategyTemplates, StrategyTemplate } from '@/data/strategyTemplates';

interface StrategyTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (template: StrategyTemplate) => void;
}

export const StrategyTemplatesDialog = ({ open, onOpenChange, onSelectTemplate }: StrategyTemplatesDialogProps) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'momentum': return Zap;
      case 'reversal': return TrendingDown;
      case 'trend': return TrendingUp;
      case 'breakout': return BarChart3;
      default: return BarChart3;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'momentum': return 'text-chart-3';
      case 'reversal': return 'text-chart-2';
      case 'trend': return 'text-primary';
      case 'breakout': return 'text-chart-4';
      default: return 'text-foreground';
    }
  };

  const filteredTemplates = selectedCategory === 'all' 
    ? strategyTemplates 
    : strategyTemplates.filter(t => t.category === selectedCategory);

  const handleSelectTemplate = (template: StrategyTemplate) => {
    onSelectTemplate(template);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Strategy Templates</DialogTitle>
          <DialogDescription>
            Choose a pre-configured strategy template to get started quickly
          </DialogDescription>
        </DialogHeader>

        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="momentum">Momentum</TabsTrigger>
            <TabsTrigger value="reversal">Reversal</TabsTrigger>
            <TabsTrigger value="trend">Trend</TabsTrigger>
            <TabsTrigger value="breakout">Breakout</TabsTrigger>
          </TabsList>

          <TabsContent value={selectedCategory} className="mt-6">
            <div className="grid gap-4 md:grid-cols-2">
              {filteredTemplates.map((template) => {
                const Icon = getCategoryIcon(template.category);
                const colorClass = getCategoryColor(template.category);
                
                return (
                  <Card 
                    key={template.id} 
                    className="p-4 hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => handleSelectTemplate(template)}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-5 w-5 ${colorClass}`} />
                          <h3 className="font-semibold text-foreground">{template.name}</h3>
                        </div>
                        <Badge variant="outline" className="capitalize">
                          {template.category}
                        </Badge>
                      </div>

                      <p className="text-sm text-muted-foreground">
                        {template.description}
                      </p>

                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">Entry Rules</div>
                          <div className="font-mono font-semibold">{template.entry_conditions.length}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Exit Rules</div>
                          <div className="font-mono font-semibold">{template.exit_conditions.length}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Indicators</div>
                          <div className="font-mono font-semibold">{template.indicators.length}</div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Stop Loss:</span>
                          <span className="font-mono text-loss">{template.risk_settings.stopLossPercent}%</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Take Profit:</span>
                          <span className="font-mono text-profit">{template.risk_settings.takeProfitPercent}%</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Position Size:</span>
                          <span className="font-mono">{template.risk_settings.positionSizePercent}%</span>
                        </div>
                      </div>

                      <Button 
                        size="sm" 
                        className="w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectTemplate(template);
                        }}
                      >
                        Use This Template
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>

            {filteredTemplates.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                No templates found in this category
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};