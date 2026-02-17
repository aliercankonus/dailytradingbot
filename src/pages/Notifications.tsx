import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Mail, Phone } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { useRiskParametersContext } from '@/contexts/RiskParametersContext';

export default function Notifications() {
  const { toast } = useToast();
  const { riskParams, updateRiskParameters } = useRiskParametersContext();
  const [notificationEmail, setNotificationEmail] = useState('');
  const [notificationPhone, setNotificationPhone] = useState(riskParams?.notification_phone || '');

  const handleSaveEmail = async () => {
    if (!notificationEmail) {
      toast({ title: "Missing Email", description: "Please enter an email address", variant: "destructive" });
      return;
    }
    try {
      await updateRiskParameters({ notification_email: notificationEmail });
      toast({ title: "Email Updated", description: "Your notification email has been saved" });
    } catch {
      toast({ title: "Error", description: "Failed to update email", variant: "destructive" });
    }
  };

  const handleSavePhone = async () => {
    if (!notificationPhone) {
      toast({ title: "Missing Phone", description: "Please enter a phone number", variant: "destructive" });
      return;
    }
    try {
      await updateRiskParameters({ notification_phone: notificationPhone });
      toast({ title: "Phone Updated", description: "Your phone number has been saved" });
    } catch {
      toast({ title: "Error", description: "Failed to update phone number", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto px-3 sm:px-6 py-4 space-y-4 max-w-2xl">
        <h1 className="text-lg font-semibold">Notifications</h1>

        {/* Email Notifications */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-[15px] font-semibold">Email Notifications</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-1">
                <div className="font-medium">Enable Email Alerts</div>
                <p className="text-sm text-muted-foreground">Receive email alerts for trades and API errors</p>
              </div>
              <Switch
                checked={riskParams?.email_notifications_enabled ?? true}
                onCheckedChange={async (enabled) => {
                  try {
                    await updateRiskParameters({ email_notifications_enabled: enabled });
                    toast({
                      title: enabled ? "Email Notifications Enabled" : "Email Notifications Disabled",
                      description: enabled ? "You'll receive email alerts" : "Email alerts disabled",
                    });
                  } catch {
                    toast({ title: "Error", description: "Failed to update", variant: "destructive" });
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notif-email">Email Address</Label>
              <Input
                id="notif-email"
                type="email"
                value={notificationEmail || riskParams?.notification_email || ''}
                onChange={(e) => setNotificationEmail(e.target.value)}
                placeholder="your-email@example.com"
              />
              <Button onClick={handleSaveEmail} className="w-full">Save Email Address</Button>
            </div>
          </div>
        </Card>

        {/* SMS Notifications */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-[15px] font-semibold">SMS Notifications</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-1">
                <div className="font-medium">Enable SMS Alerts</div>
                <p className="text-sm text-muted-foreground">Receive text alerts for critical trading events</p>
              </div>
              <Switch
                checked={riskParams?.sms_notifications_enabled ?? true}
                onCheckedChange={async (enabled) => {
                  try {
                    await updateRiskParameters({ sms_notifications_enabled: enabled });
                    toast({
                      title: enabled ? "SMS Enabled" : "SMS Disabled",
                      description: enabled ? "You'll receive SMS alerts" : "SMS alerts disabled",
                    });
                  } catch {
                    toast({ title: "Error", description: "Failed to update", variant: "destructive" });
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notif-phone">Phone Number</Label>
              <Input
                id="notif-phone"
                type="tel"
                value={notificationPhone}
                onChange={(e) => setNotificationPhone(e.target.value)}
                placeholder="+1234567890"
              />
              <Button onClick={handleSavePhone} className="w-full">Save Phone Number</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
