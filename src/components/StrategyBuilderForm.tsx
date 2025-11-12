import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, FlaskConical } from 'lucide-react';

const strategySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
});

type StrategyFormData = z.infer<typeof strategySchema>;

interface Condition {
  indicator: string;
  operator: string;
  value: string;
}

interface Indicator {
  type: string;
  period?: number;
  signal?: number;
}

interface RiskSettings {
  stopLossPercent: number;
  takeProfitPercent: number;
  positionSizePercent: number;
}

interface StrategyBuilderFormProps {
  onSubmit: (data: any) => void;
  onCancel: () => void;
  onTest?: (data: any) => void;
  initialData?: any;
  isTesting?: boolean;
}

export const StrategyBuilderForm = ({ 
  onSubmit, 
  onCancel, 
  onTest, 
  initialData,
  isTesting = false 
}: StrategyBuilderFormProps) => {
  const [entryConditions, setEntryConditions] = useState<Condition[]>(
    initialData?.entry_conditions || []
  );
  const [exitConditions, setExitConditions] = useState<Condition[]>(
    initialData?.exit_conditions || []
  );
  const [indicators, setIndicators] = useState<Indicator[]>(
    initialData?.indicators || []
  );
  const [riskSettings, setRiskSettings] = useState<RiskSettings>(
    initialData?.risk_settings || {
      stopLossPercent: 2,
      takeProfitPercent: 4,
      positionSizePercent: 1,
    }
  );

  const form = useForm<StrategyFormData>({
    resolver: zodResolver(strategySchema),
    defaultValues: {
      name: initialData?.name || '',
      description: initialData?.description || '',
    },
  });

  // Update form when initialData changes (e.g., when template is selected)
  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name || '',
        description: initialData.description || '',
      });
      setEntryConditions(initialData.entry_conditions || []);
      setExitConditions(initialData.exit_conditions || []);
      setIndicators(initialData.indicators || []);
      setRiskSettings(initialData.risk_settings || {
        stopLossPercent: 2,
        takeProfitPercent: 4,
        positionSizePercent: 1,
      });
    }
  }, [initialData, form]);

  const addEntryCondition = () => {
    setEntryConditions([...entryConditions, { indicator: 'RSI', operator: 'below', value: '30' }]);
  };

  const removeEntryCondition = (index: number) => {
    setEntryConditions(entryConditions.filter((_, i) => i !== index));
  };

  const updateEntryCondition = (index: number, field: keyof Condition, value: string) => {
    const updated = [...entryConditions];
    updated[index] = { ...updated[index], [field]: value };
    setEntryConditions(updated);
  };

  const addExitCondition = () => {
    setExitConditions([...exitConditions, { indicator: 'RSI', operator: 'above', value: '70' }]);
  };

  const removeExitCondition = (index: number) => {
    setExitConditions(exitConditions.filter((_, i) => i !== index));
  };

  const updateExitCondition = (index: number, field: keyof Condition, value: string) => {
    const updated = [...exitConditions];
    updated[index] = { ...updated[index], [field]: value };
    setExitConditions(updated);
  };

  const addIndicator = () => {
    setIndicators([...indicators, { type: 'RSI', period: 14 }]);
  };

  const removeIndicator = (index: number) => {
    setIndicators(indicators.filter((_, i) => i !== index));
  };

  const updateIndicator = (index: number, field: string, value: string | number) => {
    const updated = [...indicators];
    updated[index] = { ...updated[index], [field]: value };
    setIndicators(updated);
  };

  const handleSubmit = (data: StrategyFormData) => {
    onSubmit({
      ...data,
      entry_conditions: entryConditions,
      exit_conditions: exitConditions,
      indicators,
      risk_settings: riskSettings,
      is_active: initialData?.is_active ?? false,
    });
  };

  const handleTest = () => {
    const data = form.getValues();
    if (onTest) {
      onTest({
        ...data,
        entry_conditions: entryConditions,
        exit_conditions: exitConditions,
        indicators,
        risk_settings: riskSettings,
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Strategy Name</FormLabel>
                  <FormControl>
                    <Input placeholder="My Custom Strategy" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Describe your strategy..." {...field} />
                  </FormControl>
                  <FormDescription>Optional description of your strategy</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Entry Conditions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Entry Conditions</CardTitle>
            <Button type="button" size="sm" onClick={addEntryCondition}>
              <Plus className="h-4 w-4 mr-1" /> Add Condition
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {entryConditions.length === 0 && (
              <p className="text-sm text-muted-foreground">No entry conditions defined</p>
            )}
            {entryConditions.map((condition, index) => (
              <div key={index} className="flex gap-2 items-start">
                <Select
                  value={condition.indicator}
                  onValueChange={(value) => updateEntryCondition(index, 'indicator', value)}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RSI">RSI</SelectItem>
                    <SelectItem value="MACD">MACD</SelectItem>
                    <SelectItem value="EMA">EMA</SelectItem>
                    <SelectItem value="Price">Price</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={condition.operator}
                  onValueChange={(value) => updateEntryCondition(index, 'operator', value)}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="above">Above</SelectItem>
                    <SelectItem value="below">Below</SelectItem>
                    <SelectItem value="crosses_above">Crosses Above</SelectItem>
                    <SelectItem value="crosses_below">Crosses Below</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="text"
                  value={condition.value}
                  onChange={(e) => updateEntryCondition(index, 'value', e.target.value)}
                  placeholder="Value"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={() => removeEntryCondition(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Exit Conditions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Exit Conditions</CardTitle>
            <Button type="button" size="sm" onClick={addExitCondition}>
              <Plus className="h-4 w-4 mr-1" /> Add Condition
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {exitConditions.length === 0 && (
              <p className="text-sm text-muted-foreground">No exit conditions defined</p>
            )}
            {exitConditions.map((condition, index) => (
              <div key={index} className="flex gap-2 items-start">
                <Select
                  value={condition.indicator}
                  onValueChange={(value) => updateExitCondition(index, 'indicator', value)}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RSI">RSI</SelectItem>
                    <SelectItem value="MACD">MACD</SelectItem>
                    <SelectItem value="EMA">EMA</SelectItem>
                    <SelectItem value="Price">Price</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={condition.operator}
                  onValueChange={(value) => updateExitCondition(index, 'operator', value)}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="above">Above</SelectItem>
                    <SelectItem value="below">Below</SelectItem>
                    <SelectItem value="crosses_above">Crosses Above</SelectItem>
                    <SelectItem value="crosses_below">Crosses Below</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="text"
                  value={condition.value}
                  onChange={(e) => updateExitCondition(index, 'value', e.target.value)}
                  placeholder="Value"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={() => removeExitCondition(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Indicators */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Indicators</CardTitle>
            <Button type="button" size="sm" onClick={addIndicator}>
              <Plus className="h-4 w-4 mr-1" /> Add Indicator
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {indicators.length === 0 && (
              <p className="text-sm text-muted-foreground">No indicators configured</p>
            )}
            {indicators.map((indicator, index) => (
              <div key={index} className="flex gap-2 items-start">
                <Select
                  value={indicator.type}
                  onValueChange={(value) => updateIndicator(index, 'type', value)}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RSI">RSI</SelectItem>
                    <SelectItem value="MACD">MACD</SelectItem>
                    <SelectItem value="EMA">EMA</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={indicator.period || ''}
                  onChange={(e) => updateIndicator(index, 'period', parseInt(e.target.value))}
                  placeholder="Period"
                  className="w-[120px]"
                />
                {indicator.type === 'MACD' && (
                  <Input
                    type="number"
                    value={indicator.signal || ''}
                    onChange={(e) => updateIndicator(index, 'signal', parseInt(e.target.value))}
                    placeholder="Signal"
                    className="w-[120px]"
                  />
                )}
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={() => removeIndicator(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Risk Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Risk Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Stop Loss (%)</label>
              <Input
                type="number"
                step="0.1"
                value={riskSettings.stopLossPercent}
                onChange={(e) =>
                  setRiskSettings({ ...riskSettings, stopLossPercent: parseFloat(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Take Profit (%)</label>
              <Input
                type="number"
                step="0.1"
                value={riskSettings.takeProfitPercent}
                onChange={(e) =>
                  setRiskSettings({ ...riskSettings, takeProfitPercent: parseFloat(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Position Size (%)</label>
              <Input
                type="number"
                step="0.1"
                value={riskSettings.positionSizePercent}
                onChange={(e) =>
                  setRiskSettings({
                    ...riskSettings,
                    positionSizePercent: parseFloat(e.target.value),
                  })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          {onTest && (
            <Button 
              type="button" 
              variant="secondary" 
              onClick={handleTest}
              disabled={isTesting}
            >
              <FlaskConical className="h-4 w-4 mr-2" />
              {isTesting ? 'Testing...' : 'Test Strategy'}
            </Button>
          )}
          <Button type="submit">
            {initialData ? 'Update Strategy' : 'Create Strategy'}
          </Button>
        </div>
      </form>
    </Form>
  );
};
