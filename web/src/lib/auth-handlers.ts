/**
 * Thin re-export layer that matches Auth.js v5's handler shape for the
 * App Router catch-all route.
 */
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
