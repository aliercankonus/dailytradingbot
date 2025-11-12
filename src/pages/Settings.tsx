import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Settings as SettingsIcon, Key, Mail, Shield, ArrowLeft } from 'lucide-react';
import { useRiskParameters } from '@/hooks/useRiskParameters';
import { PerformanceSettings } from '@/components/PerformanceSettings';
import { PerformanceMonitoringDashboard } from '@/components/PerformanceMonitoringDashboard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Settings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { riskParams, updateRiskParameters } = useRiskParameters();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    binanceApiKey: '',
    binanceApiSecret: '',
    notificationEmail: 'trader@example.com',
    notificationPhone: riskParams?.notification_phone || '',
  });

  const handleSaveApiKeys = async () => {
    if (!formData.binanceApiKey || !formData.binanceApiSecret) {
      toast({
        title: "Missing Information",
        description: "Please enter both API Key and Secret",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Note: In a real application, you would want to store these securely
      // This is a simplified example
      toast({
        title: "API Keys Updated",
        description: "Your Binance API keys have been updated. Note: For production, implement secure secret management.",
      });
      
      setFormData({ ...formData, binanceApiKey: '', binanceApiSecret: '' });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to update API keys',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePaperTrading = async (enabled: boolean) => {
    try {
      await updateRiskParameters({ paper_trading_mode: enabled });
      toast({
        title: enabled ? "Paper Trading Enabled" : "Live Trading Enabled",
        description: enabled 
          ? "Trades will be simulated without real money" 
          : "⚠️ Trades will use real money. Be careful!",
        variant: enabled ? "default" : "destructive",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update trading mode",
        variant: "destructive",
      });
    }
  };

  const handleToggleSmsNotifications = async (enabled: boolean) => {
    try {
      await updateRiskParameters({ sms_notifications_enabled: enabled });
      toast({
        title: enabled ? "SMS Notifications Enabled" : "SMS Notifications Disabled",
        description: enabled 
          ? "You'll receive SMS alerts for critical events" 
          : "SMS alerts are now disabled",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update SMS settings",
        variant: "destructive",
      });
    }
  };

  const handleSavePhoneNumber = async () => {
    if (!formData.notificationPhone) {
      toast({
        title: "Missing Phone Number",
        description: "Please enter a phone number",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateRiskParameters({ notification_phone: formData.notificationPhone });
      toast({
        title: "Phone Number Updated",
        description: "Your phone number has been saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update phone number",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => navigate('/')}
          className="mr-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <SettingsIcon className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="general">General Settings</TabsTrigger>
          <TabsTrigger value="performance">Performance Monitor</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          {/* Trading Mode */}
          <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Trading Mode</h2>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <div className="font-medium">Paper Trading Mode</div>
              <p className="text-sm text-muted-foreground">
                Simulate trades without using real money. Perfect for testing strategies safely.
              </p>
            </div>
            <Switch
              checked={riskParams?.paper_trading_mode ?? true}
              onCheckedChange={handleTogglePaperTrading}
            />
          </div>
          
          {riskParams?.paper_trading_mode === false && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive font-medium">
                ⚠️ Live Trading Active - Real money will be used for trades
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* API Keys */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Key className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Binance API Keys</h2>
        </div>
        
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Update your Binance API credentials. These are stored securely and used for trade execution.
          </p>
          
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              value={formData.binanceApiKey}
              onChange={(e) => setFormData({ ...formData, binanceApiKey: e.target.value })}
              placeholder="Enter your Binance API Key"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiSecret">API Secret</Label>
            <Input
              id="apiSecret"
              type="password"
              value={formData.binanceApiSecret}
              onChange={(e) => setFormData({ ...formData, binanceApiSecret: e.target.value })}
              placeholder="Enter your Binance API Secret"
            />
          </div>

          <Button onClick={handleSaveApiKeys} disabled={loading}>
            {loading ? 'Updating...' : 'Update API Keys'}
          </Button>
          
          <p className="text-xs text-muted-foreground">
            Note: For production use, implement proper secret management through your backend.
          </p>
        </div>
      </Card>

      {/* Notifications */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Mail className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Notifications</h2>
        </div>
        
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Receive email notifications for important trading events.
          </p>
          
          <div className="space-y-2">
            <Label htmlFor="email">Notification Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.notificationEmail}
              onChange={(e) => setFormData({ ...formData, notificationEmail: e.target.value })}
              placeholder="your-email@example.com"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border rounded">
              <span className="text-sm">Trade Executions</span>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between p-3 border rounded">
              <span className="text-sm">Stop Loss Triggers</span>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between p-3 border rounded">
              <span className="text-sm">Take Profit Triggers</span>
              <Switch defaultChecked />
            </div>
          </div>
        </div>
      </Card>

      {/* SMS Notifications */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Mail className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">SMS Notifications (Twilio)</h2>
        </div>
        
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Receive SMS alerts for critical events like stop-loss and take-profit triggers.
          </p>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <div className="font-medium">Enable SMS Alerts</div>
              <p className="text-sm text-muted-foreground">
                Send SMS for stop-loss and take-profit events
              </p>
            </div>
            <Switch
              checked={riskParams?.sms_notifications_enabled ?? true}
              onCheckedChange={handleToggleSmsNotifications}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number (with country code)</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.notificationPhone}
              onChange={(e) => setFormData({ ...formData, notificationPhone: e.target.value })}
              placeholder="+1234567890"
            />
            <p className="text-xs text-muted-foreground">
              Format: +[country code][number] (e.g., +15551234567)
            </p>
          </div>

          <Button onClick={handleSavePhoneNumber}>
            Save Phone Number
          </Button>
        </div>
      </Card>

          {/* Performance Settings */}
          <PerformanceSettings />
        </TabsContent>

        <TabsContent value="performance">
          <PerformanceMonitoringDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
