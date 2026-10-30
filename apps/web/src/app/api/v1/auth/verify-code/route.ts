import { verifyCodeBodySchema, type VerifyCodeResponse } from "@chorely/api-client";
import { verifyCode } from "@/server/auth/auth";
import { sessionCookie } from "@/server/auth/request";
import { getDeps } from "@/server/deps";
import { handle, json, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const { email, code, transport } = await parseBody(req, verifyCodeBodySchema);
    const { account, token } = await verifyCode(getDeps(), email, code);
    if (transport === "bearer") {
      const body: VerifyCodeResponse = { account, token };
      return json(body);
    }
    const body: VerifyCodeResponse = { account };
    return json(body, 200, { "set-cookie": sessionCookie(token) });
  });
}
