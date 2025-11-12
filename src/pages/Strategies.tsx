import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Edit, Trash2, Power } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCustomStrategies } from "@/hooks/useCustomStrategies";

const Strategies = () => {
  const navigate = useNavigate();
  const { strategies, loading, deleteStrategy, toggleActive } = useCustomStrategies();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (deleteId) {
      await deleteStrategy(deleteId);
      setDeleteId(null);
    }
  };

  const handleToggle = async (id: string, currentState: boolean) => {
    await toggleActive(id, !currentState);
  };

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
                <h1 className="text-2xl font-bold text-foreground">Strategy Management</h1>
                <p className="text-sm text-muted-foreground">Create and manage your custom trading strategies</p>
              </div>
            </div>
            <Button onClick={() => navigate('/strategies/new')} className="gap-2">
              <Plus className="h-4 w-4" />
              New Strategy
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            <p className="mt-4 text-muted-foreground">Loading strategies...</p>
          </div>
        ) : strategies.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="max-w-md mx-auto space-y-4">
              <div className="h-16 w-16 mx-auto rounded-full bg-secondary/50 flex items-center justify-center">
                <Plus className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">No strategies yet</h2>
              <p className="text-muted-foreground">
                Create your first custom strategy to start automated trading with your own rules
              </p>
              <Button onClick={() => navigate('/strategies/new')} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Strategy
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {strategies.map((strategy) => (
              <Card key={strategy.id} className="p-6 hover:border-primary/50 transition-colors">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg text-foreground mb-1">
                        {strategy.name}
                      </h3>
                      {strategy.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {strategy.description}
                        </p>
                      )}
                    </div>
                    <Badge variant={strategy.is_active ? "default" : "secondary"}>
                      {strategy.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Entry Conditions:</span>
                      <span className="font-mono text-foreground">
                        {Array.isArray(strategy.entry_conditions) ? strategy.entry_conditions.length : 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Exit Conditions:</span>
                      <span className="font-mono text-foreground">
                        {Array.isArray(strategy.exit_conditions) ? strategy.exit_conditions.length : 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Indicators:</span>
                      <span className="font-mono text-foreground">
                        {Array.isArray(strategy.indicators) ? strategy.indicators.length : 0}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-4 border-t border-border">
                    <div className="flex items-center gap-2 flex-1">
                      <Power className="h-4 w-4 text-muted-foreground" />
                      <Switch
                        checked={strategy.is_active}
                        onCheckedChange={() => handleToggle(strategy.id, strategy.is_active)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigate(`/strategies/edit/${strategy.id}`)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(strategy.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Strategy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this strategy? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Strategies;
