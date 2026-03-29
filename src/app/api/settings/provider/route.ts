import { NextResponse } from "next/server";
import { getProviderName } from "@/lib/llm/provider";
import { PROVIDER_INFO } from "@/lib/llm/types";

export async function GET() {
  const name = getProviderName();
  const info = PROVIDER_INFO[name];
  return NextResponse.json({ provider: name, ...info });
}
