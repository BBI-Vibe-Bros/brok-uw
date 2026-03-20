"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, ArrowRight, UserPlus, LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [isBrockAgent, setIsBrockAgent] = useState<boolean | null>(null);

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    npn: "",
    password: "",
  });

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      setIsBrockAgent(data.is_brock_agent);
      setSignupSuccess(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      router.push("/chat");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (signupSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Shield className="mx-auto h-12 w-12 text-emerald-600 mb-2" />
            <CardTitle className="text-2xl">
              {isBrockAgent ? "Welcome, Brock Agent!" : "Account Created"}
            </CardTitle>
            <CardDescription>
              {isBrockAgent
                ? "Your NPN was verified. You have full access."
                : "Your information has been saved. A subscription is required for full access."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => {
                setMode("login");
                setSignupSuccess(false);
              }}
            >
              Continue to Login <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Shield className="mx-auto h-12 w-12 text-blue-600 mb-2" />
          <CardTitle className="text-2xl">Brock UW</CardTitle>
          <CardDescription>
            Medicare Supplement underwriting guidance powered by AI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6">
            <Button
              variant={mode === "login" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setMode("login")}
            >
              <LogIn className="mr-2 h-4 w-4" /> Log In
            </Button>
            <Button
              variant={mode === "signup" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setMode("signup")}
            >
              <UserPlus className="mr-2 h-4 w-4" /> Sign Up
            </Button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 text-sm">
              {error}
            </div>
          )}

          {mode === "signup" ? (
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={form.full_name}
                  onChange={(e) => updateField("full_name", e.target.value)}
                  placeholder="John Smith"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="agent@example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="npn">NPN (National Producer Number)</Label>
                <Input
                  id="npn"
                  value={form.npn}
                  onChange={(e) => updateField("npn", e.target.value)}
                  placeholder="12345678"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Verifying NPN..." : "Create Account"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="agent@example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Logging in..." : "Log In"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
