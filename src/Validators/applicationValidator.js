import { z } from "zod";

const STAGES = ["SAVED", "APPLIED", "SCREENING", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED", "WITHDRAWN"];
const SOURCES = ["Referral", "LinkedIn", "Company site", "Job board", "Cold email", "Recruiter", "Other"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];

const dateString = z.string().refine((v) => !isNaN(new Date(v).getTime()), {
  message: "Invalid date format",
});

export const idSchema = z.object({
  id: z.string().uuid("Invalid application id"),
});

export const createApplicationSchema = z.object({
  company: z.string().trim().min(1, "Company is required"),
  role: z.string().trim().min(1, "Role is required"),
  location: z.string().trim().optional().default(""),
  salary: z.string().trim().optional().default(""),
  source: z.enum(SOURCES, { message: "Invalid source" }),
  stage: z.enum(STAGES, { message: "Invalid stage" }),
  priority: z.enum(PRIORITIES, { message: "Invalid priority" }).optional(),
  link: z.string().trim().optional().default(""),
  notes: z.string().optional().default(""),
});

export const updateApplicationSchema = z
  .object({
    company: z.string().trim().min(1, "Company cannot be empty"),
    role: z.string().trim().min(1, "Role cannot be empty"),
    location: z.string().trim(),
    salary: z.string().trim(),
    source: z.enum(SOURCES, { message: "Invalid source" }),
    stage: z.enum(STAGES, { message: "Invalid stage" }),
    priority: z.enum(PRIORITIES, { message: "Invalid priority" }),
    link: z.string().trim(),
    notes: z.string(),
  })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field is required",
  });

export const patchApplicationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("note"),
    text: z.string().trim().min(1, "Note text is required"),
  }),
  z.object({
    action: z.literal("interview"),
    kind: z.string().trim().min(1, "Interview kind is required"),
    withWhom: z.string().trim().optional(),
    at: dateString,
  }),
  z.object({
    action: z.literal("reminder"),
    label: z.string().trim().min(1, "Reminder label is required"),
    at: dateString,
  }),
  z.object({
    action: z.literal("toggleReminder"),
    reminderId: z.string().uuid("Invalid reminder id"),
  }),
  z.object({
    action: z.literal("stage"),
    stage: z.enum(STAGES, { message: "Invalid stage" }),
  }),
]);
