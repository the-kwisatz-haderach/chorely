export const TEMPLATE_DB = "chorely_test_template";

const BASE = process.env.DATABASE_URL ?? "postgres://chorely:chorely@localhost:5433/chorely";

export function databaseUrl(name: string): string {
  const url = new URL(BASE);
  url.pathname = `/${name}`;
  return url.toString();
}

/** Connection used for CREATE/DROP DATABASE. */
export function adminUrl(): string {
  return databaseUrl("postgres");
}
