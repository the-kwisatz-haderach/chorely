import { uuidv7 } from "uuidv7";

/** App-generated primary key (ADR 0001). */
export function newId(): string {
  return uuidv7();
}
