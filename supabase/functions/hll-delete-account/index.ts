import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return Response.json({ error: "Authentication required" }, { status: 401, headers: corsHeaders });
  }

  let body: { confirm?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
  }
  if (body.confirm !== "DELETE") {
    return Response.json({ error: "Explicit deletion confirmation required" }, { status: 400, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return Response.json({ error: "Server configuration is incomplete" }, { status: 500, headers: corsHeaders });
  }

  const token = authorization.slice("Bearer ".length);
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser(token);
  if (authError || !user) {
    return Response.json({ error: "Invalid or expired session" }, { status: 401, headers: corsHeaders });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Remove known user-owned rows before deleting the Auth identity. The service-role
  // key stays exclusively on the server and is never sent to browser code.
  // These operations use the table/column names already used by HLL's client code.
  const cleanupSteps = [
    () => adminClient.from("completion_submissions").delete().eq("submitted_by", user.id),
    () => adminClient.from("level_submissions").delete().eq("submitted_by", user.id),
    () => adminClient.from("completions").delete().eq("user_id", user.id),
    () => adminClient.from("staff_members").delete().eq("user_id", user.id),
    () => adminClient.from("profiles").delete().eq("id", user.id),
  ];
  for (const cleanup of cleanupSteps) {
    const { error } = await cleanup();
    if (error) {
      console.error("Account cleanup failed:", error.message);
      return Response.json({ error: "Account data could not be fully removed. Contact HLL support." }, { status: 500, headers: corsHeaders });
    }
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("Auth identity deletion failed:", deleteError.message);
    return Response.json({ error: "Account data was cleaned up but the login identity could not be deleted. Contact HLL support." }, { status: 500, headers: corsHeaders });
  }

  return Response.json({ success: true }, { status: 200, headers: corsHeaders });
});
