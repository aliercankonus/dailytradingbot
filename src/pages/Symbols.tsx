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
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/')}
                className="hover:bg-accent shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-3xl font-bold truncate">Trading Symbols</h1>
                <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 sm:mt-1 hidden sm:block">
                  Manage which trading pairs are active in your system
                </p>
              </div>
            </div>
            <Button onClick={() => setShowAddDialog(true)} size="sm" className="shrink-0">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Add Symbol</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="grid gap-4 mb-6">
          <Card className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm sm:text-base">Active Trading Pairs</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Monitoring {activeSymbols.length} pair{activeSymbols.length !== 1 ? 's' : ''}
                </p>
              </div>
              <Badge variant="default" className="text-sm sm:text-lg px-3 sm:px-4 py-1 sm:py-2 shrink-0">
                {activeSymbols.length} Active
              </Badge>
            </div>
          </Card>
        </div>

        <Card className="p-3 sm:p-6">
          <div className="space-y-3">
            {symbols.map((symbol) => (
              <div
                key={symbol.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg border transition-all gap-3 ${
                  symbol.is_active
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-muted/30 border-border'
                }`}
              >
                <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                  <div
                    className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full shrink-0 ${
                      symbol.is_active ? 'bg-primary/20' : 'bg-muted'
                    }`}
                  >
                    {symbol.is_active ? (
                      <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                    ) : (
                      <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm sm:text-base">{symbol.display_name}</h4>
                      <Badge variant="outline" className="font-mono text-[10px] sm:text-xs">
                        {symbol.symbol}
                      </Badge>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">
                      {symbol.is_active ? 'Active - Signal generation & monitoring' : 'Inactive'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`symbol-${symbol.id}`} className="text-xs sm:text-sm cursor-pointer">
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
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
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
