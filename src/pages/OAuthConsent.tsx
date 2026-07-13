import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { Loader2 } from "lucide-react";

// Minimal typed wrapper for the beta supabase.auth.oauth namespace.
type OAuthResult = {
  data?: {
    client?: { name?: string; redirect_uris?: string[] } | null;
    scope?: string | string[] | null;
    redirect_url?: string;
    redirect_to?: string;
  } | null;
  error?: { message: string } | null;
};
const oauth = (supabase.auth as unknown as {
  oauth: {
    getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
    approveAuthorization: (id: string) => Promise<OAuthResult>;
    denyAuthorization: (id: string) => Promise<OAuthResult>;
  };
}).oauth;

function isSameOriginRelative(path: string | null): path is string {
  if (!path) return false;
  return path.startsWith("/") && !path.startsWith("//");
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthResult["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id in the request.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const res = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (res.error) {
        setError(res.error.message);
        return;
      }
      const immediate = res.data?.redirect_url ?? res.data?.redirect_to;
      if (immediate && !res.data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(res.data ?? null);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const res = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (res.error) {
      setBusy(false);
      setError(res.error.message);
      return;
    }
    const target = res.data?.redirect_url ?? res.data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("The authorization server did not return a redirect URL.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an external app";
  const redirectUri = details?.client?.redirect_uris?.[0];
  const scopes = Array.isArray(details?.scope)
    ? details?.scope
    : typeof details?.scope === "string"
      ? details?.scope.split(/\s+/).filter(Boolean)
      : [];

  return (
    <div className="min-h-screen flex items-center justify-center auth-bg p-4">
      <Card className="w-full max-w-md border-border/50">
        <CardHeader className="space-y-1 text-center pb-2">
          <div className="flex justify-center mb-4">
            <BrandLogo size="lg" />
          </div>
          <CardTitle className="text-xl">
            Connect {clientName} to your account
          </CardTitle>
          <CardDescription>
            {clientName} will be able to call this app&apos;s enabled tools while you are signed in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <p className="text-sm text-destructive">Could not load this authorization request: {error}</p>
          ) : !details ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {redirectUri && (
                <div className="text-xs text-muted-foreground break-all">
                  Redirect URI: <code>{redirectUri}</code>
                </div>
              )}
              <div className="text-sm">
                <div className="font-medium mb-1">This app will let {clientName} use these tools as you:</div>
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                  <li>List your open trading positions</li>
                  <li>List your recent closed trades</li>
                  <li>List your recent trading signals</li>
                  <li>Read your portfolio summary</li>
                </ul>
              </div>
              {scopes.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Identity scopes requested: {scopes.join(", ")}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                This does not bypass this app&apos;s permissions or backend policies.
              </p>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => decide(false)}
                >
                  Cancel connection
                </Button>
                <Button
                  className="flex-1"
                  disabled={busy}
                  onClick={() => decide(true)}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
