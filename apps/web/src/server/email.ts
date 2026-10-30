export interface Email {
  to: string;
  subject: string;
  text: string;
}

export type SendEmail = (email: Email) => Promise<void>;

/** Placeholder transport until a real provider is chosen: logs instead of sending. */
export const logEmail: SendEmail = async (email) => {
  console.log(`[email] to=${email.to} subject=${email.subject}`);
};
