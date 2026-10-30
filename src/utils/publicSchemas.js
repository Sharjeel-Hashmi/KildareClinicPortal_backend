// Input rules for the public (website) API. Every object is .strict(): unknown fields are rejected.
import { z } from "zod";
import { isValidDateStr } from "./slotMath.js";

const slug = z.string().min(1).max(100).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Invalid value");
const dateStr = z.string().refine(isValidDateStr, "Use the format YYYY-MM-DD");
const token = z.string().regex(/^[a-f0-9]{48}$/, "Invalid link");

const availabilityQuery = z.object({ from: dateStr, to: dateStr, service: slug }).strict();
const slotsQuery = z.object({ date: dateStr, service: slug }).strict();
const slugParam = z.object({ slug }).strict();
const tokenParam = z.object({ token }).strict();

const patient = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(120, "That name is too long").regex(/^[^\r\n\t<>]+$/, "Please remove special characters from your name"),
    phone: z.string().trim().regex(/^[0-9+()\-\s]{6,30}$/, "Enter a valid phone number"),
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200, "That email is too long"),
    isNewPatient: z.boolean({ required_error: "Tell us if you are a new patient", invalid_type_error: "Tell us if you are a new patient" }),
    reason: z.string().trim().max(300, "Keep this under 300 characters").optional().default(""),
  })
  .strict();

const bookingBody = z
  .object({
    doctor: slug,
    service: slug,
    startTime: z.string().datetime({ offset: true, message: "Choose a valid appointment time" }),
    patient,
    gdprConsent: z.literal(true, {
      errorMap: () => ({ message: "Please confirm that you agree to us storing your details to manage this appointment" }),
    }),
    turnstileToken: z.string().max(2048).optional(),
  })
  .strict();

// -> { value } or { errors: { "patient.email": "Enter a valid email address", ... } }
function parse(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return { value: result.data };
  const errors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    if (errors[key]) continue;
    errors[key] = issue.code === "unrecognized_keys" ? `Unknown field: ${issue.keys.join(", ")}` : issue.message;
  }
  return { errors };
}

export { availabilityQuery, slotsQuery, slugParam, tokenParam, bookingBody, parse };
