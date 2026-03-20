export interface BrockPortalAgent {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: string | null;
  states_licensed: string | null;
}

export async function lookupNPN(npn: string): Promise<BrockPortalAgent | null> {
  const url = process.env.BROCK_PORTAL_SUPABASE_URL;
  const key = process.env.BROCK_PORTAL_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Brock Portal Supabase credentials not configured");
    return null;
  }

  const response = await fetch(
    `${url}/rest/v1/agents?npn=eq.${encodeURIComponent(npn)}&select=id,first_name,last_name,email,status,states_licensed`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    console.error("Brock Portal NPN lookup failed:", response.status);
    return null;
  }

  const agents: BrockPortalAgent[] = await response.json();
  return agents.length > 0 ? agents[0] : null;
}
