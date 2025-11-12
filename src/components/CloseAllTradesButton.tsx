import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const CloseAllTradesButton = () => {
  const { toast } = useToast();
  const [isClosing, setIsClosing] = useState(false);

  const closeAllTrades = async () => {
    try {
      setIsClosing(true);
      const { data, error } = await supabase.functions.invoke('close-trade', {
        body: { closeAll: true }
      });

      if (error) throw error;

      toast({
        title: "All Positions Closed",
        description: `Successfully closed ${data.closedCount} positions`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to close positions',
        variant: "destructive",
      });
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <X className="h-4 w-4 mr-2" />
          Close All Trades
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close All Active Positions?</AlertDialogTitle>
          <AlertDialogDescription>
            This action will close all your active trading positions at current market prices. 
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={closeAllTrades}
            disabled={isClosing}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isClosing ? 'Closing...' : 'Close All'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
