import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Strategy {
  id: string;
  strategy_name: string;
  status: string;
}

interface EditBuiltInStrategyDialogProps {
  strategy: Strategy | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const EditBuiltInStrategyDialog = ({ strategy, open, onOpenChange, onSuccess }: EditBuiltInStrategyDialogProps) => {
  const [name, setName] = useState(strategy?.strategy_name || '');
  const [status, setStatus] = useState(strategy?.status || 'active');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!strategy) return;

    try {
      setSaving(true);
      
      const { error } = await supabase
        .from('strategy_performance')
        .update({
          strategy_name: name,
          status,
          last_updated: new Date().toISOString(),
        })
        .eq('id', strategy.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Strategy updated successfully',
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating strategy:', error);
      toast({
        title: 'Error',
        description: 'Failed to update strategy',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Update local state when strategy prop changes
  if (strategy && name !== strategy.strategy_name) {
    setName(strategy.strategy_name);
    setStatus(strategy.status);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Strategy</DialogTitle>
          <DialogDescription>
            Update the strategy settings below
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Strategy Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter strategy name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="standby">Standby</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};