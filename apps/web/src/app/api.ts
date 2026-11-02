import { createApiClient } from "@chorely/api-client";

// Same typed client as native; the browser sends the httpOnly session cookie itself.
export const api = createApiClient({ baseUrl: "", fetch: (url, init) => fetch(url, init) });
