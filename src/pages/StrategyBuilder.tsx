import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StrategyBuilderForm } from "@/components/StrategyBuilderForm";
import { useCustomStrategies } from "@/hooks/useCustomStrategies";
import { useEffect, useState } from "react";

const StrategyBuilder = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { strategies, createStrategy, updateStrategy } = useCustomStrategies();
  const [initialData, setInitialData] = useState<any>(null);

  useEffect(() => {
    if (id) {
      const strategy = strategies.find(s => s.id === id);
      if (strategy) {
        setInitialData(strategy);
      }
    }
  }, [id, strategies]);

  const handleSubmit = async (data: any) => {
    if (id) {
      await updateStrategy(id, data);
    } else {
      await createStrategy(data);
    }
    navigate('/strategies');
  };

  const handleCancel = () => {
    navigate('/strategies');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancel}
              className="hover:bg-accent"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {id ? 'Edit Strategy' : 'Create New Strategy'}
              </h1>
              <p className="text-sm text-muted-foreground">
                Configure entry/exit conditions, indicators, and risk settings
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <StrategyBuilderForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          initialData={initialData}
        />
      </main>
    </div>
  );
};

export default StrategyBuilder;
