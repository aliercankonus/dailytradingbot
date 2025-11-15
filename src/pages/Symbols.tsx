import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSymbols } from '@/hooks/useSymbols';
import { Plus, Trash2, Loader2, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';

const Symbols = () => {
  const navigate = useNavigate();
  const { symbols, activeSymbols, loading, toggleSymbol, addSymbol, deleteSymbol } = useSymbols();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddSymbol = async () => {
    if (!newSymbol || !newDisplayName) return;

    setIsAdding(true);
    await addSymbol(newSymbol, newDisplayName);
    setIsAdding(false);
    setShowAddDialog(false);
    setNewSymbol('');
    setNewDisplayName('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/')}
                className="hover:bg-accent"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold">Trading Symbols</h1>
                <p className="text-muted-foreground mt-1">
                  Manage which trading pairs are active in your system
                </p>
              </div>
            </div>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Symbol
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Active Trading Pairs</h3>
                <p className="text-sm text-muted-foreground">
                  Currently monitoring {activeSymbols.length} trading pair{activeSymbols.length !== 1 ? 's' : ''}
                </p>
              </div>
              <Badge variant="default" className="text-lg px-4 py-2">
                {activeSymbols.length} Active
              </Badge>
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <div className="space-y-3">
            {symbols.map((symbol) => (
              <div
                key={symbol.id}
                className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                  symbol.is_active
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-muted/30 border-border'
                }`}
              >
                <div className="flex items-center gap-4 flex-1">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full ${
                      symbol.is_active ? 'bg-primary/20' : 'bg-muted'
                    }`}
                  >
                    {symbol.is_active ? (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    ) : (
                      <XCircle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{symbol.display_name}</h4>
                      <Badge variant="outline" className="font-mono text-xs">
                        {symbol.symbol}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {symbol.is_active
                        ? 'Active - Included in signal generation and monitoring'
                        : 'Inactive - Not used in trading operations'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`symbol-${symbol.id}`} className="text-sm cursor-pointer">
                      {symbol.is_active ? 'Active' : 'Inactive'}
                    </Label>
                    <Switch
                      id={`symbol-${symbol.id}`}
                      checked={symbol.is_active}
                      onCheckedChange={(checked) => toggleSymbol(symbol.id, checked)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteSymbol(symbol.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            {symbols.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No trading symbols configured</p>
                <Button onClick={() => setShowAddDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Symbol
                </Button>
              </div>
            )}
          </div>
        </Card>
      </main>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Trading Symbol</DialogTitle>
            <DialogDescription>
              Add a new trading pair to monitor. Use Binance format (e.g., BTCUSDT).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="symbol">Symbol</Label>
              <Input
                id="symbol"
                placeholder="BTCUSDT"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                placeholder="Bitcoin (BTC/USDT)"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddSymbol}
              disabled={!newSymbol || !newDisplayName || isAdding}
            >
              {isAdding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Symbol
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Symbols;
