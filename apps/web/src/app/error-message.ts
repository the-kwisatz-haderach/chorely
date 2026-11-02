import { ApiError } from "@chorely/api-client";

export function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Try again.";
  // A network error's message is the browser's own, such as "Failed to fetch".
  if (err.code === "network_error") return "Can't reach Chorely. Check your connection and try again.";
  return err.message;
}
