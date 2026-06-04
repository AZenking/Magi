import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@magi/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@magi/ui/components/card";
import { Badge } from "@magi/ui/components/badge";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">MAGI</h1>
        <p className="mt-2 text-muted-foreground">Personal EPG + Live TV Platform</p>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Quick Start
            <Badge variant="secondary">v0.1</Badge>
          </CardTitle>
          <CardDescription>MAGI 管理后台正在建设中</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Link to="/dashboard">
            <Button>Get Started</Button>
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
