import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StrategyBuilderForm } from "@/components/StrategyBuilderForm";
import { StrategyTestResults } from "@/components/StrategyTestResults";
import { StrategyTemplatesDialog } from "@/components/StrategyTemplatesDialog";
import { useCustomStrategies } from "@/hooks/useCustomStrategies";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { StrategyTemplate } from "@/data/strategyTemplates";

const StrategyBuilder = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { strategies, createStrategy, updateStrategy } = useCustomStrategies();
  const { toast } = useToast();
  const [initialData, setInitialData] = useState<any>(null);
  const [testResults, setTestResults] = useState<any>(null);
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateData, setTemplateData] = useState<any>(null);

  useEffect(() => {
    if (id) {
      const strategy = strategies.find(s => s.id === id);
      if (strategy) {
        setInitialData(strategy);
      }
    } else if (templateData) {
      setInitialData(templateData);
    }
  }, [id, strategies, templateData]);

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

  const handleTest = async (strategyData: any) => {
    setIsTesting(true);
    
    try {
      const { data: result, error } = await supabase.functions.invoke('test-strategy', {
        body: { strategy: strategyData }
      });

      if (error) throw error;

      if (result.success) {
        setTestResults(result);
        setIsTestDialogOpen(true);
        toast({
          title: "Test Complete",
          description: `Generated ${result.summary.signalsGenerated} signals from ${result.summary.totalSymbolsTested} symbols`,
        });
      } else {
        throw new Error(result.error || 'Test failed');
      }
    } catch (error) {
      console.error('Test error:', error);
      toast({
        title: "Test Failed",
        description: error instanceof Error ? error.message : "Failed to test strategy",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSelectTemplate = (template: StrategyTemplate) => {
    const newTemplateData = {
      name: template.name,
      description: template.description,
      entry_conditions: template.entry_conditions,
      exit_conditions: template.exit_conditions,
      indicators: template.indicators,
      risk_settings: template.risk_settings,
    };
    setTemplateData(newTemplateData);
    setInitialData(newTemplateData);
    toast({
      title: "Template Applied",
      description: `${template.name} template has been loaded. You can customize it before saving.`,
    });
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
            {!id && (
              <Button 
                variant="outline" 
                onClick={() => setShowTemplates(true)}
                className="gap-2"
              >
                <BookTemplate className="h-4 w-4" />
                Browse Templates
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <StrategyBuilderForm
          key={initialData?.name || 'new'}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onTest={handleTest}
          initialData={initialData}
          isTesting={isTesting}
        />
      </main>

      {/* Test Results Dialog */}
      <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Strategy Test Results</DialogTitle>
          </DialogHeader>
          {testResults && (
            <StrategyTestResults
              strategyName={testResults.strategyName}
              results={testResults.results}
              summary={testResults.summary}
              timestamp={testResults.timestamp}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Templates Dialog */}
      <StrategyTemplatesDialog
        open={showTemplates}
        onOpenChange={setShowTemplates}
        onSelectTemplate={handleSelectTemplate}
      />
    </div>
  );
};

export default StrategyBuilder;