import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Settings as SettingsIcon, Key, Mail, Shield, ArrowLeft, Brain } from 'lucide-react';
import { useRiskParameters } from '@/hooks/useRiskParameters';
import { PerformanceSettings } from '@/components/PerformanceSettings';
import { PerformanceMonitoringDashboard } from '@/components/PerformanceMonitoringDashboard';
import SmartRiskSettings from '@/components/SmartRiskSettings';
import { HedgingSettings } from '@/components/HedgingSettings';

import { SmartTradingSettings } from '@/components/SmartTradingSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Settings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { riskParams, updateRiskParameters } = useRiskParameters();
  const [loading, setLoading] = useState(false);
  const [apiKeysLoading, setApiKeysLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    binanceApiKey: '',
    binanceApiSecret: '',
    notificationPhone: riskParams?.notification_phone || '',
  });

  const [hasEncryptedKeys, setHasEncryptedKeys] = useState(false);

  const fetchApiKeys = async () => {
    try {
      setApiKeysLoading(true);
      const { data, error } = await supabase
        .from('user_api_keys' as any)
        .select('binance_api_key, binance_api_secret, keys_encrypted')
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        const isEncrypted = (data as any).keys_encrypted === true;
        setHasEncryptedKeys(isEncrypted);
        
        // If keys are encrypted, show masked version; otherwise show actual keys
        setFormData(prev => ({
          ...prev,
          binanceApiKey: isEncrypted ? '' : ((data as any).binance_api_key || ''),
          binanceApiSecret: isEncrypted ? '' : ((data as any).binance_api_secret || ''),
        }));
      }
    } catch (error) {
      console.error('Error fetching API keys:', error);
    } finally {
      setApiKeysLoading(false);
    }
  };

  // Fetch user's API keys on load
  useEffect(() => {
    fetchApiKeys();
  }, []);

  const handleUpdateBinanceKeys = async () => {
    if (!formData.binanceApiKey || !formData.binanceApiSecret) {
      toast({
        title: "Missing API Keys",
        description: "Please enter both API Key and API Secret",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check if record exists
      const { data: existing } = await supabase
        .from('user_api_keys' as any)
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        // Update existing record
        const { error } = await supabase
          .from('user_api_keys' as any)
          .update({
            binance_api_key: formData.binanceApiKey,
            binance_api_secret: formData.binanceApiSecret,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('user_api_keys' as any)
          .insert({
            user_id: user.id,
            binance_api_key: formData.binanceApiKey,
            binance_api_secret: formData.binanceApiSecret,
          });

        if (error) throw error;
      }

      toast({
        title: "API Keys Updated",
        description: "Your Binance API credentials have been saved securely",
      });

      // Refetch to show updated keys
      fetchApiKeys();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update API keys",
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

  const handleToggleAIAnalysis = async (enabled: boolean) => {
    try {
      await updateRiskParameters({ ai_analysis_enabled: enabled });
      toast({
        title: enabled ? "AI Analysis Enabled" : "AI Analysis Disabled",
        description: enabled 
          ? "AI will analyze signals and trades for additional validation" 
          : "AI analysis is now completely disabled - no AI usage",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update AI settings",
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

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general">General Settings</TabsTrigger>
          <TabsTrigger value="smart">Smart Trading</TabsTrigger>
          <TabsTrigger value="performance">Performance Monitor</TabsTrigger>
        </TabsList>

        <TabsContent value="smart" className="space-y-6">
          <SmartTradingSettings />
        </TabsContent>

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

          {/* AI Analysis */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Brain className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">AI Analysis</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <div className="font-medium">Enable AI Analysis</div>
                  <p className="text-sm text-muted-foreground">
                    Use AI to analyze signals for additional validation and risk assessment. Disabling stops all AI usage.
                  </p>
                </div>
                <Switch
                  checked={riskParams?.ai_analysis_enabled !== false}
                  onCheckedChange={handleToggleAIAnalysis}
                />
              </div>
              
              {riskParams?.ai_analysis_enabled === false && (
                <div className="p-4 bg-muted/50 border border-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    AI analysis is disabled. No AI calls will be made for signal validation or rejection analysis.
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
                Your Binance API credentials are stored securely and used for trade execution.
              </p>
              
              {apiKeysLoading ? (
                <div className="p-4 bg-muted/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">Loading API keys...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {hasEncryptedKeys && (
                    <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                        🔐 Your API keys are encrypted and stored securely in the vault. Enter new keys below to update them.
                      </p>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <Label htmlFor="binance-api-key">Binance API Key</Label>
                    <Input
                      id="binance-api-key"
                      type="text"
                      placeholder={hasEncryptedKeys ? "Keys encrypted - enter new key to update" : "Enter your Binance API Key"}
                      value={formData.binanceApiKey}
                      onChange={(e) => setFormData({ ...formData, binanceApiKey: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="binance-api-secret">Binance API Secret</Label>
                    <Input
                      id="binance-api-secret"
                      type="password"
                      placeholder={hasEncryptedKeys ? "Keys encrypted - enter new secret to update" : "Enter your Binance API Secret"}
                      value={formData.binanceApiSecret}
                      onChange={(e) => setFormData({ ...formData, binanceApiSecret: e.target.value })}
                    />
                  </div>

                  <Button 
                    onClick={handleUpdateBinanceKeys}
                    disabled={loading}
                  >
                    {loading ? 'Encrypting & Saving...' : (hasEncryptedKeys ? 'Update & Re-encrypt Keys' : 'Save Binance Keys')}
                  </Button>
                </div>
              )}
              
              <p className="text-xs text-muted-foreground border-l-2 border-primary/50 pl-3 py-2">
                🔒 Security: Your API keys are encrypted using Supabase Vault and stored securely. Only your edge functions can decrypt them.
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
                Configure SMS notifications for important trading events.
              </p>
              
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <div className="font-medium">SMS Notifications</div>
                  <p className="text-sm text-muted-foreground">
                    Receive text alerts for critical trading events
                  </p>
                </div>
                <Switch
                  checked={riskParams?.sms_notifications_enabled ?? true}
                  onCheckedChange={handleToggleSmsNotifications}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number for SMS</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.notificationPhone}
                  onChange={(e) => setFormData({ ...formData, notificationPhone: e.target.value })}
                  placeholder="+1234567890"
                />
                <Button onClick={handleSavePhoneNumber} className="w-full">
                  Save Phone Number
                </Button>
              </div>
            </div>
          </Card>

          {/* Hedging Settings */}
          <HedgingSettings />

          {/* Smart Risk Management */}
          <SmartRiskSettings />

          {/* Risk Management */}
          <PerformanceSettings />
        </TabsContent>


        <TabsContent value="performance">
          <PerformanceMonitoringDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
